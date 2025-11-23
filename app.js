/* Firebase imports */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getFirestore, collection, addDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, serverTimestamp, doc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-analytics.js";

/* Config */
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

let rollingNames = [];
let pickNames = [];
let rollingInterval;
let displayingPicked = false;

/* Snowflakes */
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

/* Twinkling stars */
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

/* Firebase seeding + listening */
async function seedNamesIfEmpty() {
  const ref = collection(db, NAMES_COLLECTION);
  const snap = await getDocs(ref);
  if (snap.empty) {
    for (const name of initialNames) {
      await addDoc(ref, { name, addedAt: serverTimestamp() });
    }
  }
}

function listenNames() {
  const ref = collection(db, NAMES_COLLECTION);
  const q = query(ref, orderBy("addedAt"));
  onSnapshot(q, snapshot => {
    pickNames = snapshot.docs.map(d => ({ id: d.id, name: d.data().name }));
    rollingNames = snapshot.docs.map(d => ({ id: d.id, name: d.data().name })); // always all names for rolling

    if (pickNames.length === 0) {
      pickBox.classList.add("disabled");
      pickBox.textContent = "All Child paired! 🎉";
      message.textContent = "";
    } else {
      pickBox.classList.remove("disabled");
      pickBox.textContent = "Click to find Santa Child";
      message.textContent = "";
      pickBox.disabled = false;
    }
  });
}

/* PICK NAME FUNCTION */
async function pickName() {
  if (!pickNames.length || displayingPicked) return;
  pickBox.disabled = true;

  pickBox.style.backgroundColor = "#3ba1ff";
  pickBox.style.color = "#e9f7ff";

  let rollDuration = 5000;
  rollingInterval = setInterval(() => {
    if (rollingNames.length === 0) return;
    const idx = Math.floor(Math.random() * rollingNames.length);
    if (window.innerWidth >= 600) {
      pickBox.textContent = rollingNames[idx].name;
    }
  }, 200);

  setTimeout(async () => {
    clearInterval(rollingInterval);

    if (pickNames.length === 0) return;
    const idx = Math.floor(Math.random() * pickNames.length);
    const picked = pickNames[idx];
    displayingPicked = true;

    pickBox.style.backgroundColor = "#7fd4ff";
    pickBox.style.color = "#002f55";

    pickBox.classList.add("revealed");
    message.textContent = "Your Santa Game Child is:";
    pickBox.textContent = picked.name;

    setTimeout(async () => {
      await deleteDoc(doc(db, NAMES_COLLECTION, picked.id));
      pickNames.splice(idx, 1); // remove only from pickNames

      displayingPicked = false;
      pickBox.textContent = "Click to find Santa Child";

      pickBox.style.backgroundColor = "#1e78c8";
      pickBox.style.color = "#e9f6ff";

      pickBox.classList.remove("revealed");
      pickBox.disabled = false;
      message.textContent = "";

    }, 5000);

  }, rollDuration);
}

pickBox.addEventListener("click", pickName);

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

  const snap = await getDocs(collection(db, NAMES_COLLECTION));
  await Promise.all(snap.docs.map(d => deleteDoc(doc(db, NAMES_COLLECTION, d.id))));
  await Promise.all(initialNames.map(name => addDoc(collection(db, NAMES_COLLECTION), { name, addedAt: serverTimestamp() })));

  pickBox.textContent = "Click to find Santa Child";
  pickBox.disabled = false;
  resetBtn.disabled = false;
  resetBtn.style.display = "none";
  message.textContent = "";
});

seedNamesIfEmpty().then(() => listenNames());
