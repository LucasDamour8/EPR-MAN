/* ======================================================================
   SAS — STANDARD ACCOUNTING SOFTWARE SYSTEM (Firestore-backed)
   ----------------------------------------------------------------------
   v3 — adds on top of v2:
   - QuickBooks-style "Expense" modal: payee/account/location searchable
     pickers, a fully editable line-items grid (Category ← Projects,
     Description, Amount, VAT, Billable, Customer/Project, Class ← every
     sub-section in every department), "Add lines" / "Clear all lines",
     live Subtotal/Total.
   - QuickBooks-style "Bank Deposit" modal: account/date header, an
     editable "Add funds to this deposit" grid (Received from ← Customers,
     Account ← Projects, Description, Payment method, Ref no., Amount,
     VAT, Class), live "Other funds total".
   - QuickBooks-style double-entry "Journal Entry" modal: Account (bank
     accounts + A/R + A/P + project categories), Debits, Credits,
     Description, Name ← Customers/Suppliers, VAT, Location ← EPR
     Presbyteries, Class ← sub-sections; running Total RWF debit/credit
     footer; saved to its own JOURNAL_ENTRIES collection.
   - Dashboard "Create actions" relabelled: Record expense → "Expense
     Portal", Add bank deposit → "Sales Portal", Double journal entry →
     "Accounting", plus a new "Customer Portal" quick action.
   - User Admin now assigns by ticking any number of sub-projects from a
     full grid of every department's sub-sections (not a single select):
     "Assign By: Presbytery Location" hides Department and still shows
     every sub-project in the system to tick; "Assign By: Department"
     hides Presbytery Location and also shows every sub-project in the
     system to tick.
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
// 1. ORGANIZATION STRUCTURE
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

const DEPT_CHART_COLORS = ["#2ca01c", "#3b82f6", "#0e5c00", "#93c5fd", "#178000", "#1d4ed8"];

const PRESBYTERIES = [
    "EPR Presbytery Zinga", "EPR Presbytery Kigali", "EPR Presbytery Remera",
    "EPR Presbytery Gitarama", "EPR Presbytery Rubengera", "EPR Presbytery Kirinda", "EPR Presbytery Gisenyi"
];

const ROLE_LABELS = { superadmin: "Superadmin", manager: "Manager", finance: "Finance User" };
const STATUS_LABELS = { pending_approval: "Pending Approval", approved: "Approved", rejected: "Rejected" };

const ACCOUNT_LINKED_PREFIXES = ['tx', 'invoice', 'bill', 'cheque', 'exp', 'deposit'];

const VAT_OPTIONS = [
    "Capital Import (15%)", "Old Change In Use (14%)", "Standard (15%)", "Capital (15%)",
    "Old Standard (14%)", "Exempt (0%)", "Old Capital Import (14%)", "Zero Rated (0%)"
];

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Mobile Money", "Cheque", "Card"];

// ---------------------------------------------------------------------
// 2. LOCAL CACHES
// ---------------------------------------------------------------------
let usersDb = [];
let transactionsDb = [];
let invoicesDb = [];
let billsDb = [];
let chequesDb = [];
let suppliersDb = [];
let customersDb = [];
let projectsDb = [];
let budgetsDb = [];
let banksDb = [];
let journalEntriesDb = [];

// ---------------------------------------------------------------------
// 3. APPLICATION STATE
// ---------------------------------------------------------------------
let currentUser = null;
let currentScope = { presbytery: "ALL", department: "ALL" };
let searchQuery = "";
let txFilters = { type: "ALL", from: "", to: "" };
let userListRoleFilter = "ALL";
let pendingConfirm = null;
let activeOrgTab = "departments";

let coaSelectedBankId = null;
let coaBankChart = null;
let coaDeptChart = null;
let glanceExpenseChart = null;

let reportRange = { preset: 'all', from: '', to: '' };
let coaRange = { preset: 'all', from: '', to: '' };

let unsubTx = null, unsubUsers = null, unsubOwnProfile = null;
let unsubInvoices = null, unsubBills = null, unsubCheques = null;
let unsubSuppliers = null, unsubCustomers = null, unsubProjects = null;
let unsubBudgets = null, unsubBanks = null;

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
    ACCOUNT_LINKED_PREFIXES.forEach(setupAccountCombobox);
    setupStaticListCombobox('exp-location', () => PRESBYTERIES);
    setupStaticListCombobox('exp-payee', () => [...new Set([...suppliersDb.map(s => s.name), ...customersDb.map(c => c.name)])]);
    setupRangeBar('report-range-bar', (r) => { reportRange = r; renderReportPanel(); });
    setupRangeBar('coa-range-bar', (r) => { coaRange = r; renderCoaCharts(); });
    populateUserProjectsChecklist();
    relabelCreateActions();
    await checkFirstRun();
});

async function checkFirstRun() {
    try {
        const metaSnap = await getDoc(doc(db, COLLECTIONS.META, 'system'));
        $('boot-screen').classList.add('hidden');
        const initialized = metaSnap.exists() && metaSnap.data().initialized === true;
        if (!initialized) { $('setup-container').classList.remove('hidden'); }
        else { $('auth-container').classList.remove('hidden'); }
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
    if (!select) return;
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

function fillSimpleSelect(select, list, includeBlank, blankLabel) {
    if (!select) return;
    select.innerHTML = '';
    if (includeBlank) {
        const o = document.createElement('option');
        o.value = ''; o.textContent = blankLabel || '-- Select --';
        select.appendChild(o);
    }
    list.forEach(v => {
        const o = document.createElement('option');
        o.value = v; o.textContent = v;
        select.appendChild(o);
    });
}

function getAllSubsectionsFlat() {
    const list = [];
    Object.entries(EPR_STRUCTURE).forEach(([dept, subs]) => subs.forEach(sub => list.push({ dept, sub })));
    return list;
}

function fillOptGroupedSelect(select, groupedList, includeBlank) {
    if (!select) return;
    select.innerHTML = '';
    if (includeBlank) {
        const o = document.createElement('option');
        o.value = ''; o.textContent = '-- Class --';
        select.appendChild(o);
    }
    let lastDept = null, optgroup = null;
    groupedList.forEach(({ dept, sub }) => {
        if (dept !== lastDept) {
            optgroup = document.createElement('optgroup');
            optgroup.label = shortDeptName(dept);
            select.appendChild(optgroup);
            lastDept = dept;
        }
        const opt = document.createElement('option');
        opt.value = sub; opt.textContent = sub;
        optgroup.appendChild(opt);
    });
}

function renderSidebarFilters() {
    const deptMenu = $('dept-sidebar-menu');
    const presMenu = $('pres-sidebar-menu');
    deptMenu.innerHTML = ''; presMenu.innerHTML = '';

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
// 6b. DASHBOARD CREATE-ACTIONS RELABEL
// ---------------------------------------------------------------------
function relabelCreateActions() {
    const relabel = (id, icon, label) => {
        const btn = $(id);
        if (!btn) return;
        btn.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
    };
    relabel('qa-record-expense', 'fa-receipt', 'Expense Portal');
    relabel('qa-bank-deposit', 'fa-file-invoice-dollar', 'Sales Portal');
    relabel('qa-journal-entry', 'fa-scale-balanced', 'Accounting');

    const showAllBtn = $('qa-show-all');
    if (showAllBtn && !$('qa-customer-portal')) {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'ca-btn'; btn.id = 'qa-customer-portal';
        btn.innerHTML = '<i class="fa-solid fa-address-book"></i> Customer Portal';
        btn.addEventListener('click', () => switchView('customers'));
        showAllBtn.parentElement.insertBefore(btn, showAllBtn);
    }
}

// ---------------------------------------------------------------------
// 7. EVENT WIRING
// ---------------------------------------------------------------------
function setupEventListeners() {
    $('setup-form').addEventListener('submit', onSubmitSetupForm);
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
    $('hamburger-btn').addEventListener('click', () => toggleSidebar(true));
    $('sidebar-close-btn').addEventListener('click', () => toggleSidebar(false));
    $('sidebar-overlay').addEventListener('click', () => toggleSidebar(false));

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
    $('feedback-btn').addEventListener('click', () => showToast('info', 'Feedback noted — thanks for helping improve SAS.'));
    $('help-btn').addEventListener('click', () => showToast('info', 'Need a hand? Contact your Superadmin or SAS support.'));
    $('settings-btn').addEventListener('click', () => { switchView(isSuper() ? 'users' : 'overview'); });

    qsa('.nav-item[data-view], .pill-nav-btn[data-view], .apps-grid-item[data-view]').forEach(item => {
        item.addEventListener('click', () => { switchView(item.getAttribute('data-view')); closeAppsPanel(); toggleSidebar(false); });
    });

    $('rail-apps-btn').addEventListener('click', openAppsPanel);
    $('apps-panel-close').addEventListener('click', closeAppsPanel);
    $('rail-bookmarks-btn').addEventListener('click', () => showToast('info', 'Bookmarks are coming soon — pin your favourite reports here.'));
    $('rail-customise-btn').addEventListener('click', () => { e_toggleProfile(); });
    $('rail-create-btn').addEventListener('click', () => switchView('transactions'));
    $('customise-link-btn').addEventListener('click', () => { e_toggleProfile(); });
    $('privacy-link-btn').addEventListener('click', () => showToast('info', 'Only people with matching department/presbytery access can see this scope\'s records. Chart of Accounts is further limited to accounts you\'ve personally posted against, unless you\'re a Superadmin.'));

    $('qa-record-expense').addEventListener('click', () => openExpenseModal());
    $('qa-bank-deposit').addEventListener('click', () => openDepositModal());
    $('qa-journal-entry').addEventListener('click', () => openJournalModal());
    $('qa-show-all').addEventListener('click', openAppsPanel);
    $('glance-banks-goto').addEventListener('click', () => switchView('coa'));

    function e_toggleProfile() { $('profile-dropdown').classList.toggle('hidden'); }

    $('sa-presbytery-select').addEventListener('change', (e) => { currentScope.presbytery = e.target.value; onScopeChanged(); });
    $('sa-department-select').addEventListener('change', (e) => { currentScope.department = e.target.value; onScopeChanged(); });
    $('scope-reset-btn').addEventListener('click', () => {
        currentScope = { presbytery: 'ALL', department: 'ALL' };
        $('sa-presbytery-select').value = 'ALL'; $('sa-department-select').value = 'ALL';
        onScopeChanged();
        showToast('info', 'Scope reset to all presbyteries and departments.');
    });

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

    $('tx-filter-type').addEventListener('change', (e) => { txFilters.type = e.target.value; renderTransactionsTable(getFilteredTransactions()); });
    $('tx-filter-from').addEventListener('change', (e) => { txFilters.from = e.target.value; renderTransactionsTable(getFilteredTransactions()); });
    $('tx-filter-to').addEventListener('change', (e) => { txFilters.to = e.target.value; renderTransactionsTable(getFilteredTransactions()); });
    $('tx-filter-reset').addEventListener('click', () => {
        txFilters = { type: 'ALL', from: '', to: '' };
        $('tx-filter-type').value = 'ALL'; $('tx-filter-from').value = ''; $('tx-filter-to').value = '';
        renderTransactionsTable(getFilteredTransactions());
    });

    qsa('.org-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activeOrgTab = btn.dataset.orgTab;
            qsa('.org-tab-btn').forEach(b => b.classList.toggle('active', b === btn));
            $('org-panel-departments').classList.toggle('hidden', activeOrgTab !== 'departments');
            $('org-panel-presbyteries').classList.toggle('hidden', activeOrgTab !== 'presbyteries');
        });
    });

    $('user-role').addEventListener('change', () => {
        const isSuperRole = $('user-role').value === 'superadmin';
        $('user-scope-fields').classList.toggle('hidden', isSuperRole);
        qsa('#user-scope-fields select').forEach(sel => sel.required = !isSuperRole);
    });
    $('user-dept').addEventListener('change', () => populateSubsections('user-dept', 'user-subsection'));

    qsa('input[name="user-assign-mode"]').forEach(r => r.addEventListener('change', onUserAssignModeChange));

    $('add-user-form').addEventListener('submit', onSubmitUserForm);
    $('user-cancel-edit-btn').addEventListener('click', resetUserForm);
    $('user-send-reset-btn').addEventListener('click', onSendResetForEditedUser);
    $('users-table-body').addEventListener('click', onUsersTableClick);
    $('user-list-role-filter').addEventListener('change', (e) => { userListRoleFilter = e.target.value; renderUsersTable(); });

    const txModal = $('tx-modal');
    $('open-tx-modal-btn').addEventListener('click', () => openTxModal());
    $('close-tx-modal').addEventListener('click', closeTxModal);
    txModal.addEventListener('click', (e) => { if (e.target === txModal) closeTxModal(); });
    $('tx-form').addEventListener('submit', onSubmitTxForm);
    $('tx-table-body').addEventListener('click', onTxTableClick);
    $('open-expense-modal-btn').addEventListener('click', () => openExpenseModal());

    $('close-confirm-modal').addEventListener('click', closeConfirmModal);
    $('confirm-cancel-btn').addEventListener('click', closeConfirmModal);
    $('confirm-ok-btn').addEventListener('click', () => {
        if (pendingConfirm && typeof pendingConfirm.onConfirm === 'function') pendingConfirm.onConfirm();
        closeConfirmModal();
    });
    $('confirm-modal').addEventListener('click', (e) => { if (e.target === $('confirm-modal')) closeConfirmModal(); });

    $('print-btn').addEventListener('click', () => window.print());
    $('export-excel-btn').addEventListener('click', exportReportToExcel);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTxModal(); closeConfirmModal();
            closeAllExtModals();
            closeAppsPanel();
            $('search-results-dropdown').classList.add('hidden');
            $('profile-dropdown').classList.add('hidden');
            qsa('.acct-dropdown').forEach(d => d.classList.add('hidden'));
        }
    });

    setupExtModulesEventListeners();
    setupQbModalsEventListeners();
    setupRailFlyouts();

    qsa('.modal-cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = $(btn.dataset.modal);
            if (modal) modal.classList.add('hidden');
        });
    });
}

// ---------------------------------------------------------------------
// 7a. WHO-DID-IT HELPERS
// ---------------------------------------------------------------------
function actorMeta() {
    return {
        createdBy: currentUser.email,
        createdById: currentUser.id,
        createdByName: currentUser.name,
        createdByRole: currentUser.role,
        createdByDept: currentUser.department,
        createdByPresbytery: currentUser.presbytery
    };
}

function updateMeta(extra = {}) {
    return {
        updatedBy: currentUser.email,
        updatedById: currentUser.id,
        updatedByName: currentUser.name,
        updatedAt: serverTimestamp(),
        ...extra
    };
}

function whoLine(rec) {
    if (!rec) return '—';
    const name = rec.createdByName || rec.createdBy || 'Unknown';
    const role = rec.createdByRole ? ` (${ROLE_LABELS[rec.createdByRole] || rec.createdByRole})` : '';
    return `${escapeHtml(name)}${role}`;
}

// ---------------------------------------------------------------------
// 7b. SEARCHABLE ("AJAX-STYLE") BANK / CASH ACCOUNT PICKER
// ---------------------------------------------------------------------
function setupAccountCombobox(prefix) {
    const input = $(`${prefix}-bank-search`);
    const hidden = $(`${prefix}-bank-id`);
    const dropdown = $(`${prefix}-bank-dropdown`);
    if (!input || !hidden || !dropdown) return;

    let debounceTimer = null;

    function renderList(term) {
        const t = (term || '').toLowerCase().trim();
        dropdown.innerHTML = '';

        if (banksDb.length === 0) {
            dropdown.innerHTML = `<div class="acct-empty">No bank/cash accounts exist yet. Ask your Superadmin to add one under Bank Management.</div>`;
            dropdown.classList.remove('hidden');
            return;
        }

        const matches = banksDb.filter(b =>
            !t ||
            (b.name || '').toLowerCase().includes(t) ||
            (b.account || '').toLowerCase().includes(t) ||
            (b.branch || '').toLowerCase().includes(t)
        ).slice(0, 40);

        if (matches.length === 0) {
            dropdown.innerHTML = `<div class="acct-empty">No accounts match "${escapeHtml(term)}".</div>`;
        } else {
            matches.forEach(b => {
                const row = document.createElement('div');
                row.className = 'acct-dropdown-item';
                row.innerHTML = `
                    <div class="adi-main"><span class="adi-name">${escapeHtml(b.name)}</span><span class="adi-acct">${escapeHtml(b.account || '')}</span></div>
                    <span class="adi-bal">${formatRF(b.balance)}</span>`;
                row.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    hidden.value = b.id;
                    input.value = `${b.name} — ${b.account}`;
                    input.classList.remove('invalid');
                    dropdown.classList.add('hidden');
                    if (input.id === 'exp-bank-search') updateExpenseHeaderBalance(b);
                    if (input.id === 'deposit-bank-search') updateDepositHeaderBalance(b);
                });
                dropdown.appendChild(row);
            });
        }
        dropdown.classList.remove('hidden');
    }

    input.addEventListener('focus', () => renderList(''));
    input.addEventListener('input', () => {
        hidden.value = '';
        clearTimeout(debounceTimer);
        const term = input.value;
        debounceTimer = setTimeout(() => renderList(term), 180);
    });
    input.addEventListener('blur', () => setTimeout(() => dropdown.classList.add('hidden'), 160));
}

function prefillAccountCombobox(prefix, bankId) {
    const input = $(`${prefix}-bank-search`);
    const hidden = $(`${prefix}-bank-id`);
    if (!input || !hidden) return;
    const bank = banksDb.find(b => b.id === bankId);
    hidden.value = bankId || '';
    input.value = bank ? `${bank.name} — ${bank.account}` : '';
}

function resetAccountCombobox(prefix) {
    const input = $(`${prefix}-bank-search`);
    const hidden = $(`${prefix}-bank-id`);
    if (input) input.value = '';
    if (hidden) hidden.value = '';
}

function readAccountCombobox(prefix) {
    const hidden = $(`${prefix}-bank-id`);
    const id = hidden ? hidden.value : '';
    const bank = banksDb.find(b => b.id === id);
    return { bankId: id || '', bankName: bank ? bank.name : '' };
}

function validateAccountCombobox(prefix) {
    const hidden = $(`${prefix}-bank-id`);
    const input = $(`${prefix}-bank-search`);
    const ok = !!(hidden && hidden.value);
    if (!ok && input) input.classList.add('invalid');
    return ok;
}

// ---------------------------------------------------------------------
// 7b-2. GENERIC STATIC-LIST SEARCHABLE COMBOBOX
// ---------------------------------------------------------------------
function setupStaticListCombobox(prefix, listProvider) {
    const input = $(`${prefix}-search`);
    const hidden = $(`${prefix}-id`);
    const dropdown = $(`${prefix}-dropdown`);
    if (!input || !hidden || !dropdown) return;
    let debounceTimer = null;

    function render(term) {
        const t = (term || '').toLowerCase().trim();
        const list = listProvider();
        dropdown.innerHTML = '';
        if (!list.length) { dropdown.innerHTML = `<div class="acct-empty">Nothing to pick from yet.</div>`; dropdown.classList.remove('hidden'); return; }
        const matches = list.filter(v => !t || v.toLowerCase().includes(t)).slice(0, 40);
        if (!matches.length) {
            dropdown.innerHTML = `<div class="acct-empty">No matches for "${escapeHtml(term)}".</div>`;
        } else {
            matches.forEach(v => {
                const row = document.createElement('div');
                row.className = 'acct-dropdown-item';
                row.innerHTML = `<div class="adi-main"><span class="adi-name">${escapeHtml(v)}</span></div>`;
                row.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    hidden.value = v; input.value = v;
                    dropdown.classList.add('hidden');
                });
                dropdown.appendChild(row);
            });
        }
        dropdown.classList.remove('hidden');
    }

    input.addEventListener('focus', () => render(''));
    input.addEventListener('input', () => {
        hidden.value = '';
        clearTimeout(debounceTimer);
        const term = input.value;
        debounceTimer = setTimeout(() => render(term), 150);
    });
    input.addEventListener('blur', () => setTimeout(() => dropdown.classList.add('hidden'), 160));
}

// ---------------------------------------------------------------------
// 7c. QUICK DATE-RANGE BARS
// ---------------------------------------------------------------------
function isoDate(d) { return d.toISOString().split('T')[0]; }

function computePresetRange(preset, customFrom, customTo) {
    const today = new Date();
    if (preset === 'today') { const d = isoDate(today); return { from: d, to: d }; }
    if (preset === 'week') {
        const dow = today.getDay() || 7;
        const monday = new Date(today); monday.setDate(today.getDate() - dow + 1);
        return { from: isoDate(monday), to: isoDate(today) };
    }
    if (preset === 'month') {
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: isoDate(first), to: isoDate(today) };
    }
    if (preset === 'annual') {
        const first = new Date(today.getFullYear(), 0, 1);
        return { from: isoDate(first), to: isoDate(today) };
    }
    if (preset === 'custom') return { from: customFrom || '', to: customTo || '' };
    return { from: '', to: '' };
}

function setupRangeBar(barId, onChange) {
    const bar = $(barId);
    if (!bar) return;
    const customFields = bar.parentElement.querySelector('.custom-range-fields');
    const fromInput = customFields ? customFields.querySelector('.range-from') : null;
    const toInput = customFields ? customFields.querySelector('.range-to') : null;
    const applyBtn = customFields ? customFields.querySelector('.range-apply') : null;

    qsa('.range-btn', bar).forEach(btn => {
        btn.addEventListener('click', () => {
            qsa('.range-btn', bar).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const preset = btn.dataset.range;
            if (preset === 'custom') {
                customFields.classList.remove('hidden');
                const r = computePresetRange('custom', fromInput.value, toInput.value);
                onChange({ preset: 'custom', from: r.from, to: r.to });
            } else {
                if (customFields) customFields.classList.add('hidden');
                const r = computePresetRange(preset);
                onChange({ preset, from: r.from, to: r.to });
            }
        });
    });
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            onChange({ preset: 'custom', from: fromInput.value, to: toInput.value });
        });
    }
}

function rangeLabel(range) {
    if (!range || range.preset === 'all' || (!range.from && !range.to)) return 'All time';
    if (range.from && range.to && range.from === range.to) return range.from;
    return `${range.from || '…'} → ${range.to || '…'}`;
}

function dateInRange(dateStr, range) {
    if (!dateStr) return false;
    if (range.from && dateStr < range.from) return false;
    if (range.to && dateStr > range.to) return false;
    return true;
}

// ---------------------------------------------------------------------
// 7d. ICON-RAIL HOVER FLYOUTS
// ---------------------------------------------------------------------
function setTxTypeFilter(type) {
    txFilters.type = type;
    const sel = $('tx-filter-type');
    if (sel) sel.value = type;
    renderTransactionsTable(getFilteredTransactions());
}

function getFlyoutGroups(key) {
    const superAdmin = isSuper();
    const lockedGroup = { items: [{ icon: 'fa-lock', label: 'Superadmin only', disabled: true }] };

    switch (key) {
        case 'create':
            return [
                { title: 'Quick create', items: [
                    { icon: 'fa-receipt', label: 'New Expense', action: () => openExpenseModal() },
                    { icon: 'fa-building-columns', label: 'New Bank Deposit', action: () => openDepositModal() },
                    { icon: 'fa-scale-balanced', label: 'New Journal Entry', action: () => openJournalModal() },
                    { icon: 'fa-file-invoice', label: 'New Invoice', action: () => { switchView('invoices'); openInvoiceModal(); } },
                    { icon: 'fa-receipt', label: 'New Bill', action: () => { switchView('bills'); openBillModal(); } },
                    { icon: 'fa-money-check', label: 'New Cheque', action: () => { switchView('cheques'); openChequeModal(); } },
                    { icon: 'fa-truck-field', label: 'New Supplier', action: () => { switchView('suppliers'); openSupplierModal(); } },
                    { icon: 'fa-address-book', label: 'New Customer', action: () => { switchView('customers'); openCustomerModal(); } },
                    { icon: 'fa-diagram-project', label: 'New Project', action: () => { switchView('projects'); openProjectModal(); } }
                ] },
                ...(superAdmin ? [{ title: 'Admin', items: [
                    { icon: 'fa-scale-balanced', label: 'New Budget Line', action: () => { switchView('budget'); openBudgetModal(); } },
                    { icon: 'fa-building-columns', label: 'New Bank', action: () => { switchView('banks'); openBankModal(); } }
                ] }] : [])
            ];
        case 'bookmarks':
            return [{ title: 'Bookmarks', items: [], empty: 'No bookmarks yet — pin your favourite reports here soon.' }];
        case 'feed':
            return [{ title: 'Transactions', items: [
                { icon: 'fa-list-check', label: 'All transactions', action: () => switchView('transactions') },
                { icon: 'fa-arrow-trend-up', label: 'Income only', action: () => { switchView('transactions'); setTxTypeFilter('Income'); } },
                { icon: 'fa-arrow-trend-down', label: 'Expenses only', action: () => { switchView('transactions'); setTxTypeFilter('Expense'); } },
                { icon: 'fa-building-columns', label: 'Assets only', action: () => { switchView('transactions'); setTxTypeFilter('Asset'); } },
                { icon: 'fa-scale-unbalanced', label: 'Liabilities only', action: () => { switchView('transactions'); setTxTypeFilter('Liability'); } }
            ] }];
        case 'reports':
            return [
                { title: 'Standard reports', items: [
                    { icon: 'fa-file-invoice-dollar', label: 'Financial Statement', action: () => switchView('reports') },
                    { icon: 'fa-file-excel', label: 'Export to Excel', action: () => exportReportToExcel() },
                    { icon: 'fa-print', label: 'Print statement', action: () => window.print() }
                ] },
                { title: 'Management & performance', items: [
                    { icon: 'fa-chart-line', label: 'Chart of Accounts', action: () => switchView('coa') },
                    { icon: 'fa-chart-pie', label: 'Department breakdown', action: () => switchView('overview') }
                ] },
                { title: 'Financial planning', ...(superAdmin ? { items: [
                    { icon: 'fa-scale-balanced', label: 'Budgets', action: () => switchView('budget') },
                    { icon: 'fa-building-columns', label: 'Bank Management', action: () => switchView('banks') }
                ] } : lockedGroup) }
            ];
        case 'apps':
            return [
                { title: 'Sales & Get Paid', items: [
                    { icon: 'fa-file-invoice', label: 'Invoices', action: () => switchView('invoices') },
                    { icon: 'fa-address-book', label: 'Customer Hub', action: () => switchView('customers') }
                ] },
                { title: 'Expenses & Bills', items: [
                    { icon: 'fa-receipt', label: 'Pay Bills', action: () => switchView('bills') },
                    { icon: 'fa-truck-field', label: 'Suppliers', action: () => switchView('suppliers') },
                    { icon: 'fa-money-check', label: 'Cheques', action: () => switchView('cheques') }
                ] },
                { title: 'Operations', items: [
                    { icon: 'fa-diagram-project', label: 'Projects', action: () => switchView('projects') },
                    { icon: 'fa-sitemap', label: 'Departments & Presbyteries', action: () => switchView('departments') },
                    { icon: 'fa-chart-line', label: 'Chart of Accounts', action: () => switchView('coa') }
                ] },
                ...(superAdmin ? [{ title: 'Admin tools', items: [
                    { icon: 'fa-scale-balanced', label: 'Budget Management', action: () => switchView('budget') },
                    { icon: 'fa-building-columns', label: 'Bank Management', action: () => switchView('banks') },
                    { icon: 'fa-users-gear', label: 'User Admin', action: () => switchView('users') }
                ] }] : []),
                { items: [{ icon: 'fa-grip', label: 'Open full module list', action: () => openAppsPanel() }] }
            ];
        case 'accounting':
            return [{ title: 'Accounting', items: [
                { icon: 'fa-list-check', label: 'Transactions', action: () => switchView('transactions') },
                { icon: 'fa-scale-balanced', label: 'New Journal Entry', action: () => openJournalModal() },
                { icon: 'fa-chart-line', label: 'Chart of Accounts', action: () => switchView('coa') },
                ...(superAdmin ? [
                    { icon: 'fa-scale-balanced', label: 'Budget Management', action: () => switchView('budget') },
                    { icon: 'fa-building-columns', label: 'Bank Management', action: () => switchView('banks') }
                ] : [])
            ] }];
        case 'expenses':
            return [{ title: 'Expenses & Pay Bills', items: [
                { icon: 'fa-receipt', label: 'Pay Bills', action: () => switchView('bills') },
                { icon: 'fa-truck-field', label: 'Suppliers', action: () => switchView('suppliers') },
                { icon: 'fa-plus', label: 'Record Expense', action: () => openExpenseModal() }
            ] }];
        case 'sales':
            return [{ title: 'Sales & Get Paid', items: [
                { icon: 'fa-file-invoice', label: 'Invoices', action: () => switchView('invoices') },
                { icon: 'fa-address-book', label: 'Customer Hub', action: () => switchView('customers') },
                { icon: 'fa-building-columns', label: 'Bank Deposit', action: () => openDepositModal() },
                { icon: 'fa-plus', label: 'Create Invoice', action: () => { switchView('invoices'); openInvoiceModal(); } }
            ] }];
        case 'customise':
            return [{ title: 'Your account', items: [
                { icon: 'fa-user', label: 'My profile', action: () => $('profile-dropdown').classList.remove('hidden') },
                { icon: 'fa-sitemap', label: 'Departments & Presbyteries', action: () => switchView('departments') },
                ...(superAdmin ? [{ icon: 'fa-users-gear', label: 'User Admin', action: () => switchView('users') }] : []),
                { icon: 'fa-right-from-bracket', label: 'Sign out', action: () => doLogout() }
            ] }];
        default:
            return [];
    }
}

function renderFlyout(groups) {
    const wrap = $('rail-flyout-content');
    wrap.innerHTML = '';
    let renderedAny = false;
    groups.forEach(g => {
        if (g.title) {
            const t = document.createElement('div');
            t.className = 'rf-group-title';
            t.textContent = g.title;
            wrap.appendChild(t);
        }
        if (!g.items || g.items.length === 0) {
            const e = document.createElement('div');
            e.className = 'rf-empty';
            e.textContent = g.empty || 'Nothing here yet.';
            wrap.appendChild(e);
            renderedAny = true;
            return;
        }
        g.items.forEach(it => {
            renderedAny = true;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'rf-item' + (it.disabled ? ' disabled' : '');
            btn.innerHTML = `<i class="fa-solid ${it.icon}"></i><span>${escapeHtml(it.label)}</span>`;
            if (!it.disabled) btn.addEventListener('click', () => { it.action(); hideFlyout(); toggleSidebar(false); });
            wrap.appendChild(btn);
        });
    });
    if (!renderedAny) wrap.innerHTML = `<div class="rf-empty">Nothing here yet.</div>`;
}

let flyoutHideTimer = null;
function showFlyoutFor(btn, key) {
    if (!key) { hideFlyout(); return; }
    clearTimeout(flyoutHideTimer);
    const groups = getFlyoutGroups(key);
    if (!groups.length) { hideFlyout(); return; }
    renderFlyout(groups);
    const panel = $('rail-flyout');
    const rect = btn.getBoundingClientRect();
    panel.classList.remove('hidden');
    requestAnimationFrame(() => {
        const maxTop = window.innerHeight - panel.offsetHeight - 12;
        panel.style.top = Math.max(8, Math.min(rect.top, Math.max(8, maxTop))) + 'px';
    });
}
function hideFlyoutSoon() { flyoutHideTimer = setTimeout(hideFlyout, 180); }
function hideFlyout() { $('rail-flyout').classList.add('hidden'); }

function setupRailFlyouts() {
    qsa('[data-flyout]').forEach(btn => {
        btn.addEventListener('mouseenter', () => showFlyoutFor(btn, btn.dataset.flyout));
        btn.addEventListener('mouseleave', hideFlyoutSoon);
        btn.addEventListener('focus', () => showFlyoutFor(btn, btn.dataset.flyout));
        btn.addEventListener('blur', hideFlyoutSoon);
    });
    const panel = $('rail-flyout');
    panel.addEventListener('mouseenter', () => clearTimeout(flyoutHideTimer));
    panel.addEventListener('mouseleave', hideFlyoutSoon);
}

function toggleSidebar(open) {
    $('sidebar').classList.toggle('open', open);
    $('sidebar-overlay').classList.toggle('show', open);
}

function openAppsPanel() { $('apps-panel').classList.add('open'); $('sidebar-overlay').classList.add('show'); }
function closeAppsPanel() { $('apps-panel').classList.remove('open'); if (!$('sidebar').classList.contains('open')) $('sidebar-overlay').classList.remove('show'); }

function onSidebarDeptFilter(e) {
    e.preventDefault();
    if (currentUser.role !== 'superadmin') return;
    const dept = e.currentTarget.getAttribute('data-dept');
    $('sa-department-select').value = dept;
    currentScope.department = dept;
    switchView('transactions');
    onScopeChanged();
    closeAppsPanel();
}

function onSidebarPresFilter(e) {
    e.preventDefault();
    if (currentUser.role !== 'superadmin') return;
    const pres = e.currentTarget.getAttribute('data-pres');
    $('sa-presbytery-select').value = pres;
    currentScope.presbytery = pres;
    switchView('transactions');
    onScopeChanged();
    closeAppsPanel();
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
    qsa('.pill-nav-btn[data-view]').forEach(n => n.classList.toggle('active', n.getAttribute('data-view') === target));
    qsa('.view-panel').forEach(panel => panel.classList.remove('active'));
    const panel = $(`view-${target}`);
    if (panel) panel.classList.add('active');
    if (target === 'departments') renderOrgChart();
    if (target === 'coa') { renderCoaBankGrid(); renderCoaCharts(); }
    if (target === 'reports') renderReportPanel();
}

// ---------------------------------------------------------------------
// 9. FIRST-RUN SETUP
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
        const payload = { name, email, role: 'superadmin', presbytery: 'ALL', department: 'ALL', subsection: 'ALL', assignedProjects: [], createdAt: serverTimestamp() };
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
    [unsubTx, unsubUsers, unsubOwnProfile, unsubInvoices, unsubBills, unsubCheques,
     unsubSuppliers, unsubCustomers, unsubProjects, unsubBudgets, unsubBanks]
        .forEach(u => { if (u) u(); });
    unsubTx = unsubUsers = unsubOwnProfile = null;
    unsubInvoices = unsubBills = unsubCheques = null;
    unsubSuppliers = unsubCustomers = unsubProjects = null;
    unsubBudgets = unsubBanks = null;

    signOut(auth).catch(() => {});
    currentUser = null;
    usersDb = []; transactionsDb = [];
    invoicesDb = []; billsDb = []; chequesDb = [];
    suppliersDb = []; customersDb = []; projectsDb = [];
    budgetsDb = []; banksDb = []; journalEntriesDb = [];
    currentScope = { presbytery: 'ALL', department: 'ALL' };
    searchQuery = ''; txFilters = { type: 'ALL', from: '', to: '' };
    reportRange = { preset: 'all', from: '', to: '' };
    coaRange = { preset: 'all', from: '', to: '' };
    coaSelectedBankId = null;
    $('app-container').classList.add('hidden');
    $('auth-container').classList.remove('hidden');
    $('profile-dropdown').classList.add('hidden');
    closeAppsPanel();
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
        'auth/operation-not-allowed': 'Email/Password sign-in is disabled — enable it in Firebase Console → Authentication → Sign-in method.'
    };
    return map[code] || (err && err.message) || 'Something went wrong.';
}

// ---------------------------------------------------------------------
// 11. SESSION INITIALIZER
// ---------------------------------------------------------------------
function initAppSession() {
    $('app-container').classList.remove('hidden');
    const isSuperUser = currentUser.role === 'superadmin';

    $('superadmin-filter-bar').classList.toggle('hidden', !isSuperUser);
    $('admin-filter-section').classList.toggle('hidden', !isSuperUser);
    $('my-assignment-card').classList.toggle('hidden', isSuperUser);
    $('apps-admin-only').classList.toggle('hidden', !isSuperUser);

    if (isSuperUser) {
        currentScope = { presbytery: 'ALL', department: 'ALL' };
        $('sa-presbytery-select').value = 'ALL'; $('sa-department-select').value = 'ALL';
    } else {
        currentScope = { presbytery: currentUser.presbytery, department: currentUser.department };
        $('ab-department').textContent = shortDeptName(currentUser.department);
        $('ab-presbytery').textContent = currentUser.presbytery;
        $('ab-subsection').textContent = (currentUser.assignedProjects && currentUser.assignedProjects.length)
            ? currentUser.assignedProjects.map(p => p.split('::')[1]).join(', ')
            : currentUser.subsection;
    }

    updateProfileUI();
    updateGreeting();
    relabelCreateActions();
    switchView('overview');

    subscribeTransactions();
    subscribeInvoices();
    subscribeBills();
    subscribeCheques();
    subscribeSuppliers();
    subscribeCustomers();
    subscribeProjects();
    subscribeBanks();
    if (isSuperUser) { subscribeUsers(); subscribeBudgets(); }
    else { subscribeOwnProfile(); }
}

function updateGreeting() {
    const hour = new Date().getHours();
    const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    const firstName = (currentUser.name || '').split(' ')[0] || 'there';
    $('greeting-text').textContent = `Good ${part}, ${firstName}!`;
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
    $('pd-subsection').textContent = (currentUser.assignedProjects && currentUser.assignedProjects.length)
        ? currentUser.assignedProjects.map(p => p.split('::')[1]).join(', ')
        : (currentUser.subsection === 'ALL' ? 'All sections' : currentUser.subsection);
    $('user-scope-line').textContent = currentUser.role === 'superadmin'
        ? 'Full system access'
        : `${shortDeptName(currentUser.department)} · ${(currentUser.presbytery || '').replace('EPR Presbytery ', '')}`;
}

function initials(name) { return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join(''); }
function isSuper() { return currentUser && currentUser.role === 'superadmin'; }
function isFinanceOrSuper() { return currentUser && (currentUser.role === 'superadmin' || currentUser.role === 'finance'); }
function isOwnRecord(rec) { return currentUser && rec && rec.createdById === currentUser.id; }

// ---------------------------------------------------------------------
// 12. FIRESTORE LIVE SUBSCRIPTIONS — TRANSACTIONS
// ---------------------------------------------------------------------
function setSyncStatus(state) {
    const el = $('sync-indicator');
    if (!el) return;
    el.className = `sync-indicator sync-${state}`;
    el.title = state === 'live' ? 'Live — synced with Firestore' : state === 'syncing' ? 'Syncing…' : 'Sync error';
}

function buildScopedQuery(collectionName) {
    const col = collection(db, collectionName);
    const clauses = [];
    if (!isSuper()) {
        clauses.push(where('department', '==', currentUser.department));
        clauses.push(where('presbytery', '==', currentUser.presbytery));
    } else {
        if (currentScope.department !== 'ALL') clauses.push(where('department', '==', currentScope.department));
        if (currentScope.presbytery !== 'ALL') clauses.push(where('presbytery', '==', currentScope.presbytery));
    }
    return clauses.length ? query(col, ...clauses) : query(col);
}

function buildTransactionsQuery() { return buildScopedQuery(COLLECTIONS.TRANSACTIONS); }

function subscribeTransactions() {
    if (unsubTx) unsubTx();
    setSyncStatus('syncing');
    unsubTx = onSnapshot(buildTransactionsQuery(), (snap) => {
        transactionsDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        transactionsDb.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        refreshAllViews();
        setSyncStatus('live');
    }, (err) => { console.error(err); showToast('error', 'Live transactions feed error: ' + err.message); setSyncStatus('error'); });
}

function onScopeChanged() {
    subscribeTransactions();
    subscribeInvoices();
    subscribeBills();
    subscribeCheques();
    subscribeSuppliers();
    subscribeCustomers();
    subscribeProjects();
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
        $('ab-subsection').textContent = (currentUser.assignedProjects && currentUser.assignedProjects.length)
            ? currentUser.assignedProjects.map(p => p.split('::')[1]).join(', ')
            : currentUser.subsection;
        if (scopeChanged) {
            currentScope = { presbytery: currentUser.presbytery, department: currentUser.department };
            onScopeChanged();
            showToast('info', 'Your department/presbytery assignment was updated.');
        }
    }, (err) => showToast('error', 'Profile sync error: ' + err.message));
}

// ---------------------------------------------------------------------
// 13. SUBSECTION HELPERS
// ---------------------------------------------------------------------
function populateSubsections(deptSelectId, subSelectId) {
    const deptSel = $(deptSelectId);
    const subSelect = $(subSelectId);
    if (!deptSel || !subSelect) return;
    const deptVal = deptSel.value;
    subSelect.innerHTML = '';
    (EPR_STRUCTURE[deptVal] || []).forEach(item => {
        const opt = document.createElement('option');
        opt.value = item; opt.textContent = item;
        subSelect.appendChild(opt);
    });
}

function setupScopedModalFields(prefix, hasSubsection, editRecord) {
    const deptGroup = $(`${prefix}-dept-group`);
    const subGroup = $(`${prefix}-subsection-group`);
    const presGroup = $(`${prefix}-pres-group`);
    const superVisible = isSuper();

    if (deptGroup) deptGroup.style.display = superVisible ? 'block' : 'none';
    if (subGroup) subGroup.style.display = (superVisible && hasSubsection) ? 'block' : 'none';
    if (presGroup) presGroup.style.display = superVisible ? 'block' : 'none';

    if (superVisible) {
        fillSelect($(`${prefix}-dept`), Object.keys(EPR_STRUCTURE));
        fillSelect($(`${prefix}-pres`), PRESBYTERIES);
        if (hasSubsection) {
            populateSubsections(`${prefix}-dept`, `${prefix}-subsection`);
            $(`${prefix}-dept`).onchange = () => populateSubsections(`${prefix}-dept`, `${prefix}-subsection`);
        }
        if (editRecord) {
            $(`${prefix}-dept`).value = editRecord.department;
            if (hasSubsection) { populateSubsections(`${prefix}-dept`, `${prefix}-subsection`); $(`${prefix}-subsection`).value = editRecord.subsection; }
            $(`${prefix}-pres`).value = editRecord.presbytery;
        } else {
            $(`${prefix}-dept`).selectedIndex = 0;
            if (hasSubsection) populateSubsections(`${prefix}-dept`, `${prefix}-subsection`);
            $(`${prefix}-pres`).selectedIndex = 0;
        }
    }
}

function scopedFieldsFromForm(prefix, hasSubsection) {
    if (isSuper()) {
        const deptVal = $(`${prefix}-dept`).value || '';
        const presVal = $(`${prefix}-pres`).value || '';
        const subVal = hasSubsection ? ($(`${prefix}-subsection`).value || '') : (currentUser.subsection || 'ALL');
        return { department: deptVal, subsection: subVal, presbytery: presVal };
    }
    return {
        department: currentUser.department || '',
        subsection: currentUser.subsection || '',
        presbytery: currentUser.presbytery || ''
    };
}

function sanitizePayload(obj) {
    const clean = {};
    Object.keys(obj).forEach(k => { clean[k] = obj[k] === undefined ? '' : obj[k]; });
    return clean;
}

function closeAllExtModals() {
    ['invoice-modal', 'bill-modal', 'cheque-modal', 'supplier-modal', 'customer-modal', 'project-modal', 'budget-modal', 'bank-modal', 'expense-modal', 'deposit-modal', 'journal-modal']
        .forEach(id => $(id) && $(id).classList.add('hidden'));
}

// ---------------------------------------------------------------------
// 14. TRANSACTION MODAL + CRUD
// ---------------------------------------------------------------------
function openTxModal(editTx) {
    const superVisible = isSuper();
    $('tx-dept-group').style.display = superVisible ? 'block' : 'none';
    $('tx-subsection-group').style.display = superVisible ? 'block' : 'none';
    $('tx-pres-group').style.display = superVisible ? 'block' : 'none';

    if (superVisible) {
        fillSelect($('tx-dept'), Object.keys(EPR_STRUCTURE));
        fillSelect($('tx-pres'), PRESBYTERIES);
        populateSubsections('tx-dept', 'tx-subsection');
        $('tx-dept').onchange = () => populateSubsections('tx-dept', 'tx-subsection');
    }

    if (editTx) {
        $('tx-modal-title').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Transaction';
        $('tx-submit-btn').textContent = 'Update Transaction';
        $('tx-edit-id').value = editTx.id;
        $('tx-type').value = editTx.type;
        $('tx-desc').value = editTx.desc;
        $('tx-amount').value = editTx.amount;
        $('tx-date').value = editTx.date;
        prefillAccountCombobox('tx', editTx.bankId);
        if (superVisible) {
            $('tx-dept').value = editTx.department;
            populateSubsections('tx-dept', 'tx-subsection');
            $('tx-subsection').value = editTx.subsection;
            $('tx-pres').value = editTx.presbytery;
        }
    } else {
        $('tx-modal-title').innerHTML = '<i class="fa-solid fa-receipt"></i> Record Transaction';
        $('tx-submit-btn').textContent = 'Save Transaction';
        $('tx-form').reset();
        $('tx-edit-id').value = '';
        $('tx-date').value = new Date().toISOString().split('T')[0];
        resetAccountCombobox('tx');
        if (superVisible) { $('tx-dept').selectedIndex = 0; populateSubsections('tx-dept', 'tx-subsection'); $('tx-pres').selectedIndex = 0; }
    }
    $('tx-modal').classList.remove('hidden');
}
function closeTxModal() { $('tx-modal').classList.add('hidden'); }

async function onSubmitTxForm(e) {
    e.preventDefault();
    const editId = $('tx-edit-id').value;
    const superVisible = isSuper();

    let deptField = currentUser.department, subsec = currentUser.subsection, pres = currentUser.presbytery;
    if (superVisible) { deptField = $('tx-dept').value; subsec = $('tx-subsection').value; pres = $('tx-pres').value; }

    if (!validateAccountCombobox('tx')) { showToast('error', 'Please choose which bank/cash account this transaction belongs to.'); return; }
    const acct = readAccountCombobox('tx');

    const payload = sanitizePayload({
        date: $('tx-date').value || new Date().toISOString().split('T')[0],
        type: $('tx-type').value,
        desc: $('tx-desc').value.trim(),
        amount: parseFloat($('tx-amount').value),
        department: deptField, subsection: subsec, presbytery: pres,
        bankId: acct.bankId, bankName: acct.bankName
    });

    if (!payload.desc || isNaN(payload.amount) || payload.amount < 0) {
        showToast('error', 'Please provide a valid description and amount.');
        return;
    }

    const submitBtn = $('tx-submit-btn');
    submitBtn.disabled = true;
    try {
        if (editId) {
            await updateDoc(doc(db, COLLECTIONS.TRANSACTIONS, editId), { ...payload, ...updateMeta() });
            showToast('success', 'Transaction updated.');
        } else {
            await addDoc(collection(db, COLLECTIONS.TRANSACTIONS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() }));
            showToast('success', 'Transaction saved.');
        }
        closeTxModal();
    } catch (err) {
        showToast('error', "Couldn't save the transaction: " + err.message);
    } finally { submitBtn.disabled = false; }
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
            try { await deleteDoc(doc(db, COLLECTIONS.TRANSACTIONS, tx.id)); showToast('success', 'Transaction deleted.'); }
            catch (err) { showToast('error', "Couldn't delete: " + err.message); }
        });
    }
}

// ---------------------------------------------------------------------
// 15. USER FORM (create / edit) — superadmin only
// ---------------------------------------------------------------------
function populateUserProjectsChecklist(selectedList) {
    const wrap = $('user-projects-checklist');
    if (!wrap) return;
    wrap.innerHTML = '';
    const selected = new Set(selectedList || []);
    Object.entries(EPR_STRUCTURE).forEach(([dept, subs]) => {
        const title = document.createElement('div');
        title.className = 'checklist-group-title';
        title.textContent = shortDeptName(dept);
        wrap.appendChild(title);
        subs.forEach(sub => {
            const key = `${dept}::${sub}`;
            const label = document.createElement('label');
            label.className = 'checklist-item';
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.value = key;
            if (selected.has(key)) cb.checked = true;
            label.appendChild(cb);
            label.appendChild(document.createTextNode(' ' + sub));
            wrap.appendChild(label);
        });
    });
}

function getCheckedProjectKeys() {
    return qsa('#user-projects-checklist input[type=checkbox]:checked').map(cb => cb.value);
}

function onUserAssignModeChange() {
    const checked = document.querySelector('input[name="user-assign-mode"]:checked');
    const mode = checked ? checked.value : 'presbytery';
    const presField = $('user-pres-field');
    const deptField = $('user-dept-field');
    if (presField) presField.classList.toggle('hidden', mode !== 'presbytery');
    if (deptField) deptField.classList.toggle('hidden', mode !== 'department');
    populateUserProjectsChecklist(getCheckedProjectKeys());
}

async function onSubmitUserForm(e) {
    e.preventDefault();
    const editId = $('user-edit-id').value;
    const role = $('user-role').value;
    const roleSuper = role === 'superadmin';
    const modeEl = document.querySelector('input[name="user-assign-mode"]:checked');
    const mode = modeEl ? modeEl.value : 'presbytery';

    const name = $('user-name').value.trim();
    const email = $('user-email').value.trim().toLowerCase();
    const password = $('user-password').value;
    const assignedProjects = roleSuper ? [] : getCheckedProjectKeys();

    const profileFields = sanitizePayload({
        name, email, role,
        presbytery: roleSuper ? 'ALL' : (mode === 'presbytery' ? $('user-pres').value : 'ALL'),
        department: roleSuper ? 'ALL' : (mode === 'department' ? $('user-dept').value : 'ALL'),
        subsection: roleSuper ? 'ALL' : (assignedProjects[0] ? assignedProjects[0].split('::')[1] : ''),
        assignMode: roleSuper ? '' : mode
    });
    profileFields.assignedProjects = assignedProjects;

    if (!name || !email) { showToast('error', 'Fill in a name and a valid email.'); return; }
    if (!editId && password.length < 6) { showToast('error', 'Set a password of at least 6 characters for this new user.'); return; }
    if (!roleSuper) {
        if (mode === 'presbytery' && !profileFields.presbytery) { showToast('error', 'Assign a presbytery location for this user.'); return; }
        if (mode === 'department' && !profileFields.department) { showToast('error', 'Assign a department for this user.'); return; }
        if (!assignedProjects.length) { showToast('error', 'Tick at least one sub-project for this user to work on.'); return; }
    }

    const submitBtn = $('user-submit-btn');
    submitBtn.disabled = true;
    try {
        if (editId) {
            await updateDoc(doc(db, COLLECTIONS.USERS, editId), { ...profileFields, ...updateMeta() });
            showToast('success', `${name} updated.`);
        } else {
            const dupSnap = await getDocs(query(collection(db, COLLECTIONS.USERS), where('email', '==', email)));
            if (dupSnap.docs.length) { showToast('error', 'A user with that email already exists.'); return; }

            const tempApp = initializeApp(firebaseConfig, 'tempAdminCreate-' + Date.now());
            const tempAuth = getAuth(tempApp);
            try {
                const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
                await setDoc(doc(db, COLLECTIONS.USERS, cred.user.uid), sanitizePayload({ ...profileFields, assignedProjects, createdBy: currentUser.email, createdById: currentUser.id, createdByName: currentUser.name, createdAt: serverTimestamp() }));
                showToast('success', `${name} created and assigned successfully.`);
            } finally { await deleteApp(tempApp); }
        }
        resetUserForm();
    } catch (err) {
        showToast('error', "Couldn't save the user: " + describeAuthError(err));
    } finally { submitBtn.disabled = false; }
}

function resetUserForm() {
    $('add-user-form').reset();
    $('user-edit-id').value = '';
    $('user-email').disabled = false;
    $('user-form-title').textContent = 'Add New System User';
    $('user-submit-btn').textContent = 'Create & Assign User';
    $('user-cancel-edit-btn').classList.add('hidden');
    $('user-password-group').classList.remove('hidden');
    $('user-reset-group').classList.add('hidden');
    $('user-password').required = true;
    $('user-scope-fields').classList.remove('hidden');
    const presRadio = document.querySelector('input[name="user-assign-mode"][value="presbytery"]');
    if (presRadio) presRadio.checked = true;
    const presField = $('user-pres-field'), deptField = $('user-dept-field');
    if (presField) presField.classList.remove('hidden');
    if (deptField) deptField.classList.add('hidden');
    populateSubsections('user-dept', 'user-subsection');
    populateUserProjectsChecklist([]);
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
        $('user-email').disabled = true;
        $('user-role').value = u.role;

        $('user-password-group').classList.add('hidden');
        $('user-password').required = false;
        $('user-reset-group').classList.remove('hidden');

        const roleSuper = u.role === 'superadmin';
        $('user-scope-fields').classList.toggle('hidden', roleSuper);
        if (!roleSuper) {
            const mode = u.assignMode || (u.department === 'ALL' ? 'presbytery' : 'department');
            const radio = document.querySelector(`input[name="user-assign-mode"][value="${mode}"]`);
            if (radio) radio.checked = true;
            const presField = $('user-pres-field'), deptField = $('user-dept-field');
            if (presField) presField.classList.toggle('hidden', mode !== 'presbytery');
            if (deptField) deptField.classList.toggle('hidden', mode !== 'department');
            if (mode === 'presbytery') $('user-pres').value = u.presbytery;
            else $('user-dept').value = u.department;
            populateUserProjectsChecklist(u.assignedProjects || []);
        }
        $('user-form-title').textContent = `Edit User — ${u.name}`;
        $('user-submit-btn').textContent = 'Save Changes';
        $('user-cancel-edit-btn').classList.remove('hidden');
        $('user-name').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (delBtn) {
        const u = usersDb.find(x => String(x.id) === String(delBtn.dataset.id));
        if (!u) return;
        if (u.email === currentUser.email) { showToast('error', "You can't delete the account you're signed in as."); return; }
        openConfirmModal(`Remove user "${u.name}" (${u.email})? This deletes their Firestore profile. Their sign-in account itself must also be removed from Firebase Console → Authentication.`, async () => {
            try { await deleteDoc(doc(db, COLLECTIONS.USERS, u.id)); showToast('success', 'User profile removed. Also remove their sign-in from the Firebase Console → Authentication tab.'); }
            catch (err) { showToast('error', "Couldn't remove user: " + err.message); }
        });
    }
}

async function onSendResetForEditedUser() {
    const email = $('user-email').value.trim().toLowerCase();
    if (!email) return;
    try { await sendPasswordResetEmail(auth, email); showToast('success', `Password reset email sent to ${email}.`); }
    catch (err) { showToast('error', describeAuthError(err)); }
}

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
// 17. CLIENT-SIDE FILTER FOR TRANSACTIONS
// ---------------------------------------------------------------------
function getFilteredTransactions() {
    return transactionsDb.filter(tx => {
        if (txFilters.type !== 'ALL' && tx.type !== txFilters.type) return false;
        if (txFilters.from && tx.date < txFilters.from) return false;
        if (txFilters.to && tx.date > txFilters.to) return false;
        if (searchQuery) {
            const hay = [tx.desc, tx.department, tx.subsection, tx.presbytery, tx.type, String(tx.amount), tx.date, tx.bankName].join(' ').toLowerCase();
            if (!hay.includes(searchQuery)) return false;
        }
        return true;
    });
}

// ---------------------------------------------------------------------
// 18. MASTER RENDER
// ---------------------------------------------------------------------
function refreshAllViews() {
    const list = getFilteredTransactions();
    const superVisible = isSuper();

    const scopeDesc = superVisible
        ? `Presbytery: [${currentScope.presbytery}] | Department: [${currentScope.department}]`
        : `Presbytery: [${currentUser.presbytery}] | Department: [${currentUser.department}] (locked to your assignment)`;
    $('scope-indicator').textContent = `Current Scope: ${scopeDesc}`;
    $('tx-scope-note').textContent = superVisible ? 'Superadmin — full visibility across the selected scope.' : `You're seeing only what belongs to ${shortDeptName(currentUser.department)} · ${currentUser.presbytery}.`;

    let income = 0, expense = 0, assets = 0, liabilities = 0;
    list.forEach(tx => {
        if (tx.type === 'Income') income += tx.amount;
        if (tx.type === 'Expense') expense += tx.amount;
        if (tx.type === 'Asset') assets += tx.amount;
        if (tx.type === 'Liability') liabilities += tx.amount;
    });
    const netProfit = income - expense;

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

    $('gl-net-profit').textContent = formatRF(netProfit);
    $('gl-income').textContent = formatRF(income);
    $('gl-expense').textContent = formatRF(expense);
    $('gl-income-bar').style.width = `${(income / totalPL) * 100}%`;
    $('gl-expense-bar').style.width = `${(expense / totalPL) * 100}%`;
    $('gl-total-expense').textContent = formatRF(expense);

    $('cash-in').textContent = formatRF(income);
    $('cash-out').textContent = formatRF(expense);
    $('cash-assets').textContent = formatRF(assets);
    $('cash-liabilities').textContent = formatRF(liabilities);

    renderTransactionsTable(list);
    renderDeptBreakdown(list, superVisible);
    renderActiveScopeChips();
    renderPendingApprovals();
    renderGlanceExpenseDonut(list);
    renderGlanceBanks();

    $('nav-tx-count').textContent = list.length;
    highlightSidebarFilters();

    if ($('view-coa').classList.contains('active')) { renderCoaBankGrid(); renderCoaCharts(); }
    if ($('view-reports').classList.contains('active')) renderReportPanel();
}

function renderDeptBreakdown(list, superVisible) {
    const wrap = $('dept-breakdown-wrap');
    const grid = $('dept-breakdown-grid');
    if (!superVisible) { wrap.classList.add('hidden'); return; }
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
            <div class="dc-row"><span>Income</span><strong style="color:var(--primary-dark)">${formatRF(inc)}</strong></div>
            <div class="dc-row"><span>Expenses</span><strong style="color:var(--danger)">${formatRF(exp)}</strong></div>
            <div class="dc-net"><span>Net</span><span style="color:${inc - exp >= 0 ? 'var(--primary-dark)' : 'var(--danger)'}">${formatRF(inc - exp)}</span></div>
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

function renderGlanceExpenseDonut(list) {
    const canvas = $('glance-expense-chart');
    const legendWrap = $('glance-expense-legend');
    if (!canvas || !legendWrap) return;

    const depts = Object.keys(EPR_STRUCTURE);
    const totals = depts.map(d => list.filter(t => t.department === d && t.type === 'Expense').reduce((s, t) => s + (t.amount || 0), 0));
    const hasData = totals.some(v => v > 0);
    const labels = depts.map(shortDeptName);
    const colors = depts.map((_, i) => DEPT_CHART_COLORS[i % DEPT_CHART_COLORS.length]);

    if (glanceExpenseChart) glanceExpenseChart.destroy();
    glanceExpenseChart = new Chart(canvas, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: hasData ? totals : [1], backgroundColor: hasData ? colors : ['#e3e5e8'], borderWidth: 0 }] },
        options: { responsive: false, cutout: '68%', plugins: { legend: { display: false }, tooltip: { enabled: hasData } } }
    });

    legendWrap.innerHTML = '';
    if (!hasData) { legendWrap.innerHTML = `<span class="glance-sub">No expenses recorded yet in this scope.</span>`; return; }
    depts.forEach((d, i) => {
        if (!totals[i]) return;
        const row = document.createElement('div');
        row.className = 'glance-legend-row';
        row.innerHTML = `<span class="glance-legend-dot" style="background:${colors[i]}"></span><span>${shortDeptName(d)}: <strong>${formatRF(totals[i])}</strong></span>`;
        legendWrap.appendChild(row);
    });
}

function renderGlanceBanks() {
    const wrap = $('glance-banks-list');
    if (!wrap) return;
    const visible = getVisibleBanks();
    if (!visible.length) {
        wrap.innerHTML = isSuper()
            ? `<p class="glance-sub">No banks added yet.</p>`
            : `<p class="glance-sub">You haven't posted any transaction or cheque against a bank account yet.</p>`;
        return;
    }
    wrap.innerHTML = '';
    visible.slice(0, 5).forEach(b => {
        const row = document.createElement('div');
        row.className = 'glance-bank-row';
        row.innerHTML = `
            <div class="glance-bank-icon"><i class="fa-solid fa-building-columns"></i></div>
            <div class="glance-bank-name">${escapeHtml(b.name)}<br><span class="glance-sub" style="margin:0;">${escapeHtml(b.account || '')}</span></div>
            <div class="glance-bank-bal">${formatRF(computeBankBalance(b))}</div>`;
        wrap.appendChild(row);
    });
}

function renderTransactionsTable(list) {
    const tbody = $('tx-table-body');
    tbody.innerHTML = '';
    const superVisible = isSuper();
    $('ft-result-count').textContent = `${list.length} result${list.length === 1 ? '' : 's'}`;

    if (list.length === 0) {
        tbody.innerHTML = `<tr class="table-empty-row"><td colspan="9"><i class="fa-solid fa-inbox empty-icon"></i>No records found in this scope. Try clearing filters or search.</td></tr>`;
        $('tx-table-footer').textContent = '';
        return;
    }

    list.forEach(tx => {
        const tr = document.createElement('tr');
        const isInc = tx.type === 'Income' || tx.type === 'Asset';
        const canEdit = superVisible || tx.createdById === currentUser.id;
        tr.innerHTML = `
            <td>${tx.date}</td>
            <td><span class="badge type-${tx.type.toLowerCase()}">${tx.type}</span></td>
            <td class="wrap">${escapeHtml(tx.desc)}<div class="row-who">by ${whoLine(tx)}</div></td>
            <td>${shortDeptName(tx.department)}</td>
            <td><strong>${tx.subsection}</strong></td>
            <td>${(tx.presbytery || '').replace('EPR Presbytery ', '')}</td>
            <td>${escapeHtml(tx.bankName || '—')}</td>
            <td style="font-weight: bold; color: ${isInc ? 'var(--primary-dark)' : 'var(--danger)'};">${formatRF(tx.amount)}</td>
            <td><div class="row-actions">
                <button class="icon-action-btn tx-edit-btn" data-id="${tx.id}" title="Edit" ${canEdit ? '' : 'disabled'}><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action-btn danger-hover tx-delete-btn" data-id="${tx.id}" title="Delete" ${canEdit ? '' : 'disabled'}><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
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
        const projCount = (u.assignedProjects || []).length;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(u.name)}</strong></td>
            <td>${escapeHtml(u.email)}</td>
            <td><span class="badge role-${u.role}">${ROLE_LABELS[u.role] || u.role}</span></td>
            <td>${u.presbytery === 'ALL' ? 'All presbyteries' : u.presbytery}</td>
            <td>${u.department === 'ALL' ? 'All departments' : shortDeptName(u.department)}${projCount ? ` <span class="muted-sm">(${projCount} project${projCount === 1 ? '' : 's'})</span>` : ''}</td>
            <td><div class="row-actions">
                <button class="icon-action-btn user-edit-btn" data-id="${u.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action-btn danger-hover user-delete-btn" data-id="${u.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

// ---------------------------------------------------------------------
// 19. DEPARTMENTS / PRESBYTERIES ORG CHART VIEW
// ---------------------------------------------------------------------
function renderOrgChart() {
    const superVisible = isSuper();
    const deptGrid = $('org-dept-grid');
    deptGrid.innerHTML = '';
    Object.entries(EPR_STRUCTURE).forEach(([dept, subs]) => {
        const isMine = !superVisible && dept === currentUser.department;
        const managerCount = superVisible ? usersDb.filter(u => u.department === dept).length : null;
        const card = document.createElement('div');
        card.className = `org-dept-card${isMine ? ' mine' : ''}`;
        card.innerHTML = `
            <div class="odc-head"><i class="fa-solid ${DEPT_ICONS[dept] || 'fa-building'}"></i> ${shortDeptName(dept)}</div>
            <div class="odc-body">${subs.map(s => `<div class="odc-sub">${s}</div>`).join('')}</div>
            ${superVisible ? `<div class="odc-count"><i class="fa-solid fa-user-gear"></i> ${managerCount} user${managerCount === 1 ? '' : 's'} assigned</div>` : (isMine ? `<div class="odc-count"><i class="fa-solid fa-circle-check"></i> This is your department</div>` : '')}
        `;
        if (superVisible) card.addEventListener('click', () => { $('sa-department-select').value = dept; currentScope.department = dept; switchView('transactions'); onScopeChanged(); });
        deptGrid.appendChild(card);
    });

    const presGrid = $('org-pres-grid');
    presGrid.innerHTML = '';
    PRESBYTERIES.forEach(p => {
        const isMine = !superVisible && p === currentUser.presbytery;
        const count = superVisible ? usersDb.filter(u => u.presbytery === p).length : null;
        const card = document.createElement('div');
        card.className = `pres-card${isMine ? ' mine' : ''}`;
        card.innerHTML = `
            <i class="fa-solid fa-location-dot"></i>
            <div class="pc-name">${p.replace('EPR Presbytery ', '')}</div>
            ${superVisible ? `<div class="pc-count">${count} user${count === 1 ? '' : 's'}</div>` : (isMine ? `<div class="pc-count">Your presbytery</div>` : '')}
        `;
        if (superVisible) card.addEventListener('click', () => { $('sa-presbytery-select').value = p; currentScope.presbytery = p; switchView('transactions'); onScopeChanged(); });
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
                <span style="font-weight:700;color:${tx.type === 'Expense' || tx.type === 'Liability' ? 'var(--danger)' : 'var(--primary-dark)'}">${formatRF(tx.amount)}</span>`;
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
    const list = getReportTransactions();
    if (list.length === 0) { showToast('error', 'Nothing to export for the selected range/scope.'); return; }
    const data = list.map(item => ({
        Date: item.date, Type: item.type, Description: item.desc, Department: item.department,
        Section: item.subsection, Presbytery: item.presbytery, Account: item.bankName || '',
        Amount: item.amount, RecordedBy: item.createdByName || item.createdBy || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "SAS Report");
    XLSX.writeFile(workbook, "SAS_Financial_Report.xlsx");
    showToast('success', `Exported ${list.length} records to Excel.`);
}

// ---------------------------------------------------------------------
// 22. HELPERS
// ---------------------------------------------------------------------
const formatRF = (amount) => "RF " + Number(amount || 0).toLocaleString();
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function statusPill(status) {
    return `<span class="status-pill status-${status}">${STATUS_LABELS[status] || status}</span>`;
}

/* =======================================================================
   EXTENDED MODULES
   ======================================================================= */

// ---------------------------------------------------------------------
// 23. EXT MODULE EVENT WIRING
// ---------------------------------------------------------------------
function setupExtModulesEventListeners() {
    $('open-invoice-modal-btn').addEventListener('click', () => openInvoiceModal());
    $('close-invoice-modal').addEventListener('click', () => $('invoice-modal').classList.add('hidden'));
    $('invoice-modal').addEventListener('click', (e) => { if (e.target === $('invoice-modal')) $('invoice-modal').classList.add('hidden'); });
    $('invoice-form').addEventListener('submit', onSubmitInvoiceForm);
    $('invoices-table-body').addEventListener('click', onInvoicesTableClick);

    $('open-bill-modal-btn').addEventListener('click', () => openBillModal());
    $('close-bill-modal').addEventListener('click', () => $('bill-modal').classList.add('hidden'));
    $('bill-modal').addEventListener('click', (e) => { if (e.target === $('bill-modal')) $('bill-modal').classList.add('hidden'); });
    $('bill-form').addEventListener('submit', onSubmitBillForm);
    $('bills-table-body').addEventListener('click', onBillsTableClick);

    $('open-cheque-modal-btn').addEventListener('click', () => openChequeModal());
    $('close-cheque-modal').addEventListener('click', () => $('cheque-modal').classList.add('hidden'));
    $('cheque-modal').addEventListener('click', (e) => { if (e.target === $('cheque-modal')) $('cheque-modal').classList.add('hidden'); });
    $('cheque-form').addEventListener('submit', onSubmitChequeForm);
    $('cheques-table-body').addEventListener('click', onChequesTableClick);

    $('open-supplier-modal-btn').addEventListener('click', () => openSupplierModal());
    $('close-supplier-modal').addEventListener('click', () => $('supplier-modal').classList.add('hidden'));
    $('supplier-modal').addEventListener('click', (e) => { if (e.target === $('supplier-modal')) $('supplier-modal').classList.add('hidden'); });
    $('supplier-form').addEventListener('submit', onSubmitSupplierForm);
    $('suppliers-table-body').addEventListener('click', onSuppliersTableClick);

    $('open-customer-modal-btn').addEventListener('click', () => openCustomerModal());
    $('close-customer-modal').addEventListener('click', () => $('customer-modal').classList.add('hidden'));
    $('customer-modal').addEventListener('click', (e) => { if (e.target === $('customer-modal')) $('customer-modal').classList.add('hidden'); });
    $('customer-form').addEventListener('submit', onSubmitCustomerForm);
    $('customers-table-body').addEventListener('click', onCustomersTableClick);

    $('open-project-modal-btn').addEventListener('click', () => openProjectModal());
    $('close-project-modal').addEventListener('click', () => $('project-modal').classList.add('hidden'));
    $('project-modal').addEventListener('click', (e) => { if (e.target === $('project-modal')) $('project-modal').classList.add('hidden'); });
    $('project-form').addEventListener('submit', onSubmitProjectForm);
    $('projects-table-body').addEventListener('click', onProjectsTableClick);
    $('project-progress').addEventListener('input', (e) => { $('project-progress-val').textContent = `${e.target.value}%`; });

    $('open-budget-modal-btn').addEventListener('click', () => openBudgetModal());
    $('close-budget-modal').addEventListener('click', () => $('budget-modal').classList.add('hidden'));
    $('budget-modal').addEventListener('click', (e) => { if (e.target === $('budget-modal')) $('budget-modal').classList.add('hidden'); });
    $('budget-form').addEventListener('submit', onSubmitBudgetForm);
    $('budget-table-body').addEventListener('click', onBudgetTableClick);

    $('open-bank-modal-btn').addEventListener('click', () => openBankModal());
    $('close-bank-modal').addEventListener('click', () => $('bank-modal').classList.add('hidden'));
    $('bank-modal').addEventListener('click', (e) => { if (e.target === $('bank-modal')) $('bank-modal').classList.add('hidden'); });
    $('bank-form').addEventListener('submit', onSubmitBankForm);
    $('banks-table-body').addEventListener('click', onBanksTableClick);
}

function guardSuperadminView(viewId, sectionLabel) {
    if (!isSuper()) {
        $(viewId).innerHTML = `<div class="module-empty"><i class="fa-solid fa-lock"></i>${sectionLabel} is available to Superadmins only.</div>`;
        return false;
    }
    return true;
}

// ---------------------------------------------------------------------
// 24. INVOICES
// ---------------------------------------------------------------------
function subscribeInvoices() {
    if (unsubInvoices) unsubInvoices();
    unsubInvoices = onSnapshot(buildScopedQuery(COLLECTIONS.INVOICES), (snap) => {
        invoicesDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        invoicesDb.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        renderInvoicesTable();
        $('nav-invoices-count').textContent = invoicesDb.length;
        renderPendingApprovals();
    }, (err) => showToast('error', 'Invoices feed error: ' + err.message));
}

function openInvoiceModal(edit) {
    setupScopedModalFields('invoice', true, edit);
    fillSelect($('invoice-customer'), [], '', '-- Select customer --');
    customersDb.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; $('invoice-customer').appendChild(o); });

    if (edit) {
        $('invoice-modal-title').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Invoice';
        $('invoice-submit-btn').textContent = 'Update Invoice';
        $('invoice-edit-id').value = edit.id;
        $('invoice-number').value = edit.number;
        $('invoice-customer').value = edit.customerId || '';
        $('invoice-desc').value = edit.desc;
        $('invoice-amount').value = edit.amount;
        $('invoice-date').value = edit.date;
        $('invoice-due').value = edit.due || '';
        prefillAccountCombobox('invoice', edit.bankId);
    } else {
        $('invoice-modal-title').innerHTML = '<i class="fa-solid fa-file-invoice"></i> Record Invoice';
        $('invoice-submit-btn').textContent = 'Submit Invoice';
        $('invoice-form').reset();
        $('invoice-edit-id').value = '';
        $('invoice-date').value = new Date().toISOString().split('T')[0];
        resetAccountCombobox('invoice');
        setupScopedModalFields('invoice', true, null);
    }
    $('invoice-modal').classList.remove('hidden');
}

async function onSubmitInvoiceForm(e) {
    e.preventDefault();
    const editId = $('invoice-edit-id').value;
    const customerId = $('invoice-customer').value;
    const customer = customersDb.find(c => c.id === customerId);
    const scope = scopedFieldsFromForm('invoice', true);

    if (!validateAccountCombobox('invoice')) { showToast('error', 'Please choose which bank/cash account will receive this invoice payment.'); return; }
    const acct = readAccountCombobox('invoice');

    const payload = sanitizePayload({
        number: $('invoice-number').value.trim(),
        customerId, customerName: customer ? customer.name : '',
        desc: $('invoice-desc').value.trim(),
        amount: parseFloat($('invoice-amount').value),
        date: $('invoice-date').value || new Date().toISOString().split('T')[0],
        due: $('invoice-due').value || '',
        bankId: acct.bankId, bankName: acct.bankName,
        ...scope
    });
    if (!payload.number || !customerId || !payload.desc || isNaN(payload.amount) || payload.amount < 0) {
        showToast('error', 'Fill in invoice number, customer, description and a valid amount.'); return;
    }

    const btn = $('invoice-submit-btn'); btn.disabled = true;
    try {
        if (editId) {
            await updateDoc(doc(db, COLLECTIONS.INVOICES, editId), { ...payload, ...updateMeta() });
            showToast('success', 'Invoice updated.');
        } else {
            await addDoc(collection(db, COLLECTIONS.INVOICES), sanitizePayload({ ...payload, status: 'pending_approval', ...actorMeta(), createdAt: serverTimestamp() }));
            showToast('success', 'Invoice submitted for Superadmin approval.');
        }
        $('invoice-modal').classList.add('hidden');
    } catch (err) { showToast('error', "Couldn't save invoice: " + err.message); }
    finally { btn.disabled = false; }
}

function renderInvoicesTable() {
    const tbody = $('invoices-table-body');
    if (invoicesDb.length === 0) { tbody.innerHTML = `<tr class="table-empty-row"><td colspan="10">No invoices in this scope yet.</td></tr>`; return; }
    tbody.innerHTML = '';
    invoicesDb.forEach(inv => {
        const canEditRaw = (isSuper() || inv.createdById === currentUser.id) && inv.status === 'pending_approval';
        const canApprove = isSuper() && inv.status === 'pending_approval';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${inv.date}</td><td><strong>${escapeHtml(inv.number)}</strong></td><td>${escapeHtml(inv.customerName || '—')}</td>
            <td class="wrap">${escapeHtml(inv.desc)}<div class="row-who">by ${whoLine(inv)}</div></td>
            <td style="font-weight:bold;color:var(--primary-dark)">${formatRF(inv.amount)}</td>
            <td>${escapeHtml(inv.bankName || '—')}</td>
            <td>${shortDeptName(inv.department)}</td><td>${(inv.presbytery||'').replace('EPR Presbytery ','')}</td>
            <td>${statusPill(inv.status)}</td>
            <td><div class="row-actions-wrap">
                ${canApprove ? `<button class="btn btn-approve" style="padding:6px 10px;font-size:.75rem;" data-approve="${inv.id}"><i class="fa-solid fa-check"></i> Approve</button>
                <button class="btn btn-reject" style="padding:6px 10px;font-size:.75rem;" data-reject="${inv.id}"><i class="fa-solid fa-xmark"></i> Reject</button>` : ''}
                <button class="icon-action-btn" data-edit="${inv.id}" title="Edit" ${canEditRaw ? '' : 'disabled'}><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action-btn danger-hover" data-delete="${inv.id}" title="Delete" ${canEditRaw || isSuper() ? '' : 'disabled'}><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

function onInvoicesTableClick(e) {
    const approveBtn = e.target.closest('[data-approve]');
    const rejectBtn = e.target.closest('[data-reject]');
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-delete]');
    if (approveBtn) {
        const id = approveBtn.dataset.approve;
        updateDoc(doc(db, COLLECTIONS.INVOICES, id), { status: 'approved', ...updateMeta({ approvedBy: currentUser.email, approvedById: currentUser.id, approvedByName: currentUser.name, approvedAt: serverTimestamp() }) })
            .then(() => showToast('success', 'Invoice approved and issued.')).catch(err => showToast('error', err.message));
    } else if (rejectBtn) {
        const id = rejectBtn.dataset.reject;
        openConfirmModal('Reject this invoice? The submitter will need to resubmit if needed.', async () => {
            try { await updateDoc(doc(db, COLLECTIONS.INVOICES, id), { status: 'rejected', ...updateMeta({ approvedBy: currentUser.email, approvedById: currentUser.id, approvedByName: currentUser.name, approvedAt: serverTimestamp() }) }); showToast('success', 'Invoice rejected.'); }
            catch (err) { showToast('error', err.message); }
        });
    } else if (editBtn) {
        const inv = invoicesDb.find(i => i.id === editBtn.dataset.edit);
        if (inv) openInvoiceModal(inv);
    } else if (delBtn) {
        const inv = invoicesDb.find(i => i.id === delBtn.dataset.delete);
        if (!inv) return;
        openConfirmModal(`Delete invoice "${inv.number}"? This cannot be undone.`, async () => {
            try { await deleteDoc(doc(db, COLLECTIONS.INVOICES, inv.id)); showToast('success', 'Invoice deleted.'); }
            catch (err) { showToast('error', "Couldn't delete: " + err.message); }
        });
    }
}

// ---------------------------------------------------------------------
// 25. BILLS
// ---------------------------------------------------------------------
function subscribeBills() {
    if (unsubBills) unsubBills();
    unsubBills = onSnapshot(buildScopedQuery(COLLECTIONS.BILLS), (snap) => {
        billsDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        billsDb.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        renderBillsTable();
        $('nav-bills-count').textContent = billsDb.length;
        renderPendingApprovals();
    }, (err) => showToast('error', 'Bills feed error: ' + err.message));
}

function openBillModal(edit) {
    setupScopedModalFields('bill', true, edit);
    fillSelect($('bill-supplier'), [], '', '-- Select supplier --');
    suppliersDb.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; $('bill-supplier').appendChild(o); });

    if (edit) {
        $('bill-modal-title').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Bill';
        $('bill-submit-btn').textContent = 'Update Bill';
        $('bill-edit-id').value = edit.id;
        $('bill-number').value = edit.number;
        $('bill-supplier').value = edit.supplierId || '';
        $('bill-desc').value = edit.desc;
        $('bill-amount').value = edit.amount;
        $('bill-date').value = edit.date;
        $('bill-due').value = edit.due || '';
        prefillAccountCombobox('bill', edit.bankId);
    } else {
        $('bill-modal-title').innerHTML = '<i class="fa-solid fa-receipt"></i> Record Bill';
        $('bill-submit-btn').textContent = 'Submit Bill';
        $('bill-form').reset();
        $('bill-edit-id').value = '';
        $('bill-date').value = new Date().toISOString().split('T')[0];
        resetAccountCombobox('bill');
        setupScopedModalFields('bill', true, null);
    }
    $('bill-modal').classList.remove('hidden');
}

async function onSubmitBillForm(e) {
    e.preventDefault();
    const editId = $('bill-edit-id').value;
    const supplierId = $('bill-supplier').value;
    const supplier = suppliersDb.find(s => s.id === supplierId);
    const scope = scopedFieldsFromForm('bill', true);

    if (!validateAccountCombobox('bill')) { showToast('error', 'Please choose which bank/cash account this bill will be paid from.'); return; }
    const acct = readAccountCombobox('bill');

    const payload = sanitizePayload({
        number: $('bill-number').value.trim(),
        supplierId, supplierName: supplier ? supplier.name : '',
        desc: $('bill-desc').value.trim(),
        amount: parseFloat($('bill-amount').value),
        date: $('bill-date').value || new Date().toISOString().split('T')[0],
        due: $('bill-due').value || '',
        bankId: acct.bankId, bankName: acct.bankName,
        ...scope
    });
    if (!payload.number || !supplierId || !payload.desc || isNaN(payload.amount) || payload.amount < 0) {
        showToast('error', 'Fill in bill number, supplier, description and a valid amount.'); return;
    }

    const btn = $('bill-submit-btn'); btn.disabled = true;
    try {
        if (editId) {
            await updateDoc(doc(db, COLLECTIONS.BILLS, editId), { ...payload, ...updateMeta() });
            showToast('success', 'Bill updated.');
        } else {
            await addDoc(collection(db, COLLECTIONS.BILLS), sanitizePayload({ ...payload, status: 'pending_approval', ...actorMeta(), createdAt: serverTimestamp() }));
            showToast('success', 'Bill submitted for Superadmin approval.');
        }
        $('bill-modal').classList.add('hidden');
    } catch (err) { showToast('error', "Couldn't save bill: " + err.message); }
    finally { btn.disabled = false; }
}

function renderBillsTable() {
    const tbody = $('bills-table-body');
    if (billsDb.length === 0) { tbody.innerHTML = `<tr class="table-empty-row"><td colspan="10">No bills in this scope yet.</td></tr>`; return; }
    tbody.innerHTML = '';
    billsDb.forEach(bill => {
        const canEditRaw = (isSuper() || bill.createdById === currentUser.id) && bill.status === 'pending_approval';
        const canApprove = isSuper() && bill.status === 'pending_approval';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${bill.date}</td><td><strong>${escapeHtml(bill.number)}</strong></td><td>${escapeHtml(bill.supplierName || '—')}</td>
            <td class="wrap">${escapeHtml(bill.desc)}<div class="row-who">by ${whoLine(bill)}</div></td>
            <td style="font-weight:bold;color:var(--danger)">${formatRF(bill.amount)}</td>
            <td>${escapeHtml(bill.bankName || '—')}</td>
            <td>${shortDeptName(bill.department)}</td><td>${(bill.presbytery||'').replace('EPR Presbytery ','')}</td>
            <td>${statusPill(bill.status)}</td>
            <td><div class="row-actions-wrap">
                ${canApprove ? `<button class="btn btn-approve" style="padding:6px 10px;font-size:.75rem;" data-approve="${bill.id}"><i class="fa-solid fa-check"></i> Approve &amp; Pay</button>
                <button class="btn btn-reject" style="padding:6px 10px;font-size:.75rem;" data-reject="${bill.id}"><i class="fa-solid fa-xmark"></i> Reject</button>` : ''}
                <button class="icon-action-btn" data-edit="${bill.id}" title="Edit" ${canEditRaw ? '' : 'disabled'}><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action-btn danger-hover" data-delete="${bill.id}" title="Delete" ${canEditRaw || isSuper() ? '' : 'disabled'}><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

function onBillsTableClick(e) {
    const approveBtn = e.target.closest('[data-approve]');
    const rejectBtn = e.target.closest('[data-reject]');
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-delete]');
    if (approveBtn) {
        updateDoc(doc(db, COLLECTIONS.BILLS, approveBtn.dataset.approve), { status: 'approved', ...updateMeta({ approvedBy: currentUser.email, approvedById: currentUser.id, approvedByName: currentUser.name, approvedAt: serverTimestamp() }) })
            .then(() => showToast('success', 'Bill approved and marked paid.')).catch(err => showToast('error', err.message));
    } else if (rejectBtn) {
        const id = rejectBtn.dataset.reject;
        openConfirmModal('Reject this bill?', async () => {
            try { await updateDoc(doc(db, COLLECTIONS.BILLS, id), { status: 'rejected', ...updateMeta({ approvedBy: currentUser.email, approvedById: currentUser.id, approvedByName: currentUser.name, approvedAt: serverTimestamp() }) }); showToast('success', 'Bill rejected.'); }
            catch (err) { showToast('error', err.message); }
        });
    } else if (editBtn) {
        const bill = billsDb.find(b => b.id === editBtn.dataset.edit);
        if (bill) openBillModal(bill);
    } else if (delBtn) {
        const bill = billsDb.find(b => b.id === delBtn.dataset.delete);
        if (!bill) return;
        openConfirmModal(`Delete bill "${bill.number}"? This cannot be undone.`, async () => {
            try { await deleteDoc(doc(db, COLLECTIONS.BILLS, bill.id)); showToast('success', 'Bill deleted.'); }
            catch (err) { showToast('error', "Couldn't delete: " + err.message); }
        });
    }
}

// ---------------------------------------------------------------------
// 26. CHEQUES
// ---------------------------------------------------------------------
function subscribeCheques() {
    if (unsubCheques) unsubCheques();
    unsubCheques = onSnapshot(buildScopedQuery(COLLECTIONS.CHEQUES), (snap) => {
        chequesDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        chequesDb.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        renderChequesTable();
        $('nav-cheques-count').textContent = chequesDb.length;
        renderPendingApprovals();
        if ($('view-coa').classList.contains('active')) { renderCoaBankGrid(); renderCoaCharts(); }
    }, (err) => showToast('error', 'Cheques feed error: ' + err.message));
}

function openChequeModal(edit) {
    setupScopedModalFields('cheque', true, edit);

    if (edit) {
        $('cheque-modal-title').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Cheque';
        $('cheque-submit-btn').textContent = 'Update Cheque';
        $('cheque-edit-id').value = edit.id;
        $('cheque-number').value = edit.number;
        $('cheque-payee').value = edit.payee;
        $('cheque-amount').value = edit.amount;
        $('cheque-date').value = edit.date;
        $('cheque-memo').value = edit.memo || '';
        prefillAccountCombobox('cheque', edit.bankId);
    } else {
        $('cheque-modal-title').innerHTML = '<i class="fa-solid fa-money-check"></i> Prepare Cheque';
        $('cheque-submit-btn').textContent = 'Submit Cheque';
        $('cheque-form').reset();
        $('cheque-edit-id').value = '';
        $('cheque-date').value = new Date().toISOString().split('T')[0];
        resetAccountCombobox('cheque');
        setupScopedModalFields('cheque', true, null);
    }
    $('cheque-modal').classList.remove('hidden');
}

async function onSubmitChequeForm(e) {
    e.preventDefault();
    const editId = $('cheque-edit-id').value;
    const scope = scopedFieldsFromForm('cheque', true);

    if (!validateAccountCombobox('cheque')) { showToast('error', 'Please choose the bank this cheque is drawn against.'); return; }
    const acct = readAccountCombobox('cheque');

    const payload = sanitizePayload({
        number: $('cheque-number').value.trim(),
        payee: $('cheque-payee').value.trim(),
        bankId: acct.bankId, bankName: acct.bankName,
        amount: parseFloat($('cheque-amount').value),
        date: $('cheque-date').value || new Date().toISOString().split('T')[0],
        memo: $('cheque-memo').value.trim(),
        ...scope
    });
    if (!payload.number || !payload.payee || !acct.bankId || isNaN(payload.amount) || payload.amount < 0) {
        showToast('error', 'Fill in cheque number, payee, bank and a valid amount.'); return;
    }

    const btn = $('cheque-submit-btn'); btn.disabled = true;
    try {
        if (editId) {
            await updateDoc(doc(db, COLLECTIONS.CHEQUES, editId), { ...payload, ...updateMeta() });
            showToast('success', 'Cheque updated.');
        } else {
            await addDoc(collection(db, COLLECTIONS.CHEQUES), sanitizePayload({ ...payload, status: 'pending_approval', ...actorMeta(), createdAt: serverTimestamp() }));
            showToast('success', 'Cheque submitted for approval.');
        }
        $('cheque-modal').classList.add('hidden');
    } catch (err) { showToast('error', "Couldn't save cheque: " + err.message); }
    finally { btn.disabled = false; }
}

function renderChequesTable() {
    const tbody = $('cheques-table-body');
    if (chequesDb.length === 0) { tbody.innerHTML = `<tr class="table-empty-row"><td colspan="9">No cheques in this scope yet.</td></tr>`; return; }
    tbody.innerHTML = '';
    chequesDb.forEach(chq => {
        const canEditRaw = (isSuper() || chq.createdById === currentUser.id) && chq.status === 'pending_approval';
        const canApprove = isFinanceOrSuper() && chq.status === 'pending_approval';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${chq.date}</td><td><strong>${escapeHtml(chq.number)}</strong></td><td>${escapeHtml(chq.payee)}</td>
            <td>${escapeHtml(chq.bankName || '—')}</td><td style="font-weight:bold;color:var(--danger)">${formatRF(chq.amount)}</td>
            <td>${shortDeptName(chq.department)}</td><td>${(chq.presbytery||'').replace('EPR Presbytery ','')}</td>
            <td>${statusPill(chq.status)}</td>
            <td><div class="row-actions-wrap">
                ${canApprove ? `<button class="btn btn-approve" style="padding:6px 10px;font-size:.75rem;" data-approve="${chq.id}"><i class="fa-solid fa-check"></i> Approve</button>
                <button class="btn btn-reject" style="padding:6px 10px;font-size:.75rem;" data-reject="${chq.id}"><i class="fa-solid fa-xmark"></i> Reject</button>` : ''}
                <button class="icon-action-btn" data-edit="${chq.id}" title="Edit" ${canEditRaw ? '' : 'disabled'}><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action-btn danger-hover" data-delete="${chq.id}" title="Delete" ${canEditRaw || isSuper() ? '' : 'disabled'}><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

function onChequesTableClick(e) {
    const approveBtn = e.target.closest('[data-approve]');
    const rejectBtn = e.target.closest('[data-reject]');
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-delete]');
    if (approveBtn) {
        updateDoc(doc(db, COLLECTIONS.CHEQUES, approveBtn.dataset.approve), { status: 'approved', ...updateMeta({ approvedBy: currentUser.email, approvedById: currentUser.id, approvedByName: currentUser.name, approvedAt: serverTimestamp() }) })
            .then(() => showToast('success', 'Cheque approved.')).catch(err => showToast('error', err.message));
    } else if (rejectBtn) {
        const id = rejectBtn.dataset.reject;
        openConfirmModal('Reject this cheque?', async () => {
            try { await updateDoc(doc(db, COLLECTIONS.CHEQUES, id), { status: 'rejected', ...updateMeta({ approvedBy: currentUser.email, approvedById: currentUser.id, approvedByName: currentUser.name, approvedAt: serverTimestamp() }) }); showToast('success', 'Cheque rejected.'); }
            catch (err) { showToast('error', err.message); }
        });
    } else if (editBtn) {
        const chq = chequesDb.find(c => c.id === editBtn.dataset.edit);
        if (chq) openChequeModal(chq);
    } else if (delBtn) {
        const chq = chequesDb.find(c => c.id === delBtn.dataset.delete);
        if (!chq) return;
        openConfirmModal(`Delete cheque "${chq.number}"? This cannot be undone.`, async () => {
            try { await deleteDoc(doc(db, COLLECTIONS.CHEQUES, chq.id)); showToast('success', 'Cheque deleted.'); }
            catch (err) { showToast('error', "Couldn't delete: " + err.message); }
        });
    }
}

// ---------------------------------------------------------------------
// 27. SUPPLIERS
// ---------------------------------------------------------------------
function subscribeSuppliers() {
    if (unsubSuppliers) unsubSuppliers();
    unsubSuppliers = onSnapshot(buildScopedQuery(COLLECTIONS.SUPPLIERS), (snap) => {
        suppliersDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        suppliersDb.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderSuppliersTable();
        $('nav-suppliers-count').textContent = suppliersDb.length;
    }, (err) => showToast('error', 'Suppliers feed error: ' + err.message));
}

function openSupplierModal(edit) {
    setupScopedModalFields('supplier', false, edit);
    if (edit) {
        $('supplier-modal-title').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Supplier';
        $('supplier-submit-btn').textContent = 'Update Supplier';
        $('supplier-edit-id').value = edit.id;
        $('supplier-name').value = edit.name;
        $('supplier-contact').value = edit.contact || '';
        $('supplier-phone').value = edit.phone || '';
        $('supplier-email').value = edit.email || '';
        $('supplier-address').value = edit.address || '';
    } else {
        $('supplier-modal-title').innerHTML = '<i class="fa-solid fa-truck-field"></i> Add Supplier';
        $('supplier-submit-btn').textContent = 'Save Supplier';
        $('supplier-form').reset();
        $('supplier-edit-id').value = '';
        setupScopedModalFields('supplier', false, null);
    }
    $('supplier-modal').classList.remove('hidden');
}

async function onSubmitSupplierForm(e) {
    e.preventDefault();
    const editId = $('supplier-edit-id').value;
    const scope = scopedFieldsFromForm('supplier', false);
    const payload = sanitizePayload({
        name: $('supplier-name').value.trim(), contact: $('supplier-contact').value.trim(),
        phone: $('supplier-phone').value.trim(), email: $('supplier-email').value.trim(),
        address: $('supplier-address').value.trim(),
        department: scope.department, presbytery: scope.presbytery
    });
    if (!payload.name) { showToast('error', 'Supplier name is required.'); return; }
    const btn = $('supplier-submit-btn'); btn.disabled = true;
    try {
        if (editId) { await updateDoc(doc(db, COLLECTIONS.SUPPLIERS, editId), { ...payload, ...updateMeta() }); showToast('success', 'Supplier updated.'); }
        else { await addDoc(collection(db, COLLECTIONS.SUPPLIERS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() })); showToast('success', 'Supplier added.'); }
        $('supplier-modal').classList.add('hidden');
    } catch (err) { showToast('error', "Couldn't save supplier: " + err.message); }
    finally { btn.disabled = false; }
}

function renderSuppliersTable() {
    const tbody = $('suppliers-table-body');
    if (suppliersDb.length === 0) { tbody.innerHTML = `<tr class="table-empty-row"><td colspan="7">No suppliers in this scope yet.</td></tr>`; return; }
    tbody.innerHTML = '';
    suppliersDb.forEach(s => {
        const canEdit = isSuper() || s.createdById === currentUser.id;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(s.name)}</strong><div class="row-who">by ${whoLine(s)}</div></td><td>${escapeHtml(s.contact||'—')}</td><td>${escapeHtml(s.phone||'—')}</td>
            <td>${escapeHtml(s.email||'—')}</td><td>${shortDeptName(s.department)}</td><td>${(s.presbytery||'').replace('EPR Presbytery ','')}</td>
            <td><div class="row-actions">
                <button class="icon-action-btn" data-edit="${s.id}" title="Edit" ${canEdit?'':'disabled'}><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action-btn danger-hover" data-delete="${s.id}" title="Delete" ${canEdit?'':'disabled'}><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

function onSuppliersTableClick(e) {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-delete]');
    if (editBtn) { const s = suppliersDb.find(x => x.id === editBtn.dataset.edit); if (s) openSupplierModal(s); }
    else if (delBtn) {
        const s = suppliersDb.find(x => x.id === delBtn.dataset.delete);
        if (!s) return;
        openConfirmModal(`Delete supplier "${s.name}"?`, async () => {
            try { await deleteDoc(doc(db, COLLECTIONS.SUPPLIERS, s.id)); showToast('success', 'Supplier deleted.'); }
            catch (err) { showToast('error', err.message); }
        });
    }
}

// ---------------------------------------------------------------------
// 28. CUSTOMER HUB
// ---------------------------------------------------------------------
function subscribeCustomers() {
    if (unsubCustomers) unsubCustomers();
    unsubCustomers = onSnapshot(buildScopedQuery(COLLECTIONS.CUSTOMERS), (snap) => {
        customersDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        customersDb.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderCustomersTable();
        $('nav-customers-count').textContent = customersDb.length;
    }, (err) => showToast('error', 'Customers feed error: ' + err.message));
}

function openCustomerModal(edit) {
    setupScopedModalFields('customer', false, edit);
    if (edit) {
        $('customer-modal-title').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Customer';
        $('customer-submit-btn').textContent = 'Update Customer';
        $('customer-edit-id').value = edit.id;
        $('customer-name').value = edit.name;
        $('customer-contact').value = edit.contact || '';
        $('customer-phone').value = edit.phone || '';
        $('customer-email').value = edit.email || '';
        $('customer-address').value = edit.address || '';
    } else {
        $('customer-modal-title').innerHTML = '<i class="fa-solid fa-address-book"></i> Add Customer';
        $('customer-submit-btn').textContent = 'Save Customer';
        $('customer-form').reset();
        $('customer-edit-id').value = '';
        setupScopedModalFields('customer', false, null);
    }
    $('customer-modal').classList.remove('hidden');
}

async function onSubmitCustomerForm(e) {
    e.preventDefault();
    const editId = $('customer-edit-id').value;
    const scope = scopedFieldsFromForm('customer', false);
    const payload = sanitizePayload({
        name: $('customer-name').value.trim(), contact: $('customer-contact').value.trim(),
        phone: $('customer-phone').value.trim(), email: $('customer-email').value.trim(),
        address: $('customer-address').value.trim(),
        department: scope.department, presbytery: scope.presbytery
    });
    if (!payload.name) { showToast('error', 'Customer name is required.'); return; }
    const btn = $('customer-submit-btn'); btn.disabled = true;
    try {
        if (editId) { await updateDoc(doc(db, COLLECTIONS.CUSTOMERS, editId), { ...payload, ...updateMeta() }); showToast('success', 'Customer updated.'); }
        else { await addDoc(collection(db, COLLECTIONS.CUSTOMERS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() })); showToast('success', 'Customer added.'); }
        $('customer-modal').classList.add('hidden');
    } catch (err) { showToast('error', "Couldn't save customer: " + err.message); }
    finally { btn.disabled = false; }
}

function renderCustomersTable() {
    const tbody = $('customers-table-body');
    if (customersDb.length === 0) { tbody.innerHTML = `<tr class="table-empty-row"><td colspan="7">No customers in this scope yet.</td></tr>`; return; }
    tbody.innerHTML = '';
    customersDb.forEach(c => {
        const canEdit = isSuper() || c.createdById === currentUser.id;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(c.name)}</strong><div class="row-who">by ${whoLine(c)}</div></td><td>${escapeHtml(c.contact||'—')}</td><td>${escapeHtml(c.phone||'—')}</td>
            <td>${escapeHtml(c.email||'—')}</td><td>${shortDeptName(c.department)}</td><td>${(c.presbytery||'').replace('EPR Presbytery ','')}</td>
            <td><div class="row-actions">
                <button class="icon-action-btn" data-edit="${c.id}" title="Edit" ${canEdit?'':'disabled'}><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action-btn danger-hover" data-delete="${c.id}" title="Delete" ${canEdit?'':'disabled'}><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

function onCustomersTableClick(e) {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-delete]');
    if (editBtn) { const c = customersDb.find(x => x.id === editBtn.dataset.edit); if (c) openCustomerModal(c); }
    else if (delBtn) {
        const c = customersDb.find(x => x.id === delBtn.dataset.delete);
        if (!c) return;
        openConfirmModal(`Delete customer "${c.name}"?`, async () => {
            try { await deleteDoc(doc(db, COLLECTIONS.CUSTOMERS, c.id)); showToast('success', 'Customer deleted.'); }
            catch (err) { showToast('error', err.message); }
        });
    }
}

// ---------------------------------------------------------------------
// 29. PROJECTS
// ---------------------------------------------------------------------
function subscribeProjects() {
    if (unsubProjects) unsubProjects();
    unsubProjects = onSnapshot(buildScopedQuery(COLLECTIONS.PROJECTS), (snap) => {
        projectsDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        projectsDb.sort((a, b) => (b.start || '').localeCompare(a.start || ''));
        renderProjectsTable();
        $('nav-projects-count').textContent = projectsDb.length;
    }, (err) => showToast('error', 'Projects feed error: ' + err.message));
}

function openProjectModal(edit) {
    setupScopedModalFields('project', true, edit);
    if (edit) {
        $('project-modal-title').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Project';
        $('project-submit-btn').textContent = 'Update Project';
        $('project-edit-id').value = edit.id;
        $('project-name').value = edit.name;
        $('project-desc').value = edit.desc || '';
        $('project-start').value = edit.start || '';
        $('project-end').value = edit.end || '';
        $('project-budget').value = edit.budget || 0;
        $('project-progress').value = edit.progress || 0;
        $('project-progress-val').textContent = `${edit.progress || 0}%`;
        $('project-status').value = edit.status || 'Not Started';
    } else {
        $('project-modal-title').innerHTML = '<i class="fa-solid fa-diagram-project"></i> Add Project';
        $('project-submit-btn').textContent = 'Save Project';
        $('project-form').reset();
        $('project-edit-id').value = '';
        $('project-progress-val').textContent = '0%';
        setupScopedModalFields('project', true, null);
    }
    $('project-modal').classList.remove('hidden');
}

async function onSubmitProjectForm(e) {
    e.preventDefault();
    const editId = $('project-edit-id').value;
    const scope = scopedFieldsFromForm('project', true);
    const payload = sanitizePayload({
        name: $('project-name').value.trim(), desc: $('project-desc').value.trim(),
        start: $('project-start').value || '', end: $('project-end').value || '',
        budget: parseFloat($('project-budget').value) || 0,
        progress: parseInt($('project-progress').value, 10) || 0,
        status: $('project-status').value,
        ...scope
    });
    if (!payload.name) { showToast('error', 'Project name is required.'); return; }
    const btn = $('project-submit-btn'); btn.disabled = true;
    try {
        if (editId) { await updateDoc(doc(db, COLLECTIONS.PROJECTS, editId), { ...payload, ...updateMeta() }); showToast('success', 'Project updated.'); }
        else { await addDoc(collection(db, COLLECTIONS.PROJECTS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() })); showToast('success', 'Project created.'); }
        $('project-modal').classList.add('hidden');
    } catch (err) { showToast('error', "Couldn't save project: " + err.message); }
    finally { btn.disabled = false; }
}

function renderProjectsTable() {
    const tbody = $('projects-table-body');
    if (projectsDb.length === 0) { tbody.innerHTML = `<tr class="table-empty-row"><td colspan="8">No projects in this scope yet.</td></tr>`; return; }
    tbody.innerHTML = '';
    projectsDb.forEach(p => {
        const canEdit = isSuper() || p.createdById === currentUser.id;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(p.name)}</strong>${p.desc ? `<div class="ext-sub">${escapeHtml(p.desc)}</div>` : ''}<div class="row-who">by ${whoLine(p)}</div></td>
            <td>${shortDeptName(p.department)}<div class="ext-sub">${p.subsection||''}</div></td>
            <td>${(p.presbytery||'').replace('EPR Presbytery ','')}</td>
            <td>${p.start||'—'} → ${p.end||'—'}</td>
            <td>${formatRF(p.budget)}</td>
            <td style="min-width:120px;"><div class="progress-track"><div class="progress-fill" style="width:${p.progress||0}%"></div></div><span class="ext-sub">${p.progress||0}%</span></td>
            <td><span class="badge">${escapeHtml(p.status||'Not Started')}</span></td>
            <td><div class="row-actions">
                <button class="icon-action-btn" data-edit="${p.id}" title="Edit" ${canEdit?'':'disabled'}><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action-btn danger-hover" data-delete="${p.id}" title="Delete" ${canEdit?'':'disabled'}><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

function onProjectsTableClick(e) {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-delete]');
    if (editBtn) { const p = projectsDb.find(x => x.id === editBtn.dataset.edit); if (p) openProjectModal(p); }
    else if (delBtn) {
        const p = projectsDb.find(x => x.id === delBtn.dataset.delete);
        if (!p) return;
        openConfirmModal(`Delete project "${p.name}"?`, async () => {
            try { await deleteDoc(doc(db, COLLECTIONS.PROJECTS, p.id)); showToast('success', 'Project deleted.'); }
            catch (err) { showToast('error', err.message); }
        });
    }
}

// ---------------------------------------------------------------------
// 30. BUDGET MANAGEMENT (superadmin only)
// ---------------------------------------------------------------------
function subscribeBudgets() {
    if (unsubBudgets) unsubBudgets();
    unsubBudgets = onSnapshot(collection(db, COLLECTIONS.BUDGETS), (snap) => {
        budgetsDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        budgetsDb.sort((a, b) => (b.period || '').localeCompare(a.period || ''));
        renderBudgetTable();
    }, (err) => showToast('error', 'Budget feed error: ' + err.message));
}

function openBudgetModal(edit) {
    if (!guardSuperadminAction()) return;
    fillSelect($('budget-dept'), Object.keys(EPR_STRUCTURE));
    fillSelect($('budget-pres'), PRESBYTERIES);
    if (edit) {
        $('budget-modal-title').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Budget Line';
        $('budget-submit-btn').textContent = 'Update Budget Line';
        $('budget-edit-id').value = edit.id;
        $('budget-dept').value = edit.department;
        $('budget-pres').value = edit.presbytery;
        $('budget-category').value = edit.category;
        $('budget-period').value = edit.period;
        $('budget-amount').value = edit.amount;
        $('budget-notes').value = edit.notes || '';
    } else {
        $('budget-modal-title').innerHTML = '<i class="fa-solid fa-scale-balanced"></i> Add Budget Line';
        $('budget-submit-btn').textContent = 'Save Budget Line';
        $('budget-form').reset();
        $('budget-edit-id').value = '';
    }
    $('budget-modal').classList.remove('hidden');
}

function guardSuperadminAction() {
    if (!isSuper()) { showToast('error', 'Only a Superadmin can manage this.'); return false; }
    return true;
}

async function onSubmitBudgetForm(e) {
    e.preventDefault();
    if (!guardSuperadminAction()) return;
    const editId = $('budget-edit-id').value;
    const payload = sanitizePayload({
        department: $('budget-dept').value, presbytery: $('budget-pres').value,
        category: $('budget-category').value.trim(), period: $('budget-period').value.trim(),
        amount: parseFloat($('budget-amount').value), notes: $('budget-notes').value.trim()
    });
    if (!payload.category || !payload.period || isNaN(payload.amount) || payload.amount < 0) {
        showToast('error', 'Fill in category, period and a valid amount.'); return;
    }
    const btn = $('budget-submit-btn'); btn.disabled = true;
    try {
        if (editId) { await updateDoc(doc(db, COLLECTIONS.BUDGETS, editId), { ...payload, ...updateMeta() }); showToast('success', 'Budget line updated.'); }
        else { await addDoc(collection(db, COLLECTIONS.BUDGETS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() })); showToast('success', 'Budget line added.'); }
        $('budget-modal').classList.add('hidden');
    } catch (err) { showToast('error', "Couldn't save budget line: " + err.message); }
    finally { btn.disabled = false; }
}

function renderBudgetTable() {
    if (!guardSuperadminView('view-budget', 'Budget Management')) return;
    const tbody = $('budget-table-body');
    if (!tbody) return;
    if (budgetsDb.length === 0) { tbody.innerHTML = `<tr class="table-empty-row"><td colspan="7">No budget lines yet.</td></tr>`; return; }
    tbody.innerHTML = '';
    budgetsDb.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${shortDeptName(b.department)}</td><td>${(b.presbytery||'').replace('EPR Presbytery ','')}</td>
            <td>${escapeHtml(b.category)}</td><td>${escapeHtml(b.period)}</td><td>${formatRF(b.amount)}</td>
            <td class="wrap">${escapeHtml(b.notes||'—')}</td>
            <td><div class="row-actions">
                <button class="icon-action-btn" data-edit="${b.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action-btn danger-hover" data-delete="${b.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

function onBudgetTableClick(e) {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-delete]');
    if (editBtn) { const b = budgetsDb.find(x => x.id === editBtn.dataset.edit); if (b) openBudgetModal(b); }
    else if (delBtn) {
        const b = budgetsDb.find(x => x.id === delBtn.dataset.delete);
        if (!b) return;
        openConfirmModal(`Delete budget line "${b.category} — ${b.period}"?`, async () => {
            try { await deleteDoc(doc(db, COLLECTIONS.BUDGETS, b.id)); showToast('success', 'Budget line deleted.'); }
            catch (err) { showToast('error', err.message); }
        });
    }
}

// ---------------------------------------------------------------------
// 31. BANK MANAGEMENT (superadmin only to manage; all can read for pickers)
// ---------------------------------------------------------------------
function subscribeBanks() {
    if (unsubBanks) unsubBanks();
    unsubBanks = onSnapshot(collection(db, COLLECTIONS.BANKS), (snap) => {
        banksDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        banksDb.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderBanksTable();
        $('nav-banks-count').textContent = banksDb.length;
        renderGlanceBanks();
        if ($('view-coa').classList.contains('active')) { renderCoaBankGrid(); renderCoaCharts(); }
    }, (err) => showToast('error', 'Banks feed error: ' + err.message));
}

function openBankModal(edit) {
    if (!guardSuperadminAction()) return;
    if (edit) {
        $('bank-modal-title').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Bank';
        $('bank-submit-btn').textContent = 'Update Bank';
        $('bank-edit-id').value = edit.id;
        $('bank-name').value = edit.name;
        $('bank-branch').value = edit.branch || '';
        $('bank-account').value = edit.account;
        $('bank-currency').value = edit.currency || 'RWF';
        $('bank-balance').value = edit.balance || 0;
        $('bank-notes').value = edit.notes || '';
    } else {
        $('bank-modal-title').innerHTML = '<i class="fa-solid fa-building-columns"></i> Add Bank';
        $('bank-submit-btn').textContent = 'Save Bank';
        $('bank-form').reset();
        $('bank-edit-id').value = '';
        $('bank-currency').value = 'RWF';
    }
    $('bank-modal').classList.remove('hidden');
}

async function onSubmitBankForm(e) {
    e.preventDefault();
    if (!guardSuperadminAction()) return;
    const editId = $('bank-edit-id').value;
    const payload = sanitizePayload({
        name: $('bank-name').value.trim(), branch: $('bank-branch').value.trim(),
        account: $('bank-account').value.trim(), currency: $('bank-currency').value.trim() || 'RWF',
        balance: parseFloat($('bank-balance').value) || 0, notes: $('bank-notes').value.trim()
    });
    if (!payload.name || !payload.account) { showToast('error', 'Bank name and account number are required.'); return; }
    const btn = $('bank-submit-btn'); btn.disabled = true;
    try {
        if (editId) { await updateDoc(doc(db, COLLECTIONS.BANKS, editId), { ...payload, ...updateMeta() }); showToast('success', 'Bank updated.'); }
        else { await addDoc(collection(db, COLLECTIONS.BANKS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() })); showToast('success', 'Bank added.'); }
        $('bank-modal').classList.add('hidden');
    } catch (err) { showToast('error', "Couldn't save bank: " + err.message); }
    finally { btn.disabled = false; }
}

function renderBanksTable() {
    if (!guardSuperadminView('view-banks', 'Bank Management')) return;
    const tbody = $('banks-table-body');
    if (!tbody) return;
    if (banksDb.length === 0) { tbody.innerHTML = `<tr class="table-empty-row"><td colspan="6">No banks added yet.</td></tr>`; return; }
    tbody.innerHTML = '';
    banksDb.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(b.name)}</strong></td><td>${escapeHtml(b.branch||'—')}</td>
            <td>${escapeHtml(b.account)}</td><td>${escapeHtml(b.currency||'RWF')}</td><td>${formatRF(computeBankBalance(b))}</td>
            <td><div class="row-actions">
                <button class="icon-action-btn" data-edit="${b.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action-btn danger-hover" data-delete="${b.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

function onBanksTableClick(e) {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-delete]');
    if (editBtn) { const b = banksDb.find(x => x.id === editBtn.dataset.edit); if (b) openBankModal(b); }
    else if (delBtn) {
        const b = banksDb.find(x => x.id === delBtn.dataset.delete);
        if (!b) return;
        openConfirmModal(`Delete bank "${b.name}"? Records already linked to it will keep the old bank name on record.`, async () => {
            try { await deleteDoc(doc(db, COLLECTIONS.BANKS, b.id)); showToast('success', 'Bank deleted.'); }
            catch (err) { showToast('error', err.message); }
        });
    }
}

// ---------------------------------------------------------------------
// 32. CHART OF ACCOUNTS
// ---------------------------------------------------------------------
function getVisibleBanks() {
    if (isSuper()) return banksDb;
    if (!currentUser) return [];
    const ownIds = new Set();
    transactionsDb.forEach(t => { if (t.bankId && t.createdById === currentUser.id) ownIds.add(t.bankId); });
    chequesDb.forEach(c => { if (c.bankId && c.createdById === currentUser.id) ownIds.add(c.bankId); });
    invoicesDb.forEach(i => { if (i.bankId && i.createdById === currentUser.id) ownIds.add(i.bankId); });
    billsDb.forEach(bl => { if (bl.bankId && bl.createdById === currentUser.id) ownIds.add(bl.bankId); });
    return banksDb.filter(b => ownIds.has(b.id));
}

function getBankActivity(bankId) {
    const mine = (rec) => isSuper() || rec.createdById === currentUser.id;
    return {
        tx: transactionsDb.filter(t => t.bankId === bankId && mine(t)),
        cheques: chequesDb.filter(c => c.bankId === bankId && c.status === 'approved' && mine(c))
    };
}

function computeBankBalance(bank) {
    const { tx, cheques } = getBankActivity(bank.id);
    const inflow = tx.filter(t => t.type === 'Income').reduce((s, t) => s + (t.amount || 0), 0);
    const outflow = tx.filter(t => t.type === 'Expense').reduce((s, t) => s + (t.amount || 0), 0);
    const chequeOut = cheques.reduce((s, c) => s + (c.amount || 0), 0);
    return (bank.balance || 0) + inflow - outflow - chequeOut;
}

function renderCoaBankGrid() {
    const grid = $('coa-bank-grid');
    const empty = $('coa-empty');
    const charts = $('coa-charts');
    if (!grid || !empty || !charts) return;

    $('coa-scope-note').textContent = isSuper()
        ? 'Superadmin view — every bank account and everyone\'s activity against it.'
        : 'Showing only bank accounts you\'ve personally posted a transaction or cheque against. Their totals reflect only your own records.';

    const visible = getVisibleBanks();
    grid.innerHTML = '';

    if (visible.length === 0) {
        empty.classList.remove('hidden');
        charts.classList.add('hidden');
        empty.innerHTML = isSuper()
            ? `<i class="fa-solid fa-building-columns"></i>Add a bank under Bank Management, then it will appear here.`
            : `<i class="fa-solid fa-building-columns"></i>You haven't posted a transaction or cheque against any bank account yet. Record one and it will show up here.`;
        coaSelectedBankId = null;
        return;
    }
    empty.classList.add('hidden');

    if (!coaSelectedBankId || !visible.find(b => b.id === coaSelectedBankId)) coaSelectedBankId = visible[0].id;

    visible.forEach(b => {
        const { tx, cheques } = getBankActivity(b.id);
        const card = document.createElement('div');
        card.className = `ext-card bank-card${coaSelectedBankId === b.id ? ' selected' : ''}`;
        card.innerHTML = `
            <h4><i class="fa-solid fa-building-columns"></i> ${escapeHtml(b.name)}</h4>
            <div class="ext-sub">${escapeHtml(b.branch||'')} · ${escapeHtml(b.account)}</div>
            <div class="ext-row"><span>Current balance</span><strong>${formatRF(computeBankBalance(b))}</strong></div>
            <div class="ext-row"><span>Transactions posted</span><strong>${tx.length}</strong></div>
            <div class="ext-row"><span>Cheques cleared</span><strong>${cheques.length}</strong></div>
        `;
        card.addEventListener('click', () => { coaSelectedBankId = b.id; renderCoaBankGrid(); renderCoaCharts(); });
        grid.appendChild(card);
    });
}

function buildTrendBuckets(range) {
    const today = new Date();
    const from = range.from ? new Date(range.from + 'T00:00:00') : new Date(today.getFullYear(), today.getMonth() - 5, 1);
    const to = range.to ? new Date(range.to + 'T00:00:00') : today;
    const dayDiff = Math.max(0, Math.round((to - from) / 86400000));

    const buckets = [];
    if (dayDiff <= 31) {
        const cur = new Date(from);
        while (cur <= to) {
            const key = isoDate(cur);
            buckets.push({ key, label: cur.toLocaleDateString('default', { month: 'short', day: 'numeric' }), match: (d) => d === key });
            cur.setDate(cur.getDate() + 1);
        }
    } else {
        const cur = new Date(from.getFullYear(), from.getMonth(), 1);
        while (cur <= to) {
            const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
            buckets.push({ key, label: cur.toLocaleString('default', { month: 'short', year: '2-digit' }), match: (d) => (d || '').startsWith(key) });
            cur.setMonth(cur.getMonth() + 1);
        }
    }
    return buckets.slice(-36);
}

function renderCoaStatement(bank, range) {
    const grid = $('coa-stmt-grid');
    const label = $('coa-stmt-bank-label');
    if (!grid) return;
    if (!bank) { grid.innerHTML = ''; if (label) label.textContent = '—'; return; }
    if (label) label.textContent = `${bank.name} (${bank.account})`;

    const { tx, cheques } = getBankActivity(bank.id);
    const rangeTx = tx.filter(t => dateInRange(t.date, range) || (!range.from && !range.to));
    const rangeChq = cheques.filter(c => dateInRange(c.date, range) || (!range.from && !range.to));

    const rangeIn = rangeTx.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
    const rangeOut = rangeTx.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
    const rangeChqOut = rangeChq.reduce((s, c) => s + c.amount, 0);
    const currentBalance = computeBankBalance(bank);

    grid.innerHTML = `
        <div class="stmt-mini"><span>Opening balance</span><strong>${formatRF(bank.balance)}</strong></div>
        <div class="stmt-mini"><span>Current balance</span><strong class="${currentBalance >= 0 ? 'pos' : 'neg'}">${formatRF(currentBalance)}</strong></div>
        <div class="stmt-mini"><span>Money in (${rangeLabel(range)})</span><strong class="pos">${formatRF(rangeIn)}</strong></div>
        <div class="stmt-mini"><span>Money out (${rangeLabel(range)})</span><strong class="neg">${formatRF(rangeOut)}</strong></div>
        <div class="stmt-mini"><span>Cheques cleared (${rangeLabel(range)})</span><strong class="neg">${formatRF(rangeChqOut)}</strong></div>
    `;
}

const CHART_GREEN = '#2ca01c';
const CHART_GREEN_SOFT = 'rgba(44,160,28,0.14)';
const CHART_BLUE = '#3b82f6';
const CHART_BLUE_SOFT = 'rgba(59,130,246,0.12)';
const CHART_GREEN_DARK = '#0e5c00';

function sizeCanvasExplicitly(canvas, height) {
    if (!canvas) return { width: 0, height: 0 };
    const wrap = canvas.closest('.chart-canvas-wrap') || canvas.parentElement;
    const width = Math.max(260, Math.floor(wrap.getBoundingClientRect().width) || 600);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width, height };
}

function renderCoaCharts() {
    const visible = getVisibleBanks();
    const charts = $('coa-charts');
    if (!charts) return;
    if (!visible.length) { charts.classList.add('hidden'); return; }
    charts.classList.remove('hidden');

    const bank = visible.find(b => b.id === coaSelectedBankId) || visible[0];
    coaSelectedBankId = bank.id;

    const range = coaRange.preset === 'all' ? { from: '', to: '' } : computePresetRange(coaRange.preset, coaRange.from, coaRange.to);
    $('coa-selected-bank-label').textContent = `Cash trend — ${bank.name}`;

    renderCoaStatement(bank, range);

    const buckets = buildTrendBuckets(range.from || range.to ? range : { from: '', to: '' });
    const { tx, cheques } = getBankActivity(bank.id);
    const inSeries = buckets.map(bkt => tx.filter(t => t.type === 'Income' && bkt.match(t.date)).reduce((s, t) => s + t.amount, 0));
    const outSeries = buckets.map(bkt =>
        tx.filter(t => t.type === 'Expense' && bkt.match(t.date)).reduce((s, t) => s + t.amount, 0) +
        cheques.filter(c => bkt.match(c.date)).reduce((s, c) => s + c.amount, 0)
    );

    const depts = currentScope.department === 'ALL' ? Object.keys(EPR_STRUCTURE) : [currentScope.department];
    const deptSource = isSuper() ? transactionsDb : transactionsDb.filter(t => t.createdById === currentUser.id);
    const incomeByDept = depts.map(d => deptSource.filter(t => t.department === d && t.type === 'Income').reduce((s, t) => s + t.amount, 0));
    const expenseByDept = depts.map(d => deptSource.filter(t => t.department === d && t.type === 'Expense').reduce((s, t) => s + t.amount, 0));

    requestAnimationFrame(() => {
        const bankCtx = $('coa-bank-chart');
        if (bankCtx) {
            sizeCanvasExplicitly(bankCtx, 260);
            if (coaBankChart) coaBankChart.destroy();
            coaBankChart = new Chart(bankCtx, {
                type: 'line',
                data: {
                    labels: buckets.map(b => b.label),
                    datasets: [
                        { label: 'Money in', data: inSeries, borderColor: CHART_GREEN, backgroundColor: CHART_GREEN_SOFT, fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: CHART_GREEN, borderWidth: 2.5 },
                        { label: 'Money out', data: outSeries, borderColor: CHART_BLUE, backgroundColor: CHART_BLUE_SOFT, fill: true, tension: 0.3, pointRadius: 3, pointBackgroundColor: CHART_BLUE, borderWidth: 2.5 }
                    ]
                },
                options: {
                    responsive: false, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#eef1ee' }, ticks: { callback: v => formatRF(v) } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        const deptCtx = $('coa-dept-chart');
        if (deptCtx) {
            sizeCanvasExplicitly(deptCtx, 260);
            if (coaDeptChart) coaDeptChart.destroy();
            coaDeptChart = new Chart(deptCtx, {
                type: 'bar',
                data: {
                    labels: depts.map(shortDeptName),
                    datasets: [
                        { label: 'Income', data: incomeByDept, backgroundColor: CHART_GREEN, borderRadius: 8, maxBarThickness: 34 },
                        { label: 'Expense', data: expenseByDept, backgroundColor: CHART_BLUE, borderRadius: 8, maxBarThickness: 34 }
                    ]
                },
                options: {
                    responsive: false, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#eef1ee' }, ticks: { callback: v => formatRF(v) } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }
    });
}

let coaResizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(coaResizeTimer);
    coaResizeTimer = setTimeout(() => {
        if ($('view-coa') && $('view-coa').classList.contains('active')) renderCoaCharts();
    }, 200);
});

// ---------------------------------------------------------------------
// 33. REPORTS
// ---------------------------------------------------------------------
function getReportTransactions() {
    const range = reportRange.preset === 'all' ? { from: '', to: '' } : computePresetRange(reportRange.preset, reportRange.from, reportRange.to);
    return transactionsDb.filter(tx => dateInRange(tx.date, range) || (!range.from && !range.to));
}

function renderReportPanel() {
    const superVisible = isSuper();
    const scopeDesc = superVisible
        ? `Presbytery: [${currentScope.presbytery}] | Department: [${currentScope.department}]`
        : `Presbytery: [${currentUser.presbytery}] | Department: [${currentUser.department}] (locked to your assignment)`;
    $('statement-scope').textContent = `${scopeDesc} · Range: ${rangeLabel(reportRange.preset === 'all' ? { preset: 'all' } : computePresetRange(reportRange.preset, reportRange.from, reportRange.to))}`;
    $('stmt-generated-line').textContent = `Generated ${new Date().toLocaleString()} by ${currentUser.name} (${ROLE_LABELS[currentUser.role]})`;

    const list = getReportTransactions();
    let income = 0, expense = 0, assets = 0, liabilities = 0;
    list.forEach(tx => {
        if (tx.type === 'Income') income += tx.amount;
        if (tx.type === 'Expense') expense += tx.amount;
        if (tx.type === 'Asset') assets += tx.amount;
        if (tx.type === 'Liability') liabilities += tx.amount;
    });
    const netProfit = income - expense;
    const netWorth = assets - liabilities;

    $('stmt-income').textContent = formatRF(income);
    $('stmt-expenses').textContent = formatRF(expense);
    $('stmt-net').textContent = formatRF(netProfit);
    $('stmt-assets').textContent = formatRF(assets);
    $('stmt-liabilities').textContent = formatRF(liabilities);
    $('stmt-equity').textContent = formatRF(netWorth);
    $('stmt-record-count').textContent = `${list.length} record${list.length === 1 ? '' : 's'} in this range`;
}

// ---------------------------------------------------------------------
// 34. PENDING APPROVALS WIDGET (Overview)
// ---------------------------------------------------------------------
function renderPendingApprovals() {
    if (!currentUser) return;
    const wrap = $('pending-approvals-wrap');
    const grid = $('pending-approvals-grid');
    const items = [];

    if (isSuper()) {
        invoicesDb.filter(i => i.status === 'pending_approval').forEach(i => items.push({ type: 'Invoice', label: i.number, sub: i.customerName, amount: i.amount, id: i.id, kind: 'invoice' }));
        billsDb.filter(b => b.status === 'pending_approval').forEach(b => items.push({ type: 'Bill', label: b.number, sub: b.supplierName, amount: b.amount, id: b.id, kind: 'bill' }));
    }
    if (isFinanceOrSuper()) {
        chequesDb.filter(c => c.status === 'pending_approval').forEach(c => items.push({ type: 'Cheque', label: c.number, sub: c.payee, amount: c.amount, id: c.id, kind: 'cheque' }));
    }

    if (items.length === 0) { wrap.classList.add('hidden'); grid.innerHTML = ''; return; }
    wrap.classList.remove('hidden');
    grid.innerHTML = '';
    items.slice(0, 8).forEach(it => {
        const card = document.createElement('div');
        card.className = 'ext-card';
        card.innerHTML = `
            <h4><i class="fa-solid fa-clock"></i> ${it.type} ${escapeHtml(it.label)}</h4>
            <div class="ext-sub">${escapeHtml(it.sub || '')}</div>
            <div class="ext-row"><span>Amount</span><strong>${formatRF(it.amount)}</strong></div>
        `;
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => switchView(it.kind === 'invoice' ? 'invoices' : it.kind === 'bill' ? 'bills' : 'cheques'));
        grid.appendChild(card);
    });
}

/* =======================================================================
   35. QUICKBOOKS-STYLE MODALS — EXPENSE / BANK DEPOSIT / JOURNAL ENTRY
   ======================================================================= */

function setupQbModalsEventListeners() {
    $('close-expense-modal').addEventListener('click', () => $('expense-modal').classList.add('hidden'));
    $('expense-modal').addEventListener('click', (e) => { if (e.target === $('expense-modal')) $('expense-modal').classList.add('hidden'); });
    $('expense-form').addEventListener('submit', onSubmitExpenseForm);
    $('exp-add-line-btn').addEventListener('click', () => { addExpenseLine(); });
    $('exp-clear-lines-btn').addEventListener('click', () => { $('exp-lines-body').innerHTML = ''; addExpenseLine(); addExpenseLine(); updateExpenseTotals(); });
    $('exp-amount-display'); // header amount is display-only, driven by updateExpenseTotals

    $('close-deposit-modal').addEventListener('click', () => $('deposit-modal').classList.add('hidden'));
    $('deposit-modal').addEventListener('click', (e) => { if (e.target === $('deposit-modal')) $('deposit-modal').classList.add('hidden'); });
    $('deposit-form').addEventListener('submit', onSubmitDepositForm);
    $('deposit-add-line-btn').addEventListener('click', () => { addDepositLine(); });
    $('deposit-clear-lines-btn').addEventListener('click', () => { $('deposit-lines-body').innerHTML = ''; addDepositLine(); addDepositLine(); updateDepositTotals(); });

    $('close-journal-modal').addEventListener('click', () => $('journal-modal').classList.add('hidden'));
    $('journal-modal').addEventListener('click', (e) => { if (e.target === $('journal-modal')) $('journal-modal').classList.add('hidden'); });
    $('journal-form').addEventListener('submit', onSubmitJournalForm);
    $('journal-save-new-btn').addEventListener('click', async (e) => { await onSubmitJournalForm(e, true); });
    $('journal-add-line-btn').addEventListener('click', () => { addJournalLine(); });
    $('journal-clear-lines-btn').addEventListener('click', () => { $('journal-lines-body').innerHTML = ''; for (let i = 0; i < 4; i++) addJournalLine(); updateJournalTotals(); });
}

function renumberLines(tbodyId) {
    const tbody = $(tbodyId);
    qsa('tr', tbody).forEach((tr, i) => { const firstTd = tr.querySelector('td'); if (firstTd) firstTd.textContent = i + 1; });
}

/* ---------- EXPENSE MODAL ---------- */
function addExpenseLine() {
    const tbody = $('exp-lines-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${tbody.children.length + 1}</td>
        <td><select class="line-category"></select></td>
        <td><input type="text" class="line-desc" placeholder="Description"></td>
        <td><input type="number" class="line-amount" step="any" min="0" placeholder="0.00"></td>
        <td><select class="line-vat"></select></td>
        <td style="text-align:center;"><input type="checkbox" class="line-billable"></td>
        <td><select class="line-customer"></select></td>
        <td><select class="line-class"></select></td>
        <td><button type="button" class="icon-action-btn danger-hover line-delete-btn" title="Delete"><i class="fa-solid fa-trash"></i></button></td>`;
    fillSimpleSelect(tr.querySelector('.line-category'), projectsDb.map(p => p.name), true, '-- Category (Project) --');
    fillSimpleSelect(tr.querySelector('.line-vat'), VAT_OPTIONS, true, '-- VAT --');
    fillSimpleSelect(tr.querySelector('.line-customer'), customersDb.map(c => c.name), true, '-- Customer/Project --');
    fillOptGroupedSelect(tr.querySelector('.line-class'), getAllSubsectionsFlat(), true);
    tr.querySelector('.line-amount').addEventListener('input', updateExpenseTotals);
    tr.querySelector('.line-delete-btn').addEventListener('click', () => { tr.remove(); renumberLines('exp-lines-body'); updateExpenseTotals(); });
    tbody.appendChild(tr);
}

function updateExpenseHeaderBalance(bank) {
    // no-op placeholder kept for symmetry with deposit; balance already
    // shown inline next to the account combobox via banksDb lookups.
}

function updateExpenseTotals() {
    const rows = qsa('#exp-lines-body tr');
    let total = 0;
    rows.forEach(tr => { const v = parseFloat(tr.querySelector('.line-amount').value); if (!isNaN(v)) total += v; });
    $('exp-subtotal').textContent = formatRF(total);
    $('exp-total').textContent = formatRF(total);
    $('exp-amount-display').textContent = formatRF(total);
}

function openExpenseModal() {
    $('expense-form').reset();
    $('exp-date').value = new Date().toISOString().split('T')[0];
    resetAccountCombobox('exp');
    const payeeInput = $('exp-payee-search'), payeeHidden = $('exp-payee-id');
    if (payeeInput) payeeInput.value = '';
    if (payeeHidden) payeeHidden.value = '';
    const locInput = $('exp-location-search'), locHidden = $('exp-location-id');
    if (locInput) locInput.value = '';
    if (locHidden) locHidden.value = '';
    $('exp-lines-body').innerHTML = '';
    addExpenseLine(); addExpenseLine();
    updateExpenseTotals();
    $('expense-modal').classList.remove('hidden');
}

async function onSubmitExpenseForm(e) {
    e.preventDefault();
    if (!validateAccountCombobox('exp')) { showToast('error', 'Please choose the payment account for this expense.'); return; }
    const acct = readAccountCombobox('exp');

    const lines = [];
    qsa('#exp-lines-body tr').forEach(tr => {
        const category = tr.querySelector('.line-category').value;
        const desc = tr.querySelector('.line-desc').value.trim();
        const amount = parseFloat(tr.querySelector('.line-amount').value) || 0;
        if (!category && !desc && !amount) return;
        lines.push({
            category, description: desc, amount,
            vat: tr.querySelector('.line-vat').value,
            billable: tr.querySelector('.line-billable').checked,
            customerProject: tr.querySelector('.line-customer').value,
            class: tr.querySelector('.line-class').value
        });
    });
    const total = lines.reduce((s, l) => s + l.amount, 0);
    if (!lines.length || total <= 0) { showToast('error', 'Add at least one line with a category and an amount.'); return; }

    const scope = isSuper()
        ? { department: currentScope.department !== 'ALL' ? currentScope.department : (lines[0].class ? Object.keys(EPR_STRUCTURE).find(d => EPR_STRUCTURE[d].includes(lines[0].class)) : 'ALL') || 'ALL', subsection: lines[0].class || 'ALL', presbytery: $('exp-location-id').value || currentScope.presbytery }
        : { department: currentUser.department, subsection: currentUser.subsection, presbytery: currentUser.presbytery };

    const payload = sanitizePayload({
        date: $('exp-date').value || new Date().toISOString().split('T')[0],
        type: 'Expense',
        desc: lines[0].description || 'Expense',
        amount: total,
        payee: $('exp-payee-search').value || '',
        method: $('exp-method').value || '',
        ref: $('exp-ref').value.trim(),
        location: $('exp-location-search').value || '',
        bankId: acct.bankId, bankName: acct.bankName,
        lines: JSON.stringify(lines),
        ...scope
    });

    const btn = $('exp-submit-btn'); btn.disabled = true;
    try {
        await addDoc(collection(db, COLLECTIONS.TRANSACTIONS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() }));
        showToast('success', `Expense of ${formatRF(total)} saved.`);
        $('expense-modal').classList.add('hidden');
    } catch (err) { showToast('error', "Couldn't save expense: " + err.message); }
    finally { btn.disabled = false; }
}

/* ---------- BANK DEPOSIT MODAL ---------- */
function addDepositLine() {
    const tbody = $('deposit-lines-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${tbody.children.length + 1}</td>
        <td><select class="line-received"></select></td>
        <td><select class="line-account"></select></td>
        <td><input type="text" class="line-desc" placeholder="Description"></td>
        <td><select class="line-method"></select></td>
        <td><input type="text" class="line-ref" placeholder="Ref no."></td>
        <td><input type="number" class="line-amount" step="any" min="0" placeholder="0.00"></td>
        <td><select class="line-vat"></select></td>
        <td><select class="line-class"></select></td>
        <td><button type="button" class="icon-action-btn danger-hover line-delete-btn" title="Delete"><i class="fa-solid fa-trash"></i></button></td>`;
    fillSimpleSelect(tr.querySelector('.line-received'), customersDb.map(c => c.name), true, '-- Received from (Customer) --');
    fillSimpleSelect(tr.querySelector('.line-account'), projectsDb.map(p => p.name), true, '-- Account (Project) --');
    fillSimpleSelect(tr.querySelector('.line-method'), PAYMENT_METHODS, true, '-- Method --');
    fillSimpleSelect(tr.querySelector('.line-vat'), VAT_OPTIONS, true, '-- VAT --');
    fillOptGroupedSelect(tr.querySelector('.line-class'), getAllSubsectionsFlat(), true);
    tr.querySelector('.line-amount').addEventListener('input', updateDepositTotals);
    tr.querySelector('.line-delete-btn').addEventListener('click', () => { tr.remove(); renumberLines('deposit-lines-body'); updateDepositTotals(); });
    tbody.appendChild(tr);
}

function updateDepositHeaderBalance(bank) { /* balance already shown next to combobox via banksDb */ }

function updateDepositTotals() {
    const rows = qsa('#deposit-lines-body tr');
    let total = 0;
    rows.forEach(tr => { const v = parseFloat(tr.querySelector('.line-amount').value); if (!isNaN(v)) total += v; });
    $('deposit-funds-total').textContent = formatRF(total);
    $('deposit-amount-display').textContent = formatRF(total);
}

function openDepositModal() {
    $('deposit-form').reset();
    $('deposit-date').value = new Date().toISOString().split('T')[0];
    resetAccountCombobox('deposit');
    $('deposit-lines-body').innerHTML = '';
    addDepositLine(); addDepositLine();
    updateDepositTotals();
    $('deposit-modal').classList.remove('hidden');
}

async function onSubmitDepositForm(e) {
    e.preventDefault();
    if (!validateAccountCombobox('deposit')) { showToast('error', 'Please choose which account this deposit goes into.'); return; }
    const acct = readAccountCombobox('deposit');

    const lines = [];
    qsa('#deposit-lines-body tr').forEach(tr => {
        const receivedFrom = tr.querySelector('.line-received').value;
        const account = tr.querySelector('.line-account').value;
        const desc = tr.querySelector('.line-desc').value.trim();
        const amount = parseFloat(tr.querySelector('.line-amount').value) || 0;
        if (!receivedFrom && !account && !desc && !amount) return;
        lines.push({
            receivedFrom, account, description: desc,
            method: tr.querySelector('.line-method').value,
            ref: tr.querySelector('.line-ref').value.trim(),
            amount, vat: tr.querySelector('.line-vat').value,
            class: tr.querySelector('.line-class').value
        });
    });
    const total = lines.reduce((s, l) => s + l.amount, 0);
    if (!lines.length || total <= 0) { showToast('error', 'Add at least one funds line with an amount.'); return; }

    const scope = isSuper()
        ? { department: currentScope.department !== 'ALL' ? currentScope.department : 'ALL', subsection: lines[0].class || 'ALL', presbytery: currentScope.presbytery }
        : { department: currentUser.department, subsection: currentUser.subsection, presbytery: currentUser.presbytery };

    const payload = sanitizePayload({
        date: $('deposit-date').value || new Date().toISOString().split('T')[0],
        type: 'Income',
        desc: lines[0].description || `Deposit from ${lines[0].receivedFrom || 'various'}`,
        amount: total,
        bankId: acct.bankId, bankName: acct.bankName,
        lines: JSON.stringify(lines),
        ...scope
    });

    const btn = $('deposit-submit-btn'); btn.disabled = true;
    try {
        await addDoc(collection(db, COLLECTIONS.TRANSACTIONS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() }));
        showToast('success', `Deposit of ${formatRF(total)} saved.`);
        $('deposit-modal').classList.add('hidden');
    } catch (err) { showToast('error', "Couldn't save deposit: " + err.message); }
    finally { btn.disabled = false; }
}

/* ---------- JOURNAL ENTRY MODAL ---------- */
function getJournalAccountOptions() {
    const list = ['Accounts Receivable (A/R)', 'Accounts Payable (A/P)'];
    banksDb.forEach(b => list.push(`${b.name} — ${b.account}`));
    projectsDb.forEach(p => list.push(`${p.name} (Project)`));
    return list;
}

function addJournalLine() {
    const tbody = $('journal-lines-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${tbody.children.length + 1}</td>
        <td><select class="line-account"></select></td>
        <td><input type="number" class="line-debit" step="any" min="0" placeholder="0.00"></td>
        <td><input type="number" class="line-credit" step="any" min="0" placeholder="0.00"></td>
        <td><input type="text" class="line-desc" placeholder="Description"></td>
        <td><select class="line-name"></select></td>
        <td><select class="line-vat"></select></td>
        <td><select class="line-location"></select></td>
        <td><select class="line-class"></select></td>
        <td><button type="button" class="icon-action-btn danger-hover line-delete-btn" title="Delete"><i class="fa-solid fa-trash"></i></button></td>`;
    fillSimpleSelect(tr.querySelector('.line-account'), getJournalAccountOptions(), true, '-- Account --');
    fillSimpleSelect(tr.querySelector('.line-name'), [...new Set([...customersDb.map(c => c.name), ...suppliersDb.map(s => s.name)])], true, '-- Name --');
    fillSimpleSelect(tr.querySelector('.line-vat'), VAT_OPTIONS, true, '-- VAT --');
    fillSimpleSelect(tr.querySelector('.line-location'), PRESBYTERIES, true, '-- Location --');
    fillOptGroupedSelect(tr.querySelector('.line-class'), getAllSubsectionsFlat(), true);
    const debitInput = tr.querySelector('.line-debit'), creditInput = tr.querySelector('.line-credit');
    debitInput.addEventListener('input', () => { if (parseFloat(debitInput.value) > 0) creditInput.value = ''; updateJournalTotals(); });
    creditInput.addEventListener('input', () => { if (parseFloat(creditInput.value) > 0) debitInput.value = ''; updateJournalTotals(); });
    tr.querySelector('.line-delete-btn').addEventListener('click', () => { tr.remove(); renumberLines('journal-lines-body'); updateJournalTotals(); });
    tbody.appendChild(tr);
}

function updateJournalTotals() {
    let debit = 0, credit = 0;
    qsa('#journal-lines-body tr').forEach(tr => {
        debit += parseFloat(tr.querySelector('.line-debit').value) || 0;
        credit += parseFloat(tr.querySelector('.line-credit').value) || 0;
    });
    $('journal-total-debit').textContent = formatRF(debit);
    $('journal-total-credit').textContent = formatRF(credit);
}

async function openJournalModal() {
    $('journal-form').reset();
    $('journal-date').value = new Date().toISOString().split('T')[0];
    $('journal-lines-body').innerHTML = '';
    for (let i = 0; i < 4; i++) addJournalLine();
    updateJournalTotals();
    try {
        const snap = await getDocs(collection(db, COLLECTIONS.JOURNAL_ENTRIES));
        $('journal-no').value = String(snap.size + 1);
    } catch (err) { $('journal-no').value = ''; }
    $('journal-modal').classList.remove('hidden');
}

async function onSubmitJournalForm(e, keepOpen) {
    e.preventDefault();
    const lines = [];
    qsa('#journal-lines-body tr').forEach(tr => {
        const account = tr.querySelector('.line-account').value;
        const debit = parseFloat(tr.querySelector('.line-debit').value) || 0;
        const credit = parseFloat(tr.querySelector('.line-credit').value) || 0;
        const desc = tr.querySelector('.line-desc').value.trim();
        if (!account && !debit && !credit && !desc) return;
        lines.push({
            account, debit, credit, description: desc,
            name: tr.querySelector('.line-name').value,
            vat: tr.querySelector('.line-vat').value,
            location: tr.querySelector('.line-location').value,
            class: tr.querySelector('.line-class').value
        });
    });
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (!lines.length || totalDebit <= 0) { showToast('error', 'Add at least two lines with debit/credit amounts.'); return; }
    if (Math.abs(totalDebit - totalCredit) > 0.01) { showToast('error', `Debits (${formatRF(totalDebit)}) must equal Credits (${formatRF(totalCredit)}) before saving.`); return; }

    const payload = sanitizePayload({
        date: $('journal-date').value || new Date().toISOString().split('T')[0],
        journalNo: $('journal-no').value.trim(),
        lines: JSON.stringify(lines),
        totalDebit, totalCredit,
        department: isSuper() ? currentScope.department : currentUser.department,
        presbytery: isSuper() ? currentScope.presbytery : currentUser.presbytery
    });

    const btn = keepOpen ? $('journal-save-new-btn') : $('journal-submit-btn');
    if (btn) btn.disabled = true;
    try {
        await addDoc(collection(db, COLLECTIONS.JOURNAL_ENTRIES), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() }));
        showToast('success', `Journal entry #${payload.journalNo || ''} saved — balanced at ${formatRF(totalDebit)}.`);
        if (keepOpen) { await openJournalModal(); }
        else { $('journal-modal').classList.add('hidden'); }
    } catch (err) { showToast('error', "Couldn't save journal entry: " + err.message); }
    finally { if (btn) btn.disabled = false; }
}
