/* ------------------------------- FIREBASE IMPORTS ------------------------------- */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, deleteDoc, getDocs, 
    onSnapshot, query, orderBy, serverTimestamp, doc, 
    setDoc, enableIndexedDbPersistence, runTransaction
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-analytics.js";

/* ------------------------------- FIREBASE CONFIG ------------------------------- */
const firebaseConfig = {
    apiKey: "AIzaSyCNc-y_OHfX_5Ryo8G_ldUYHn5702dx_NA",
    authDomain: "christmas-santa-name-picker.firebaseapp.com",
    projectId: "christmas-santa-name-picker",
    storageBucket: "christmas-santa-name-picker.appspot.com",
    messagingSenderId: "143601363304",
    appId: "1:143601363304:web:7b5e4eefad9e737f98cedd"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
try { getAnalytics(app); } catch (e) {}

/* Enable offline persistence */
enableIndexedDbPersistence(db).catch(() => {});

/* ------------------------------- CONSTANTS ------------------------------- */
const NAMES_COLLECTION = "christmas_names";
const initialNames = [
    "Keerthy", "Manisha", "Lindsa", "Abhishek", "Akhilesh",
    "Gopi", "Pavan", "Santosh", "Guru", "Balaji", "Vedant", "Kaushal"
];
const ADMIN_EMAIL = "grootsanta@gmail.in";

/* DOM Elements */
const pickBox = document.getElementById("pickBox");
const message = document.getElementById("message");
const resetBtn = document.getElementById("resetBtn");
const adminPanelBtn = document.getElementById("adminPanelBtn");

let pickNames = [];            // local snapshot of remaining names (id + name)
let displayingPicked = false;  // UI lock for animation/pick
let pendingPick = null;        // object { candidate, attemptCount } if we need to retry

/* ------------------------------- RESET FLAG LISTENER ------------------------------- */
function listenForResetFlag() {
    const resetRef = doc(db, "config", "resetFlag");

    onSnapshot(resetRef, (snap) => {
        if (!snap.exists()) return;

        const data = snap.data();
        const lastReset = localStorage.getItem("lastResetTime");

        if (data.time !== lastReset) {
            localStorage.removeItem("pickedName");
            localStorage.setItem("lastResetTime", data.time);
            location.reload();
        }
    });
}

/* ------------------------------- SEED NAMES ------------------------------- */
async function seedNamesIfEmpty() {
    const ref = collection(db, NAMES_COLLECTION);
    const snap = await getDocs(ref);

    if (snap.empty) {
        for (const name of initialNames) {
            await addDoc(ref, { name, addedAt: serverTimestamp() });
        }
    }
}

/* ------------------------------- REAL-TIME NAME LISTENER ------------------------------- */
function listenNames() {
    const ref = collection(db, NAMES_COLLECTION);
    const q = query(ref, orderBy("addedAt"));

    onSnapshot(q, (snapshot) => {
        pickNames = snapshot.docs.map(d => ({ id: d.id, name: d.data().name }));

        const pickedName = localStorage.getItem("pickedName");

        if (pickedName && !pickNames.find(p => p.name === pickedName)) {
            showPickedName(pickedName);
        }
        else if (pickNames.length === 0) {
            pickBox.textContent = "All children have been successfully paired!";
            pickBox.disabled = true;
            pickBox.classList.add("disabled");
            pickBox.style.backgroundColor = "#1e78c8";
            message.textContent = "";
        }
        else {
            if (!localStorage.getItem("pickedName") && !pendingPick) resetPickUI();
        }
    });
}

function resetPickUI() {
    pickBox.textContent = "Click to choose your child";
    pickBox.disabled = false;
    pickBox.classList.remove("disabled");
    pickBox.style.backgroundColor = "#1e78c8";
    pickBox.style.color = "#e9f6ff";
    pickBox.style.pointerEvents = "auto";
    message.textContent = "";
}

/* ------------------------------- SHOW PICKED NAME ------------------------------- */
function showPickedName(name) {
    pickBox.textContent = name;
    pickBox.disabled = true;
    pickBox.classList.add("disabled");
    pickBox.style.backgroundColor = "#1e78c8";
    pickBox.style.color = "#e9f6ff";
    pickBox.style.pointerEvents = "none";
    message.textContent = "Meet your Santa child:";
}

/* ------------------------------- HELPER: sleep ------------------------------- */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ------------------------------- HELPER: tryDeleteWithRetries -------------------------------
   Attempts to atomically delete the candidate doc using runTransaction.
   If runTransaction fails due to transient errors, we retry a few times with exponential backoff.
   If device goes offline, we attach a 'online' listener and resume automatically.
------------------------------------------------------------------------------- */
async function tryDeleteWithRetries(candidate, maxAttempts = 5) {
    let attempt = 0;
    let backoff = 500; // ms

    // Small helper to perform a single atomic delete attempt
    async function attemptOnce() {
        attempt++;
        try {
            await runTransaction(db, async (tx) => {
                const docRef = doc(db, NAMES_COLLECTION, candidate.id);
                const snap = await tx.get(docRef);
                if (!snap.exists()) {
                    throw new Error("already-picked");
                }
                tx.delete(docRef);
            });
            return { ok: true };
        } catch (err) {
            // Distinguish conflict (already picked) vs transient/network error
            const msg = (err && err.message) ? err.message.toLowerCase() : "";
            if (msg.includes("already-picked") || msg.includes("no document to delete") || msg.includes("not found")) {
                return { ok: false, reason: "already-picked" };
            }

            // Firestore runTransaction may fail offline or due to transient server issues:
            return { ok: false, reason: "transient", error: err };
        }
    }

    while (attempt < maxAttempts) {
        // If offline, exit early and let caller set up 'online' handler
        if (!navigator.onLine) {
            return { ok: false, reason: "offline", attempt };
        }

        const res = await attemptOnce();
        if (res.ok) return { ok: true, attempt };
        if (res.reason === "already-picked") return { ok: false, reason: "already-picked", attempt, error: res.error };

        // transient error -> backoff and retry
        await sleep(backoff);
        backoff = Math.min(5000, backoff * 1.8);
        attempt++;
    }

    // final attempt exhausted
    return { ok: false, reason: "transient", attempt };
}

/* ------------------------------- PICK NAME (robust, retries, online resume) ------------------------------- */
async function pickName() {
    // Disallow re-entry if already picking or if user already picked
    if (displayingPicked || localStorage.getItem("pickedName")) return;

    // If there are no names, bail
    if (!pickNames.length) {
        resetPickUI();
        return;
    }

    displayingPicked = true;
    pendingPick = null;

    // Lock UI
    pickBox.disabled = true;
    pickBox.classList.add("disabled");
    pickBox.style.pointerEvents = "none";
    pickBox.style.backgroundColor = "#3ba1ff";

    /* ---------------------- Rolling animation using ALL initial names ---------------------- */
    const namesToRoll = initialNames.slice(); // ALWAYS roll through all initial names
    let index = 0;
    const rollDuration = 3000;
    const intervalTime = 120; // keeps it smooth on slow devices
    let elapsed = 0;

    await new Promise(resolve => {
        const interval = setInterval(() => {
            pickBox.textContent = namesToRoll[index];
            index = (index + 1) % namesToRoll.length;

            elapsed += intervalTime;
            if (elapsed >= rollDuration) {
                clearInterval(interval);
                resolve();
            }
        }, intervalTime);
    });

    /* ---------------------- Fresh snapshot BEFORE selecting final candidate ---------------------- */
    let freshSnap;
    try {
        freshSnap = await getDocs(collection(db, NAMES_COLLECTION));
    } catch (err) {
        // If we cannot fetch fresh snapshot due to network, treat as transient and fall through
        console.warn("Failed to fetch latest names before picking:", err);
    }

    const freshList = (freshSnap && freshSnap.docs)
        ? freshSnap.docs.map(d => ({ id: d.id, name: d.data().name }))
        : pickNames.slice(); // fallback to local pickNames if fetch failed

    if (!freshList.length) {
        message.textContent = "All paired — nothing to pick.";
        displayingPicked = false;
        resetPickUI();
        return;
    }

    // Choose candidate from the fresh list to minimize conflicts
    const finalIdx = Math.floor(Math.random() * freshList.length);
    const candidate = freshList[finalIdx];

    // Show candidate immediately
    pickBox.textContent = candidate.name;
    pickBox.style.backgroundColor = "#1e78c8";
    pickBox.style.color = "#e9f6ff";
    message.textContent = "Meet your Santa child:";

    /* ---------------------- Try atomic deletion with retries ---------------------- */
    let result = await tryDeleteWithRetries(candidate, 4);

    // If offline, set up retry-on-online behavior
    if (!result.ok && result.reason === "offline") {
        message.textContent = "You're offline — will complete pick when you're back online.";
        // Save pending pick so UI remains showing selected name, but do not set localStorage until success.
        pendingPick = { candidate, attempts: result.attempt || 0 };

        // Listen once for 'online' event to resume
        const onOnline = async () => {
            window.removeEventListener("online", onOnline);
            message.textContent = "Back online — finishing your pick...";
            const r = await tryDeleteWithRetries(candidate, 6);
            if (r.ok) {
                localStorage.setItem("pickedName", candidate.name);
                // Update local pickNames quickly to keep UI consistent; actual onSnapshot will sync soon
                pickNames = pickNames.filter(p => p.id !== candidate.id);
                pendingPick = null;
                message.textContent = "Pick completed!";
                displayingPicked = false;
                pickBox.disabled = true;
                pickBox.style.pointerEvents = "none";
            } else if (r.reason === "already-picked") {
                message.textContent = "Sorry — someone else picked that name. Try again.";
                pendingPick = null;
                displayingPicked = false;
                resetPickUI();
            } else {
                message.textContent = "Pick failed after reconnecting. Try again.";
                pendingPick = null;
                displayingPicked = false;
                resetPickUI();
            }
        };
        window.addEventListener("online", onOnline);
        // keep UI locked until online handler resolves; return here
        return;
    }

    // If transaction returned an "already-picked" conflict
    if (!result.ok && result.reason === "already-picked") {
        message.textContent = "That name was already taken — retrying...";
        // Give user a brief message then allow them to try again (or we can auto-retry)
        setTimeout(() => {
            displayingPicked = false;
            resetPickUI();
        }, 900);
        return;
    }

    // If still transient failure after retries
    if (!result.ok && result.reason === "transient") {
        // As a last-resort fallback: try a plain deleteDoc (non-transactional) once if online
        if (navigator.onLine) {
            try {
                await deleteDoc(doc(db, NAMES_COLLECTION, candidate.id));
                // success
                localStorage.setItem("pickedName", candidate.name);
                pickNames = pickNames.filter(p => p.id !== candidate.id);
                message.textContent = "Pick completed!";
                displayingPicked = false;
                pickBox.disabled = true;
                pickBox.style.pointerEvents = "none";
                return;
            } catch (err) {
                console.warn("Fallback deleteDoc also failed:", err);
            }
        }

        // If fallback didn't succeed, inform the user and allow retry
        message.textContent = "Pick failed due to network issues. Please try again.";
        displayingPicked = false;
        resetPickUI();
        return;
    }

    // Success path
    if (result.ok) {
        localStorage.setItem("pickedName", candidate.name);
        // update local pickNames quickly — snapshot will follow
        pickNames = pickNames.filter(p => p.id !== candidate.id);

        message.textContent = "Pick completed!";
        displayingPicked = false;
        pickBox.disabled = true;
        pickBox.style.pointerEvents = "none";
        return;
    }
}

/* ------------------------------- ADMIN LOGIN ------------------------------- */
adminPanelBtn.addEventListener("click", async () => {
    const email = prompt("Enter admin email:");
    const password = prompt("Enter admin password:");
    if (!email || !password) return;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (userCredential.user.email === ADMIN_EMAIL) {
            resetBtn.style.display = "inline-block";
            alert("Admin logged in! Reset enabled.");
        } else {
            alert("Unauthorized user.");
        }
    } catch (e) {
        alert("Login failed: " + e.message);
    }
});

/* ------------------------------- RESET BUTTON ------------------------------- */
resetBtn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to reset everything?")) return;

    resetBtn.style.display = "none";
    localStorage.removeItem("pickedName");

    const snap = await getDocs(collection(db, NAMES_COLLECTION));
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, NAMES_COLLECTION, d.id))));

    await Promise.all(initialNames.map(name =>
        addDoc(collection(db, NAMES_COLLECTION), {
            name,
            addedAt: serverTimestamp()
        })
    ));

    await setDoc(doc(db, "config", "resetFlag"), {
        time: Date.now().toString()
    });

    location.reload();
});

/* ------------------------------- SNOWFALL EFFECT ------------------------------- */
function createSnowflake() {
    const s = document.createElement("div");
    s.className = "snowflake";
    s.style.left = Math.random() * window.innerWidth + "px";
    s.style.fontSize = `${15 + Math.random() * 14}px`;
    s.style.animationDuration = `${4 + Math.random() * 3}s`;
    s.textContent = "❄";
    s.style.color = "#fff";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 8000);
}
setInterval(createSnowflake, window.innerWidth < 600 ? 600 : 300);

/* ------------------------------- INIT ------------------------------- */
seedNamesIfEmpty().then(() => {
    listenForResetFlag();
    listenNames();
});
pickBox.addEventListener("click", pickName);
