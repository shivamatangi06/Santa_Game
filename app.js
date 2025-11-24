/* Firebase imports */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, serverTimestamp, doc, setDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-analytics.js";

/* Firebase Config */
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

/* Constants */
const NAMES_COLLECTION = "christmas_names";
const initialNames = ["Keerthy", "Manisha", "Lindsa", "Abhishek", "Akhilesh", "Gopi", "Pavan", "Santosh", "Guru", "Balaji", "Vedant", "Kaushal"];

const pickBox = document.getElementById("pickBox");
const message = document.getElementById("message");
const resetBtn = document.getElementById("resetBtn");
const adminPanelBtn = document.getElementById("adminPanelBtn");
const ADMIN_EMAIL = "grootsanta@gmail.in";

let pickNames = [];
let displayingPicked = false;

/* ------------------------ LISTEN FOR RESET FLAG ------------------------ */
function listenForResetFlag() {
    const resetRef = doc(db, "config", "resetFlag");
    onSnapshot(resetRef, (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const lastReset = localStorage.getItem("lastResetTime");

        // If the reset time is different, refresh the page to reflect reset
        if (data.time !== lastReset) {
            localStorage.setItem("lastResetTime", data.time);
            location.reload(); // Auto-refresh after reset to reflect updated state
        }
    });
}

/* ------------------------ SEED NAMES IF EMPTY ------------------------ */
async function seedNamesIfEmpty() {
    const ref = collection(db, NAMES_COLLECTION);
    const snap = await getDocs(ref);
    if (snap.empty) {
        for (const name of initialNames) {
            await addDoc(ref, { name, addedAt: serverTimestamp() });
        }
    }
}

/* ------------------------ LISTEN NAMES FROM FIRESTORE ------------------------ */
function listenNames() {
    const ref = collection(db, NAMES_COLLECTION);
    const q = query(ref, orderBy("addedAt"));
    onSnapshot(q, snapshot => {
        pickNames = snapshot.docs.map(d => ({ id: d.id, name: d.data().name }));

        const pickedName = localStorage.getItem("pickedName");

        if (pickedName && !pickNames.find(p => p.name === pickedName)) {
            showPickedName(pickedName);
        } else if (pickNames.length === 0) {
            pickBox.textContent = "All children have been successfully paired!";
            pickBox.disabled = true;
            pickBox.classList.add("disabled");
            message.textContent = "";
        } else {
            pickBox.textContent = "Click to choose your child";
            pickBox.disabled = false;
            pickBox.classList.remove("disabled");
            pickBox.style.backgroundColor = "#1e78c8";
            pickBox.style.color = "#e9f6ff";
            message.textContent = "";
        }
    });
}

/* ------------------------ SHOW PICKED NAME ------------------------ */
function showPickedName(name) {
    pickBox.textContent = name;
    pickBox.disabled = true;
    pickBox.classList.add("disabled");
    pickBox.style.backgroundColor = "#1e78c8";
    pickBox.style.color = "#e9f6ff";
    message.textContent = "Meet your Santa child :"; 
    message.classList.add("pop");  
    setTimeout(() => message.classList.remove("pop"), 600); 
}

/* ------------------------ PICK NAME ------------------------ */
async function pickName() {
    if (!pickNames.length || displayingPicked || localStorage.getItem("pickedName")) return;

    displayingPicked = true;
    pickBox.disabled = true;
    pickBox.classList.add("disabled");
    pickBox.style.backgroundColor = "#3ba1ff"; 
    pickBox.style.color = "#ffffff";

    const rollDuration = 3000;
    const intervalTime = 200;  
    let elapsed = 0;

    await new Promise(resolve => {
        const interval = setInterval(() => {
            const idx = Math.floor(Math.random() * initialNames.length);
            pickBox.textContent = initialNames[idx];
            elapsed += intervalTime;
            if (elapsed >= rollDuration) {
                clearInterval(interval);
                resolve();
            }
        }, intervalTime);
    });

    if (!pickNames.length) {
        displayingPicked = false;
        pickBox.textContent = "All children have been successfully paired!";
        return;
    }

    const finalIdx = Math.floor(Math.random() * pickNames.length);
    const picked = pickNames[finalIdx];

    pickBox.textContent = picked.name;
    pickBox.disabled = true;
    pickBox.style.backgroundColor = "#1e78c8"; 
    pickBox.style.color = "#e9f6ff";
    message.textContent = "Meet your Santa child :";

    localStorage.setItem("pickedName", picked.name);

    await deleteDoc(doc(db, NAMES_COLLECTION, picked.id));
    pickNames.splice(finalIdx, 1);
    displayingPicked = false;
}

/* ------------------------ ADMIN LOGIN ------------------------ */
adminPanelBtn.addEventListener("click", async () => {
    const email = prompt("Enter admin email:");
    const password = prompt("Enter admin password:");
    if (!email || !password) return;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (userCredential.user.email === ADMIN_EMAIL) {
            resetBtn.style.display = "inline-block"; 
            resetBtn.disabled = false;
            resetBtn.style.pointerEvents = "auto";
            alert("Admin logged in! Reset button is now visible.");
        } else {
            alert("You are not authorized as admin.");
        }
    } catch (e) {
        alert("Login failed: " + e.message);
    }
});

/* ------------------------ RESET BUTTON ------------------------ */
resetBtn.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to reset all names?")) return;

    resetBtn.style.display = "none";

    localStorage.removeItem("pickedName");

    // Delete all existing names
    const snap = await getDocs(collection(db, NAMES_COLLECTION));
    await Promise.all(snap.docs.map(d => deleteDoc(doc(db, NAMES_COLLECTION, d.id))));

    // Add initial names back
    await Promise.all(initialNames.map(name =>
        addDoc(collection(db, NAMES_COLLECTION), { name, addedAt: serverTimestamp() })
    ));

    // Set the reset flag so other clients know
    await setDoc(doc(db, "config", "resetFlag"), { time: Date.now().toString() });

    // Notify that the reset was successful and refresh all clients
    location.reload();
});

/* ------------------------ SNOWFALL EFFECT ------------------------ */
function createSnowflake() {
    const s = document.createElement("div");
    s.className = "snowflake";
    s.style.left = Math.random() * window.innerWidth + "px";
    s.style.fontSize = 15 + Math.random() * 14 + "px";
    s.style.animationDuration = 4 + Math.random() * 3 + "s";
    s.textContent = "❄";
    s.style.color = "#fff";
    document.body.appendChild(s);
    setTimeout(() => s.remove(), 8000);
}

setInterval(createSnowflake, window.innerWidth < 600 ? 600 : 300);

seedNamesIfEmpty().then(() => {
    listenForResetFlag();
    listenNames();
});

pickBox.addEventListener("click", pickName);
