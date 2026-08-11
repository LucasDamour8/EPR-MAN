/* ======================================================================
   EPR FINANCIAL & OPERATIONS SYSTEM — Firestore-backed
   ----------------------------------------------------------------------
   All users and transactions live in Cloud Firestore. Nothing in this
   file is hardcoded demo data — usersDb / transactionsDb are just local
   in-memory *caches* kept in sync with Firestore via onSnapshot()
   listeners, so every screen updates live the moment data changes.

   AUTHENTICATION: this app uses real Firebase Authentication
   (email/password). Firestore Security Rules key off request.auth.uid,
   so signing in through Firebase Auth (not just matching a Firestore
   field) is what makes request.auth non-null and the rules pass.

   Data scoping is enforced at the QUERY level, not just in the UI:
   a non-superadmin's transactions query always carries
   where('department','==', theirDept) + where('presbytery','==', theirPres),
   so they can only ever fetch documents inside their own assignment.
====================================================================== */

import { firebaseConfig, COLLECTIONS } from './firebase-config.js';
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, setDoc, getDoc,
    onSnapshot, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

// ---------------------------------------------------------------------
// 1. FIXED ORGANIZATION STRUCTURE
// ---------------------------------------------------------------------
const EPR_STRUCTURE = {
    "Department of Church Growth": ["Evangelization", "Youth", "Women and family", "CFD"],
    "Department of Development and Diakonia": ["Development", "Project SCA", "Project CCDP", "Diakonia"],
    "Department of Finance and Administration": ["Functioning", "Information"],
    "Department of Education": ["Education", "CPAJ"],
    "Department of Health": ["Health Projects"]
};

const DEPT_ICONS = {
    "Department of Church Growth": "fa-church",
    "Department of Development and Diakonia": "fa-hand-holding-hand",
    "Department of Finance and Administration": "fa-coins",
    "Department of Education": "fa-graduation-cap",
    "Department of Health": "fa-notes-medical"
};

const PRESBYTERIES = [
    "EPR Presbytery Zinga", "EPR Presbytery Kigali", "EPR Presbytery Remera",
    "EPR Presbytery Gitarama", "EPR Presbytery Rubengera", "EPR Presbytery Kirinda", "EPR Presbytery Gisenyi"
];

const ROLE_LABELS = { superadmin: "Superadmin", manager: "Manager", finance: "Finance User" };

// ---------------------------------------------------------------------
// 2. LOCAL CACHES (populated live from Firestore — never hand-edited)
// ---------------------------------------------------------------------
let usersDb = [];
let transactionsDb = [];

// ---------------------------------------------------------------------
// 3. APPLICATION STATE
// ---------------------------------------------------------------------
let currentUser = null;               // { id, name, email, role, presbytery, department, subsection, ... }
let currentScope = { presbytery: "ALL", department: "ALL" };
let searchQuery = "";
let txFilters = { type: "ALL", from: "", to: "" };
let userListRoleFilter = "ALL";
let pendingConfirm = null;
let activeOrgTab = "departments";

let unsubTx = null;
let unsubUsers = null;
let unsubOwnProfile = null;

// ---------------------------------------------------------------------
// 4. DOM SHORTCUTS
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------------------------------------------------------------------
// 5. BOOT
// ---------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    buildStaticSelectOptions();
    setupEventListeners();
    populateSubsections('user-dept', 'user-subsection');
    await checkFirstRun();
});

// Uses the public meta/system flag instead of listing /users, so this
// works even while signed out (avoids the permission error you hit).
async function checkFirstRun() {
    try {
        const metaSnap = await getDoc(doc(db, COLLECTIONS.META, 'system'));
        $('boot-screen').classList.add('hidden');
        const initialized = metaSnap.exists() && metaSnap.data().initialized === true;
        if (!initialized) {
            $('setup-container').classList.remove('hidden');
        } else {
            $('auth-container').classList.remove('hidden');
        }
    } catch (err) {
        $('boot-screen').innerHTML = `
            <div style="max-width:420px;text-align:center;color:#fecaca;">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:1.8rem;margin-bottom:10px;"></i>
                <p><strong>Couldn't connect to Firestore.</strong></p>
                <p style="font-size:.82rem;margin-top:6px;color:#94a3b8;">Check firebase-config.js has your real project keys, and that your Firestore security rules allow public read on meta/system. (${err.message})</p>
            </div>`;
    }
}

// ---------------------------------------------------------------------
// 6. STATIC SELECT OPTIONS
// ---------------------------------------------------------------------
function buildStaticSelectOptions() {
    fillSelect($('sa-presbytery-select'), PRESBYTERIES, "ALL", "-- All Presbyteries --");
    fillSelect($('sa-department-select'), Object.keys(EPR_STRUCTURE), "ALL", "-- All Departments --");
    fillSelect($('user-pres'), PRESBYTERIES);
    fillSelect($('user-dept'), Object.keys(EPR_STRUCTURE));
    renderSidebarFilters();
}

function fillSelect(select, values, prependValue, prependLabel) {
    select.innerHTML = '';
    if (prependValue !== undefined) {
        const opt = document.createElement('option');
        opt.value = prependValue; opt.textContent = prependLabel;
        select.appendChild(opt);
    }
    values.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        select.appendChild(opt);
    });
}

function renderSidebarFilters() {
    const deptMenu = $('dept-sidebar-menu');
    const presMenu = $('pres-sidebar-menu');
    deptMenu.innerHTML = '';
    presMenu.innerHTML = '';

    const allDept = document.createElement('button');
    allDept.type = 'button'; allDept.className = 'nav-item filter-dept'; allDept.dataset.dept = 'ALL';
    allDept.innerHTML = `<i class="fa-solid fa-layer-group"></i> All Departments`;
    deptMenu.appendChild(allDept);

    Object.keys(EPR_STRUCTURE).forEach(d => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'nav-item filter-dept'; btn.dataset.dept = d;
        btn.innerHTML = `<i class="fa-solid ${DEPT_ICONS[d] || 'fa-building'}"></i> ${shortDeptName(d)}`;
        deptMenu.appendChild(btn);
    });

    const allPres = document.createElement('button');
    allPres.type = 'button'; allPres.className = 'nav-item filter-pres'; allPres.dataset.pres = 'ALL';
    allPres.innerHTML = `<i class="fa-solid fa-globe"></i> All Presbyteries`;
    presMenu.appendChild(allPres);

    PRESBYTERIES.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'nav-item filter-pres'; btn.dataset.pres = p;
        btn.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${p.replace('EPR Presbytery ', '')}`;
        presMenu.appendChild(btn);
    });

    qsa('.filter-dept', deptMenu).forEach(item => item.addEventListener('click', onSidebarDeptFilter));
    qsa('.filter-pres', presMenu).forEach(item => item.addEventListener('click', onSidebarPresFilter));
}

function shortDeptName(d) { return (d || '').replace('Department of ', ''); }

// ---------------------------------------------------------------------
// 7. EVENT WIRING
// ---------------------------------------------------------------------
function setupEventListeners() {
    // ---- First-run setup ----
    $('setup-form').addEventListener('submit', onSubmitSetupForm);

    // ---- Auth ----
    $('login-form').addEventListener('submit', onSubmitLogin);
    $('forgot-password-btn').addEventListener('click', onForgotPassword);

    qsa('.pw-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = $(btn.dataset.toggleFor);
            const icon = btn.querySelector('i');
            if (target.type === 'password') { target.type = 'text'; icon.className = 'fa-solid fa-eye-slash'; }
            else { target.type = 'password'; icon.className = 'fa-solid fa-eye'; }
        });
    });

    $('logout-btn').addEventListener('click', doLogout);

    // ---- Sidebar mobile toggle ----
    $('hamburger-btn').addEventListener('click', () => toggleSidebar(true));
    $('sidebar-close-btn').addEventListener('click', () => toggleSidebar(false));
    $('sidebar-overlay').addEventListener('click', () => toggleSidebar(false));

    // ---- Profile dropdown ----
    $('profile-toggle').addEventListener('click', (e) => { e.stopPropagation(); $('profile-dropdown').classList.toggle('hidden'); });
    document.addEventListener('click', () => {
        $('profile-dropdown').classList.add('hidden');
        $('search-results-dropdown').classList.add('hidden');
    });
    $('profile-dropdown').addEventListener('click', (e) => e.stopPropagation());

    $('notif-btn').addEventListener('click', () => {
        $('notif-dot').classList.add('hidden');
        showToast('info', "You're all caught up — no new notifications.");
    });

    // ---- Sidebar View Switcher ----
    qsa('.nav-item[data-view]').forEach(item => item.addEventListener('click', () => switchView(item.getAttribute('data-view'))));

    // ---- Superadmin Dropdown Filters (re-queries Firestore live) ----
    $('sa-presbytery-select').addEventListener('change', (e) => { currentScope.presbytery = e.target.value; onScopeChanged(); });
    $('sa-department-select').addEventListener('change', (e) => { currentScope.department = e.target.value; onScopeChanged(); });
    $('scope-reset-btn').addEventListener('click', () => {
        currentScope = { presbytery: 'ALL', department: 'ALL' };
        $('sa-presbytery-select').value = 'ALL'; $('sa-department-select').value = 'ALL';
        onScopeChanged();
        showToast('info', 'Scope reset to all presbyteries and departments.');
    });

    // ---- Global Search (live, client-side over the already-scoped cache) ----
    $('global-search').addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        $('search-clear-btn').style.display = searchQuery ? 'inline-flex' : 'none';
        renderSearchDropdown();
        renderTransactionsTable(getFilteredTransactions());
    });
    $('global-search').addEventListener('focus', () => { if (searchQuery) renderSearchDropdown(); });
    $('search-clear-btn').addEventListener('click', () => {
        $('global-search').value = ''; searchQuery = '';
        $('search-clear-btn').style.display = 'none';
        $('search-results-dropdown').classList.add('hidden');
        renderTransactionsTable(getFilteredTransactions());
    });

    // ---- Transactions view filters ----
    $('tx-filter-type').addEventListener('change', (e) => { txFilters.type = e.target.value; renderTransactionsTable(getFilteredTransactions()); });
    $('tx-filter-from').addEventListener('change', (e) => { txFilters.from = e.target.value; renderTransactionsTable(getFilteredTransactions()); });
    $('tx-filter-to').addEventListener('change', (e) => { txFilters.to = e.target.value; renderTransactionsTable(getFilteredTransactions()); });
    $('tx-filter-reset').addEventListener('click', () => {
        txFilters = { type: 'ALL', from: '', to: '' };
        $('tx-filter-type').value = 'ALL'; $('tx-filter-from').value = ''; $('tx-filter-to').value = '';
        renderTransactionsTable(getFilteredTransactions());
    });

    // ---- Org chart tabs ----
    qsa('.org-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activeOrgTab = btn.dataset.orgTab;
            qsa('.org-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
            $('org-panel-departments').classList.toggle('hidden', activeOrgTab !== 'departments');
            $('org-panel-presbyteries').classList.toggle('hidden', activeOrgTab !== 'presbyteries');
        });
    });

    // ---- User creation: role toggles scope fields; dept toggles subsections ----
    $('user-role').addEventListener('change', () => {
        const isSuper = $('user-role').value === 'superadmin';
        $('user-scope-fields').classList.toggle('hidden', isSuper);
        qsa('#user-scope-fields select').forEach(sel => sel.required = !isSuper);
    });
    $('user-dept').addEventListener('change', () => populateSubsections('user-dept', 'user-subsection'));

    // ---- Add / Edit User Form ----
    $('add-user-form').addEventListener('submit', onSubmitUserForm);
    $('user-cancel-edit-btn').addEventListener('click', resetUserForm);
    $('user-send-reset-btn').addEventListener('click', onSendResetForEditedUser);
    $('users-table-body').addEventListener('click', onUsersTableClick);
    $('user-list-role-filter').addEventListener('change', (e) => { userListRoleFilter = e.target.value; renderUsersTable(); });

    // ---- Transaction modal ----
    const txModal = $('tx-modal');
    $('open-tx-modal-btn').addEventListener('click', () => openTxModal());
    $('close-tx-modal').addEventListener('click', closeTxModal);
    txModal.addEventListener('click', (e) => { if (e.target === txModal) closeTxModal(); });
    $('tx-form').addEventListener('submit', onSubmitTxForm);
    $('tx-table-body').addEventListener('click', onTxTableClick);

    // ---- Confirm modal ----
    $('close-confirm-modal').addEventListener('click', closeConfirmModal);
    $('confirm-cancel-btn').addEventListener('click', closeConfirmModal);
    $('confirm-ok-btn').addEventListener('click', () => {
        if (pendingConfirm && typeof pendingConfirm.onConfirm === 'function') pendingConfirm.onConfirm();
        closeConfirmModal();
    });
    $('confirm-modal').addEventListener('click', (e) => { if (e.target === $('confirm-modal')) closeConfirmModal(); });

    // ---- Report Actions ----
    $('print-btn').addEventListener('click', () => window.print());
    $('export-excel-btn').addEventListener('click', exportReportToExcel);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTxModal(); closeConfirmModal();
            $('search-results-dropdown').classList.add('hidden');
            $('profile-dropdown').classList.add('hidden');
        }
    });
}

function toggleSidebar(open) {
    $('sidebar').classList.toggle('open', open);
    $('sidebar-overlay').classList.toggle('show', open);
}

function onSidebarDeptFilter(e) {
    e.preventDefault();
    if (currentUser.role !== 'superadmin') return;
    const dept = e.currentTarget.getAttribute('data-dept');
    $('sa-department-select').value = dept;
    currentScope.department = dept;
    switchView('transactions');
    onScopeChanged();
    toggleSidebar(false);
}

function onSidebarPresFilter(e) {
    e.preventDefault();
    if (currentUser.role !== 'superadmin') return;
    const pres = e.currentTarget.getAttribute('data-pres');
    $('sa-presbytery-select').value = pres;
    currentScope.presbytery = pres;
    switchView('transactions');
    onScopeChanged();
    toggleSidebar(false);
}

function highlightSidebarFilters() {
    qsa('.filter-dept').forEach(b => b.classList.toggle('active-filter', b.dataset.dept === currentScope.department));
    qsa('.filter-pres').forEach(b => b.classList.toggle('active-filter', b.dataset.pres === currentScope.presbytery));
}

function renderActiveScopeChips() {
    const wrap = $('active-scope-chips');
    wrap.innerHTML = '';
    if (currentScope.department !== 'ALL') wrap.appendChild(makeChip(shortDeptName(currentScope.department), () => { currentScope.department = 'ALL'; $('sa-department-select').value = 'ALL'; onScopeChanged(); }));
    if (currentScope.presbytery !== 'ALL') wrap.appendChild(makeChip(currentScope.presbytery.replace('EPR Presbytery ', ''), () => { currentScope.presbytery = 'ALL'; $('sa-presbytery-select').value = 'ALL'; onScopeChanged(); }));
}
function makeChip(label, onRemove) {
    const chip = document.createElement('span');
    chip.className = 'scope-chip';
    chip.innerHTML = `${escapeHtml(label)} <button type="button" aria-label="Remove filter">&times;</button>`;
    chip.querySelector('button').addEventListener('click', onRemove);
    return chip;
}

// ---------------------------------------------------------------------
// 8. VIEW SWITCHING
// ---------------------------------------------------------------------
function switchView(target) {
    qsa('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.getAttribute('data-view') === target));
    qsa('.view-panel').forEach(panel => panel.classList.remove('active'));
    $(`view-${target}`).classList.add('active');
    if (target === 'departments') renderOrgChart();
}

// ---------------------------------------------------------------------
// 9. FIRST-RUN SETUP (creates the one and only bootstrap Superadmin)
//    Order matters here: create the Auth account, then the /users/{uid}
//    profile doc (allowed by "self-create"), THEN the meta/system flag
//    (allowed because by that point isSuperAdmin() resolves true).
// ---------------------------------------------------------------------
async function onSubmitSetupForm(e) {
    e.preventDefault();
    $('setup-error').textContent = '';
    const name = $('setup-name').value.trim();
    const email = $('setup-email').value.trim().toLowerCase();
    const password = $('setup-password').value;

    if (!name || !email || password.length < 6) {
        $('setup-error').textContent = 'Fill in your name, a valid email, and a password of at least 6 characters.';
        return;
    }

    const btn = $('setup-submit-btn');
    btn.disabled = true; btn.textContent = 'Creating account…';
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        const payload = { name, email, role: 'superadmin', presbytery: 'ALL', department: 'ALL', subsection: 'ALL', createdAt: serverTimestamp() };
        await setDoc(doc(db, COLLECTIONS.USERS, cred.user.uid), payload);
        await setDoc(doc(db, COLLECTIONS.META, 'system'), { initialized: true, initializedAt: serverTimestamp() });

        currentUser = { id: cred.user.uid, ...payload };
        $('setup-container').classList.add('hidden');
        initAppSession();
        showToast('success', `Welcome, ${name}. Your Superadmin account is ready.`);
    } catch (err) {
        $('setup-error').textContent = "Couldn't create the account: " + describeAuthError(err);
    } finally {
        btn.disabled = false; btn.textContent = 'Create Superadmin & Continue';
    }
}

// ---------------------------------------------------------------------
// 10. LOGIN / LOGOUT / PASSWORD RESET
// ---------------------------------------------------------------------
async function onSubmitLogin(e) {
    e.preventDefault();
    $('auth-error').textContent = '';
    const email = $('login-email').value.trim().toLowerCase();
    const password = $('login-password').value;
    if (!email || !password) { $('auth-error').textContent = 'Enter both your email and password.'; return; }

    const btn = $('login-submit-btn');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        const snap = await getDoc(doc(db, COLLECTIONS.USERS, cred.user.uid));
        if (!snap.exists()) {
            await signOut(auth);
            $('auth-error').textContent = 'This account has no profile on record. Contact your Superadmin.';
            return;
        }
        currentUser = { id: snap.id, ...snap.data() };
        $('login-form').reset();
        $('auth-container').classList.add('hidden');
        initAppSession();
    } catch (err) {
        $('auth-error').textContent = describeAuthError(err);
    } finally {
        btn.disabled = false; btn.textContent = 'Sign In';
    }
}

async function onForgotPassword() {
    const email = ($('login-email').value || '').trim().toLowerCase();
    if (!email) { $('auth-error').textContent = 'Enter your email above first, then tap "Forgot your password?".'; return; }
    try {
        await sendPasswordResetEmail(auth, email);
        showToast('success', `Password reset email sent to ${email}.`);
    } catch (err) {
        $('auth-error').textContent = describeAuthError(err);
    }
}

function doLogout() {
    if (unsubTx) { unsubTx(); unsubTx = null; }
    if (unsubUsers) { unsubUsers(); unsubUsers = null; }
    if (unsubOwnProfile) { unsubOwnProfile(); unsubOwnProfile = null; }
    signOut(auth).catch(() => {});
    currentUser = null;
    usersDb = []; transactionsDb = [];
    currentScope = { presbytery: 'ALL', department: 'ALL' };
    searchQuery = ''; txFilters = { type: 'ALL', from: '', to: '' };
    $('app-container').classList.add('hidden');
    $('auth-container').classList.remove('hidden');
    $('profile-dropdown').classList.add('hidden');
}

function describeAuthError(err) {
    const code = err && err.code ? err.code : '';
    const map = {
        'auth/email-already-in-use': 'That email is already registered.',
        'auth/invalid-email': 'That email address looks invalid.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/user-not-found': 'Invalid email or password.',
        'auth/wrong-password': 'Invalid email or password.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/too-many-requests': 'Too many attempts — please wait a moment and try again.',
        'auth/operation-not-allowed': 'Email/Password sign-in is disabled for this project — enable it in Firebase Console → Authentication → Sign-in method.'
    };
    return map[code] || (err && err.message) || 'Something went wrong.';
}

// ---------------------------------------------------------------------
// 11. SESSION INITIALIZER
// ---------------------------------------------------------------------
function initAppSession() {
    $('app-container').classList.remove('hidden');
    const isSuper = currentUser.role === 'superadmin';

    $('admin-menu-item').classList.toggle('hidden', !isSuper);
    $('superadmin-filter-bar').classList.toggle('hidden', !isSuper);
    $('admin-filter-section').classList.toggle('hidden', !isSuper);
    $('my-assignment-card').classList.toggle('hidden', isSuper);

    if (isSuper) {
        currentScope = { presbytery: 'ALL', department: 'ALL' };
        $('sa-presbytery-select').value = 'ALL'; $('sa-department-select').value = 'ALL';
    } else {
        currentScope = { presbytery: currentUser.presbytery, department: currentUser.department };
        $('ab-department').textContent = shortDeptName(currentUser.department);
        $('ab-presbytery').textContent = currentUser.presbytery;
        $('ab-subsection').textContent = currentUser.subsection;
    }

    updateProfileUI();
    switchView('overview');

    subscribeTransactions();
    if (isSuper) subscribeUsers(); else subscribeOwnProfile();
}

function updateProfileUI() {
    $('user-display-name').textContent = currentUser.name;
    $('avatar-initials').textContent = initials(currentUser.name);
    $('pd-name').textContent = currentUser.name;
    $('pd-email').textContent = currentUser.email;
    $('pd-role-badge').textContent = ROLE_LABELS[currentUser.role] || currentUser.role;
    $('pd-role-badge').className = `badge role-${currentUser.role}`;
    $('pd-presbytery').textContent = currentUser.presbytery === 'ALL' ? 'All presbyteries' : currentUser.presbytery;
    $('pd-department').textContent = currentUser.department === 'ALL' ? 'All departments' : currentUser.department;
    $('pd-subsection').textContent = currentUser.subsection === 'ALL' ? 'All sections' : currentUser.subsection;
    $('user-scope-line').textContent = currentUser.role === 'superadmin'
        ? 'Full system access'
        : `${shortDeptName(currentUser.department)} · ${(currentUser.presbytery || '').replace('EPR Presbytery ', '')}`;
}

function initials(name) { return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join(''); }

// ---------------------------------------------------------------------
// 12. FIRESTORE LIVE SUBSCRIPTIONS
// ---------------------------------------------------------------------
function setSyncStatus(state) {
    const el = $('sync-indicator');
    if (!el) return;
    el.className = `sync-indicator sync-${state}`;
    el.title = state === 'live' ? 'Live — synced with Firestore' : state === 'syncing' ? 'Syncing…' : 'Sync error';
}

function buildTransactionsQuery() {
    const col = collection(db, COLLECTIONS.TRANSACTIONS);
    const clauses = [];
    if (currentUser.role !== 'superadmin') {
        // Hard scoping — a staff account's query can never return another
        // department or presbytery's records, regardless of UI state.
        clauses.push(where('department', '==', currentUser.department));
        clauses.push(where('presbytery', '==', currentUser.presbytery));
    } else {
        if (currentScope.department !== 'ALL') clauses.push(where('department', '==', currentScope.department));
        if (currentScope.presbytery !== 'ALL') clauses.push(where('presbytery', '==', currentScope.presbytery));
    }
    return clauses.length ? query(col, ...clauses) : query(col);
}

function subscribeTransactions() {
    if (unsubTx) unsubTx();
    setSyncStatus('syncing');
    const q = buildTransactionsQuery();
    unsubTx = onSnapshot(q, (snap) => {
        transactionsDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        transactionsDb.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        refreshAllViews();
        setSyncStatus('live');
    }, (err) => {
        console.error(err);
        showToast('error', 'Live transactions feed error: ' + err.message);
        setSyncStatus('error');
    });
}

function onScopeChanged() {
    subscribeTransactions();
    renderActiveScopeChips();
}

function subscribeUsers() {
    if (unsubUsers) unsubUsers();
    unsubUsers = onSnapshot(collection(db, COLLECTIONS.USERS), (snap) => {
        usersDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderUsersTable();
        renderOrgChart();
        $('nav-users-count').textContent = usersDb.length;
    }, (err) => showToast('error', 'Live users feed error: ' + err.message));
}

function subscribeOwnProfile() {
    if (unsubOwnProfile) unsubOwnProfile();
    unsubOwnProfile = onSnapshot(doc(db, COLLECTIONS.USERS, currentUser.id), (snap) => {
        if (!snap.exists()) { showToast('error', 'Your account was removed by an administrator.'); doLogout(); return; }
        const data = snap.data();
        const scopeChanged = data.department !== currentUser.department || data.presbytery !== currentUser.presbytery;
        currentUser = { id: snap.id, ...data };
        updateProfileUI();
        $('ab-department').textContent = shortDeptName(currentUser.department);
        $('ab-presbytery').textContent = currentUser.presbytery;
        $('ab-subsection').textContent = currentUser.subsection;
        if (scopeChanged) {
            currentScope = { presbytery: currentUser.presbytery, department: currentUser.department };
            subscribeTransactions();
            showToast('info', 'Your department/presbytery assignment was updated.');
        }
    }, (err) => showToast('error', 'Profile sync error: ' + err.message));
}

// ---------------------------------------------------------------------
// 13. SUBSECTION HELPERS
// ---------------------------------------------------------------------
function populateSubsections(deptSelectId, subSelectId) {
    const deptVal = $(deptSelectId).value;
    const subSelect = $(subSelectId);
    subSelect.innerHTML = '';
    (EPR_STRUCTURE[deptVal] || []).forEach(item => {
        const opt = document.createElement('option');
        opt.value = item; opt.textContent = item;
        subSelect.appendChild(opt);
    });
}

// ---------------------------------------------------------------------
// 14. TRANSACTION MODAL + CRUD
// ---------------------------------------------------------------------
function openTxModal(editTx) {
    const isSuper = currentUser.role === 'superadmin';
    $('tx-dept-group').style.display = isSuper ? 'block' : 'none';
    $('tx-subsection-group').style.display = isSuper ? 'block' : 'none';
    $('tx-pres-group').style.display = isSuper ? 'block' : 'none';

    if (isSuper) {
        fillSelect($('tx-dept'), Object.keys(EPR_STRUCTURE));
        fillSelect($('tx-pres'), PRESBYTERIES);
        populateSubsections('tx-dept', 'tx-subsection');
        $('tx-dept').onchange = () => populateSubsections('tx-dept', 'tx-subsection');
    }

    if (editTx) {
        $('tx-modal-title').textContent = 'Edit Transaction';
        $('tx-submit-btn').textContent = 'Update Transaction';
        $('tx-edit-id').value = editTx.id;
        $('tx-type').value = editTx.type;
        $('tx-desc').value = editTx.desc;
        $('tx-amount').value = editTx.amount;
        $('tx-date').value = editTx.date;
        if (isSuper) {
            $('tx-dept').value = editTx.department;
            populateSubsections('tx-dept', 'tx-subsection');
            $('tx-subsection').value = editTx.subsection;
            $('tx-pres').value = editTx.presbytery;
        }
    } else {
        $('tx-modal-title').textContent = 'Record Transaction';
        $('tx-submit-btn').textContent = 'Save Transaction';
        $('tx-form').reset();
        $('tx-edit-id').value = '';
        $('tx-date').value = new Date().toISOString().split('T')[0];
        if (isSuper) { $('tx-dept').selectedIndex = 0; populateSubsections('tx-dept', 'tx-subsection'); $('tx-pres').selectedIndex = 0; }
    }
    $('tx-modal').classList.remove('hidden');
}
function closeTxModal() { $('tx-modal').classList.add('hidden'); }

async function onSubmitTxForm(e) {
    e.preventDefault();
    const editId = $('tx-edit-id').value;
    const isSuper = currentUser.role === 'superadmin';

    let deptField = currentUser.department, subsec = currentUser.subsection, pres = currentUser.presbytery;
    if (isSuper) { deptField = $('tx-dept').value; subsec = $('tx-subsection').value; pres = $('tx-pres').value; }

    const payload = {
        date: $('tx-date').value || new Date().toISOString().split('T')[0],
        type: $('tx-type').value,
        desc: $('tx-desc').value.trim(),
        amount: parseFloat($('tx-amount').value),
        department: deptField,
        subsection: subsec,
        presbytery: pres
    };

    if (!payload.desc || isNaN(payload.amount) || payload.amount < 0) {
        showToast('error', 'Please provide a valid description and amount.');
        return;
    }

    const submitBtn = $('tx-submit-btn');
    submitBtn.disabled = true;
    try {
        if (editId) {
            await updateDoc(doc(db, COLLECTIONS.TRANSACTIONS, editId), payload);
            showToast('success', 'Transaction updated.');
        } else {
            await addDoc(collection(db, COLLECTIONS.TRANSACTIONS), { ...payload, createdBy: currentUser.email, createdAt: serverTimestamp() });
            showToast('success', 'Transaction saved.');
        }
        closeTxModal();
    } catch (err) {
        showToast('error', "Couldn't save the transaction: " + err.message);
    } finally {
        submitBtn.disabled = false;
    }
}

function onTxTableClick(e) {
    const editBtn = e.target.closest('.tx-edit-btn');
    const delBtn = e.target.closest('.tx-delete-btn');
    if (editBtn) {
        const tx = transactionsDb.find(t => String(t.id) === String(editBtn.dataset.id));
        if (tx) openTxModal(tx);
    } else if (delBtn) {
        const tx = transactionsDb.find(t => String(t.id) === String(delBtn.dataset.id));
        if (!tx) return;
        openConfirmModal(`Delete the transaction "${tx.desc}" (${formatRF(tx.amount)})? This cannot be undone.`, async () => {
            try {
                await deleteDoc(doc(db, COLLECTIONS.TRANSACTIONS, tx.id));
                showToast('success', 'Transaction deleted.');
            } catch (err) {
                showToast('error', "Couldn't delete: " + err.message);
            }
        });
    }
}

// ---------------------------------------------------------------------
// 15. USER FORM (create / edit) — superadmin only
//    Creating a NEW user must not sign the acting superadmin out, so we
//    spin up a throwaway secondary Firebase app instance just for the
//    createUserWithEmailAndPassword call, then tear it down.
// ---------------------------------------------------------------------
async function onSubmitUserForm(e) {
    e.preventDefault();
    const editId = $('user-edit-id').value;
    const role = $('user-role').value;
    const isSuper = role === 'superadmin';

    const name = $('user-name').value.trim();
    const email = $('user-email').value.trim().toLowerCase();
    const password = $('user-password').value;

    const profileFields = {
        name, email, role,
        presbytery: isSuper ? 'ALL' : $('user-pres').value,
        department: isSuper ? 'ALL' : $('user-dept').value,
        subsection: isSuper ? 'ALL' : $('user-subsection').value
    };

    if (!name || !email) { showToast('error', 'Fill in a name and a valid email.'); return; }
    if (!editId && password.length < 6) { showToast('error', 'Set a password of at least 6 characters for this new user.'); return; }
    if (!isSuper && (!profileFields.presbytery || !profileFields.department || !profileFields.subsection)) {
        showToast('error', 'Assign a presbytery, department and sub-section for this role.');
        return;
    }

    const submitBtn = $('user-submit-btn');
    submitBtn.disabled = true;
    try {
        if (editId) {
            // Editing an existing profile: Firestore fields only.
            // (Changing another user's password requires the "send reset
            // email" button instead — client SDKs can't set it directly.)
            await updateDoc(doc(db, COLLECTIONS.USERS, editId), profileFields);
            showToast('success', `${name} updated.`);
        } else {
            // New user: create the Auth account on a throwaway secondary
            // app instance so the current superadmin's session is untouched.
            const dupSnap = await getDocs(query(collection(db, COLLECTIONS.USERS), where('email', '==', email)));
            if (dupSnap.docs.length) { showToast('error', 'A user with that email already exists.'); return; }

            const tempApp = initializeApp(firebaseConfig, 'tempAdminCreate-' + Date.now());
            const tempAuth = getAuth(tempApp);
            try {
                const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
                await setDoc(doc(db, COLLECTIONS.USERS, cred.user.uid), { ...profileFields, createdAt: serverTimestamp() });
                showToast('success', `${name} created and assigned successfully.`);
            } finally {
                await deleteApp(tempApp);
            }
        }
        resetUserForm();
    } catch (err) {
        showToast('error', "Couldn't save the user: " + describeAuthError(err));
    } finally {
        submitBtn.disabled = false;
    }
}

function resetUserForm() {
    $('add-user-form').reset();
    $('user-edit-id').value = '';
    $('user-form-title').textContent = 'Add New System User';
    $('user-submit-btn').textContent = 'Create & Assign User';
    $('user-cancel-edit-btn').classList.add('hidden');
    $('user-password-group').classList.remove('hidden');
    $('user-reset-group').classList.add('hidden');
    $('user-password').required = true;
    $('user-scope-fields').classList.remove('hidden');
    qsa('#user-scope-fields select').forEach(sel => sel.required = true);
    populateSubsections('user-dept', 'user-subsection');
}

function onUsersTableClick(e) {
    const editBtn = e.target.closest('.user-edit-btn');
    const delBtn = e.target.closest('.user-delete-btn');
    if (editBtn) {
        const u = usersDb.find(x => String(x.id) === String(editBtn.dataset.id));
        if (!u) return;
        $('user-edit-id').value = u.id;
        $('user-name').value = u.name;
        $('user-email').value = u.email;
        $('user-email').disabled = true; // changing email would orphan the Auth account
        $('user-role').value = u.role;

        // Editing: hide the "set password" field, show "send reset email" instead.
        $('user-password-group').classList.add('hidden');
        $('user-password').required = false;
        $('user-reset-group').classList.remove('hidden');

        const isSuper = u.role === 'superadmin';
        $('user-scope-fields').classList.toggle('hidden', isSuper);
        if (!isSuper) {
            $('user-pres').value = u.presbytery;
            $('user-dept').value = u.department;
            populateSubsections('user-dept', 'user-subsection');
            $('user-subsection').value = u.subsection;
        }
        $('user-form-title').textContent = `Edit User — ${u.name}`;
        $('user-submit-btn').textContent = 'Save Changes';
        $('user-cancel-edit-btn').classList.remove('hidden');
        $('user-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (delBtn) {
        const u = usersDb.find(x => String(x.id) === String(delBtn.dataset.id));
        if (!u) return;
        if (u.email === currentUser.email) { showToast('error', "You can't delete the account you're signed in as."); return; }
        openConfirmModal(`Remove user "${u.name}" (${u.email})? This deletes their Firestore profile. Their sign-in account itself must also be removed from the Firebase Console → Authentication tab (client apps can't delete other users' Auth accounts).`, async () => {
            try {
                await deleteDoc(doc(db, COLLECTIONS.USERS, u.id));
                showToast('success', 'User profile removed. Also remove their sign-in from the Firebase Console → Authentication tab.');
            } catch (err) {
                showToast('error', "Couldn't remove user: " + err.message);
            }
        });
    }
}

async function onSendResetForEditedUser() {
    const email = $('user-email').value.trim().toLowerCase();
    if (!email) return;
    try {
        await sendPasswordResetEmail(auth, email);
        showToast('success', `Password reset email sent to ${email}.`);
    } catch (err) {
        showToast('error', describeAuthError(err));
    }
}

// Re-enable the email field whenever the form goes back to "create" mode.
const _origResetUserForm = resetUserForm;
resetUserForm = function () {
    $('user-email').disabled = false;
    _origResetUserForm();
};

// ---------------------------------------------------------------------
// 16. CONFIRM MODAL + TOASTS
// ---------------------------------------------------------------------
function openConfirmModal(text, onConfirm) {
    $('confirm-text').textContent = text;
    pendingConfirm = { onConfirm };
    $('confirm-modal').classList.remove('hidden');
}
function closeConfirmModal() { $('confirm-modal').classList.add('hidden'); pendingConfirm = null; }

function showToast(type, message) {
    const container = $('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
    const icon = type === 'error' ? 'fa-circle-exclamation' : type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
    el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 250); }, 3400);
}

// ---------------------------------------------------------------------
// 17. CLIENT-SIDE FILTER (search + type/date) ON TOP OF THE ALREADY
//     FIRESTORE-SCOPED CACHE — nothing here widens what a user can see.
// ---------------------------------------------------------------------
function getFilteredTransactions() {
    return transactionsDb.filter(tx => {
        if (txFilters.type !== 'ALL' && tx.type !== txFilters.type) return false;
        if (txFilters.from && tx.date < txFilters.from) return false;
        if (txFilters.to && tx.date > txFilters.to) return false;
        if (searchQuery) {
            const hay = [tx.desc, tx.department, tx.subsection, tx.presbytery, tx.type, String(tx.amount), tx.date].join(' ').toLowerCase();
            if (!hay.includes(searchQuery)) return false;
        }
        return true;
    });
}

// ---------------------------------------------------------------------
// 18. MASTER RENDER (called whenever the Firestore snapshot updates)
// ---------------------------------------------------------------------
function refreshAllViews() {
    const list = getFilteredTransactions();
    const isSuper = currentUser.role === 'superadmin';

    const scopeDesc = isSuper
        ? `Presbytery: [${currentScope.presbytery}] | Department: [${currentScope.department}]`
        : `Presbytery: [${currentUser.presbytery}] | Department: [${currentUser.department}] (locked to your assignment)`;
    $('scope-indicator').textContent = `Current Scope: ${scopeDesc}`;
    $('tx-scope-note').textContent = isSuper ? 'Superadmin — full visibility across the selected scope.' : `You're seeing only what belongs to ${shortDeptName(currentUser.department)} · ${currentUser.presbytery}.`;
    $('statement-scope').textContent = scopeDesc;
    $('stmt-generated-line').textContent = `Generated ${new Date().toLocaleString()} by ${currentUser.name} (${ROLE_LABELS[currentUser.role]})`;

    let income = 0, expense = 0, assets = 0, liabilities = 0;
    list.forEach(tx => {
        if (tx.type === 'Income') income += tx.amount;
        if (tx.type === 'Expense') expense += tx.amount;
        if (tx.type === 'Asset') assets += tx.amount;
        if (tx.type === 'Liability') liabilities += tx.amount;
    });
    const netProfit = income - expense;
    const netWorth = assets - liabilities;

    $('stat-count').textContent = `${list.length} Records`;
    $('stat-revenue').textContent = formatRF(income);
    $('stat-expenses').textContent = formatRF(expense);
    $('stat-net').textContent = formatRF(netProfit);
    $('stat-net-card').className = `card-item ${netProfit >= 0 ? 'success' : 'danger'}`;

    $('net-profit-val').textContent = formatRF(netProfit);
    $('pl-income').textContent = formatRF(income);
    $('pl-expense').textContent = formatRF(expense);
    const totalPL = income + expense || 1;
    $('income-bar').style.width = `${(income / totalPL) * 100}%`;
    $('expense-bar').style.width = `${(expense / totalPL) * 100}%`;

    $('cash-in').textContent = formatRF(income);
    $('cash-out').textContent = formatRF(expense);
    $('cash-assets').textContent = formatRF(assets);
    $('cash-liabilities').textContent = formatRF(liabilities);

    $('stmt-income').textContent = formatRF(income);
    $('stmt-expenses').textContent = formatRF(expense);
    $('stmt-net').textContent = formatRF(netProfit);
    $('stmt-assets').textContent = formatRF(assets);
    $('stmt-liabilities').textContent = formatRF(liabilities);
    $('stmt-equity').textContent = formatRF(netWorth);

    renderTransactionsTable(list);
    renderDeptBreakdown(list, isSuper);
    renderActiveScopeChips();

    $('nav-tx-count').textContent = list.length;
    highlightSidebarFilters();
}

function renderDeptBreakdown(list, isSuper) {
    const wrap = $('dept-breakdown-wrap');
    const grid = $('dept-breakdown-grid');
    if (!isSuper) { wrap.classList.add('hidden'); return; }
    wrap.classList.remove('hidden');
    grid.innerHTML = '';

    const depts = currentScope.department === 'ALL' ? Object.keys(EPR_STRUCTURE) : [currentScope.department];
    depts.forEach(dept => {
        const rows = list.filter(t => t.department === dept);
        let inc = 0, exp = 0;
        rows.forEach(t => { if (t.type === 'Income') inc += t.amount; if (t.type === 'Expense') exp += t.amount; });
        const card = document.createElement('div');
        card.className = 'dept-card';
        card.innerHTML = `
            <div class="dc-name"><i class="fa-solid ${DEPT_ICONS[dept] || 'fa-building'}"></i> ${shortDeptName(dept)}</div>
            <div class="dc-row"><span>Income</span><strong style="color:var(--success)">${formatRF(inc)}</strong></div>
            <div class="dc-row"><span>Expenses</span><strong style="color:var(--danger)">${formatRF(exp)}</strong></div>
            <div class="dc-net"><span>Net</span><span style="color:${inc - exp >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatRF(inc - exp)}</span></div>
        `;
        card.addEventListener('click', () => {
            $('sa-department-select').value = dept;
            currentScope.department = dept;
            switchView('transactions');
            onScopeChanged();
        });
        grid.appendChild(card);
    });
}

function renderTransactionsTable(list) {
    const tbody = $('tx-table-body');
    tbody.innerHTML = '';
    const isSuper = currentUser.role === 'superadmin';
    $('ft-result-count').textContent = `${list.length} result${list.length === 1 ? '' : 's'}`;

    if (list.length === 0) {
        tbody.innerHTML = `<tr class="table-empty-row"><td colspan="8"><i class="fa-solid fa-inbox empty-icon"></i>No records found in this scope. Try clearing filters or search.</td></tr>`;
        $('tx-table-footer').textContent = '';
        return;
    }

    list.forEach(tx => {
        const tr = document.createElement('tr');
        const isInc = tx.type === 'Income' || tx.type === 'Asset';
        const canEdit = isSuper || tx.createdBy === currentUser.email;
        tr.innerHTML = `
            <td>${tx.date}</td>
            <td><span class="badge type-${tx.type.toLowerCase()}">${tx.type}</span></td>
            <td class="wrap">${escapeHtml(tx.desc)}</td>
            <td>${shortDeptName(tx.department)}</td>
            <td><strong>${tx.subsection}</strong></td>
            <td>${(tx.presbytery || '').replace('EPR Presbytery ', '')}</td>
            <td style="font-weight: bold; color: ${isInc ? 'var(--success)' : 'var(--danger)'};">${formatRF(tx.amount)}</td>
            <td>
                <div class="row-actions">
                    <button class="icon-action-btn tx-edit-btn" data-id="${tx.id}" title="Edit" ${canEdit ? '' : 'disabled'}><i class="fa-solid fa-pen"></i></button>
                    <button class="icon-action-btn danger-hover tx-delete-btn" data-id="${tx.id}" title="Delete" ${canEdit ? '' : 'disabled'}><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    $('tx-table-footer').textContent = `Showing ${list.length} transaction${list.length === 1 ? '' : 's'} in current scope.`;
}

function renderUsersTable() {
    const tbody = $('users-table-body');
    tbody.innerHTML = '';
    const list = userListRoleFilter === 'ALL' ? usersDb : usersDb.filter(u => u.role === userListRoleFilter);

    if (list.length === 0) {
        tbody.innerHTML = `<tr class="table-empty-row"><td colspan="6">No users match this filter.</td></tr>`;
        return;
    }
    list.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(u.name)}</strong></td>
            <td>${escapeHtml(u.email)}</td>
            <td><span class="badge role-${u.role}">${ROLE_LABELS[u.role] || u.role}</span></td>
            <td>${u.presbytery === 'ALL' ? 'All presbyteries' : u.presbytery}</td>
            <td>${u.department === 'ALL' ? 'All departments' : `${shortDeptName(u.department)} (${u.subsection})`}</td>
            <td>
                <div class="row-actions">
                    <button class="icon-action-btn user-edit-btn" data-id="${u.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button class="icon-action-btn danger-hover user-delete-btn" data-id="${u.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ---------------------------------------------------------------------
// 19. DEPARTMENTS / PRESBYTERIES ORG CHART VIEW
// ---------------------------------------------------------------------
function renderOrgChart() {
    const isSuper = currentUser.role === 'superadmin';

    const deptGrid = $('org-dept-grid');
    deptGrid.innerHTML = '';
    Object.entries(EPR_STRUCTURE).forEach(([dept, subs]) => {
        const isMine = !isSuper && dept === currentUser.department;
        const managerCount = isSuper ? usersDb.filter(u => u.department === dept).length : null;
        const card = document.createElement('div');
        card.className = `org-dept-card${isMine ? ' mine' : ''}`;
        card.innerHTML = `
            <div class="odc-head"><i class="fa-solid ${DEPT_ICONS[dept] || 'fa-building'}"></i> ${shortDeptName(dept)}</div>
            <div class="odc-body">${subs.map(s => `<div class="odc-sub">${s}</div>`).join('')}</div>
            ${isSuper ? `<div class="odc-count"><i class="fa-solid fa-user-gear"></i> ${managerCount} user${managerCount === 1 ? '' : 's'} assigned</div>` : (isMine ? `<div class="odc-count"><i class="fa-solid fa-circle-check"></i> This is your department</div>` : '')}
        `;
        if (isSuper) {
            card.addEventListener('click', () => {
                $('sa-department-select').value = dept;
                currentScope.department = dept;
                switchView('transactions');
                onScopeChanged();
            });
        }
        deptGrid.appendChild(card);
    });

    const presGrid = $('org-pres-grid');
    presGrid.innerHTML = '';
    PRESBYTERIES.forEach(p => {
        const isMine = !isSuper && p === currentUser.presbytery;
        const count = isSuper ? usersDb.filter(u => u.presbytery === p).length : null;
        const card = document.createElement('div');
        card.className = `pres-card${isMine ? ' mine' : ''}`;
        card.innerHTML = `
            <i class="fa-solid fa-location-dot"></i>
            <div class="pc-name">${p.replace('EPR Presbytery ', '')}</div>
            ${isSuper ? `<div class="pc-count">${count} user${count === 1 ? '' : 's'}</div>` : (isMine ? `<div class="pc-count">Your presbytery</div>` : '')}
        `;
        if (isSuper) {
            card.addEventListener('click', () => {
                $('sa-presbytery-select').value = p;
                currentScope.presbytery = p;
                switchView('transactions');
                onScopeChanged();
            });
        }
        presGrid.appendChild(card);
    });
}

// ---------------------------------------------------------------------
// 20. GLOBAL LIVE SEARCH DROPDOWN
// ---------------------------------------------------------------------
function renderSearchDropdown() {
    const dropdown = $('search-results-dropdown');
    if (!searchQuery) { dropdown.classList.add('hidden'); return; }

    const matches = getFilteredTransactions().slice(0, 6);
    dropdown.innerHTML = `<div class="sr-header">Live results — Transactions</div>`;

    if (matches.length === 0) {
        dropdown.innerHTML += `<div class="sr-empty">No transactions match "${escapeHtml(searchQuery)}" in your current scope.</div>`;
    } else {
        matches.forEach(tx => {
            const row = document.createElement('div');
            row.className = 'sr-item';
            row.innerHTML = `
                <span>${escapeHtml(tx.desc)}<br><span class="sr-meta">${shortDeptName(tx.department)} · ${(tx.presbytery || '').replace('EPR Presbytery ', '')}</span></span>
                <span style="font-weight:700;color:${tx.type === 'Expense' || tx.type === 'Liability' ? 'var(--danger)' : 'var(--success)'}">${formatRF(tx.amount)}</span>
            `;
            row.addEventListener('click', () => { switchView('transactions'); dropdown.classList.add('hidden'); });
            dropdown.appendChild(row);
        });
        const footer = document.createElement('div');
        footer.className = 'sr-footer';
        footer.innerHTML = `<button type="button">View all in Transactions →</button>`;
        footer.querySelector('button').addEventListener('click', () => { switchView('transactions'); dropdown.classList.add('hidden'); });
        dropdown.appendChild(footer);
    }
    dropdown.classList.remove('hidden');
}

// ---------------------------------------------------------------------
// 21. EXPORT
// ---------------------------------------------------------------------
function exportReportToExcel() {
    const list = getFilteredTransactions();
    if (list.length === 0) { showToast('error', 'Nothing to export in the current scope.'); return; }
    const data = list.map(item => ({
        Date: item.date, Type: item.type, Description: item.desc, Department: item.department,
        Section: item.subsection, Presbytery: item.presbytery, Amount: item.amount, RecordedBy: item.createdBy || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "EPR Report");
    XLSX.writeFile(workbook, "EPR_Financial_Report.xlsx");
    showToast('success', `Exported ${list.length} records to Excel.`);
}

// ---------------------------------------------------------------------
// 22. HELPERS
// ---------------------------------------------------------------------
const formatRF = (amount) => "RF " + Number(amount || 0).toLocaleString();
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
