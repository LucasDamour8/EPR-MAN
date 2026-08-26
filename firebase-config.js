/* ======================================================================
   FIREBASE CONFIG
   ----------------------------------------------------------------------
   Values copied from Firebase Console → Project settings → epr-manage
   (Web app) → SDK setup and configuration.
   It's normal and safe for firebaseConfig to be visible in client-side
   code — this apiKey is not a secret. Actual access control is enforced
   by Firestore Security Rules + Firebase Authentication, not by hiding
   this file.
====================================================================== */
export const firebaseConfig = {
    apiKey: "AIzaSyCVRQbkg_ZUcuYAH9qzAnppXpMU6x15qcQ",
    authDomain: "epr-manage.firebaseapp.com",
    projectId: "epr-manage",
    storageBucket: "epr-manage.firebasestorage.app",
    messagingSenderId: "516443213633",
    appId: "1:516443213633:web:f48a8b1b74708911225bc0"
};

// Firestore collection / doc names — change here once, used everywhere in app.js
export const COLLECTIONS = {
    USERS: "users",
    TRANSACTIONS: "transactions",
    META: "meta",
    INVOICES: "invoices",
    BILLS: "bills",
    CHEQUES: "cheques",
    SUPPLIERS: "suppliers",
    CUSTOMERS: "customers",
    PROJECTS: "projects",
    BUDGETS: "budgets",
    BANKS: "banks",
    ACCOUNTS: "accounts",
    JOURNAL_ENTRIES: "journal_entries"
};
