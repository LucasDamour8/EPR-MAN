import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
    getFirestore, doc, getDoc, setDoc, collection, addDoc, onSnapshot, query, where 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase Configuration from your screenshot
const firebaseConfig = {
    apiKey: "AIzaSyCVRQbkg_ZUcuYAH9qzAnppXPMU6x15qcQ",
    authDomain: "epr-manage.firebaseapp.com",
    projectId: "epr-manage",
    storageBucket: "epr-manage.firebasestorage.app",
    messagingSenderId: "516443213633",
    appId: "1:516443213633:web:f48a8b1b74708911225bc0"
};

// Initialize App Services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Application State Management
let currentUser = null;
let userProfile = null;
let liveTransactions = [];

// DOM Elements
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app-container');
const loginForm = document.getElementById('login-form');
const authError = document.getElementById('auth-error');

// Navigation Switches (Voiding Page Reloads)
document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = item.getAttribute('data-view');
        
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelectorAll('.view-panel').forEach(v => v.classList.remove('active'));

        item.classList.add('active');
        document.getElementById(`view-${targetView}`).classList.add('active');
    });
});

// Authentication Watcher
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
            userProfile = userDoc.data();
            setupDashboardUI();
            attachRealtimeListeners();
            
            authContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
        } else {
            authError.textContent = "User profile configuration missing in database.";
            signOut(auth);
        }
    } else {
        authContainer.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }
});

// Login Form Submit Event
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;

    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
        authError.textContent = "Authentication Failed: " + err.message;
    }
});

// Logout Event
document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

// UI Customization based on Role and Department Access
function setupDashboardUI() {
    document.getElementById('user-display-name').textContent = userProfile.name;
    document.getElementById('user-role-badge').textContent = userProfile.role;

    // Scope Banner Setup
    const scopeBanner = document.getElementById('scope-indicator');
    if (userProfile.role === 'superadmin') {
        scopeBanner.textContent = "All departments and presbyteries — EPR Super Admin";
        document.getElementById('admin-menu-item').classList.remove('hidden');
    } else {
        scopeBanner.textContent = `${userProfile.department} — ${userProfile.presbytery}`;
        document.getElementById('admin-menu-item').classList.add('hidden');
    }
}

// Realtime Data Sync
function attachRealtimeListeners() {
    let txRef = collection(db, "transactions");
    let txQuery;

    // Query filtration according to system hierarchy logic
    if (userProfile.role === 'superadmin') {
        txQuery = txRef;
    } else {
        txQuery = query(
            txRef, 
            where("department", "==", userProfile.department),
            where("presbytery", "==", userProfile.presbytery)
        );
    }

    // Realtime Listener
    onSnapshot(txQuery, (snapshot) => {
        liveTransactions = [];
        snapshot.forEach(doc => {
            liveTransactions.push({ id: doc.id, ...doc.data() });
        });
        renderDashboardMetrics();
        renderTransactionsTable();
        renderFinancialReports();
    });

    // Realtime listener for User Management if Superadmin
    if (userProfile.role === 'superadmin') {
        onSnapshot(collection(db, "users"), (snapshot) => {
            const userTable = document.getElementById('users-table-body');
            userTable.innerHTML = '';
            snapshot.forEach(uDoc => {
                const u = uDoc.data();
                userTable.innerHTML += `
                    <tr>
                        <td>${u.name}</td>
                        <td><span class="badge">${u.role}</span></td>
                        <td>${u.department}</td>
                        <td>${u.presbytery}</td>
                    </tr>
                `;
            });
        });
    }
}

// Render Dashboard Overview Cards
function renderDashboardMetrics() {
    let income = 0;
    let expense = 0;

    liveTransactions.forEach(t => {
        if (t.type === 'Income') income += parseFloat(t.amount);
        if (t.type === 'Expense') expense += parseFloat(t.amount);
    });

    const netProfit = income - expense;

    document.getElementById('net-profit-val').textContent = `RF ${netProfit.toLocaleString()}`;
    document.getElementById('pl-income').textContent = `RF ${income.toLocaleString()}`;
    document.getElementById('pl-expense').textContent = `RF ${expense.toLocaleString()}`;
    document.getElementById('cash-in').textContent = `RF ${income.toLocaleString()}`;
    document.getElementById('cash-out').textContent = `RF ${expense.toLocaleString()}`;

    // Bar Width updates
    const maxVal = Math.max(income, expense) || 1;
    document.getElementById('income-bar').style.width = `${(income / maxVal) * 100}%`;
    document.getElementById('expense-bar').style.width = `${(expense / maxVal) * 100}%`;

    // Overview Department Stat Cards Mapping
    const grid = document.getElementById('overview-grid');
    grid.innerHTML = '';
    
    const overviewItems = [
        "Department of Church Growth",
        "Department of Development and Diakonia",
        "Department of Finance and Administration",
        "Department of Education",
        "Department of Health",
        "EPR Presbytery Zinga",
        "EPR Presbytery Kigali",
        "EPR Presbytery Remera",
        "EPR Presbytery Gitarama",
        "EPR Presbytery Rubengera",
        "EPR Presbytery Kirinda",
        "EPR Presbytery Gisenyi"
    ];

    overviewItems.forEach(item => {
        const count = liveTransactions.filter(t => t.department === item || t.presbytery === item).length;
        grid.innerHTML += `
            <div class="card-item">
                <h5>${item}</h5>
                <div class="value">${count}</div>
            </div>
        `;
    });
}

// Render Transactions List Table
function renderTransactionsTable() {
    const tbody = document.getElementById('tx-table-body');
    tbody.innerHTML = '';

    liveTransactions.forEach(t => {
        tbody.innerHTML += `
            <tr>
                <td>${t.date || 'N/A'}</td>
                <td><span class="badge">${t.type}</span></td>
                <td>${t.description}</td>
                <td>${t.department}</td>
                <td>${t.presbytery}</td>
                <td><strong>RF ${parseFloat(t.amount).toLocaleString()}</strong></td>
            </tr>
        `;
    });
}

// Render Financial Statements
function renderFinancialReports() {
    let income = 0;
    let expense = 0;
    let assets = 0;
    let liabilities = 0;

    liveTransactions.forEach(t => {
        const amt = parseFloat(t.amount);
        if (t.type === 'Income') income += amt;
        if (t.type === 'Expense') expense += amt;
        if (t.type === 'Asset') assets += amt;
        if (t.type === 'Liability') liabilities += amt;
    });

    document.getElementById('stmt-income').textContent = `RF ${income.toLocaleString()}`;
    document.getElementById('stmt-expenses').textContent = `RF ${expense.toLocaleString()}`;
    document.getElementById('stmt-net').textContent = `RF ${(income - expense).toLocaleString()}`;
    
    document.getElementById('stmt-assets').textContent = `RF ${assets.toLocaleString()}`;
    document.getElementById('stmt-liabilities').textContent = `RF ${liabilities.toLocaleString()}`;
    document.getElementById('stmt-equity').textContent = `RF ${(assets - liabilities).toLocaleString()}`;
}

// Modal Handlers for Record Entries
const modal = document.getElementById('tx-modal');
document.getElementById('open-tx-modal-btn').onclick = () => modal.classList.remove('hidden');
document.getElementById('close-tx-modal').onclick = () => modal.classList.add('hidden');

// Submit Transaction
document.getElementById('tx-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('tx-type').value;
    const description = document.getElementById('tx-desc').value;
    const amount = document.getElementById('tx-amount').value;

    await addDoc(collection(db, "transactions"), {
        type,
        description,
        amount: parseFloat(amount),
        department: userProfile.department,
        presbytery: userProfile.presbytery,
        date: new Date().toISOString().split('T')[0]
    });

    modal.classList.add('hidden');
    document.getElementById('tx-form').reset();
});

// Admin Function: Assign Rights & Users
document.getElementById('add-user-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const uid = document.getElementById('user-uid').value;
    const name = document.getElementById('user-name').value;
    const email = document.getElementById('user-email').value;
    const role = document.getElementById('user-role').value;
    const department = document.getElementById('user-dept').value;
    const presbytery = document.getElementById('user-pres').value;

    await setDoc(doc(db, "users", uid), {
        name,
        email,
        role,
        department,
        presbytery
    });

    alert("User privileges registered successfully!");
    document.getElementById('add-user-form').reset();
});

// Excel Export Routine
document.getElementById('export-excel-btn').addEventListener('click', () => {
    const data = liveTransactions.map(t => ({
        Date: t.date,
        Type: t.type,
        Description: t.description,
        Department: t.department,
        Presbytery: t.presbytery,
        Amount: t.amount
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
    XLSX.writeFile(workbook, "EPR_Financial_Report.xlsx");
});