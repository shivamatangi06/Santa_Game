/* Firebase imports */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, deleteDoc, getDocs,
  onSnapshot, query, orderBy, serverTimestamp, doc, setDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

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
try { getAnalytics(app); } catch(e){}

/* Constants */
const NAMES_COLLECTION = "christmas_names";
const initialNames = [
  "Keerthy","Manisha","Lindsa","Abhishek","Akhilesh",
  "Gopi","Pavan","Santosh","Guru","Balaji","Vedant","Kaushal"
];
const ADMIN_EMAIL = "grootsanta@gmail.in";

/* UI Elements */
const pickBox = document.getElementById("pickBox");
const message = document.getElementById("message");
const resetBtn = document.getElementById("resetBtn");
const adminPanelBtn = document.getElementById("adminPanelBtn");

let pickNames = [];
let displayingPicked = false;

/* Seed Firestore if empty */
async function seedNamesIfEmpty() {
  const ref = collection(db, NAMES_COLLECTION);
  const snap = await getDocs(ref);

  if (snap.empty) {
    for (const name of initialNames) {
      await addDoc(ref, { 
        name, 
        addedAt: serverTimestamp()
      });
    }
  }
}

/* 🔥 LISTEN FOR ADMIN RESET */
function listenResetFlag() {
  const resetRef = doc(db, "system", "reset");

  onSnapshot(resetRef, snap => {
    if (!snap.exists()) return;

    const serverResetTime = snap.data().resetAt?.toMillis();
    const localResetTime = Number(localStorage.getItem("lastReset") || 0);

    // If admin reset is newer → clear this user's pick
    if (serverResetTime > localResetTime) {
      localStorage.removeItem("pickedName");
      localStorage.setItem("lastReset", serverResetTime);

      pickBox.textContent = "Click to find Santa Child";
      pickBox.disabled = false;
      message.textContent = "";
    }
  });
}

/* Firestore Listener */
function listenNames() {
  const ref = collection(db, NAMES_COLLECTION);
  const q = query(ref, orderBy("__name__")); // no timestamp race

  onSnapshot(q, snapshot => {
    pickNames = snapshot.docs.map(d => ({
      id: d.id,
      name: d.data().name
    }));

    const savedPick = localStorage.getItem("pickedName");

    // 🔒 KEEP NAME LOCKED UNTIL ADMIN RESET
    if (savedPick) {
      pickBox.textContent = savedPick;
      pickBox.disabled = true;
      message.textContent = "Your Santa child is:";
      return;
    }

    if (pickNames.length === 0) {
      pickBox.textContent = "All Child paired! 🎉";
      pickBox.disabled = true;
      return;
    }

    pickBox.textContent = "Click to find Santa Child";
    pickBox.disabled = false;
  });
}

/* Pick Name */
async function pickName() {
  if (!pickNames.length || displayingPicked || localStorage.getItem("pickedName")) return;

  displayingPicked = true;
  pickBox.disabled = true;

  const available = [...pickNames];

  // Rolling animation
  await new Promise(resolve => {
    const interval = setInterval(() => {
      pickBox.textContent =
        available[Math.floor(Math.random() * available.length)].name;
    }, 150);

    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, 3000);
  });

  const idx = Math.floor(Math.random() * available.length);
  const picked = available[idx];
  const docRef = doc(db, NAMES_COLLECTION, picked.id);

  try {
    await deleteDoc(docRef);
  } catch (err) {
    alert("Error deleting name: " + err.message);
    displayingPicked = false;
    pickBox.disabled = false;
    return;
  }

  localStorage.setItem("pickedName", picked.name);

  pickBox.textContent = picked.name;
  message.textContent = "Your Santa child is:";
  pickBox.disabled = true;

  displayingPicked = false;
}

/* Admin Login */
adminPanelBtn.addEventListener("click", async () => {
  const email = prompt("Enter admin email:");
  const password = prompt("Enter admin password:");
  if (!email || !password) return;

  try {
    const user = await signInWithEmailAndPassword(auth, email, password);

    if (user.user.email === ADMIN_EMAIL) {
      resetBtn.style.display = "inline-block";
      alert("Admin logged in! Reset enabled.");
    } else {
      alert("You are NOT authorized.");
    }
  } catch (e) {
    alert("Login failed: " + e.message);
  }
});

/* ADMIN RESET — FIXED FOR ALL DEVICES */
resetBtn.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to reset everything?")) return;

  resetBtn.disabled = true;
  pickBox.disabled = true;
  pickBox.textContent = "Resetting...";

  const ref = collection(db, NAMES_COLLECTION);
  const snap = await getDocs(ref);

  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, NAMES_COLLECTION, d.id))));

  await Promise.all(
    initialNames.map(name =>
      addDoc(ref, {
        name,
        addedAt: serverTimestamp()
      })
    )
  );

  // 🔥 SET GLOBAL RESET FLAG
  await setDoc(doc(db, "system", "reset"), {
    resetAt: serverTimestamp()
  });

  localStorage.removeItem("pickedName");
  localStorage.setItem("lastReset", Date.now());

  pickBox.textContent = "Click to find Santa Child";
  pickBox.disabled = false;

  resetBtn.disabled = false;
  resetBtn.style.display = "none";
});

/* Initialize */
seedNamesIfEmpty().then(() => {
  listenResetFlag();  // 🔥 first load reset listener
  listenNames();
});
pickBox.addEventListener("click", pickName);
