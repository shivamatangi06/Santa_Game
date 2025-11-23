/* Firebase imports */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, serverTimestamp, doc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
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

const NAMES_COLLECTION = "christmas_names";
const initialNames = ["Keerthy","Manisha","Lindsa","Abhishek","Akhilesh","Gopi","Pavan","Santosh","Guru","Balaji","Vedant","Kaushal"];

const pickBox = document.getElementById("pickBox");
const message = document.getElementById("message");
const resetBtn = document.getElementById("resetBtn");
const adminPanelBtn = document.getElementById("adminPanelBtn");
const ADMIN_EMAIL = "grootsanta@gmail.in";

let pickNames = [];
let displayingPicked = false;

/* Snowflakes & Stars */
function createSnowflake() {
  const s = document.createElement("div");
  s.className = "snowflake";
  s.style.left = Math.random() * window.innerWidth + "px";
  const size = 10 + Math.random() * 10;
  s.style.fontSize = size + "px";
  s.style.animationDuration = 4 + Math.random() * 4 + "s";
  s.textContent = "❄";
  s.style.color = "#fff";
  document.body.appendChild(s);
  setTimeout(() => s.remove(), parseFloat(s.style.animationDuration)*1000);
}
setInterval(createSnowflake, window.innerWidth < 600 ? 500 : 300);

function createStar() {
  const star = document.createElement("div");
  star.className = "star";
  const size = 1 + Math.random()*3;
  star.style.width = size + "px";
  star.style.height = size + "px";
  star.style.top = Math.random() * window.innerHeight + "px";
  star.style.left = Math.random() * window.innerWidth + "px";
  star.style.animationDuration = 1 + Math.random()*2 + "s";
  document.body.appendChild(star);
  setTimeout(() => star.remove(), parseFloat(star.style.animationDuration)*1000);
}
setInterval(createStar, 300);

/* Seed Firestore if empty */
async function seedNamesIfEmpty() {
  const ref = collection(db, NAMES_COLLECTION);
  const snap = await getDocs(ref);
  if (snap.empty) {
    for (const name of initialNames) {
      await addDoc(ref, { name, addedAt: serverTimestamp() });
    }
  }
}

/* Listen for Firestore changes */
function listenNames() {
  const ref = collection(db, NAMES_COLLECTION);
  const q = query(ref, orderBy("addedAt"));
  onSnapshot(q, snapshot => {
    pickNames = snapshot.docs.map(d => ({ id: d.id, name: d.data().name }));
    const pickedName = localStorage.getItem("pickedName");

    if (pickedName) {
      pickBox.textContent = pickedName;
      pickBox.disabled = true;
      pickBox.classList.add("disabled");
      pickBox.style.backgroundColor = "#7fd4ff";
      pickBox.style.color = "#002f55";
      message.textContent = "Your Santa Child is:";
    } else if (pickNames.length === 0) {
      pickBox.textContent = "All Child paired! 🎉";
      pickBox.disabled = true;
      pickBox.classList.add("disabled");
      message.textContent = "";
    } else {
      pickBox.textContent = "Click to find Santa Child";
      pickBox.disabled = false;
      pickBox.classList.remove("disabled");
      pickBox.style.backgroundColor = "#1e78c8";
      pickBox.style.color = "#e9f6ff";
      message.textContent = "";
    }
  });
}

/* PICK NAME FUNCTION */
async function pickName() {
  if (!pickNames.length || displayingPicked || localStorage.getItem("pickedName")) return;

  displayingPicked = true;
  pickBox.disabled = true;
  pickBox.classList.add("disabled");
  pickBox.style.backgroundColor = "#3ba1ff";
  pickBox.style.color = "#e9f7ff";

  // Rolling animation for 5 seconds
  await new Promise(resolve => {
    const rollInterval = 200;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * initialNames.length);
      pickBox.textContent = initialNames[idx];
      if (Date.now() - startTime >= 5000) {
        clearInterval(interval);
        resolve();
      }
    }, rollInterval);
  });

  if (!pickNames.length) return;
  const idx = Math.floor(Math.random() * pickNames.length);
  const picked = pickNames[idx];

  // Show picked name
  pickBox.style.backgroundColor = "#7fd4ff";
  pickBox.style.color = "#002f55";
  pickBox.classList.add("revealed");
  pickBox.textContent = picked.name;
  message.textContent = "Your Santa Child is:";

  localStorage.setItem("pickedName", picked.name);

  await deleteDoc(doc(db, NAMES_COLLECTION, picked.id));
  pickNames.splice(idx, 1);

  displayingPicked = false;
}

/* ADMIN LOGIN */
adminPanelBtn.addEventListener("click", async () => {
  const email = prompt("Enter admin email:");
  const password = prompt("Enter admin password:");
  if (!email || !password) return;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    if (userCredential.user.email === ADMIN_EMAIL) {
      resetBtn.style.display = "inline-block";
      alert("Admin logged in! Reset button visible.");
    } else {
      alert("Invalid admin email.");
    }
  } catch (e) {
    alert("Login failed: " + e.message);
  }
});

/* RESET BUTTON */
resetBtn.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to reset all names?")) return;

  resetBtn.disabled = true;
  pickBox.disabled = true;
  pickBox.textContent = "Resetting...";
  message.textContent = "";

  const snap = await getDocs(collection(db, NAMES_COLLECTION));
  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, NAMES_COLLECTION, d.id))));
  await Promise.all(initialNames.map(name => addDoc(collection(db, NAMES_COLLECTION), { name, addedAt: serverTimestamp() })));

  localStorage.removeItem("pickedName");

  pickBox.textContent = "Click to find Santa Child";
  pickBox.disabled = false;
  pickBox.classList.remove("disabled");
  pickBox.style.backgroundColor = "#1e78c8";
  pickBox.style.color = "#e9f6ff";
  message.textContent = "";
  resetBtn.disabled = false;
  resetBtn.style.display = "none";
});

/* Initialize */
seedNamesIfEmpty().then(() => listenNames());
pickBox.addEventListener("click", pickName);
