/* Firebase imports */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, deleteDoc, getDocs,
  onSnapshot, query, orderBy, serverTimestamp, doc 
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
        addedAt: serverTimestamp() || new Date() // NEVER null
      });
    }
  }
}

/* Firestore Listener — FINAL VERSION */
function listenNames() {
  const ref = collection(db, NAMES_COLLECTION);

  // Use ID ordering to avoid timestamp problems
  const q = query(ref, orderBy("__name__"));

  onSnapshot(q, snapshot => {
    pickNames = snapshot.docs.map(d => ({
      id: d.id,
      name: d.data().name
    }));

    const savedPick = localStorage.getItem("pickedName");

    // 🔒 User already picked — lock UI permanently
    if (savedPick) {
      pickBox.textContent = savedPick;
      pickBox.disabled = true;
      message.textContent = "Your Santa child is:";
      return; // DO NOT overwrite UI
    }

    // No names left
    if (pickNames.length === 0) {
      pickBox.textContent = "All Child paired! 🎉";
      pickBox.disabled = true;
      message.textContent = "";
      return;
    }

    // Ready to pick
    pickBox.textContent = "Click to find Santa Child";
    pickBox.disabled = false;
    message.textContent = "";
  });
}

/* Pick Name — FINAL FIXED VERSION */
async function pickName() {
  if (!pickNames.length || displayingPicked || localStorage.getItem("pickedName")) return;

  displayingPicked = true;
  pickBox.disabled = true;

  // Freeze the list to avoid real-time update interruptions
  const available = [...pickNames];

  // Rolling animation (UI only)
  await new Promise(resolve => {
    const interval = setInterval(() => {
      pickBox.textContent = available[Math.floor(Math.random() * available.length)].name;
    }, 150);

    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, 3000);
  });

  const idx = Math.floor(Math.random() * available.length);
  const picked = available[idx];

  const docRef = doc(db, NAMES_COLLECTION, picked.id);

  // MUST delete BEFORE showing final pick
  try {
    await deleteDoc(docRef);
  } catch (err) {
    alert("Error deleting name. Please try again.\n" + err.message);
    displayingPicked = false;
    pickBox.disabled = false;
    return;
  }

  // Save the chosen name permanently
  localStorage.setItem("pickedName", picked.name);

  // Show final pick
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
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    if (userCredential.user.email === ADMIN_EMAIL) {
      resetBtn.style.display = "inline-block";
      alert("Admin logged in! Reset enabled.");
    } else {
      alert("You are NOT authorized.");
    }
  } catch (e) {
    alert("Login failed: " + e.message);
  }
});

/* Reset Handler */
resetBtn.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to reset everything?")) return;

  resetBtn.disabled = true;
  pickBox.disabled = true;
  pickBox.textContent = "Resetting...";

  const snap = await getDocs(collection(db, NAMES_COLLECTION));

  // Delete all existing names
  await Promise.all(
    snap.docs.map(d => deleteDoc(doc(db, NAMES_COLLECTION, d.id)))
  );

  // Add initial names back
  await Promise.all(
    initialNames.map(name => addDoc(collection(db, NAMES_COLLECTION), {
      name,
      addedAt: serverTimestamp() || new Date()
    }))
  );

  // Clear saved pick
  localStorage.removeItem("pickedName");

  pickBox.textContent = "Click to find Santa Child";
  pickBox.disabled = false;

  resetBtn.disabled = false;
  resetBtn.style.display = "none";
});

/* Initialize */
seedNamesIfEmpty().then(listenNames);
pickBox.addEventListener("click", pickName);
