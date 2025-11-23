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
try { getAnalytics(app); } catch(e){}

/* Constants */
const NAMES_COLLECTION = "christmas_names";
const initialNames = ["Keerthy","Manisha","Lindsa","Abhishek","Akhilesh","Gopi","Pavan","Santosh","Guru","Balaji","Vedant","Kaushal"];

const pickBox = document.getElementById("pickBox");
const message = document.getElementById("message");
const resetBtn = document.getElementById("resetBtn");
const adminPanelBtn = document.getElementById("adminPanelBtn");
const ADMIN_EMAIL = "grootsanta@gmail.in";

let pickNames = [];
let displayingPicked = false;

/* AUTO-REFRESH LISTENER (fires on all devices when admin resets) */
function listenForResetFlag() {
  const resetRef = doc(db, "config", "resetFlag");
  onSnapshot(resetRef, (snap) => {
    if (!snap.exists()) return;

    const data = snap.data();
    const lastReset = localStorage.getItem("lastResetTime");

    if (data.time !== lastReset) {
      // Save so reload occurs only once
      localStorage.setItem("lastResetTime", data.time);
      location.reload();   // 🔄 AUTO REFRESH DEVICE
    }
  });
}

/* Snowflakes & Stars */
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

function createStar() {
  const star = document.createElement("div");
  star.className = "star";
  const size = Math.random() * 3 + 1;
  star.style.width = size + "px";
  star.style.height = size + "px";
  star.style.top = Math.random() * window.innerHeight + "px";
  star.style.left = Math.random() * window.innerWidth + "px";
  star.style.animationDuration = 1 + Math.random() * 3 + "s";
  document.body.appendChild(star);
  setTimeout(() => star.remove(), 10000);
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

/* Firestore listener for names */
function listenNames() {
  const ref = collection(db, NAMES_COLLECTION);
  const q = query(ref, orderBy("addedAt"));
  onSnapshot(q, snapshot => {
    pickNames = snapshot.docs.map(d => ({ id: d.id, name: d.data().name }));

    const pickedName = localStorage.getItem("pickedName");

    if (pickedName && !pickNames.find(p => p.name === pickedName)) {
      pickBox.textContent = pickedName;
      pickBox.disabled = true;
      pickBox.classList.add("disabled");
      pickBox.style.backgroundColor = "#7fd4ff";
      pickBox.style.color = "#002f55";

      message.textContent = "Your Santa child is:";
      message.classList.remove("pop");
      void message.offsetWidth;
      message.classList.add("pop");

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
      if (pickedName) localStorage.removeItem("pickedName");
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

  await new Promise(resolve => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * initialNames.length);
      pickBox.textContent = initialNames[idx];
      if (Date.now() - startTime >= 5000) {
        clearInterval(interval);
        resolve();
      }
    }, 200);
  });

  if (!pickNames.length) {
    displayingPicked = false;
    pickBox.textContent = "All Child paired! 🎉";
    return;
  }

  const idx = Math.floor(Math.random() * pickNames.length);
  const picked = pickNames[idx];

  pickBox.style.backgroundColor = "#7fd4ff";
  pickBox.style.color = "#002f55";
  pickBox.classList.add("revealed");
  pickBox.textContent = picked.name;

  localStorage.setItem("pickedName", picked.name);
  await deleteDoc(doc(db, NAMES_COLLECTION, picked.id));
  pickNames.splice(idx, 1);
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
      alert("Admin logged in! Reset button is now visible.");
    } else {
      alert("You are not authorized as admin.");
    }
  } catch (e) {
    alert("Login failed: " + e.message);
  }
});

/* RESET BUTTON (ADMIN) */
resetBtn.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to reset all names?")) return;

  resetBtn.disabled = true;
  pickBox.disabled = true;
  pickBox.textContent = "Resetting...";
  message.textContent = "";

  const snap = await getDocs(collection(db, NAMES_COLLECTION));
  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, NAMES_COLLECTION, d.id))));

  await Promise.all(initialNames.map(name =>
    addDoc(collection(db, NAMES_COLLECTION), { name, addedAt: serverTimestamp() })
  ));

  localStorage.removeItem("pickedName");

  /* 🔥 AUTO REFRESH TRIGGER FOR ALL DEVICES */
  await setDoc(doc(db, "config", "resetFlag"), {
    time: Date.now().toString()
  });

  pickBox.textContent = "Click to find Santa Child";
  pickBox.disabled = false;
  pickBox.classList.remove("disabled");
  pickBox.style.backgroundColor = "#1e78c8";
  pickBox.style.color = "#e9f6ff";
  message.textContent = "";

  resetBtn.style.display = "none";
  resetBtn.disabled = false;
});

/* Initialize App */
seedNamesIfEmpty().then(() => {
  listenForResetFlag();  // 🔄 Start auto-refresh listener
  listenNames();         // 🔥 Start Firestore listener
});
pickBox.addEventListener("click", pickName);
