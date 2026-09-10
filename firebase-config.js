/* ======================================================================
   FIREBASE CONFIG
   ----------------------------------------------------------------------
   Firebase project: epr-manage

   Keep this file in the same directory as:
   - index.html
   - styles.css
   - app.js

   The Firebase Web API key is not a database password. Data access is
   controlled by Firebase Authentication and Firestore Security Rules.
====================================================================== */

export const firebaseConfig = {
    apiKey: "AIzaSyCVRQbkg_ZUcuYAH9qzAnppXpMU6x15qcQ",
    authDomain: "epr-manage.firebaseapp.com",
    projectId: "epr-manage",
    storageBucket: "epr-manage.firebasestorage.app",
    messagingSenderId: "516443213633",
    appId: "1:516443213633:web:f48a8b1b74708911225bc0"
};

/* ======================================================================
   FIRESTORE COLLECTION NAMES
   ----------------------------------------------------------------------
   Collection names are case-sensitive.

   JOURNAL_ENTRIES remains "journal_entries" because that is the collection
   name already used by your existing Firebase project.
====================================================================== */

export const COLLECTIONS = Object.freeze({
    // System and users
    META: "meta",
    USERS: "users",

    // Main financial records
    TRANSACTIONS: "transactions",
    RECORDS: "records",
    INVOICES: "invoices",
    BILLS: "bills",
    EXPENSES: "expenses",
    INCOME: "income",
    CHEQUES: "cheques",

    // Contacts and operational records
    CUSTOMERS: "customers",
    SUPPLIERS: "suppliers",
    INVENTORY: "inventory",
    PROJECTS: "projects",
    BUDGETS: "budgets",

    // Accounting records
    BANKS: "banks",
    ACCOUNTS: "accounts",
    JOURNAL_ENTRIES: "journal_entries"
});
