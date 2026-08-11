// 1. Pure CDN Firebase v10 Imports (No npm / local node_modules required)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, setDoc, collection, addDoc, onSnapshot, query, where 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 2. Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCVRQbkg_ZUcuYAH9qzAnppXpMU6x15qcQ", // PASTE YOUR FULL UN-TRUNCATED KEY HERE IF DIFFERENT
    authDomain: "epr-manage.firebaseapp.com",
    projectId: "epr-manage",
    storageBucket: "epr-manage.firebasestorage.app",
    messagingSenderId: "516443213633",
    appId: "1:516443213633:web:f48a8b1b74708911225bc0"
};

// 3. Initialize Firebase Services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// State Variables
let currentUserProfile = null;
let currentTransactions = [];
let unsubscribeTx = null;

// DOM Elements
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const authError = document.getElementById('auth-error');
const userDisplayName = document.getElementById('user-display-name');
const userRoleBadge = document.getElementById('user-role-badge');
const logoutBtn = document.getElementById('logout-btn');
const adminMenuItem = document.getElementById('admin-menu-item');

// Modal Elements
const txModal = document.getElementById('tx-modal');
const openTxModalBtn = document.getElementById('open-tx-modal-btn');
const closeTxModalBtn = document.getElementById('close-tx-modal');
const txForm = document.getElementById('tx-form');

// --- AUTHENTICATION FLOW ---

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // Fetch User Details from Firestore
            const userDocRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userDocRef);

            if (userSnap.exists()) {
                currentUserProfile = userSnap.data();
            } else {
                // Fallback default if doc missing
                currentUserProfile = {
                    name: user.email.split('@')[0],
                    role: 'finance',
                    department: 'Department of Church Growth',
                    presbytery: 'EPR Presbytery Kigali'
                };
            }

            setupUIForUser();
            authContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
            loadRealtimeTransactions();
        } catch (err) {
            console.error("User profile fetch error:", err);
        }
    } else {
        // User is logged out
        currentUserProfile = null;
        if (unsubscribeTx) unsubscribeTx();
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
        authError.textContent = "Authentication Failed: " + err.message;
    }
});

logoutBtn.addEventListener('click', () => signOut(auth));

function setupUIForUser() {
    userDisplayName.textContent = currentUserProfile.name || 'User';
    userRoleBadge.textContent = currentUserProfile.role || 'User';

    if (currentUserProfile.role === 'superadmin') {
        adminMenuItem.classList.remove('hidden');
        loadAllUsersAdmin();
    } else {
        adminMenuItem.classList.add('hidden');
    }
}

// --- NAVIGATION CONTROLLER ---

document.querySelectorAll('.nav-item[data-view]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = link.getAttribute('data-view');

        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        link.classList.add('active');

        document.querySelectorAll('.view-panel').forEach(panel => {
            panel.classList.remove('active');
        });

        document.getElementById(`view-${targetView}`).classList.add('active');
    });
});

// --- REALTIME FIRESTORE DATA LISTENER ---

function loadRealtimeTransactions() {
    if (unsubscribeTx) unsubscribeTx();

    const txCollection = collection(db, 'transactions');
    let txQuery;

    // Superadmin views all; others view restricted scope
    if (currentUserProfile.role === 'superadmin') {
        txQuery = txCollection;
    } else {
        txQuery = query(
            txCollection,
            where('department', '==', currentUserProfile.department),
            where('presbytery', '==', currentUserProfile.presbytery)
        );
    }

    unsubscribeTx = onSnapshot(txQuery, (snapshot) => {
        currentTransactions = [];
        snapshot.forEach(docSnap => {
            currentTransactions.push({ id: docSnap.id, ...docSnap.data() });
        });

        renderTransactionsTable();
        calculateMetrics();
    }, (error) => {
        console.error("Firestore Listener Error:", error);
    });
}

function renderTransactionsTable() {
    const tbody = document.getElementById('tx-table-body');
    tbody.innerHTML = '';

    if (currentTransactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No transactions recorded.</td></tr>';
        return;
    }

    currentTransactions.forEach(tx => {
        const tr = document.createElement('tr');
        const dateStr = tx.createdAt ? new Date(tx.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><strong>${tx.type}</strong></td>
            <td>${tx.description}</td>
            <td>${tx.department}</td>
            <td>${tx.presbytery}</td>
            <td>RF ${Number(tx.amount).toLocaleString()}</td>
        `;
        tbody.appendChild(tr);
    });
}

function calculateMetrics() {
    let income = 0, expense = 0, assets = 0, liabilities = 0;

    currentTransactions.forEach(tx => {
        const amt = parseFloat(tx.amount) || 0;
        if (tx.type === 'Income') income += amt;
        if (tx.type === 'Expense') expense += amt;
        if (tx.type === 'Asset') assets += amt;
        if (tx.type === 'Liability') liabilities += amt;
    });

    const netProfit = income - expense;
    const equity = assets - liabilities;

    // Overview Tab Metrics
    document.getElementById('stat-count').textContent = `${currentTransactions.length} Records`;
    document.getElementById('net-profit-val').textContent = `RF ${netProfit.toLocaleString()}`;
    document.getElementById('pl-income').textContent = `RF ${income.toLocaleString()}`;
    document.getElementById('pl-expense').textContent = `RF ${expense.toLocaleString()}`;
    document.getElementById('cash-in').textContent = `RF ${income.toLocaleString()}`;
    document.getElementById('cash-out').textContent = `RF ${expense.toLocaleString()}`;

    // Financial Statements Tab Metrics
    document.getElementById('stmt-income').textContent = `RF ${income.toLocaleString()}`;
    document.getElementById('stmt-expenses').textContent = `RF ${expense.toLocaleString()}`;
    document.getElementById('stmt-net').textContent = `RF ${netProfit.toLocaleString()}`;
    document.getElementById('stmt-assets').textContent = `RF ${assets.toLocaleString()}`;
    document.getElementById('stmt-liabilities').textContent = `RF ${liabilities.toLocaleString()}`;
    document.getElementById('stmt-equity').textContent = `RF ${equity.toLocaleString()}`;

    // Progress Bar Ratios
    const totalPL = income + expense || 1;
    document.getElementById('income-bar').style.width = `${(income / totalPL) * 100}%`;
    document.getElementById('expense-bar').style.width = `${(expense / totalPL) * 100}%`;
}

// --- ADD TRANSACTION RECORD ---

openTxModalBtn.addEventListener('click', () => txModal.classList.remove('hidden'));
closeTxModalBtn.addEventListener('click', () => txModal.classList.add('hidden'));

txForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('tx-type').value;
    const description = document.getElementById('tx-desc').value;
    const amount = parseFloat(document.getElementById('tx-amount').value);

    try {
        await addDoc(collection(db, 'transactions'), {
            type,
            description,
            amount,
            department: currentUserProfile.department,
            presbytery: currentUserProfile.presbytery,
            createdAt: new Date()
        });

        txForm.reset();
        txModal.classList.add('hidden');
    } catch (err) {
        alert("Error saving transaction: " + err.message);
    }
});

// --- ADMIN & EXPORT FUNCTIONS ---

document.getElementById('print-btn').addEventListener('click', () => window.print());

document.getElementById('export-excel-btn').addEventListener('click', () => {
    if (currentTransactions.length === 0) {
        alert("No transaction data available to export.");
        return;
    }
    const worksheet = XLSX.utils.json_to_sheet(currentTransactions);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
    XLSX.writeFile(workbook, "EPR_Financial_Report.xlsx");
});

// User Admin Management
const addUserForm = document.getElementById('add-user-form');
if (addUserForm) {
    addUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const uid = document.getElementById('user-uid').value.trim();
        const name = document.getElementById('user-name').value;
        const email = document.getElementById('user-email').value;
        const role = document.getElementById('user-role').value;
        const department = document.getElementById('user-dept').value;
        const presbytery = document.getElementById('user-pres').value;

        try {
            await setDoc(doc(db, 'users', uid), {
                name, email, role, department, presbytery
            });
            alert("User privileges saved successfully.");
            addUserForm.reset();
        } catch (err) {
            alert("Error saving user profile: " + err.message);
        }
    });
}

function loadAllUsersAdmin() {
    onSnapshot(collection(db, 'users'), (snapshot) => {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        snapshot.forEach(docSnap => {
            const u = docSnap.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${u.name || 'N/A'}</td>
                <td><span class="badge">${u.role}</span></td>
                <td>${u.department}</td>
                <td>${u.presbytery}</td>
            `;
            tbody.appendChild(tr);
        });
    });
}
