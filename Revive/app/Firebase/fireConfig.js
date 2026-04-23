// firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth'; // Add this line
import { getDatabase } from 'firebase/database';

// Your Firebase configuration (replace with actual credentials)
const firebaseConfig = {
  apiKey: "AIzaSyCKYxZ5GtaYT2puqIVFCEjv4dG8Wz-2Yp8",
  authDomain: "binance-mate-26.firebaseapp.com",
  projectId: "binance-mate-26",
  storageBucket: "binance-mate-26.firebasestorage.app",
  databaseURL: "https://binance-mate-26-default-rtdb.firebaseio.com",
  messagingSenderId: "309550037021",
  appId: "1:309550037021:web:a6cb7c9c5229642267aef4",
  measurementId: "G-83Y9XYY7JP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);
const auth = getAuth(app); // Make sure to initialize auth
const rtdb = getDatabase(app);

export { db, auth, rtdb };
