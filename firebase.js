// Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

// Your Firebase Config
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

// TEST SAVE FUNCTION
async function testSave() {
  try {
    const docRef = await addDoc(collection(db, "tenants"), {
      name: "Naim",
      room: "101",
      rent: 5000
    });

    console.log("Saved ID:", docRef.id);
  } catch (e) {
    console.error("Error:", e);
  }
}

testSave();