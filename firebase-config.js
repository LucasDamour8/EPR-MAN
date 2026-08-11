import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const firebaseConfig = {
    apiKey: "AIzaSyCVRQbkg_ZUcuYAH9qzAnppXpMU6x15qcQ",
    authDomain: "epr-manage.firebaseapp.com",
    projectId: "epr-manage",
    storageBucket: "epr-manage.firebasestorage.app",
    messagingSenderId: "516443213633",
    appId: "1:516443213633:web:f48a8b1b74708911225bc0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export const COLLECTIONS = {
    USERS: "users",
    TRANSACTIONS: "transactions"
};
