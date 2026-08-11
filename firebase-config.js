/* ======================================================================
   FIREBASE CONFIG
   ----------------------------------------------------------------------
   This file was missing from your project — that's why the app got
   stuck on "Connecting to EPR database…". app.js does:

       import { firebaseConfig, COLLECTIONS } from './firebase-config.js';

   With no file at that path, the browser fails the module import and
   silently stops executing app.js, so checkFirstRun() never runs and
   the boot screen never gets hidden.

   Values below are copied from your Firebase Console → Project settings
   → epr-manage (Web app) → SDK setup and configuration screenshot.

   NOTE: it's normal and safe for firebaseConfig to be visible in
   client-side code — this apiKey is not a secret. Actual access control
   is enforced by your Firestore Security Rules (see README.md), not by
   hiding this file.
====================================================================== */

export const firebaseConfig = {
    apiKey: "AIzaSyCVRQbkg_ZUcuYAH9qzAnppXpMU6x15qcQ",
    authDomain: "epr-manage.firebaseapp.com",
    projectId: "epr-manage",
    storageBucket: "epr-manage.firebasestorage.app",
    messagingSenderId: "516443213633",
    appId: "1:516443213633:web:f48a8b1b74708911225bc0"
};

// Firestore collection names — change here once, used everywhere in app.js
export const COLLECTIONS = {
    USERS: "users",
    TRANSACTIONS: "transactions"
};
