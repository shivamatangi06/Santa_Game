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

let pickNames = [];
let displayingPicked = false;

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
            if (!localStorage.getItem("pickedName")) resetPickUI();
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

/* ------------------------------- PICK NAME (FINAL VERSION) ------------------------------- */
async function pickName() {
    if (displayingPicked || localStorage.getItem("pickedName") || !pickNames.length) return;

    displayingPicked = true;

    pickBox.disabled = true;
    pickBox.classList.add("disabled");
    pickBox.style.pointerEvents = "none";
    pickBox.style.backgroundColor = "#3ba1ff";

    /* --------------------------------------------------------
       ROLLING ANIMATION USING ALL INITIAL NAMES IN ORDER
       -------------------------------------------------------- */
    const namesToRoll = initialNames.slice();
    let index = 0;

    const rollDuration = 3000;
    const intervalTime = 120;
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

    /* --------------------------------------------------------
       FINAL PICK (from remaining names)
       -------------------------------------------------------- */
    if (!pickNames.length) {
        displayingPicked = false;
        resetPickUI();
        return;
    }

    const finalIdx = Math.floor(Math.random() * pickNames.length);
    const candidate = pickNames[finalIdx];

    pickBox.textContent = candidate.name;
    pickBox.style.backgroundColor = "#1e78c8";
    pickBox.style.color = "#e9f6ff";
    message.textContent = "Meet your Santa child:";

    /* --------------------------------------------------------
       MAKE PICK SAFE USING FIRESTORE TRANSACTION
       -------------------------------------------------------- */
    try {
        await runTransaction(db, async (tx) => {
            const docRef = doc(db, NAMES_COLLECTION, candidate.id);
            const snap = await tx.get(docRef);
            if (!snap.exists()) {
                throw new Error("Someone already picked this name!");
            }
            tx.delete(docRef);
        });

        localStorage.setItem("pickedName", candidate.name);

        pickNames.splice(finalIdx, 1);

    } catch (err) {
        message.textContent = "Pick failed. Try again!";
        console.warn(err);

        setTimeout(() => {
            displayingPicked = false;
            resetPickUI();
        }, 800);

        return;
    }

    displayingPicked = false;
    pickBox.disabled = true;
    pickBox.style.pointerEvents = "none";
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
