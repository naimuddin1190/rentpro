// Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";


// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyDwTxd7Co8JGtKs9l6K0DK80IOyGE7jYns",
  authDomain: "rentpro-bd.firebaseapp.com",
  projectId: "rentpro-bd",
  storageBucket: "rentpro-bd.firebasestorage.app",
  messagingSenderId: "108824360670",
  appId: "1:108824360670:web:1a26fb4e5d489a5d45344f",
  measurementId: "G-40GJ6NRG38"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

console.log("Firebase Connected Successfully");


// ==========================================
// SAVE TENANT
// ==========================================

async function saveTenant(name, room, rent) {

  try {

    const docRef = await addDoc(collection(db, "tenants"), {
      name: name,
      room: room,
      rent: rent,
      createdAt: new Date()
    });

    console.log("Tenant Saved:", docRef.id);

  } catch (e) {

    console.error("Save Error:", e);

  }

}


// ==========================================
// LOAD TENANTS (REALTIME)
// ==========================================

function loadTenants() {

  onSnapshot(collection(db, "tenants"), (snapshot) => {

    const tenants = [];

    snapshot.forEach((doc) => {

      tenants.push({
        id: doc.id,
        ...doc.data()
      });

    });

    console.log("Realtime Data:", tenants);

    // এখানে তোমার UI update করবে
    renderTenants(tenants);

  });

}


// ==========================================
// RENDER UI
// ==========================================

function renderTenants(tenants) {

  const container = document.getElementById("tenantList");

  if (!container) return;

  container.innerHTML = "";

  tenants.forEach((tenant) => {

    container.innerHTML += `
    
      <div style="
        border:1px solid #ddd;
        padding:10px;
        margin:10px;
        border-radius:10px;
      ">
      
        <h3>${tenant.name}</h3>
        <p>Room: ${tenant.room}</p>
        <p>Rent: ৳${tenant.rent}</p>

      </div>

    `;

  });

}


// ==========================================
// BUTTON CLICK SAVE
// ==========================================

window.addTenant = async function () {

  const name = document.getElementById("name").value;

  const room = document.getElementById("room").value;

  const rent = document.getElementById("rent").value;

  if (!name || !room || !rent) {

    alert("সব ফিল্ড পূরণ করুন");

    return;

  }

  await saveTenant(name, room, rent);

};


// Start Realtime Listener
loadTenants();