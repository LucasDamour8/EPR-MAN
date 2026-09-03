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

const DEPT_CHART_COLORS = ["#111827", "#2563eb", "#6b7280", "#93c5fd", "#374151", "#1d4ed8"];

const PRESBYTERIES = [
    "EPR Presbytery Zinga", "EPR Presbytery Kigali", "EPR Presbytery Remera",
    "EPR Presbytery Gitarama", "EPR Presbytery Rubengera", "EPR Presbytery Kirinda", "EPR Presbytery Gisenyi"
];

const ROLE_LABELS = {
    superadmin: "Superadmin", manager: "Manager", finance: "Finance User",
    accountant: "Accountant", general_accountant: "Senior Accountant",
    cashier: "Cashier", moderator: "Moderator"
};
const STATUS_LABELS = { pending_approval: "Pending Approval", approved: "Approved", rejected: "Rejected" };

const ACCOUNT_LINKED_PREFIXES = ['tx', 'invoice', 'bill', 'exp', 'deposit'];

const VAT_OPTIONS = [
    "Exempted (0%)", "VAT (18%)", "Zero-rated (0%)"
];

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Mobile Money", "Cheque", "Card"];

// ---------------------------------------------------------------------
// Chart of Accounts — account type / detail type structure (QuickBooks
// style). Used by the "New account" page for the Chart of Accounts view.
// NOTE: the Expense/Deposit line-item picker below intentionally uses
// BANK ACCOUNTS, not this Chart of Accounts list — see setupLineBankCombobox.
// ---------------------------------------------------------------------
const CURRENCY_OPTIONS = [
    "RWF Rwanda Franc", "EUR Euro", "GBP British Pound Sterling", "USD United States Dollar",
    "AED UAE Dirham", "AFN Afghan Afghani", "ALL Albanian Lek", "AMD Armenian Dram",
    "KES Kenyan Shilling", "UGX Ugandan Shilling", "TZS Tanzanian Shilling", "BIF Burundian Franc"
];

const ACCOUNT_TYPE_STRUCTURE = {
    "Cash and cash equivalents": ["Bank", "Cash and cash equivalents", "Cash on hand", "Client trust account", "Mobile Money", "Money Market", "Rents Held in Trust", "Savings"],
    "Accounts receivable (A/R)": ["Accounts receivable (A/R)"],
    "Current assets": ["Allowance for bad debts", "Development costs", "Employee cash advances", "Inventory", "Investment - other", "Loans to officers", "Loans to others", "Other current assets", "Prepaid expenses", "Retainage", "Undeposited funds"],
    "Fixed assets": ["Accumulated depreciation", "Buildings", "Computer equipment", "Furniture and fixtures", "Land", "Leasehold improvements", "Machinery and equipment", "Vehicles", "Other fixed assets"],
    "Non-current assets": ["Accumulated amortisation", "Goodwill", "Intangible assets", "Long-term investments", "Other non-current assets", "Security deposits"],
    "Credit card": ["Credit card"],
    "Accounts payable (A/P)": ["Accounts payable (A/P)"],
    "Current liabilities": ["Accrued liabilities", "Current tax liability", "Current portion of long-term debt", "Payroll clearing", "Payroll liabilities", "Other current liabilities"],
    "Non-current liabilities": ["Accrued holiday payable", "Accrued non-current liabilities", "Liabilities related to assets held for sale", "Long-term debt", "Notes Payable", "Other non-current liabilities", "Shareholder Notes Payable"],
    "Owner's equity": ["Owner's equity", "Owner's pay and personal expenses", "Partner contributions", "Partner distributions", "Retained earnings", "Share capital", "Treasury shares"],
    "Income": ["Discounts/Refunds Given", "Non-Profit Income", "Other Primary Income", "Revenue - General", "Sales - retail", "Sales - wholesale", "Sales of Product Income", "Service/Fee Income"],
    "Other income": ["Dividend income", "Interest earned", "Loss on disposal of assets", "Other Investment Income", "Other Miscellaneous Income", "Other operating income", "Tax-Exempt Interest", "Unrealised loss on securities, net of tax"],
    "Cost of sales": ["Cost of labour - COS", "Equipment rental - COS", "Freight and delivery - COS", "Other costs of sales - COS", "Supplies and materials - COS"],
    "Expenses": ["Advertising/Promotional", "Amortisation expense", "Auto", "Bad debts", "Bank charges", "Charitable Contributions", "Commissions and fees", "Cost of Labour", "Depreciation", "Dues and subscriptions", "Entertainment", "Insurance", "Interest paid", "Legal and professional fees", "Meals", "Office expenses", "Payroll expenses", "Rent or lease", "Repairs and maintenance", "Taxes paid", "Travel", "Utilities"],
    "Other expense": ["Other miscellaneous expense", "Penalties and settlements", "Exchange gain or loss", "Unrealised loss on securities"]
};

let usersDb = [];
let transactionsDb = [];
let invoicesDb = [];
let billsDb = [];
let suppliersDb = [];
let customersDb = [];
let projectsDb = [];
let budgetsDb = [];
let banksDb = [];
let journalEntriesDb = [];
let accountsDb = [];

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
let reportDeptChart = null;
let reportPieChart = null;
let customReportChart = null;

let reportRange = { preset: 'all', from: '', to: '' };
let coaRange = { preset: 'all', from: '', to: '' };

let unsubTx = null, unsubUsers = null, unsubOwnProfile = null;
let unsubInvoices = null, unsubBills = null;
let unsubSuppliers = null, unsubCustomers = null, unsubProjects = null;
let unsubBudgets = null, unsubBanks = null, unsubAccounts = null;
let banksLoaded = false, accountsLoaded = false, accountLinkSyncRunning = false;

// "+ Add new" from a Chart-of-Accounts line picker (still used elsewhere)
// remembers which row/callback to return the newly created account to.
let pendingAccountTarget = null;
// "+ Add new" from a Bank-Account line picker (Expense/Deposit lines)
// remembers which row/callback to return the newly created bank to.
let pendingBankTarget = null;
let pendingCustomerTarget = null;

const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// =======================================================================
// PAGE-MODAL NAVIGATION
// Every data-entry form (Expense, Deposit, Journal, Transaction, Invoice,
// Bill, Supplier, Customer, Project, Budget, Bank, Chart-of-Accounts) opens
// as a full covering page (class "page-modal" in CSS) instead of a small
// centred popup. openModal()/closeModal() are the single choke point used
// everywhere in this file to show/hide those pages, so that:
//   - each newly opened page renders above any page already open (z-index
//     bump) — this matters when the "+ Add new" bank shortcut opens the
//     Bank page on top of the Expense page it was launched from;
//   - opening a page pushes browser history so the device/browser Back
//     gesture closes the topmost open page instead of leaving the app;
//   - the confirm dialog (#confirm-modal) is NOT a page — it stays a small
//     popup and is untouched by this mechanism.
// =======================================================================
const PAGE_MODAL_IDS = [
    'tx-modal', 'invoice-modal', 'bill-modal', 'supplier-modal', 'customer-modal',
    'project-modal', 'budget-modal', 'bank-modal', 'account-modal',
    'expense-modal', 'deposit-modal', 'journal-modal'
];
let modalZCounter = 100;

function openModal(id) {
    const el = $(id);
    if (!el) return;
    modalZCounter += 1;
    el.style.zIndex = String(modalZCounter);
    el.classList.remove('hidden');
    if (el.classList.contains('page-modal')) {
        try { history.pushState({ pageModal: id }, '', '#' + id); } catch (e) { /* ignore */ }
    }
}
function closeModal(id) {
    const el = $(id);
    if (!el) return;
    el.classList.add('hidden');
    el.style.zIndex = '';
}
function closeAllExtModals() {
    ['invoice-modal', 'bill-modal', 'supplier-modal', 'customer-modal', 'project-modal', 'budget-modal',
     'bank-modal', 'expense-modal', 'deposit-modal', 'journal-modal', 'account-modal']
        .forEach(id => closeModal(id));
}
// Turns each page-modal's "×" close button into a proper "← Back" pill,
// matching the .page-back-btn styling already defined in styles.css.
function enhancePageModalsAsPages() {
    PAGE_MODAL_IDS.forEach(id => {
        const modal = $(id);
        if (!modal) return;
        if (modal.classList.contains('drawer-modal')) return;
        const btn = modal.querySelector('.close-btn');
        if (btn && !btn.classList.contains('page-back-btn')) {
            btn.classList.add('page-back-btn');
            btn.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Back';
        }
    });
}
// Browser/device Back closes only the most recently opened page, not all of them.
window.addEventListener('popstate', () => {
    const openPages = PAGE_MODAL_IDS.map(id => $(id)).filter(el => el && !el.classList.contains('hidden'));
    if (!openPages.length) return;
    openPages.sort((a, b) => (parseInt(b.style.zIndex) || 0) - (parseInt(a.style.zIndex) || 0));
    openPages[0].classList.add('hidden');
    openPages[0].style.zIndex = '';
});

document.addEventListener('DOMContentLoaded', async () => {
    buildStaticSelectOptions();
    setupEventListeners();
    populateSubsections('user-dept', 'user-subsection');
    ACCOUNT_LINKED_PREFIXES.forEach(setupAccountCombobox);
    setupStaticListCombobox('exp-location', () => PRESBYTERIES);
    setupStaticListCombobox('exp-payee', () => [...new Set([...suppliersDb.map(s => s.name), ...customersDb.map(c => c.name)])]);
    setupRangeBar('report-range-bar', (r) => {
        reportRange = r;
        renderReportPanel();
        if (!$('custom-report-results').classList.contains('hidden')) renderCustomReport();
    });
    setupRangeBar('coa-range-bar', (r) => { coaRange = r; renderCoaCharts(); });
    populateUserProjectsChecklist();
    setupAccountModal();
    setupCustomReports();
    enhancePageModalsAsPages();
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

function getAllProjectKeys() {
    return getAllSubsectionsFlat().map(({ dept, sub }) => `${dept}::${sub}`);
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
    $('privacy-link-btn').addEventListener('click', () => showToast('info', 'Only people with matching department/presbytery access can see this scope\'s records. Chart of Accounts is further limited to accounts you\'ve personally posted against, unless you\'re a Superadmin or have full EPR Location access.'));

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
        $('user-full-access-group').classList.toggle('hidden', isSuperRole);
        $('user-scope-fields').classList.toggle('hidden', isSuperRole || $('user-full-access').checked);
        qsa('#user-scope-fields select').forEach(sel => sel.required = !isSuperRole && !$('user-full-access').checked);
    });
    $('user-full-access').addEventListener('change', onUserFullAccessChange);
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

    qsa('#printable-report .statement-row.clickable').forEach(row => {
        row.addEventListener('click', () => {
            openFinancialStatementDetail(row.dataset.jump);
        });
    });

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
            if (btn.dataset.modal) closeModal(btn.dataset.modal);
        });
    });
}

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
// Searchable header-level Bank/Cash account combobox — used by Transaction,
// Invoice, Bill, Expense (Payment account) and Deposit (Account) headers.
// ---------------------------------------------------------------------
function getSelectableActionAccounts() {
    const result = [];
    const seen = new Set();

    accountsDb.forEach(account => {
        const linkedBank = account.linkedBankId ? banksDb.find(bank => bank.id === account.linkedBankId) : null;
        const id = linkedBank?.id || account.id;
        if (!id || seen.has(id)) return;
        seen.add(id);
        result.push({
            ...(linkedBank || {}),
            id,
            name: account.name || linkedBank?.name || 'Unnamed account',
            accountType: account.type || linkedBank?.accountType || 'Account',
            detailType: account.detailType || linkedBank?.detailType || 'General',
            source: linkedBank ? 'bank' : 'account',
            storedBalance: Number(account.balance || account.openingBalance || 0)
        });
    });

    banksDb.forEach(bank => {
        if (!bank.id || seen.has(bank.id)) return;
        seen.add(bank.id);
        result.push({ ...bank, source: 'bank' });
    });

    return result.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function findSelectableActionAccount(id) {
    return getSelectableActionAccounts().find(account => account.id === id) || null;
}

function getActionAccountBalance(account) {
    if (!account) return 0;
    const bank = banksDb.find(item => item.id === account.id);
    return bank ? computeBankBalance(bank) : Number(account.storedBalance || account.balance || account.openingBalance || 0);
}

function setupAccountCombobox(prefix) {
    const input = $(`${prefix}-bank-search`);
    const hidden = $(`${prefix}-bank-id`);
    const dropdown = $(`${prefix}-bank-dropdown`);
    if (!input || !hidden || !dropdown) return;

    let debounceTimer = null;

    function renderList(term) {
        const t = (term || '').toLowerCase().trim();
        dropdown.innerHTML = '';

        const addRow = document.createElement('div');
        addRow.className = 'acct-dropdown-item acct-add-new';
        addRow.innerHTML = '<div class="adi-main"><span class="adi-name"><i class="fa-solid fa-plus"></i> Add new account</span><span class="adi-acct">Create an account without leaving this action</span></div>';
        addRow.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dropdown.classList.add('hidden');
            openBankModal(null, { onCreated: bank => {
                hidden.value = bank.id;
                input.value = formatHeaderBankLabel(bank);
                input.classList.add('default-account-selected');
                if (prefix === 'exp') updateExpenseHeaderBalance(bank);
                if (prefix === 'deposit') updateDepositHeaderBalance(bank);
            }});
        });
        dropdown.appendChild(addRow);

        const availableAccounts = getSelectableActionAccounts();
        if (availableAccounts.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'acct-empty';
            empty.textContent = 'No accounts exist yet. Use “Add new account” above.';
            dropdown.appendChild(empty);
            dropdown.classList.remove('hidden');
            return;
        }

        const matches = availableAccounts.filter(b =>
            !t ||
            (b.name || '').toLowerCase().includes(t) ||
            (b.accountType || '').toLowerCase().includes(t) ||
            (b.detailType || '').toLowerCase().includes(t) ||
            (b.branch || '').toLowerCase().includes(t)
        ).slice(0, 40);

        if (matches.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'acct-empty';
            empty.textContent = `No accounts match “${term}”. You can add a new account above.`;
            dropdown.appendChild(empty);
        } else {
            matches.forEach(b => {
                const row = document.createElement('div');
                row.className = 'acct-dropdown-item';
                row.innerHTML = `
                    <div class="adi-main"><span class="adi-name">${escapeHtml(b.name)}</span><span class="adi-meta"><span class="account-meta-chip">${escapeHtml(b.accountType || 'Account')}</span><span class="account-meta-chip detail">${escapeHtml(b.detailType || 'General')}</span></span></div>`;
                row.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    hidden.value = b.id;
                    input.value = formatHeaderBankLabel(b);
                    input.classList.add('default-account-selected');
                    input.classList.remove('invalid');
                    dropdown.classList.add('hidden');
                    if (prefix === 'exp') updateExpenseHeaderBalance(b);
                    if (prefix === 'deposit') updateDepositHeaderBalance(b);
                });
                dropdown.appendChild(row);
            });
        }
        dropdown.classList.remove('hidden');
    }

    input.addEventListener('focus', () => renderList(''));
    input.addEventListener('input', () => {
        hidden.value = '';
        input.classList.remove('default-account-selected');
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
    const bank = findSelectableActionAccount(bankId);
    hidden.value = bankId || '';
    input.value = bank ? formatHeaderBankLabel(bank) : '';
    input.classList.toggle('default-account-selected', !!bank);
}

function resetAccountCombobox(prefix) {
    const input = $(`${prefix}-bank-search`);
    const hidden = $(`${prefix}-bank-id`);
    if (input) input.value = '';
    if (input) input.classList.remove('default-account-selected');
    if (hidden) hidden.value = '';
}

function readAccountCombobox(prefix) {
    const hidden = $(`${prefix}-bank-id`);
    const id = hidden ? hidden.value : '';
    const bank = findSelectableActionAccount(id);
    return { bankId: id || '', bankName: bank ? bank.name : '' };
}

function validateAccountCombobox(prefix) {
    const hidden = $(`${prefix}-bank-id`);
    const input = $(`${prefix}-bank-search`);
    const ok = !!(hidden && hidden.value);
    if (!ok && input) input.classList.add('invalid');
    return ok;
}

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
                    { icon: 'fa-truck-field', label: 'New Supplier', action: () => { switchView('suppliers'); openSupplierModal(); } },
                    { icon: 'fa-address-book', label: 'New Customer', action: () => { switchView('customers'); openCustomerModal(); } },
                    { icon: 'fa-diagram-project', label: 'New Project', action: () => { switchView('projects'); openProjectModal(); } }
                ] },
                { title: 'Bank & Accounts', items: [
                    { icon: 'fa-building-columns', label: 'New Bank', action: () => openBankModal() },
                    { icon: 'fa-list', label: 'New Chart of Accounts entry', action: () => openAccountModal() }
                ] },
                ...(superAdmin ? [{ title: 'Admin', items: [
                    { icon: 'fa-scale-balanced', label: 'New Budget Line', action: () => { switchView('budget'); openBudgetModal(); } }
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
                    { icon: 'fa-truck-field', label: 'Suppliers', action: () => switchView('suppliers') }
                ] },
                { title: 'Operations', items: [
                    { icon: 'fa-diagram-project', label: 'Projects', action: () => switchView('projects') },
                    { icon: 'fa-sitemap', label: 'Departments & Presbyteries', action: () => switchView('departments') },
                    { icon: 'fa-chart-line', label: 'Chart of Accounts', action: () => switchView('coa') }
                ] },
                { title: 'Bank & Accounts', items: [
                    { icon: 'fa-building-columns', label: 'Bank Management', action: () => switchView('banks') }
                ] },
                ...(superAdmin ? [{ title: 'Admin tools', items: [
                    { icon: 'fa-scale-balanced', label: 'Budget Management', action: () => switchView('budget') },
                    { icon: 'fa-users-gear', label: 'User Admin', action: () => switchView('users') }
                ] }] : []),
                { items: [{ icon: 'fa-grip', label: 'Open full module list', action: () => openAppsPanel() }] }
            ];
        case 'accounting':
            return [{ title: 'Accounting Field', items: [
                { icon: 'fa-list-check', label: 'Transactions', action: () => switchView('transactions') },
                { icon: 'fa-scale-balanced', label: 'New Journal Entry', action: () => openJournalModal() },
                { icon: 'fa-chart-line', label: 'Chart of Accounts', action: () => switchView('coa') },
                { icon: 'fa-building-columns', label: 'Bank Management', action: () => switchView('banks') },
                ...(superAdmin ? [
                    { icon: 'fa-scale-balanced', label: 'Budget Management', action: () => switchView('budget') }
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
        const payload = { name, email, role: 'superadmin', presbytery: 'ALL', department: 'ALL', subsection: 'ALL', assignedProjects: [], fullAccess: true, createdAt: serverTimestamp() };
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
    [unsubTx, unsubUsers, unsubOwnProfile, unsubInvoices, unsubBills,
     unsubSuppliers, unsubCustomers, unsubProjects, unsubBudgets, unsubBanks, unsubAccounts]
        .forEach(u => { if (u) u(); });
    unsubTx = unsubUsers = unsubOwnProfile = null;
    unsubInvoices = unsubBills = null;
    unsubSuppliers = unsubCustomers = unsubProjects = null;
    unsubBudgets = unsubBanks = unsubAccounts = null;

    signOut(auth).catch(() => {});
    currentUser = null;
    usersDb = []; transactionsDb = [];
    invoicesDb = []; billsDb = [];
    suppliersDb = []; customersDb = []; projectsDb = [];
    budgetsDb = []; banksDb = []; journalEntriesDb = []; accountsDb = [];
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

function initAppSession() {
    $('app-container').classList.remove('hidden');
    const isSuperUser = currentUser.role === 'superadmin';
    const hasFullAccess = isSuperUser || currentUser.fullAccess === true;

    $('superadmin-filter-bar').classList.toggle('hidden', !hasFullAccess);
    $('admin-filter-section').classList.toggle('hidden', !isSuperUser);
    $('my-assignment-card').classList.toggle('hidden', hasFullAccess);
    $('apps-admin-only').classList.toggle('hidden', !isSuperUser);

    if (hasFullAccess) {
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
    switchView('overview');

    subscribeTransactions();
    subscribeInvoices();
    subscribeBills();
    subscribeSuppliers();
    subscribeCustomers();
    subscribeProjects();
    subscribeBanks();
    subscribeAccounts();
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
    const hasFullAccess = isSuper() || currentUser.fullAccess === true;
    $('user-display-name').textContent = currentUser.name;
    $('avatar-initials').textContent = initials(currentUser.name);
    $('pd-name').textContent = currentUser.name;
    $('pd-email').textContent = currentUser.email;
    $('pd-role-badge').textContent = ROLE_LABELS[currentUser.role] || currentUser.role;
    $('pd-role-badge').className = `badge role-${currentUser.role}`;
    $('pd-presbytery').textContent = (hasFullAccess || currentUser.presbytery === 'ALL') ? 'All presbyteries' : currentUser.presbytery;
    $('pd-department').textContent = (hasFullAccess || currentUser.department === 'ALL') ? 'All departments' : currentUser.department;
    $('pd-subsection').textContent = (currentUser.assignedProjects && currentUser.assignedProjects.length)
        ? currentUser.assignedProjects.map(p => p.split('::')[1]).join(', ')
        : (currentUser.subsection === 'ALL' ? 'All sections' : currentUser.subsection);
    $('user-scope-line').textContent = currentUser.role === 'superadmin'
        ? 'Full system access'
        : (hasFullAccess ? 'Full EPR Location access' : `${shortDeptName(currentUser.department)} · ${(currentUser.presbytery || '').replace('EPR Presbytery ', '')}`);
}

function initials(name) { return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join(''); }
function isSuper() { return currentUser && currentUser.role === 'superadmin'; }
function hasFullScope() { return currentUser && (currentUser.role === 'superadmin' || currentUser.fullAccess === true); }
function isFinanceOrSuper() { return currentUser && (currentUser.role === 'superadmin' || currentUser.role === 'finance' || currentUser.role === 'accountant' || currentUser.role === 'general_accountant' || currentUser.role === 'cashier'); }
function isOwnRecord(rec) { return currentUser && rec && rec.createdById === currentUser.id; }

function setSyncStatus(state) {
    const el = $('sync-indicator');
    if (!el) return;
    el.className = `sync-indicator sync-${state}`;
    el.title = state === 'live' ? 'Live — synced with Firestore' : state === 'syncing' ? 'Syncing…' : 'Sync error';
}

function buildScopedQuery(collectionName) {
    const col = collection(db, collectionName);
    const clauses = [];
    if (!hasFullScope()) {
        clauses.push(where('department', '==', currentUser.department));
        clauses.push(where('presbytery', '==', currentUser.presbytery));
    } else if (currentScope.department !== 'ALL' || currentScope.presbytery !== 'ALL') {
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
        const scopeChanged = data.department !== currentUser.department || data.presbytery !== currentUser.presbytery || data.fullAccess !== currentUser.fullAccess;
        currentUser = { id: snap.id, ...data };
        const hasFullAccess = hasFullScope();
        $('superadmin-filter-bar').classList.toggle('hidden', !hasFullAccess);
        $('my-assignment-card').classList.toggle('hidden', hasFullAccess);
        updateProfileUI();
        $('ab-department').textContent = shortDeptName(currentUser.department);
        $('ab-presbytery').textContent = currentUser.presbytery;
        $('ab-subsection').textContent = (currentUser.assignedProjects && currentUser.assignedProjects.length)
            ? currentUser.assignedProjects.map(p => p.split('::')[1]).join(', ')
            : currentUser.subsection;
        if (scopeChanged) {
            currentScope = hasFullAccess ? { presbytery: 'ALL', department: 'ALL' } : { presbytery: currentUser.presbytery, department: currentUser.department };
            onScopeChanged();
            showToast('info', 'Your access/assignment was updated.');
        }
    }, (err) => showToast('error', 'Profile sync error: ' + err.message));
}

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
    const superVisible = hasFullScope();

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
    if (hasFullScope()) {
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

function openTxModal(editTx) {
    const superVisible = hasFullScope();
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
    openModal('tx-modal');
}
function closeTxModal() { closeModal('tx-modal'); }

async function onSubmitTxForm(e) {
    e.preventDefault();
    const editId = $('tx-edit-id').value;
    const superVisible = hasFullScope();

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
        bankId: acct.bankId, bankName: acct.bankName,
        ref: editId ? (transactionsDb.find(t => t.id === editId)?.ref || nextSequentialReference('TXN')) : nextSequentialReference('TXN'),
        entryForm: editId ? (transactionsDb.find(t => t.id === editId)?.entryForm || 'transaction') : 'transaction'
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
        markReferenceUsed(payload.ref);
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
        if (tx?.entryForm === 'expense') openExpenseModal(tx);
        else if (tx?.entryForm === 'deposit') openDepositModal(tx);
        else if (tx) openTxModal(tx);
    } else if (delBtn) {
        const tx = transactionsDb.find(t => String(t.id) === String(delBtn.dataset.id));
        if (!tx) return;
        openConfirmModal(`Delete the transaction "${tx.desc}" (${formatRF(tx.amount)})? This cannot be undone.`, async () => {
            try { await deleteDoc(doc(db, COLLECTIONS.TRANSACTIONS, tx.id)); showToast('success', 'Transaction deleted.'); }
            catch (err) { showToast('error', "Couldn't delete: " + err.message); }
        });
    }
}

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

function onUserFullAccessChange() {
    const full = $('user-full-access').checked;
    $('user-scope-fields').classList.toggle('hidden', full);
    $('user-mode-group').classList.toggle('hidden', full);
    qsa('#user-scope-fields select').forEach(sel => sel.required = !full);
    if (full) populateUserProjectsChecklist(getAllProjectKeys());
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
    const fullAccess = !roleSuper && $('user-full-access').checked;
    const modeEl = document.querySelector('input[name="user-assign-mode"]:checked');
    const mode = modeEl ? modeEl.value : 'presbytery';

    const name = $('user-name').value.trim();
    const email = $('user-email').value.trim().toLowerCase();
    const password = $('user-password').value;
    const assignedProjects = (roleSuper || fullAccess) ? getAllProjectKeys() : getCheckedProjectKeys();

    const profileFields = sanitizePayload({
        name, email, role,
        presbytery: (roleSuper || fullAccess) ? 'ALL' : (mode === 'presbytery' ? $('user-pres').value : 'ALL'),
        department: (roleSuper || fullAccess) ? 'ALL' : (mode === 'department' ? $('user-dept').value : 'ALL'),
        subsection: (roleSuper || fullAccess) ? 'ALL' : (assignedProjects[0] ? assignedProjects[0].split('::')[1] : ''),
        assignMode: (roleSuper || fullAccess) ? '' : mode
    });
    profileFields.assignedProjects = assignedProjects;
    profileFields.fullAccess = fullAccess;

    if (!name || !email) { showToast('error', 'Fill in a name and a valid email.'); return; }
    if (!editId && password.length < 6) { showToast('error', 'Set a password of at least 6 characters for this new user.'); return; }
    if (!roleSuper && !fullAccess) {
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
                await setDoc(doc(db, COLLECTIONS.USERS, cred.user.uid), sanitizePayload({ ...profileFields, assignedProjects, fullAccess, createdBy: currentUser.email, createdById: currentUser.id, createdByName: currentUser.name, createdAt: serverTimestamp() }));
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
    $('user-full-access').checked = false;
    $('user-full-access-group').classList.remove('hidden');
    $('user-scope-fields').classList.remove('hidden');
    $('user-mode-group').classList.remove('hidden');
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
        $('user-full-access-group').classList.toggle('hidden', roleSuper);
        $('user-full-access').checked = !!u.fullAccess;
        $('user-scope-fields').classList.toggle('hidden', roleSuper || !!u.fullAccess);
        $('user-mode-group').classList.toggle('hidden', roleSuper || !!u.fullAccess);
        if (!roleSuper && !u.fullAccess) {
            const mode = u.assignMode || (u.department === 'ALL' ? 'presbytery' : 'department');
            const radio = document.querySelector(`input[name="user-assign-mode"][value="${mode}"]`);
            if (radio) radio.checked = true;
            const presField = $('user-pres-field'), deptField = $('user-dept-field');
            if (presField) presField.classList.toggle('hidden', mode !== 'presbytery');
            if (deptField) deptField.classList.toggle('hidden', mode !== 'department');
            if (mode === 'presbytery') $('user-pres').value = u.presbytery;
            else $('user-dept').value = u.department;
            populateUserProjectsChecklist(u.assignedProjects || []);
        } else if (!roleSuper) {
            populateUserProjectsChecklist(getAllProjectKeys());
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

function refreshAllViews() {
    const list = getFilteredTransactions();
    const superVisible = hasFullScope();

    const scopeDesc = superVisible
        ? `Presbytery: [${currentScope.presbytery}] | Department: [${currentScope.department}]`
        : `Presbytery: [${currentUser.presbytery}] | Department: [${currentUser.department}] (locked to your assignment)`;
    $('scope-indicator').textContent = `Current Scope: ${scopeDesc}`;
    $('tx-scope-note').textContent = superVisible ? 'Full visibility across the selected scope.' : `You're seeing only what belongs to ${shortDeptName(currentUser.department)} · ${currentUser.presbytery}.`;

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
    if ($('view-banks').classList.contains('active')) renderBanksTable();
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
    if (!canvas || !legendWrap || typeof Chart === 'undefined') return;

    const depts = Object.keys(EPR_STRUCTURE);
    const totals = depts.map(d => list.filter(t => t.department === d && t.type === 'Expense').reduce((s, t) => s + (t.amount || 0), 0));
    const hasData = totals.some(v => v > 0);
    const labels = depts.map(shortDeptName);
    const colors = depts.map((_, i) => DEPT_CHART_COLORS[i % DEPT_CHART_COLORS.length]);

    if (glanceExpenseChart) glanceExpenseChart.destroy();
    glanceExpenseChart = new Chart(canvas.getContext('2d'), {
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
        wrap.innerHTML = `<p class="glance-sub">No banks added yet. Use "+ Add new" while recording an expense, or add one under Bank Management.</p>`;
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
    const superVisible = hasFullScope();
    $('ft-result-count').textContent = `${list.length} result${list.length === 1 ? '' : 's'}`;

    if (list.length === 0) {
        tbody.innerHTML = `<tr class="table-empty-row"><td colspan="10"><i class="fa-solid fa-inbox empty-icon"></i>No records found in this scope. Try clearing filters or search.</td></tr>`;
        $('tx-table-footer').textContent = '';
        return;
    }

    list.forEach(tx => {
        const tr = document.createElement('tr');
        const isInc = tx.type === 'Income' || tx.type === 'Asset';
        const canEdit = superVisible || tx.createdById === currentUser.id;
        tr.innerHTML = `
            <td>${tx.date}</td>
            <td><strong>${escapeHtml(tx.ref || '—')}</strong></td>
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
            <td><strong>${escapeHtml(u.name)}</strong>${u.fullAccess ? ' <span class="badge" style="background:var(--primary-light);color:var(--primary-darker);">Full access</span>' : ''}</td>
            <td>${escapeHtml(u.email)}</td>
            <td><span class="badge role-${u.role}">${ROLE_LABELS[u.role] || u.role}</span></td>
            <td>${(u.presbytery === 'ALL') ? 'All presbyteries' : u.presbytery}</td>
            <td>${(u.department === 'ALL') ? 'All departments' : shortDeptName(u.department)}${projCount ? ` <span class="muted-sm">(${projCount} project${projCount === 1 ? '' : 's'})</span>` : ''}</td>
            <td><div class="row-actions">
                <button class="icon-action-btn user-edit-btn" data-id="${u.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action-btn danger-hover user-delete-btn" data-id="${u.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

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

function exportReportToExcel() {
    const customMode = !$('custom-report-results').classList.contains('hidden');
    const customRows = customMode ? getCustomReportRecords() : [];
    const list = customMode ? customRows : getReportTransactions();
    if (list.length === 0) { showToast('error', 'Nothing to export for the selected range/scope.'); return; }
    const data = customMode ? customRows.map(item => ({
        Date: item.date, Module: REPORT_SOURCE_LABELS[item.source] || item.source, Name: item.name,
        Reference: item.reference, Status: item.status, Amount: item.amount, Details: JSON.stringify(item.raw)
    })) : list.map(item => ({ Date: item.date, Type: item.type, Description: item.desc, Department: item.department,
        Section: item.subsection, Presbytery: item.presbytery, Account: item.bankName || '', Amount: item.amount,
        RecordedBy: item.createdByName || item.createdBy || '' }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, customMode ? "Custom Report" : "Financial Report");
    XLSX.writeFile(workbook, customMode ? "SAS_Custom_System_Report.xlsx" : "SAS_Financial_Report.xlsx");
    showToast('success', `Exported ${list.length} records to Excel.`);
}

const formatRF = (amount) => "RF " + Number(amount || 0).toLocaleString();
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function statusPill(status) {
    return `<span class="status-pill status-${status}">${STATUS_LABELS[status] || status}</span>`;
}

function setupExtModulesEventListeners() {
    $('open-invoice-modal-btn').addEventListener('click', () => openInvoiceModal());
    $('close-invoice-modal').addEventListener('click', () => closeModal('invoice-modal'));
    $('invoice-modal').addEventListener('click', (e) => { if (e.target === $('invoice-modal')) closeModal('invoice-modal'); });
    $('invoice-form').addEventListener('submit', onSubmitInvoiceForm);
    $('invoices-table-body').addEventListener('click', onInvoicesTableClick);

    $('open-bill-modal-btn').addEventListener('click', () => openBillModal());
    $('close-bill-modal').addEventListener('click', () => closeModal('bill-modal'));
    $('bill-modal').addEventListener('click', (e) => { if (e.target === $('bill-modal')) closeModal('bill-modal'); });
    $('bill-form').addEventListener('submit', onSubmitBillForm);
    $('bills-table-body').addEventListener('click', onBillsTableClick);

    $('open-supplier-modal-btn').addEventListener('click', () => openSupplierModal());
    $('close-supplier-modal').addEventListener('click', () => closeModal('supplier-modal'));
    $('supplier-modal').addEventListener('click', (e) => { if (e.target === $('supplier-modal')) closeModal('supplier-modal'); });
    $('supplier-form').addEventListener('submit', onSubmitSupplierForm);
    $('suppliers-table-body').addEventListener('click', onSuppliersTableClick);

    $('open-customer-modal-btn').addEventListener('click', () => openCustomerModal());
    $('close-customer-modal').addEventListener('click', () => closeModal('customer-modal'));
    $('customer-modal').addEventListener('click', (e) => { if (e.target === $('customer-modal')) closeModal('customer-modal'); });
    $('customer-form').addEventListener('submit', onSubmitCustomerForm);
    $('customers-table-body').addEventListener('click', onCustomersTableClick);

    $('open-project-modal-btn').addEventListener('click', () => openProjectModal());
    $('close-project-modal').addEventListener('click', () => closeModal('project-modal'));
    $('project-modal').addEventListener('click', (e) => { if (e.target === $('project-modal')) closeModal('project-modal'); });
    $('project-form').addEventListener('submit', onSubmitProjectForm);
    $('projects-table-body').addEventListener('click', onProjectsTableClick);
    $('project-progress').addEventListener('input', (e) => { $('project-progress-val').textContent = `${e.target.value}%`; });

    $('open-budget-modal-btn').addEventListener('click', () => openBudgetModal());
    $('close-budget-modal').addEventListener('click', () => closeModal('budget-modal'));
    $('budget-modal').addEventListener('click', (e) => { if (e.target === $('budget-modal')) closeModal('budget-modal'); });
    $('budget-form').addEventListener('submit', onSubmitBudgetForm);
    $('budget-table-body').addEventListener('click', onBudgetTableClick);

    $('open-bank-modal-btn').addEventListener('click', () => openBankModal());
    $('close-bank-modal').addEventListener('click', () => closeModal('bank-modal'));
    $('bank-modal').addEventListener('click', (e) => { if (e.target === $('bank-modal')) closeModal('bank-modal'); });
    $('bank-form').addEventListener('submit', onSubmitBankForm);
    $('banks-table-body').addEventListener('click', onBanksTableClick);
    fillSimpleSelect($('bank-account-type'), Object.keys(ACCOUNT_TYPE_STRUCTURE), true, 'Select account type');
    $('bank-account-type').addEventListener('change', () => {
        populateDetailTypeSelect($('bank-account-type').value, '', 'bank-detail-type');
    });
    $('bank-subaccount-toggle').addEventListener('change', () => {
        $('bank-parent-group').classList.toggle('hidden', !$('bank-subaccount-toggle').checked);
    });

    $('open-account-modal-btn').addEventListener('click', () => openAccountModal());
    $('accounts-table-body').addEventListener('click', onAccountsTableClick);
}

function guardSuperadminView(viewId, sectionLabel) {
    if (!isSuper()) {
        $(viewId).innerHTML = `<div class="module-empty"><i class="fa-solid fa-lock"></i>${sectionLabel} is available to Superadmins only.</div>`;
        return false;
    }
    return true;
}

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
    openModal('invoice-modal');
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
        closeModal('invoice-modal');
    } catch (err) { showToast('error', "Couldn't save invoice: " + err.message); }
    finally { btn.disabled = false; }
}

function renderPortalStatRow(elId, list, kind) {
    const wrap = $(elId);
    if (!wrap) return;
    const total = list.reduce((s, r) => s + (r.amount || 0), 0);
    const pending = list.filter(r => r.status === 'pending_approval');
    const approved = list.filter(r => r.status === 'approved');
    const pendingTotal = pending.reduce((s, r) => s + (r.amount || 0), 0);
    const approvedTotal = approved.reduce((s, r) => s + (r.amount || 0), 0);
    const noun = kind === 'invoice' ? 'Invoiced' : 'Billed';
    wrap.innerHTML = `
        <div class="portal-stat-card">
            <span class="psc-label">Total ${noun}</span>
            <span class="psc-value">${formatRF(total)}</span>
            <span class="psc-sub">${list.length} record${list.length === 1 ? '' : 's'}</span>
        </div>
        <div class="portal-stat-card warn">
            <span class="psc-label">Awaiting approval</span>
            <span class="psc-value">${formatRF(pendingTotal)}</span>
            <span class="psc-sub">${pending.length} pending</span>
        </div>
        <div class="portal-stat-card ok">
            <span class="psc-label">${kind === 'invoice' ? 'Issued' : 'Paid'}</span>
            <span class="psc-value">${formatRF(approvedTotal)}</span>
            <span class="psc-sub">${approved.length} approved</span>
        </div>
    `;
}

function renderInvoicesTable() {
    const tbody = $('invoices-table-body');
    renderPortalStatRow('invoices-stat-row', invoicesDb, 'invoice');
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
    openModal('bill-modal');
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
        closeModal('bill-modal');
    } catch (err) { showToast('error', "Couldn't save bill: " + err.message); }
    finally { btn.disabled = false; }
}

function renderBillsTable() {
    const tbody = $('bills-table-body');
    renderPortalStatRow('bills-stat-row', billsDb, 'bill');
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
    openModal('supplier-modal');
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
        closeModal('supplier-modal');
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

function subscribeCustomers() {
    if (unsubCustomers) unsubCustomers();
    unsubCustomers = onSnapshot(buildScopedQuery(COLLECTIONS.CUSTOMERS), (snap) => {
        customersDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        customersDb.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderCustomersTable();
        $('nav-customers-count').textContent = customersDb.length;
    }, (err) => showToast('error', 'Customers feed error: ' + err.message));
}

function openCustomerModal(edit, target) {
    pendingCustomerTarget = target || null;
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
    openModal('customer-modal');
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
        let customerId = editId;
        if (editId) { await updateDoc(doc(db, COLLECTIONS.CUSTOMERS, editId), { ...payload, ...updateMeta() }); showToast('success', 'Customer updated.'); }
        else {
            const customerRef = await addDoc(collection(db, COLLECTIONS.CUSTOMERS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() }));
            customerId = customerRef.id;
            showToast('success', 'Customer added.');
        }
        closeModal('customer-modal');
        if (pendingCustomerTarget && pendingCustomerTarget.onCreated) pendingCustomerTarget.onCreated({ id: customerId, ...payload });
        pendingCustomerTarget = null;
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
    openModal('project-modal');
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
        closeModal('project-modal');
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
    openModal('budget-modal');
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
        closeModal('budget-modal');
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

// =======================================================================
// BANKS — every user can quick-add a bank while recording an Expense or
// Deposit line ("+ Add new"); only a Superadmin can edit/delete a bank
// from the dedicated Bank Management page. The list stays fully live via
// onSnapshot, so every combobox across the app sees new banks instantly.
// =======================================================================
function subscribeBanks() {
    if (unsubBanks) unsubBanks();
    unsubBanks = onSnapshot(collection(db, COLLECTIONS.BANKS), (snap) => {
        banksDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        banksLoaded = true;
        banksDb.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        renderBanksTable();
        $('nav-banks-count').textContent = banksDb.length;
        renderGlanceBanks();
        if ($('view-coa').classList.contains('active')) { renderCoaBankGrid(); renderCoaCharts(); }
        reconcileExistingBankAccountLinks();
    }, (err) => showToast('error', 'Banks feed error: ' + err.message));
}

// `target` (optional) is { onCreated(bank) } used by the Expense/Deposit
// line "+ Add new" shortcut to drop the freshly created bank straight
// back into that line without leaving the page it was launched from.
function openBankModal(edit, target) {
    pendingBankTarget = target || null;
    // Editing or managing banks from the dedicated Bank Management page
    // stays Superadmin-only; quick-adding a brand new bank from a line
    // item (target is set) is available to any signed-in user.
    if (!target && !edit && !guardSuperadminAction()) { pendingBankTarget = null; return; }
    if (edit && !guardSuperadminAction()) { pendingBankTarget = null; return; }

    if (edit) {
        $('bank-modal-title').innerHTML = '<i class="fa-solid fa-pen"></i> Edit Bank';
        $('bank-submit-btn').textContent = 'Update Bank';
        $('bank-edit-id').value = edit.id;
        $('bank-name').value = edit.name;
        $('bank-branch').value = edit.branch || '';
        $('bank-account').value = edit.account;
        $('bank-currency').value = edit.currency || 'RWF';
        $('bank-account-type').value = ACCOUNT_TYPE_STRUCTURE[edit.accountType]
            ? edit.accountType : 'Cash and cash equivalents';
        populateDetailTypeSelect($('bank-account-type').value, edit.detailType || 'Bank', 'bank-detail-type');
        $('bank-vat').value = edit.vat || '';
        $('bank-asof').value = edit.asOfDate || new Date().toISOString().split('T')[0];
        $('bank-subaccount-toggle').checked = !!edit.parentId;
        $('bank-parent-group').classList.toggle('hidden', !edit.parentId);
        $('bank-balance').value = edit.balance || 0;
        $('bank-notes').value = edit.notes || '';
    } else {
        $('bank-modal-title').innerHTML = '<i class="fa-solid fa-building-columns"></i> Add Bank';
        $('bank-submit-btn').textContent = 'Save Bank';
        $('bank-form').reset();
        $('bank-edit-id').value = '';
        $('bank-currency').value = 'RWF';
        $('bank-account-type').value = 'Cash and cash equivalents';
        populateDetailTypeSelect('Cash and cash equivalents', 'Bank', 'bank-detail-type');
        $('bank-asof').value = new Date().toISOString().split('T')[0];
        $('bank-subaccount-toggle').checked = false;
        $('bank-parent-group').classList.add('hidden');
    }
    fillSimpleSelect($('bank-parent'), banksDb.filter(b => !edit || b.id !== edit.id).map(b => `${b.name} — ${b.account}`), true, '-- Select parent account --');
    if (edit && edit.parentId) {
        const parents = banksDb.filter(b => b.id !== edit.id);
        const index = parents.findIndex(b => b.id === edit.parentId);
        if (index >= 0) $('bank-parent').selectedIndex = index + 1;
    }
    openModal('bank-modal');
}

async function onSubmitBankForm(e) {
    e.preventDefault();
    const editId = $('bank-edit-id').value;
    if (editId && !guardSuperadminAction()) return;
    const payload = sanitizePayload({
        name: $('bank-name').value.trim(), branch: $('bank-branch').value.trim(),
        account: $('bank-account').value.trim(), currency: $('bank-currency').value || 'RWF',
        accountType: $('bank-account-type').value || 'Cash and cash equivalents',
        detailType: $('bank-detail-type').value || 'Bank',
        vat: $('bank-vat').value,
        asOfDate: $('bank-asof').value || new Date().toISOString().split('T')[0],
        parentId: $('bank-subaccount-toggle').checked && $('bank-parent').selectedIndex > 0
            ? banksDb.filter(b => b.id !== editId)[$('bank-parent').selectedIndex - 1].id : '',
        balance: parseFloat($('bank-balance').value) || 0, notes: $('bank-notes').value.trim()
    });
    if (!payload.name || !payload.account) { showToast('error', 'Bank name and account number are required.'); return; }
    const btn = $('bank-submit-btn'); btn.disabled = true;
    try {
        let newId = editId;
        if (editId) {
            await updateDoc(doc(db, COLLECTIONS.BANKS, editId), { ...payload, ...updateMeta() });
            const existingBank = banksDb.find(b => b.id === editId);
            if (existingBank && existingBank.linkedAccountId) {
                await updateDoc(doc(db, COLLECTIONS.ACCOUNTS, existingBank.linkedAccountId), {
                    name: payload.name,
                    number: payload.account,
                    type: payload.accountType,
                    detailType: payload.detailType,
                    openingBalance: payload.balance,
                    balance: payload.balance,
                    asOfDate: payload.asOfDate,
                    currency: currencyLongName(payload.currency),
                    vat: payload.vat,
                    description: payload.notes,
                    ...updateMeta()
                });
            }
            showToast('success', 'Bank updated.');
        } else {
            const ref = await addDoc(collection(db, COLLECTIONS.BANKS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() }));
            newId = ref.id;
            const accountRef = await addDoc(collection(db, COLLECTIONS.ACCOUNTS), sanitizePayload({
                name: payload.name,
                number: payload.account,
                type: payload.accountType,
                detailType: payload.detailType,
                parentId: '',
                vat: payload.vat,
                openingBalance: payload.balance,
                balance: payload.balance,
                asOfDate: payload.asOfDate,
                currency: currencyLongName(payload.currency),
                description: payload.notes,
                linkedBankId: newId,
                ...actorMeta(), createdAt: serverTimestamp()
            }));
            await updateDoc(doc(db, COLLECTIONS.BANKS, newId), { linkedAccountId: accountRef.id, ...updateMeta() });
            showToast('success', `Bank "${payload.name}" added and linked to the Chart of Accounts.`);
        }
        closeModal('bank-modal');
        if (pendingBankTarget && pendingBankTarget.onCreated) {
            pendingBankTarget.onCreated({ id: newId, ...payload });
        }
        pendingBankTarget = null;
    } catch (err) { showToast('error', "Couldn't save bank: " + err.message); }
    finally { btn.disabled = false; }
}

function currencyLongName(code) {
    return CURRENCY_OPTIONS.find(item => item.startsWith(`${code || 'RWF'} `)) || 'RWF Rwanda Franc';
}

function isBankLinkedAccountType(type) {
    return type === 'Cash and cash equivalents' || type === 'Credit card';
}

async function syncChartAccountToBank(accountId, payload, existingAccount) {
    if (!isBankLinkedAccountType(payload.type)) return '';
    const bankPayload = sanitizePayload({
        name: payload.name,
        branch: '',
        account: payload.number || `COA-${accountId.slice(0, 8).toUpperCase()}`,
        currency: (payload.currency || 'RWF Rwanda Franc').split(' ')[0],
        accountType: payload.type,
        detailType: payload.detailType,
        vat: payload.vat,
        asOfDate: payload.asOfDate,
        parentId: '',
        balance: payload.openingBalance || 0,
        notes: payload.description,
        linkedAccountId: accountId
    });
    const linkedBankId = (existingAccount && existingAccount.linkedBankId) || '';
    if (linkedBankId) {
        await updateDoc(doc(db, COLLECTIONS.BANKS, linkedBankId), { ...bankPayload, ...updateMeta() });
        return linkedBankId;
    }
    const bankRef = await addDoc(collection(db, COLLECTIONS.BANKS), sanitizePayload({ ...bankPayload, ...actorMeta(), createdAt: serverTimestamp() }));
    await updateDoc(doc(db, COLLECTIONS.ACCOUNTS, accountId), { linkedBankId: bankRef.id, ...updateMeta() });
    return bankRef.id;
}

function renderBanksTable() {
    if (!guardSuperadminView('view-banks', 'Bank Management')) return;
    const tbody = $('banks-table-body');
    if (!tbody) return;
    if (banksDb.length === 0) { tbody.innerHTML = `<tr class="table-empty-row"><td colspan="7">No banks added yet.</td></tr>`; return; }
    tbody.innerHTML = '';
    banksDb.forEach(b => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(b.name)}</strong>${b.linkedAccountId ? '<div class="linked-account-badge"><i class="fa-solid fa-link"></i> Chart-linked</div>' : ''}</td>
            <td><span class="account-meta-chip">${escapeHtml(b.accountType || 'Cash and cash equivalents')}</span></td>
            <td><span class="account-meta-chip detail">${escapeHtml(b.detailType || 'Bank')}</span></td>
            <td>${escapeHtml(b.branch||'—')}</td><td>${escapeHtml(b.currency||'RWF')}</td><td><strong>${formatRF(computeBankBalance(b))}</strong></td>
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

// =======================================================================
// CHART OF ACCOUNTS — "accounts" collection (QuickBooks-style New Account
// page). This remains separate from "banks": it's the full ledger chart
// (Asset/Liability/Equity/Income/Expense with detail types) shown under
// Chart of Accounts → Full Chart of Accounts. Expense/Deposit line items
// now categorise against BANK ACCOUNTS instead (see setupLineBankCombobox).
// =======================================================================
function subscribeAccounts() {
    if (unsubAccounts) unsubAccounts();
    unsubAccounts = onSnapshot(collection(db, COLLECTIONS.ACCOUNTS), (snap) => {
        accountsDb = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        accountsLoaded = true;
        accountsDb.sort((a, b) => (a.number || '').localeCompare(b.number || '', undefined, { numeric: true }) || (a.name || '').localeCompare(b.name || ''));
        renderAccountsTable();
        reconcileExistingBankAccountLinks();
    }, (err) => showToast('error', 'Chart of Accounts feed error: ' + err.message));
}

async function reconcileExistingBankAccountLinks() {
    if (!banksLoaded || !accountsLoaded || accountLinkSyncRunning || !currentUser) return;
    accountLinkSyncRunning = true;
    let linkedCount = 0;
    const norm = value => String(value || '').trim().toLowerCase();
    try {
        for (const bank of banksDb.filter(b => !b.linkedAccountId)) {
            let account = accountsDb.find(a => a.linkedBankId === bank.id);
            if (!account) {
                account = accountsDb.find(a => isBankLinkedAccountType(a.type) && (
                    (bank.account && norm(a.number) === norm(bank.account)) || norm(a.name) === norm(bank.name)
                ));
            }
            if (account) {
                await updateDoc(doc(db, COLLECTIONS.BANKS, bank.id), { linkedAccountId: account.id, ...updateMeta() });
                if (account.linkedBankId !== bank.id) await updateDoc(doc(db, COLLECTIONS.ACCOUNTS, account.id), { linkedBankId: bank.id, ...updateMeta() });
                linkedCount++;
            } else {
                const accountRef = await addDoc(collection(db, COLLECTIONS.ACCOUNTS), sanitizePayload({
                    name: bank.name,
                    number: bank.account || `BANK-${bank.id.slice(0, 8).toUpperCase()}`,
                    type: bank.accountType || 'Cash and cash equivalents',
                    detailType: bank.detailType || 'Bank',
                    parentId: '', vat: bank.vat || '',
                    openingBalance: Number(bank.balance || 0), balance: Number(bank.balance || 0),
                    asOfDate: bank.asOfDate || new Date().toISOString().split('T')[0],
                    currency: currencyLongName(bank.currency), description: bank.notes || '',
                    linkedBankId: bank.id,
                    ...actorMeta(), createdAt: serverTimestamp()
                }));
                await updateDoc(doc(db, COLLECTIONS.BANKS, bank.id), { linkedAccountId: accountRef.id, ...updateMeta() });
                linkedCount++;
            }
        }

        for (const account of accountsDb.filter(a => isBankLinkedAccountType(a.type) && !a.linkedBankId)) {
            const matchingBank = banksDb.find(b =>
                (account.number && norm(b.account) === norm(account.number)) || norm(b.name) === norm(account.name)
            );
            if (matchingBank) {
                await updateDoc(doc(db, COLLECTIONS.ACCOUNTS, account.id), { linkedBankId: matchingBank.id, ...updateMeta() });
                if (matchingBank.linkedAccountId !== account.id) await updateDoc(doc(db, COLLECTIONS.BANKS, matchingBank.id), { linkedAccountId: account.id, ...updateMeta() });
            } else {
                await syncChartAccountToBank(account.id, {
                    name: account.name, number: account.number, type: account.type, detailType: account.detailType,
                    vat: account.vat || '', openingBalance: Number(account.openingBalance ?? account.balance ?? 0),
                    asOfDate: account.asOfDate || new Date().toISOString().split('T')[0],
                    currency: account.currency || 'RWF Rwanda Franc', description: account.description || ''
                }, account);
            }
            linkedCount++;
        }
        if (linkedCount) showToast('success', `${linkedCount} existing bank/cash account${linkedCount === 1 ? '' : 's'} synchronized.`);
    } catch (err) {
        console.warn('Bank/Chart account synchronization:', err);
    } finally {
        accountLinkSyncRunning = false;
    }
}

function populateDetailTypeSelect(typeKey, selectedValue, selectId = 'account-detail-type') {
    const sel = $(selectId);
    if (!sel) return;
    const details = ACCOUNT_TYPE_STRUCTURE[typeKey] || [];
    sel.innerHTML = '';
    sel.disabled = !details.length;
    if (!details.length) {
        const o = document.createElement('option'); o.value = ''; o.textContent = 'Select an account type first';
        sel.appendChild(o);
        return;
    }
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select detail type';
    placeholder.disabled = true;
    placeholder.selected = !selectedValue;
    sel.appendChild(placeholder);
    details.forEach(d => {
        const o = document.createElement('option'); o.value = d; o.textContent = d;
        sel.appendChild(o);
    });
    if (selectedValue && details.includes(selectedValue)) sel.value = selectedValue;
}

function setupAccountModal() {
    fillSimpleSelect($('account-type'), Object.keys(ACCOUNT_TYPE_STRUCTURE), true, 'Select account type');
    fillSimpleSelect($('account-vat'), VAT_OPTIONS, true, '-- Select VAT --');
    fillSimpleSelect($('account-currency'), CURRENCY_OPTIONS, false);
    $('account-currency').value = 'RWF Rwanda Franc';

    $('account-type').addEventListener('change', () => populateDetailTypeSelect($('account-type').value, ''));
    $('account-subaccount-toggle').addEventListener('change', () => {
        $('account-parent-group').classList.toggle('hidden', !$('account-subaccount-toggle').checked);
        refreshAccountParentOptions();
    });

    $('close-account-modal').addEventListener('click', () => closeAccountModal());
    $('account-modal').addEventListener('click', (e) => { if (e.target === $('account-modal')) closeAccountModal(); });
    $('account-form').addEventListener('submit', onSubmitAccountForm);
}

function refreshAccountParentOptions() {
    const sel = $('account-parent');
    if (!sel) return;
    fillSimpleSelect(sel, accountsDb.map(a => `${a.number ? a.number + ' — ' : ''}${a.name}`), true, '-- Select parent account --');
    sel.dataset.map = JSON.stringify(accountsDb.map(a => a.id));
}

function openAccountModal(edit, target) {
    pendingAccountTarget = target || null;
    $('account-form').reset();
    $('account-edit-id').value = '';
    $('account-subaccount-toggle').checked = false;
    $('account-parent-group').classList.add('hidden');
    $('account-currency').value = 'RWF Rwanda Franc';
    $('account-asof').value = new Date().toISOString().split('T')[0];
    refreshAccountParentOptions();

    if (edit) {
        $('account-modal-title').textContent = 'Edit account';
        $('account-submit-btn').textContent = 'Save changes';
        $('account-edit-id').value = edit.id;
        $('account-name').value = edit.name || '';
        $('account-number').value = edit.number || '';
        $('account-type').value = edit.type || '';
        populateDetailTypeSelect(edit.type, edit.detailType);
        $('account-vat').value = edit.vat || '';
        $('account-opening-balance').value = edit.openingBalance || '';
        $('account-asof').value = edit.asOfDate || new Date().toISOString().split('T')[0];
        $('account-currency').value = edit.currency || 'RWF Rwanda Franc';
        $('account-description').value = edit.description || '';
        if (edit.parentId) {
            $('account-subaccount-toggle').checked = true;
            $('account-parent-group').classList.remove('hidden');
            const idx = accountsDb.findIndex(a => a.id === edit.parentId);
            if (idx > -1) $('account-parent').selectedIndex = idx + 1;
        }
    } else {
        $('account-modal-title').textContent = 'New account';
        $('account-submit-btn').textContent = 'Save';
        $('account-type').selectedIndex = 0;
        populateDetailTypeSelect('', '');
    }
    openModal('account-modal');
}
function closeAccountModal() { closeModal('account-modal'); pendingAccountTarget = null; }

async function onSubmitAccountForm(e) {
    e.preventDefault();
    const editId = $('account-edit-id').value;
    const name = $('account-name').value.trim();
    const number = $('account-number').value.trim();
    const type = $('account-type').value;
    const detailType = $('account-detail-type').value;
    const isSub = $('account-subaccount-toggle').checked;
    const parentSel = $('account-parent');
    const parentIdx = parentSel.selectedIndex - 1;
    const parentId = (isSub && parentIdx > -1) ? accountsDb[parentIdx].id : '';

    if (!name || !type || !detailType) { showToast('error', 'Fill in an account name, account type and detail type.'); return; }

    const payload = sanitizePayload({
        name, number, type, detailType, parentId,
        vat: $('account-vat').value,
        openingBalance: parseFloat($('account-opening-balance').value) || 0,
        balance: parseFloat($('account-opening-balance').value) || 0,
        asOfDate: $('account-asof').value || new Date().toISOString().split('T')[0],
        currency: $('account-currency').value,
        description: $('account-description').value.trim()
    });

    const btn = $('account-submit-btn'); btn.disabled = true;
    try {
        let newId = editId;
        const existingAccount = editId ? accountsDb.find(a => a.id === editId) : null;
        if (editId) {
            await updateDoc(doc(db, COLLECTIONS.ACCOUNTS, editId), { ...payload, ...updateMeta() });
            const linkedBankId = await syncChartAccountToBank(editId, payload, existingAccount);
            showToast('success', linkedBankId ? 'Account updated in both the Chart of Accounts and Bank Accounts.' : 'Ledger account updated in the Chart of Accounts.');
        } else {
            const ref = await addDoc(collection(db, COLLECTIONS.ACCOUNTS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() }));
            newId = ref.id;
            const linkedBankId = await syncChartAccountToBank(newId, payload, null);
            showToast('success', linkedBankId
                ? `Account "${name}" created and added to Bank Accounts.`
                : `Ledger account "${name}" created in the Chart of Accounts.`);
        }
        closeAccountModal();
        if (pendingAccountTarget && pendingAccountTarget.onCreated) {
            pendingAccountTarget.onCreated({ id: newId, ...payload });
        }
        pendingAccountTarget = null;
    } catch (err) { showToast('error', "Couldn't save account: " + err.message); }
    finally { btn.disabled = false; }
}

function renderAccountsTable() {
    const tbody = $('accounts-table-body');
    if (!tbody) return;
    if (accountsDb.length === 0) { tbody.innerHTML = `<tr class="table-empty-row"><td colspan="3">No chart-of-accounts entries yet. Click "New account" to add one.</td></tr>`; return; }
    tbody.innerHTML = '';
    accountsDb.forEach(a => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(a.name)}</strong>${a.linkedBankId ? '<div class="linked-account-badge"><i class="fa-solid fa-building-columns"></i> Bank-linked</div>' : ''}</td>
            <td><span class="badge">${escapeHtml(a.type || '')}</span></td>
            <td><div class="row-actions">
                <button class="icon-action-btn" data-edit="${a.id}" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action-btn danger-hover" data-delete="${a.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div></td>`;
        tbody.appendChild(tr);
    });
}

function onAccountsTableClick(e) {
    const editBtn = e.target.closest('[data-edit]');
    const delBtn = e.target.closest('[data-delete]');
    if (editBtn) { const a = accountsDb.find(x => x.id === editBtn.dataset.edit); if (a) openAccountModal(a); }
    else if (delBtn) {
        const a = accountsDb.find(x => x.id === delBtn.dataset.delete);
        if (!a) return;
        openConfirmModal(`Delete account "${a.name}"? Records already linked to it will keep the old name on record.`, async () => {
            try { await deleteDoc(doc(db, COLLECTIONS.ACCOUNTS, a.id)); showToast('success', 'Account deleted.'); }
            catch (err) { showToast('error', err.message); }
        });
    }
}

// ---------------------------------------------------------------------
// Searchable "Bank Account" combobox used inside Expense & Deposit
// line-item rows. Lists every bank in Bank Management, with a "+ Add
// new" row pinned to the top that opens the Bank page. Whichever bank a
// line points to is the account that line's amount is deducted from
// (Expense) or deposited into (Income) — see computeBankBalance().
// ---------------------------------------------------------------------
function setupLineBankCombobox(row) {
    const input = row.querySelector('.line-bank-input');
    const hidden = row.querySelector('.line-bank-id');
    const dropdown = row.querySelector('.line-bank-dropdown');
    if (!input || !hidden || !dropdown) return;
    let debounceTimer = null;

    function renderList(term) {
        const t = (term || '').toLowerCase().trim();
        dropdown.innerHTML = '';

        const addNewRow = document.createElement('div');
        addNewRow.className = 'acct-dropdown-item acct-add-new';
        addNewRow.innerHTML = `<div class="adi-main"><span class="adi-name"><i class="fa-solid fa-plus"></i> Add new account</span></div>`;
        addNewRow.addEventListener('mousedown', (e) => {
            e.preventDefault();
            dropdown.classList.add('hidden');
            openBankModal(null, {
                onCreated: (bank) => {
                    hidden.value = bank.id;
                    input.value = formatBankLabel(bank);
                }
            });
        });
        dropdown.appendChild(addNewRow);

        const availableAccounts = getSelectableActionAccounts();
        const matches = availableAccounts.filter(b =>
            !t ||
            (b.name || '').toLowerCase().includes(t) ||
            (b.accountType || '').toLowerCase().includes(t) ||
            (b.detailType || '').toLowerCase().includes(t) ||
            (b.branch || '').toLowerCase().includes(t)
        ).slice(0, 40);

        if (availableAccounts.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'acct-empty';
            empty.textContent = 'No accounts yet — use "+ Add new account" above to create one.';
            dropdown.appendChild(empty);
        } else if (matches.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'acct-empty';
            empty.textContent = `No accounts match "${term}".`;
            dropdown.appendChild(empty);
        } else {
            matches.forEach(b => {
                const rowEl = document.createElement('div');
                rowEl.className = 'acct-dropdown-item';
                rowEl.innerHTML = `
                    <div class="adi-main"><span class="adi-name">${escapeHtml(b.name)}</span><span class="adi-meta"><span class="account-meta-chip">${escapeHtml(b.accountType || 'Account')}</span><span class="account-meta-chip detail">${escapeHtml(b.detailType || 'General')}</span></span></div>`;
                rowEl.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    hidden.value = b.id;
                    input.value = formatBankLabel(b);
                    dropdown.classList.add('hidden');
                });
                dropdown.appendChild(rowEl);
            });
        }
        dropdown.classList.remove('hidden');
    }

    input.addEventListener('focus', () => renderList(input.value));
    input.addEventListener('input', () => {
        hidden.value = '';
        clearTimeout(debounceTimer);
        const term = input.value;
        debounceTimer = setTimeout(() => renderList(term), 150);
    });
    input.addEventListener('blur', () => setTimeout(() => dropdown.classList.add('hidden'), 160));
}

function formatBankLabel(b) {
    return `${b.name} · ${b.accountType || 'Account'} · ${b.detailType || 'General'}`;
}

function formatHeaderBankLabel(b) {
    return `${b.name} · ${b.accountType || 'Account'} · ${b.detailType || 'General'}`;
}

function readLineBank(row) {
    const hidden = row.querySelector('.line-bank-id');
    const id = hidden ? hidden.value : '';
    const bank = findSelectableActionAccount(id);
    return { bankId: id || '', bankName: bank ? bank.name : (row.querySelector('.line-bank-input') || {}).value || '' };
}

function getVisibleBanks() {
    // Every bank is visible to everyone once created — banks are shared,
    // company-wide accounts, not scoped per user/department.
    return banksDb;
}

function parseLines(t) {
    if (!t || !t.lines) return [];
    try { const arr = JSON.parse(t.lines); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
}

// Computes a bank's live balance: opening balance, plus/minus every
// transaction that touches it — either via that bank's own line-level
// allocations (Expense/Deposit forms, which can split a single entry
// across several banks) or, for simple Transactions with no lines, via
// the transaction's single top-level bankId.
function computeBankBalance(bank) {
    let balance = bank.balance || 0;
    transactionsDb.forEach(t => {
        const lines = parseLines(t);
        const lineHits = lines.filter(l => l.bankId === bank.id);
        if (lineHits.length) {
            const lineTotal = lineHits.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
            if (t.type === 'Income') balance += lineTotal;
            if (t.type === 'Expense') balance -= lineTotal;
        } else if (t.bankId === bank.id) {
            if (t.type === 'Income') balance += (t.amount || 0);
            if (t.type === 'Expense') balance -= (t.amount || 0);
        }
    });
    return balance;
}

// Transactions that touched this bank (by line allocation or top-level
// bankId), used for the Chart of Accounts bank statement / trend charts.
function getBankActivity(bankId) {
    const touches = (t) => {
        const lines = parseLines(t);
        if (lines.some(l => l.bankId === bankId)) return true;
        return t.bankId === bankId;
    };
    const amountFor = (t) => {
        const lines = parseLines(t);
        const hits = lines.filter(l => l.bankId === bankId);
        if (hits.length) return hits.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
        return t.amount || 0;
    };
    const tx = transactionsDb.filter(touches).map(t => ({ ...t, amount: amountFor(t) }));
    return { tx };
}

function renderCoaBankGrid() {
    const grid = $('coa-bank-grid');
    const selector = $('coa-account-select');
    const empty = $('coa-empty');
    const charts = $('coa-charts');
    if (!grid || !selector || !empty || !charts) return;

    $('coa-scope-note').textContent = 'Account name and account type only. Balances are available in statements and reports.';

    const visible = getVisibleBanks();
    selector.innerHTML = '<option value="">Select an account for charts</option>';

    if (visible.length === 0) {
        empty.classList.remove('hidden');
        charts.classList.add('hidden');
        empty.innerHTML = `<i class="fa-solid fa-building-columns"></i>No banks yet. Add one from the "New Bank" button here, or via "+ Add new bank" while recording an Expense/Deposit.`;
        coaSelectedBankId = null;
        return;
    }
    empty.classList.add('hidden');

    if (!coaSelectedBankId || !visible.find(b => b.id === coaSelectedBankId)) coaSelectedBankId = visible[0].id;

    visible.forEach(b => {
        const option = document.createElement('option');
        option.value = b.id;
        option.textContent = `${b.name} — ${b.accountType || 'Cash and cash equivalents'}`;
        option.selected = coaSelectedBankId === b.id;
        selector.appendChild(option);
    });
    if (!selector.dataset.bound) {
        selector.addEventListener('change', () => {
            coaSelectedBankId = selector.value || null;
            renderCoaCharts();
        });
        selector.dataset.bound = 'true';
    }
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
    if (label) label.textContent = `${bank.name} — ${bank.accountType || 'Cash and cash equivalents'} / ${bank.detailType || 'Bank'}`;

    const { tx } = getBankActivity(bank.id);
    const rangeTx = tx.filter(t => dateInRange(t.date, range) || (!range.from && !range.to));

    const rangeIn = rangeTx.filter(t => t.type === 'Income').reduce((s, t) => s + t.amount, 0);
    const rangeOut = rangeTx.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);
    const currentBalance = computeBankBalance(bank);

    grid.innerHTML = `
        <div class="stmt-mini"><span>Opening balance</span><strong>${formatRF(bank.balance)}</strong></div>
        <div class="stmt-mini"><span>Current balance</span><strong class="${currentBalance >= 0 ? 'pos' : 'neg'}">${formatRF(currentBalance)}</strong></div>
        <div class="stmt-mini"><span>Money in (${rangeLabel(range)})</span><strong class="pos">${formatRF(rangeIn)}</strong></div>
        <div class="stmt-mini"><span>Money out (${rangeLabel(range)})</span><strong class="neg">${formatRF(rangeOut)}</strong></div>
    `;
}

const CHART_GREEN = '#111827';
const CHART_GREEN_SOFT = 'rgba(17,24,39,0.12)';
const CHART_BLUE = '#3b82f6';
const CHART_BLUE_SOFT = 'rgba(59,130,246,0.12)';

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
    const { tx } = getBankActivity(bank.id);
    const inSeries = buckets.map(bkt => tx.filter(t => t.type === 'Income' && bkt.match(t.date)).reduce((s, t) => s + t.amount, 0));
    const outSeries = buckets.map(bkt => tx.filter(t => t.type === 'Expense' && bkt.match(t.date)).reduce((s, t) => s + t.amount, 0));
    let runningBalance = Number(bank.balance || 0);
    const balanceSeries = buckets.map((_, index) => {
        runningBalance += (inSeries[index] || 0) - (outSeries[index] || 0);
        return runningBalance;
    });

    const scopedDeptSource = hasFullScope() ? transactionsDb : transactionsDb.filter(t => t.createdById === currentUser.id);
    const deptSource = scopedDeptSource.filter(t => dateInRange(t.date, range) || (!range.from && !range.to));
    const recordedDepartments = [...new Set(deptSource.map(t => t.department || 'ALL'))];
    const depts = currentScope.department === 'ALL'
        ? (recordedDepartments.length ? recordedDepartments : ['ALL'])
        : [currentScope.department];
    const incomeByDept = depts.map(d => deptSource.filter(t => t.department === d && t.type === 'Income').reduce((s, t) => s + t.amount, 0));
    const expenseByDept = depts.map(d => deptSource.filter(t => t.department === d && t.type === 'Expense').reduce((s, t) => s + t.amount, 0));
    const bankHasData = tx.length > 0 || Number(bank.balance || 0) !== 0;
    const deptHasData = incomeByDept.some(v => v !== 0) || expenseByDept.some(v => v !== 0);
    $('coa-bank-chart-empty').classList.toggle('hidden', bankHasData);
    $('coa-dept-chart-empty').classList.toggle('hidden', deptHasData);

    requestAnimationFrame(() => {
        const bankCtx = $('coa-bank-chart');
        if (bankCtx && typeof Chart !== 'undefined') {
            if (coaBankChart) coaBankChart.destroy();
            bankCtx.removeAttribute('width');
            bankCtx.removeAttribute('height');
            coaBankChart = new Chart(bankCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: buckets.map(b => b.label),
                    datasets: [
                        { type: 'line', label: 'Running balance', data: balanceSeries, borderColor: CHART_GREEN, backgroundColor: CHART_GREEN_SOFT, fill: true, tension: 0.28, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: '#fff', pointBorderColor: CHART_GREEN, pointBorderWidth: 2, borderWidth: 2.5, order: 0 },
                        { label: 'Money in', data: inSeries, backgroundColor: 'rgba(17,24,39,.78)', borderRadius: 5, maxBarThickness: 24, order: 1 },
                        { label: 'Money out', data: outSeries, backgroundColor: 'rgba(59,130,246,.72)', borderRadius: 5, maxBarThickness: 24, order: 2 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, resizeDelay: 120,
                    animation: { duration: 450 },
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 16 } },
                        tooltip: { callbacks: { label: context => `${context.dataset.label}: ${formatRF(context.parsed.y)}` } }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#eef1ee' }, ticks: { maxTicksLimit: 6, callback: v => formatRF(v) } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        const deptCtx = $('coa-dept-chart');
        if (deptCtx && typeof Chart !== 'undefined') {
            if (coaDeptChart) coaDeptChart.destroy();
            deptCtx.removeAttribute('width');
            deptCtx.removeAttribute('height');
            coaDeptChart = new Chart(deptCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: depts.map(d => d === 'ALL' ? 'All / Unassigned' : shortDeptName(d)),
                    datasets: [
                        { label: 'Income', data: incomeByDept, backgroundColor: CHART_GREEN, borderRadius: 8, maxBarThickness: 34 },
                        { label: 'Expense', data: expenseByDept, backgroundColor: CHART_BLUE, borderRadius: 8, maxBarThickness: 34 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, resizeDelay: 120,
                    animation: { duration: 450 },
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 16 } },
                        tooltip: { callbacks: { label: context => `${context.dataset.label}: ${formatRF(context.parsed.y)}` } }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#eef1ee' }, ticks: { maxTicksLimit: 6, callback: v => formatRF(v) } },
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
        if ($('view-reports') && $('view-reports').classList.contains('active')) renderReportPanel();
    }, 200);
});

function getReportTransactions() {
    const range = reportRange.preset === 'all' ? { from: '', to: '' } : computePresetRange(reportRange.preset, reportRange.from, reportRange.to);
    return transactionsDb.filter(tx => dateInRange(tx.date, range) || (!range.from && !range.to));
}

function renderReportCharts(list) {
    const recordedDepartments = [...new Set(list.map(t => t.department || 'ALL'))];
    const depts = currentScope.department === 'ALL'
        ? (recordedDepartments.length ? recordedDepartments : ['ALL'])
        : [currentScope.department];
    const incomeByDept = depts.map(d => list.filter(t => t.department === d && t.type === 'Income').reduce((s, t) => s + t.amount, 0));
    const expenseByDept = depts.map(d => list.filter(t => t.department === d && t.type === 'Expense').reduce((s, t) => s + t.amount, 0));

    const pieDepts = depts;
    const pieTotals = pieDepts.map(d => list.filter(t => t.department === d && t.type === 'Expense').reduce((s, t) => s + (t.amount || 0), 0));
    const pieHasData = pieTotals.some(v => v > 0);

    requestAnimationFrame(() => {
        const barCtx = $('report-dept-chart');
        if (barCtx && typeof Chart !== 'undefined') {
            if (reportDeptChart) reportDeptChart.destroy();
            reportDeptChart = new Chart(barCtx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: depts.map(d => d === 'ALL' ? 'All / Unassigned' : shortDeptName(d)),
                    datasets: [
                        { label: 'Income', data: incomeByDept, backgroundColor: CHART_GREEN, borderRadius: 8, maxBarThickness: 34 },
                        { label: 'Expense', data: expenseByDept, backgroundColor: CHART_BLUE, borderRadius: 8, maxBarThickness: 34 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: '#eef1ee' }, ticks: { callback: v => formatRF(v) } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        const pieCanvas = $('report-pie-chart');
        if (pieCanvas && typeof Chart !== 'undefined') {
            if (reportPieChart) reportPieChart.destroy();
            reportPieChart = new Chart(pieCanvas.getContext('2d'), {
                type: 'pie',
                data: {
                    labels: pieDepts.map(d => d === 'ALL' ? 'All / Unassigned' : shortDeptName(d)),
                    datasets: [{ data: pieHasData ? pieTotals : [1], backgroundColor: pieHasData ? pieDepts.map((_, i) => DEPT_CHART_COLORS[i % DEPT_CHART_COLORS.length]) : ['#e3e5e8'], borderWidth: 1, borderColor: '#fff' }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 10.5 } } }, tooltip: { enabled: pieHasData } }
                }
            });
        }
    });
}

function renderReportPanel() {
    const superVisible = hasFullScope();
    const scopeDesc = superVisible
        ? `Presbytery: [${currentScope.presbytery}] | Department: [${currentScope.department}]`
        : `Presbytery: [${currentUser.presbytery}] | Department: [${currentUser.department}] (locked to your assignment)`;
    $('statement-scope').textContent = `${scopeDesc} · Range: ${rangeLabel(reportRange.preset === 'all' ? { preset: 'all' } : computePresetRange(reportRange.preset, reportRange.from, reportRange.to))}`;
    $('stmt-generated-line').textContent = `Generated ${new Date().toLocaleString()} by ${currentUser.name} (${ROLE_LABELS[currentUser.role]})`;

    const list = getReportTransactions();
    let income = 0, expense = 0, transactionAssets = 0, transactionLiabilities = 0;
    list.forEach(tx => {
        if (tx.type === 'Income') income += tx.amount;
        if (tx.type === 'Expense') expense += tx.amount;
        if (tx.type === 'Asset') transactionAssets += tx.amount;
        if (tx.type === 'Liability') transactionLiabilities += tx.amount;
    });
    const costOfSales = list.filter(isCostOfSalesTransaction).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const operatingExpenses = Math.max(0, expense - costOfSales);
    const grossMargin = income - costOfSales;
    const netProfit = income - expense;
    const cashAssets = banksDb.filter(bank => bank.accountType !== 'Credit card').reduce((sum, bank) => sum + computeBankBalance(bank), 0);
    const otherAssets = accountsDb.filter(account => !account.linkedBankId && ['Accounts receivable (A/R)', 'Current assets', 'Fixed assets', 'Non-current assets'].includes(account.type)).reduce((sum, account) => sum + Number(account.balance || account.openingBalance || 0), 0) + transactionAssets;
    const assets = cashAssets + otherAssets;
    const accountLiabilities = accountsDb.filter(account => ['Credit card', 'Accounts payable (A/P)', 'Current liabilities', 'Non-current liabilities'].includes(account.type)).reduce((sum, account) => sum + Math.abs(Number(account.balance || account.openingBalance || 0)), 0);
    const liabilities = accountLiabilities + transactionLiabilities;
    const equity = assets - liabilities;

    $('stmt-income').textContent = formatRF(income);
    $('stmt-cost-sales').textContent = formatRF(costOfSales);
    $('stmt-gross-margin').textContent = formatRF(grossMargin);
    $('stmt-operating-expenses').textContent = formatRF(operatingExpenses);
    $('stmt-expenses').textContent = formatRF(expense);
    $('stmt-net').textContent = formatRF(netProfit);
    $('stmt-cash-assets').textContent = formatRF(cashAssets);
    $('stmt-other-assets').textContent = formatRF(otherAssets);
    $('stmt-assets').textContent = formatRF(assets);
    $('stmt-liabilities').textContent = formatRF(liabilities);
    $('stmt-equity').textContent = formatRF(equity);
    $('stmt-record-count').textContent = `${list.length} record${list.length === 1 ? '' : 's'} in this range`;

    renderReportCharts(list);
}

function isCostOfSalesTransaction(tx) {
    if (!tx || tx.type !== 'Expense') return false;
    const text = [tx.desc, tx.accountType, tx.detailType, tx.category, tx.lines].join(' ').toLowerCase();
    return /cost of sales|cost of goods|\bcogs\b|direct labour|direct labor|freight|materials - cos|supplies - cos/.test(text);
}

function openFinancialStatementDetail(type) {
    const labels = {
        Income: 'Revenue / Income details', Expense: 'Operating expense details',
        CostOfSales: 'Cost of sales details', OperatingExpense: 'Operating expense details',
        Asset: 'Current asset and bank details', Liability: 'Liability details'
    };
    const txRows = getReportTransactions()
        .filter(tx => type === 'CostOfSales' ? isCostOfSalesTransaction(tx) : type === 'OperatingExpense' ? tx.type === 'Expense' && !isCostOfSalesTransaction(tx) : tx.type === type)
        .map(tx => normalizeReportRecord('transactions', tx));
    const assetAccounts = accountsDb.filter(account => !account.linkedBankId && ['Accounts receivable (A/R)', 'Current assets', 'Fixed assets', 'Non-current assets'].includes(account.type));
    const liabilityAccounts = accountsDb.filter(account => ['Credit card', 'Accounts payable (A/P)', 'Current liabilities', 'Non-current liabilities'].includes(account.type));
    const rows = type === 'Asset'
        ? [...getVisibleBanks().filter(bank => bank.accountType !== 'Credit card').map(bank => ({ ...normalizeReportRecord('banks', bank), amount: computeBankBalance(bank), raw: bank })), ...assetAccounts.map(account => normalizeReportRecord('accounts', account)), ...txRows]
        : type === 'Liability' ? [...liabilityAccounts.map(account => normalizeReportRecord('accounts', account)), ...txRows] : txRows;
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    $('record-detail-title').textContent = labels[type] || `${type} details`;
    $('record-detail-body').innerHTML = `
        <div class="record-summary"><span class="module-chip">Financial statement</span><strong>${formatRF(total)}</strong></div>
        <p class="detail-intro">${rows.length} record${rows.length === 1 ? '' : 's'} make up this financial statement figure. Click a row to view every field saved for that record.</p>
        <div class="table-wrap"><table class="report-results-table"><thead><tr><th>Date</th><th>Source</th><th>Description</th><th>Reference</th><th class="num">Amount</th><th></th></tr></thead><tbody>
        ${rows.length ? rows.map((row, index) => `<tr class="financial-detail-row" data-index="${index}"><td>${escapeHtml(row.date || '—')}</td><td><span class="module-chip">${escapeHtml(REPORT_SOURCE_LABELS[row.source] || row.source)}</span></td><td><strong>${escapeHtml(row.name)}</strong></td><td>${escapeHtml(row.reference || '—')}</td><td class="num">${formatRF(row.amount)}</td><td><i class="fa-solid fa-eye"></i></td></tr>`).join('') : '<tr class="table-empty-row"><td colspan="6">No records are available for this figure and period.</td></tr>'}
        </tbody></table></div>`;
    qsa('.financial-detail-row', $('record-detail-body')).forEach(tr => {
        tr.addEventListener('click', () => openRecordDetail(rows[Number(tr.dataset.index)]));
    });
    openModal('record-detail-modal');
}

// ---------------------------------------------------------------------
// UNIVERSAL REPORT BUILDER — financial reports and every operational
// collection in the system share one drill-down experience.
// ---------------------------------------------------------------------
const REPORT_SOURCE_LABELS = {
    transactions: 'Transactions & expenses', invoices: 'Invoices', bills: 'Bills',
    banks: 'Bank accounts', accounts: 'Chart of accounts', customers: 'Customers',
    suppliers: 'Suppliers', projects: 'Projects', budgets: 'Budgets', journal: 'Journal entries',
    users: 'Users & roles'
};

function normalizeReportRecord(source, item) {
    const amount = Number(item.amount ?? item.balance ?? item.openingBalance ?? item.budget ?? item.totalDebit ?? 0);
    const date = item.date || item.billDate || item.asOfDate || item.startDate || '';
    const name = item.name || item.desc || item.number || item.journalNo || item.category || item.email || 'Record';
    const reference = item.ref || item.number || item.account || item.journalNo || item.id || '';
    const status = item.status || (item.active === false ? 'rejected' : 'approved');
    return { source, id: item.id || '', date, name, reference, amount, status, raw: item };
}

function reportSourceRecords(source) {
    const sources = {
        transactions: getReportTransactions(), invoices: invoicesDb, bills: billsDb,
        banks: getVisibleBanks(), accounts: accountsDb, customers: customersDb,
        suppliers: suppliersDb, projects: projectsDb, budgets: budgetsDb,
        journal: journalEntriesDb, users: usersDb
    };
    const normalizeSourceRow = (key, row) => key === 'banks'
        ? { ...normalizeReportRecord(key, row), amount: computeBankBalance(row), raw: row }
        : normalizeReportRecord(key, row);
    if (source === 'all') return Object.entries(sources).flatMap(([key, rows]) => rows.map(row => normalizeSourceRow(key, row)));
    return (sources[source] || []).map(row => normalizeSourceRow(source, row));
}

function getCustomReportRecords() {
    const source = $('custom-report-source').value;
    const term = $('custom-report-search').value.trim().toLowerCase();
    const status = $('custom-report-status').value;
    const sort = $('custom-report-sort').value;
    const range = reportRange.preset === 'all' ? { from: '', to: '' } : computePresetRange(reportRange.preset, reportRange.from, reportRange.to);
    let rows = reportSourceRecords(source).filter(r => {
        if (r.date && !dateInRange(r.date, range) && (range.from || range.to)) return false;
        if (status !== 'ALL' && r.status !== status) return false;
        if (!term) return true;
        return JSON.stringify(r.raw).toLowerCase().includes(term) || r.name.toLowerCase().includes(term) || String(r.reference).toLowerCase().includes(term);
    });
    rows.sort((a, b) => {
        if (sort === 'date-asc') return String(a.date).localeCompare(String(b.date));
        if (sort === 'amount-desc') return b.amount - a.amount;
        if (sort === 'amount-asc') return a.amount - b.amount;
        if (sort === 'name') return a.name.localeCompare(b.name);
        return String(b.date).localeCompare(String(a.date));
    });
    return rows;
}

function renderCustomReport() {
    const rows = getCustomReportRecords();
    const wrap = $('custom-report-results');
    const source = $('custom-report-source').value;
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    wrap.innerHTML = `
        <div class="custom-report-head">
            <div><span class="eyebrow">SAS SYSTEM REPORT</span><h3>${escapeHtml(source === 'all' ? 'All system activity' : REPORT_SOURCE_LABELS[source])}</h3><p>${rows.length} record${rows.length === 1 ? '' : 's'} · Generated ${new Date().toLocaleString()}</p></div>
            <div class="custom-report-total"><span>Total value</span><strong>${formatRF(total)}</strong></div>
        </div>
        <div class="custom-report-chart"><div class="chart-box-title"><i class="fa-solid fa-chart-column"></i> Report values overview</div><div class="chart-canvas-wrap"><canvas id="custom-report-chart"></canvas></div></div>
        <div class="table-wrap"><table class="report-results-table"><thead><tr><th>Date</th><th>Module</th><th>Name / Description</th><th>Reference</th><th>Status</th><th class="num">Amount</th><th></th></tr></thead><tbody>
        ${rows.length ? rows.map((r, index) => `<tr class="report-record-row" data-report-index="${index}"><td>${escapeHtml(r.date || '—')}</td><td><span class="module-chip">${escapeHtml(REPORT_SOURCE_LABELS[r.source] || r.source)}</span></td><td><strong>${escapeHtml(r.name)}</strong></td><td>${escapeHtml(r.reference || '—')}</td><td>${statusPill(r.status)}</td><td class="num">${formatRF(r.amount)}</td><td><button type="button" class="icon-action-btn" title="View details"><i class="fa-solid fa-eye"></i></button></td></tr>`).join('') : '<tr class="table-empty-row"><td colspan="7">No records match your report choices.</td></tr>'}
        </tbody></table></div>`;
    wrap.classList.remove('hidden');
    wrap.dataset.rows = 'ready';
    qsa('.report-record-row', wrap).forEach(tr => tr.addEventListener('click', () => openRecordDetail(rows[Number(tr.dataset.reportIndex)])));
    requestAnimationFrame(() => {
        const canvas = $('custom-report-chart');
        if (!canvas || typeof Chart === 'undefined') return;
        if (customReportChart) customReportChart.destroy();
        const chartRows = [...rows].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, 12);
        customReportChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: chartRows.length ? chartRows.map(row => row.name.length > 28 ? row.name.slice(0, 28) + '…' : row.name) : ['No valued records'],
                datasets: [{ label: 'Amount (RF)', data: chartRows.length ? chartRows.map(row => row.amount) : [0], backgroundColor: chartRows.map((_, i) => DEPT_CHART_COLORS[i % DEPT_CHART_COLORS.length]), borderRadius: 7, maxBarThickness: 34 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, indexAxis: chartRows.length > 6 ? 'y' : 'x',
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => formatRF(context.raw) } } },
                scales: chartRows.length > 6
                    ? { x: { beginAtZero: true, grid: { color: '#eef1ee' }, ticks: { callback: value => formatRF(value) } }, y: { grid: { display: false } } }
                    : { y: { beginAtZero: true, grid: { color: '#eef1ee' }, ticks: { callback: value => formatRF(value) } }, x: { grid: { display: false } } }
            }
        });
    });
}

let activeReportDetailRecord = null;

function openRecordDetail(record) {
    if (!record) return;
    activeReportDetailRecord = record;
    $('record-detail-title').textContent = record.name;
    const ignored = new Set(['id', 'createdAt', 'updatedAt']);
    const fields = Object.entries(record.raw).filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null && value !== '');
    $('record-detail-body').innerHTML = `<div class="record-summary"><span class="module-chip">${escapeHtml(REPORT_SOURCE_LABELS[record.source] || record.source)}</span><strong>${formatRF(record.amount)}</strong></div><div class="detail-grid">${fields.map(([key, value]) => `<div class="detail-field"><span>${escapeHtml(key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()))}</span><strong>${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : String(value))}</strong></div>`).join('')}</div>`;
    openModal('record-detail-modal');
}

function openAndManageReportRecord(record) {
    if (!record) return;
    closeModal('record-detail-modal');
    const raw = record.raw || {};
    if (record.source === 'transactions') {
        switchView('transactions');
        if (raw.entryForm === 'expense') openExpenseModal(raw);
        else if (raw.entryForm === 'deposit') openDepositModal(raw);
        else openTxModal(raw);
    } else if (record.source === 'invoices') { switchView('invoices'); openInvoiceModal(raw); }
    else if (record.source === 'bills') { switchView('bills'); openBillModal(raw); }
    else if (record.source === 'banks') { switchView('banks'); openBankModal(raw); }
    else if (record.source === 'accounts') { switchView('coa'); openAccountModal(raw); }
    else if (record.source === 'customers') { switchView('customers'); openCustomerModal(raw); }
    else if (record.source === 'suppliers') { switchView('suppliers'); openSupplierModal(raw); }
    else if (record.source === 'projects') { switchView('projects'); openProjectModal(raw); }
    else if (record.source === 'budgets') { switchView('budgets'); openBudgetModal(raw); }
    else if (record.source === 'journal') { switchView('journal'); showToast('info', `Journal ${raw.journalNo || record.reference} is now visible in the journal list.`); }
    else if (record.source === 'users') { switchView('users'); showToast('info', `${raw.name || record.name} is now visible in User Management.`); }
}

function setReportMode(mode) {
    qsa('.reports-side-item[data-report-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.reportMode === mode));
    const custom = mode !== 'financial';
    $('custom-report-builder').classList.toggle('hidden', !custom);
    $('printable-report').classList.toggle('hidden', custom);
    qsa('#view-reports .ext-grid-wide').forEach(el => el.classList.toggle('hidden', custom));
    if (custom) {
        if (mode === 'activity') $('custom-report-source').value = 'all';
        if (mode === 'management') $('custom-report-source').value = 'projects';
        renderCustomReport();
    } else $('custom-report-results').classList.add('hidden');
}

function setupCustomReports() {
    qsa('.reports-side-item[data-report-mode]').forEach(btn => btn.addEventListener('click', () => setReportMode(btn.dataset.reportMode)));
    $('run-custom-report').addEventListener('click', renderCustomReport);
    ['custom-report-source', 'custom-report-sort', 'custom-report-status'].forEach(id => $(id).addEventListener('change', renderCustomReport));
    $('custom-report-search').addEventListener('input', renderCustomReport);
    $('close-record-detail').addEventListener('click', () => closeModal('record-detail-modal'));
    $('done-record-detail').addEventListener('click', () => closeModal('record-detail-modal'));
    $('manage-record-detail').addEventListener('click', () => openAndManageReportRecord(activeReportDetailRecord));
    $('record-detail-modal').addEventListener('click', e => { if (e.target === $('record-detail-modal')) closeModal('record-detail-modal'); });
    $('print-record-detail').addEventListener('click', () => window.print());
}

function renderPendingApprovals() {
    if (!currentUser) return;
    const wrap = $('pending-approvals-wrap');
    const grid = $('pending-approvals-grid');
    const items = [];

    if (isSuper()) {
        invoicesDb.filter(i => i.status === 'pending_approval').forEach(i => items.push({ type: 'Invoice', label: i.number, sub: i.customerName, amount: i.amount, id: i.id, kind: 'invoice' }));
        billsDb.filter(b => b.status === 'pending_approval').forEach(b => items.push({ type: 'Bill', label: b.number, sub: b.supplierName, amount: b.amount, id: b.id, kind: 'bill' }));
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
        card.addEventListener('click', () => switchView(it.kind === 'invoice' ? 'invoices' : 'bills'));
        grid.appendChild(card);
    });
}

function setupQbModalsEventListeners() {
    $('close-expense-modal').addEventListener('click', () => closeModal('expense-modal'));
    $('expense-modal').addEventListener('click', (e) => { if (e.target === $('expense-modal')) closeModal('expense-modal'); });
    $('expense-form').addEventListener('submit', onSubmitExpenseForm);
    $('exp-save-btn').addEventListener('click', () => { expenseSaveMode = 'stay'; $('expense-form').requestSubmit(); });
    $('exp-save-new-btn').addEventListener('click', () => { expenseSaveMode = 'new'; $('expense-form').requestSubmit(); });
    $('exp-submit-btn').addEventListener('click', () => { expenseSaveMode = 'close'; });
    $('exp-add-line-btn').addEventListener('click', () => { addExpenseLine(); });
    $('exp-clear-lines-btn').addEventListener('click', () => { $('exp-lines-body').innerHTML = ''; for (let i = 0; i < 4; i++) addExpenseLine(); updateExpenseTotals(); });

    $('close-deposit-modal').addEventListener('click', () => closeModal('deposit-modal'));
    $('deposit-modal').addEventListener('click', (e) => { if (e.target === $('deposit-modal')) closeModal('deposit-modal'); });
    $('deposit-form').addEventListener('submit', onSubmitDepositForm);
    $('deposit-save-btn').addEventListener('click', () => { depositSaveMode = 'stay'; $('deposit-form').requestSubmit(); });
    $('deposit-save-new-btn').addEventListener('click', () => { depositSaveMode = 'new'; $('deposit-form').requestSubmit(); });
    $('deposit-submit-btn').addEventListener('click', () => { depositSaveMode = 'close'; });
    $('deposit-add-line-btn').addEventListener('click', () => { addDepositLine(); });
    $('deposit-clear-lines-btn').addEventListener('click', () => { $('deposit-lines-body').innerHTML = ''; for (let i = 0; i < 4; i++) addDepositLine(); updateDepositTotals(); });

    $('close-journal-modal').addEventListener('click', () => closeModal('journal-modal'));
    $('journal-modal').addEventListener('click', (e) => { if (e.target === $('journal-modal')) closeModal('journal-modal'); });
    $('journal-form').addEventListener('submit', onSubmitJournalForm);
    $('journal-save-new-btn').addEventListener('click', async (e) => { await onSubmitJournalForm(e, true); });
    $('journal-add-line-btn').addEventListener('click', () => { addJournalLine(); });
    $('journal-clear-lines-btn').addEventListener('click', () => { $('journal-lines-body').innerHTML = ''; for (let i = 0; i < 4; i++) addJournalLine(); updateJournalTotals(); });
}

function renumberLines(tbodyId) {
    const tbody = $(tbodyId);
    qsa('tr', tbody).forEach((tr, i) => {
        const number = tr.querySelector('.line-number');
        if (number) number.textContent = i + 1;
    });
}

const referenceSequenceFloor = {};

function nextSequentialReference(prefix, records = transactionsDb) {
    const matcher = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    const highest = records.reduce((max, record) => {
        const candidates = [record.ref, record.reference, record.number, record.journalNo];
        const found = candidates.map(value => String(value || '').match(matcher)).find(Boolean);
        return found ? Math.max(max, Number(found[1]) || 0) : max;
    }, Number(referenceSequenceFloor[prefix] || 0));
    return `${prefix}-${String(highest + 1).padStart(6, '0')}`;
}

function markReferenceUsed(reference) {
    const match = String(reference || '').match(/^([A-Z]+)-(\d+)/i);
    if (!match) return;
    const prefix = match[1].toUpperCase();
    referenceSequenceFloor[prefix] = Math.max(Number(referenceSequenceFloor[prefix] || 0), Number(match[2]) || 0);
}

function setupCustomerProjectSelect(select, selectedValue = '') {
    if (!select) return;
    select.innerHTML = '<option value="">-- Customer / Project --</option>';
    const addOption = document.createElement('option');
    addOption.value = '__ADD_NEW_CUSTOMER__';
    addOption.textContent = '+ Add new customer';
    select.appendChild(addOption);
    customersDb.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.name;
        option.textContent = customer.name;
        select.appendChild(option);
    });
    projectsDb.forEach(project => {
        const option = document.createElement('option');
        option.value = project.name;
        option.textContent = `${project.name} (Project)`;
        select.appendChild(option);
    });
    if (selectedValue) select.value = selectedValue;
    select.addEventListener('change', () => {
        if (select.value !== '__ADD_NEW_CUSTOMER__') return;
        select.value = '';
        openCustomerModal(null, { onCreated: customer => {
            const option = document.createElement('option');
            option.value = customer.name;
            option.textContent = customer.name;
            select.appendChild(option);
            select.value = customer.name;
        }});
    });
}

function setupCustomerOnlySelect(select, selectedValue = '') {
    if (!select) return;
    select.innerHTML = '<option value="">-- Received from (Customer) --</option>';
    const addOption = document.createElement('option');
    addOption.value = '__ADD_NEW_CUSTOMER__';
    addOption.textContent = '+ Add new customer';
    select.appendChild(addOption);
    customersDb.forEach(customer => {
        const option = document.createElement('option');
        option.value = customer.name;
        option.textContent = customer.name;
        select.appendChild(option);
    });
    if (selectedValue) select.value = selectedValue;
    select.addEventListener('change', () => {
        if (select.value !== '__ADD_NEW_CUSTOMER__') return;
        select.value = '';
        openCustomerModal(null, { onCreated: customer => {
            const option = document.createElement('option');
            option.value = customer.name;
            option.textContent = customer.name;
            select.appendChild(option);
            select.value = customer.name;
        }});
    });
}

let activeExpenseEditId = '';
let activeDepositEditId = '';
let expenseSaveMode = 'close';
let depositSaveMode = 'close';

// ---------------------------------------------------------------------
// EXPENSE — each line now picks a Bank Account (not a Chart-of-Accounts
// category). The line's amount is deducted from whichever bank that line
// points to; a single Expense can therefore be split across several banks.
// ---------------------------------------------------------------------
function addExpenseLine(afterRow = null) {
    const tbody = $('exp-lines-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="line-sequence-cell"><div class="line-sequence-control"><button type="button" class="line-insert-btn" title="Insert a new row below" aria-label="Insert row below"><i class="fa-solid fa-plus"></i></button><span class="line-number">${tbody.children.length + 1}</span></div></td>
        <td>
            <div class="acct-combo line-bank-combo">
                <input type="text" class="line-bank-input" placeholder="-- Account name --" autocomplete="off">
                <input type="hidden" class="line-bank-id">
                <div class="acct-dropdown hidden line-bank-dropdown"></div>
            </div>
        </td>
        <td><input type="text" class="line-desc" placeholder="Description"></td>
        <td><input type="number" class="line-amount" step="any" min="0" placeholder="0.00"></td>
        <td><select class="line-vat"></select></td>
        <td style="text-align:center;"><input type="checkbox" class="line-billable"></td>
        <td><select class="line-customer"></select></td>
        <td><select class="line-class"></select></td>
        <td><div class="row-actions"><button type="button" class="icon-action-btn line-edit-btn" title="Edit this line"><i class="fa-solid fa-pen"></i></button><button type="button" class="icon-action-btn danger-hover line-delete-btn" title="Delete"><i class="fa-solid fa-trash"></i></button></div></td>`;
    setupLineBankCombobox(tr);
    fillSimpleSelect(tr.querySelector('.line-vat'), VAT_OPTIONS, true, '-- VAT --');
    setupCustomerProjectSelect(tr.querySelector('.line-customer'));
    fillOptGroupedSelect(tr.querySelector('.line-class'), getAllSubsectionsFlat(), true);
    tr.querySelector('.line-amount').addEventListener('input', updateExpenseTotals);
    tr.querySelector('.line-insert-btn').addEventListener('click', () => addExpenseLine(tr));
    tr.querySelector('.line-edit-btn').addEventListener('click', () => { tr.classList.add('line-editing'); tr.querySelector('.line-bank-input').focus(); });
    tr.querySelector('.line-delete-btn').addEventListener('click', () => { tr.remove(); renumberLines('exp-lines-body'); updateExpenseTotals(); });
    if (afterRow && afterRow.parentNode === tbody) afterRow.insertAdjacentElement('afterend', tr); else tbody.appendChild(tr);
    renumberLines('exp-lines-body');
    return tr;
}

function updateExpenseHeaderBalance(bank) {
    if (!bank) return;
    const current = getActionAccountBalance(bank);
    $('exp-amount-display').dataset.bankBalance = current;
    $('exp-balance-preview').classList.remove('hidden');
    $('exp-current-balance').textContent = formatRF(current);
    updateExpenseTotals();
}

function updateExpenseTotals() {
    const rows = qsa('#exp-lines-body tr');
    let total = 0;
    rows.forEach(tr => { const v = parseFloat(tr.querySelector('.line-amount').value); if (!isNaN(v)) total += v; });
    $('exp-subtotal').textContent = formatRF(total);
    $('exp-total').textContent = formatRF(total);
    $('exp-amount-display').textContent = formatRF(total);
    const current = Number($('exp-amount-display').dataset.bankBalance || 0);
    const hasBank = !!$('exp-bank-id').value;
    $('exp-balance-preview').classList.toggle('hidden', !hasBank);
    $('exp-current-balance').textContent = formatRF(current);
    const projected = $('exp-projected-balance');
    if (projected) {
        if ('value' in projected) projected.value = String(current - total);
        else {
            projected.textContent = formatRF(current - total);
            projected.classList.toggle('negative-balance', current - total < 0);
        }
    }
}

function openExpenseModal(editRecord) {
    $('expense-form').reset();
    activeExpenseEditId = editRecord ? editRecord.id : '';
    expenseSaveMode = 'close';
    $('exp-date').value = editRecord?.date || new Date().toISOString().split('T')[0];
    resetAccountCombobox('exp');
    delete $('exp-amount-display').dataset.bankBalance;
    $('exp-balance-preview').classList.add('hidden');
    const defaultExpenseAccount = getSelectableActionAccounts()[0];
    if (!editRecord && defaultExpenseAccount) {
        prefillAccountCombobox('exp', defaultExpenseAccount.id);
        updateExpenseHeaderBalance(defaultExpenseAccount);
    }
    const payeeInput = $('exp-payee-search'), payeeHidden = $('exp-payee-id');
    if (payeeInput) payeeInput.value = '';
    if (payeeHidden) payeeHidden.value = '';
    const locInput = $('exp-location-search'), locHidden = $('exp-location-id');
    if (locInput) locInput.value = '';
    if (locHidden) locHidden.value = '';
    $('exp-lines-body').innerHTML = '';
    $('exp-ref').value = editRecord?.ref || nextSequentialReference('EXP');
    $('exp-method').value = editRecord?.method || '';
    if (editRecord?.bankId) {
        prefillAccountCombobox('exp', editRecord.bankId);
        const bank = findSelectableActionAccount(editRecord.bankId);
        if (bank) updateExpenseHeaderBalance(bank);
    }
    if (editRecord?.payee) $('exp-payee-search').value = editRecord.payee;
    if (editRecord?.location) $('exp-location-search').value = editRecord.location;
    const savedLines = editRecord ? parseLines(editRecord) : [];
    const rowCount = Math.max(4, savedLines.length);
    for (let i = 0; i < rowCount; i++) {
        const tr = addExpenseLine();
        const line = savedLines[i];
        if (!line) continue;
        const bank = findSelectableActionAccount(line.bankId);
        tr.querySelector('.line-bank-id').value = line.bankId || '';
        tr.querySelector('.line-bank-input').value = bank ? formatBankLabel(bank) : (line.bankName || '');
        tr.querySelector('.line-desc').value = line.description || '';
        tr.querySelector('.line-amount').value = line.amount || '';
        tr.querySelector('.line-vat').value = line.vat || '';
        tr.querySelector('.line-billable').checked = !!line.billable;
        setupCustomerProjectSelect(tr.querySelector('.line-customer'), line.customerProject || '');
        tr.querySelector('.line-class').value = line.class || '';
    }
    $('exp-submit-btn').textContent = activeExpenseEditId ? 'Update and close' : 'Save and close';
    updateExpenseTotals();
    openModal('expense-modal');
}

async function onSubmitExpenseForm(e) {
    e.preventDefault();
    // The header "Payment account" is the default/primary account shown on
    // the record; if a line doesn't have its own bank chosen, its amount
    // falls back to being deducted from this header account.
    const headerAcct = readAccountCombobox('exp');
    if (!headerAcct.bankId && !validateAccountCombobox('exp')) {
        showToast('error', 'Please choose a payment account, or set a Bank account on each line.');
        return;
    }

    const lines = [];
    qsa('#exp-lines-body tr').forEach(tr => {
        const bank = readLineBank(tr);
        const desc = tr.querySelector('.line-desc').value.trim();
        const amount = parseFloat(tr.querySelector('.line-amount').value) || 0;
        if (!bank.bankId && !desc && !amount) return;
        lines.push({
            bankId: bank.bankId || headerAcct.bankId, bankName: bank.bankName || headerAcct.bankName,
            description: desc, amount,
            vat: tr.querySelector('.line-vat').value,
            billable: tr.querySelector('.line-billable').checked,
            customerProject: tr.querySelector('.line-customer').value,
            class: tr.querySelector('.line-class').value
        });
    });
    const total = lines.reduce((s, l) => s + l.amount, 0);
    if (!lines.length || total <= 0) { showToast('error', 'Add at least one line with a bank account and an amount.'); return; }

    const scope = hasFullScope()
        ? { department: currentScope.department !== 'ALL' ? currentScope.department : (lines[0].class ? Object.keys(EPR_STRUCTURE).find(d => EPR_STRUCTURE[d].includes(lines[0].class)) : 'ALL') || 'ALL', subsection: lines[0].class || 'ALL', presbytery: $('exp-location-id').value || currentScope.presbytery }
        : { department: currentUser.department, subsection: currentUser.subsection, presbytery: currentUser.presbytery };

    const payload = sanitizePayload({
        date: $('exp-date').value || new Date().toISOString().split('T')[0],
        type: 'Expense',
        desc: lines[0].description || `Expense — ${lines[0].bankName || 'multiple accounts'}`,
        amount: total,
        payee: $('exp-payee-search').value || '',
        method: $('exp-method').value || '',
        ref: $('exp-ref').value.trim(),
        entryForm: 'expense',
        location: $('exp-location-search').value || '',
        bankId: headerAcct.bankId, bankName: headerAcct.bankName,
        lines: JSON.stringify(lines),
        ...scope
    });

    const expenseButtons = ['exp-save-btn', 'exp-save-new-btn', 'exp-submit-btn'].map(id => $(id));
    expenseButtons.forEach(button => button.disabled = true);
    try {
        let savedId = activeExpenseEditId;
        if (activeExpenseEditId) await updateDoc(doc(db, COLLECTIONS.TRANSACTIONS, activeExpenseEditId), { ...payload, ...updateMeta() });
        else {
            const savedRef = await addDoc(collection(db, COLLECTIONS.TRANSACTIONS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() }));
            savedId = savedRef.id;
        }
        markReferenceUsed(payload.ref);
        showToast('success', `Expense ${payload.ref} ${activeExpenseEditId ? 'updated' : 'saved'}.`);
        if (expenseSaveMode === 'close') closeModal('expense-modal');
        else if (expenseSaveMode === 'new') openExpenseModal();
        else {
            activeExpenseEditId = savedId;
            $('exp-submit-btn').textContent = 'Update and close';
        }
    } catch (err) { showToast('error', "Couldn't save expense: " + err.message); }
    finally { expenseButtons.forEach(button => button.disabled = false); }
}

// ---------------------------------------------------------------------
// BANK DEPOSIT — each line also picks the Bank Account the funds land in,
// so a single deposit slip can fund several bank accounts at once.
// ---------------------------------------------------------------------
function addDepositLine(afterRow = null) {
    const tbody = $('deposit-lines-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="line-sequence-cell"><div class="line-sequence-control"><button type="button" class="line-insert-btn" title="Insert a new row below" aria-label="Insert row below"><i class="fa-solid fa-plus"></i></button><span class="line-number">${tbody.children.length + 1}</span></div></td>
        <td><select class="line-received"></select></td>
        <td>
            <div class="acct-combo line-bank-combo">
                <input type="text" class="line-bank-input" placeholder="-- Account name --" autocomplete="off">
                <input type="hidden" class="line-bank-id">
                <div class="acct-dropdown hidden line-bank-dropdown"></div>
            </div>
        </td>
        <td><input type="text" class="line-desc" placeholder="Description"></td>
        <td><select class="line-method"></select></td>
        <td><input type="text" class="line-ref" placeholder="Ref no."></td>
        <td><input type="number" class="line-amount" step="any" min="0" placeholder="0.00"></td>
        <td><select class="line-vat"></select></td>
        <td><select class="line-class"></select></td>
        <td><div class="row-actions"><button type="button" class="icon-action-btn line-edit-btn" title="Edit this line"><i class="fa-solid fa-pen"></i></button><button type="button" class="icon-action-btn danger-hover line-delete-btn" title="Delete"><i class="fa-solid fa-trash"></i></button></div></td>`;
    setupCustomerOnlySelect(tr.querySelector('.line-received'));
    setupLineBankCombobox(tr);
    fillSimpleSelect(tr.querySelector('.line-method'), PAYMENT_METHODS, true, '-- Method --');
    fillSimpleSelect(tr.querySelector('.line-vat'), VAT_OPTIONS, true, '-- VAT --');
    fillOptGroupedSelect(tr.querySelector('.line-class'), getAllSubsectionsFlat(), true);
    tr.querySelector('.line-amount').addEventListener('input', updateDepositTotals);
    tr.querySelector('.line-insert-btn').addEventListener('click', () => addDepositLine(tr));
    tr.querySelector('.line-edit-btn').addEventListener('click', () => { tr.classList.add('line-editing'); tr.querySelector('.line-bank-input').focus(); });
    tr.querySelector('.line-delete-btn').addEventListener('click', () => { tr.remove(); renumberLines('deposit-lines-body'); updateDepositTotals(); });
    if (afterRow && afterRow.parentNode === tbody) afterRow.insertAdjacentElement('afterend', tr); else tbody.appendChild(tr);
    renumberLines('deposit-lines-body');
    return tr;
}

function updateDepositHeaderBalance(bank) {
    if (!bank) return;
    const current = getActionAccountBalance(bank);
    $('deposit-amount-display').dataset.bankBalance = current;
    $('deposit-balance-preview').classList.remove('hidden');
    $('deposit-current-balance').textContent = formatRF(current);
    updateDepositTotals();
}

function updateDepositTotals() {
    const rows = qsa('#deposit-lines-body tr');
    let total = 0;
    rows.forEach(tr => { const v = parseFloat(tr.querySelector('.line-amount').value); if (!isNaN(v)) total += v; });
    $('deposit-funds-total').textContent = formatRF(total);
    $('deposit-amount-display').textContent = formatRF(total);
    const current = Number($('deposit-amount-display').dataset.bankBalance || 0);
    const hasBank = !!$('deposit-bank-id').value;
    $('deposit-balance-preview').classList.toggle('hidden', !hasBank);
    $('deposit-current-balance').textContent = formatRF(current);
    const projected = $('deposit-projected-balance');
    if (projected) {
        if ('value' in projected) projected.value = String(current + total);
        else projected.textContent = formatRF(current + total);
    }
}

function openDepositModal(editRecord) {
    $('deposit-form').reset();
    activeDepositEditId = editRecord ? editRecord.id : '';
    depositSaveMode = 'close';
    $('deposit-date').value = editRecord?.date || new Date().toISOString().split('T')[0];
    resetAccountCombobox('deposit');
    delete $('deposit-amount-display').dataset.bankBalance;
    $('deposit-balance-preview').classList.add('hidden');
    const defaultDepositAccount = getSelectableActionAccounts()[0];
    if (!editRecord && defaultDepositAccount) {
        prefillAccountCombobox('deposit', defaultDepositAccount.id);
        updateDepositHeaderBalance(defaultDepositAccount);
    }
    $('deposit-lines-body').innerHTML = '';
    if (editRecord?.bankId) {
        prefillAccountCombobox('deposit', editRecord.bankId);
        const bank = findSelectableActionAccount(editRecord.bankId);
        if (bank) updateDepositHeaderBalance(bank);
    }
    const savedLines = editRecord ? parseLines(editRecord) : [];
    const baseRef = editRecord?.ref || nextSequentialReference('DEP');
    const rowCount = Math.max(4, savedLines.length);
    for (let i = 0; i < rowCount; i++) {
        const tr = addDepositLine();
        const line = savedLines[i];
        if (line) {
            tr.querySelector('.line-received').value = line.receivedFrom || '';
            const bank = findSelectableActionAccount(line.bankId);
            tr.querySelector('.line-bank-id').value = line.bankId || '';
            tr.querySelector('.line-bank-input').value = bank ? formatBankLabel(bank) : (line.bankName || '');
            tr.querySelector('.line-desc').value = line.description || '';
            tr.querySelector('.line-method').value = line.method || '';
            tr.querySelector('.line-ref').value = line.ref || `${baseRef}-${String(i + 1).padStart(2, '0')}`;
            tr.querySelector('.line-amount').value = line.amount || '';
            tr.querySelector('.line-vat').value = line.vat || '';
            tr.querySelector('.line-class').value = line.class || '';
        } else tr.querySelector('.line-ref').value = `${baseRef}-${String(i + 1).padStart(2, '0')}`;
    }
    $('deposit-submit-btn').textContent = activeDepositEditId ? 'Update and close' : 'Save and close';
    updateDepositTotals();
    openModal('deposit-modal');
}

async function onSubmitDepositForm(e) {
    e.preventDefault();
    const headerAcct = readAccountCombobox('deposit');
    if (!headerAcct.bankId && !validateAccountCombobox('deposit')) {
        showToast('error', 'Please choose an account, or set a Bank account on each line.');
        return;
    }

    const lines = [];
    qsa('#deposit-lines-body tr').forEach(tr => {
        const receivedFrom = tr.querySelector('.line-received').value;
        const bank = readLineBank(tr);
        const desc = tr.querySelector('.line-desc').value.trim();
        const amount = parseFloat(tr.querySelector('.line-amount').value) || 0;
        if (!receivedFrom && !bank.bankId && !desc && !amount) return;
        lines.push({
            receivedFrom, bankId: bank.bankId || headerAcct.bankId, bankName: bank.bankName || headerAcct.bankName,
            description: desc,
            method: tr.querySelector('.line-method').value,
            ref: tr.querySelector('.line-ref').value.trim(),
            amount, vat: tr.querySelector('.line-vat').value,
            class: tr.querySelector('.line-class').value
        });
    });
    const total = lines.reduce((s, l) => s + l.amount, 0);
    if (!lines.length || total <= 0) { showToast('error', 'Add at least one funds line with a bank account and an amount.'); return; }

    const scope = hasFullScope()
        ? { department: currentScope.department !== 'ALL' ? currentScope.department : 'ALL', subsection: lines[0].class || 'ALL', presbytery: currentScope.presbytery }
        : { department: currentUser.department, subsection: currentUser.subsection, presbytery: currentUser.presbytery };

    const payload = sanitizePayload({
        date: $('deposit-date').value || new Date().toISOString().split('T')[0],
        type: 'Income',
        desc: lines[0].description || `Deposit from ${lines[0].receivedFrom || 'various'}`,
        amount: total,
        ref: (lines[0]?.ref || '').replace(/-\d{2}$/, '') || nextSequentialReference('DEP'),
        entryForm: 'deposit',
        bankId: headerAcct.bankId, bankName: headerAcct.bankName,
        lines: JSON.stringify(lines),
        ...scope
    });

    const depositButtons = ['deposit-save-btn', 'deposit-save-new-btn', 'deposit-submit-btn'].map(id => $(id));
    depositButtons.forEach(button => button.disabled = true);
    try {
        let savedId = activeDepositEditId;
        if (activeDepositEditId) await updateDoc(doc(db, COLLECTIONS.TRANSACTIONS, activeDepositEditId), { ...payload, ...updateMeta() });
        else {
            const savedRef = await addDoc(collection(db, COLLECTIONS.TRANSACTIONS), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() }));
            savedId = savedRef.id;
        }
        markReferenceUsed(payload.ref);
        showToast('success', `Deposit ${payload.ref} ${activeDepositEditId ? 'updated' : 'saved'}.`);
        if (depositSaveMode === 'close') closeModal('deposit-modal');
        else if (depositSaveMode === 'new') openDepositModal();
        else {
            activeDepositEditId = savedId;
            $('deposit-submit-btn').textContent = 'Update and close';
        }
    } catch (err) { showToast('error', "Couldn't save deposit: " + err.message); }
    finally { depositButtons.forEach(button => button.disabled = false); }
}

// ---------------------------------------------------------------------
// JOURNAL ENTRY — double-entry lines. Debits and Credits are OPTIONAL and
// do NOT need to match to save: a live pill shows whether the entry is
// currently balanced, purely as a helpful indicator, never as a blocker.
// ---------------------------------------------------------------------
function getJournalAccountOptions() {
    const list = ['Accounts Receivable (A/R)', 'Accounts Payable (A/P)'];
    banksDb.forEach(b => list.push(formatBankLabel(b)));
    accountsDb.forEach(a => list.push(formatAccountLabel(a)));
    projectsDb.forEach(p => list.push(`${p.name} (Project)`));
    return list;
}
function formatAccountLabel(a) {
    return `${a.name} · ${a.type || 'Account'} · ${a.detailType || 'General'} · ${formatRF(a.balance || 0)}`;
}

function addJournalLine(afterRow = null) {
    const tbody = $('journal-lines-body');
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td class="line-sequence-cell"><div class="line-sequence-control"><button type="button" class="line-insert-btn" title="Insert a new row below" aria-label="Insert row below"><i class="fa-solid fa-plus"></i></button><span class="line-number">${tbody.children.length + 1}</span></div></td>
        <td><select class="line-account"></select></td>
        <td><input type="number" class="line-debit" step="any" min="0" placeholder="0.00"></td>
        <td><input type="number" class="line-credit" step="any" min="0" placeholder="0.00"></td>
        <td><input type="text" class="line-desc" placeholder="Description"></td>
        <td><select class="line-name"></select></td>
        <td><select class="line-vat"></select></td>
        <td><select class="line-location"></select></td>
        <td><select class="line-class"></select></td>
        <td><div class="row-actions"><button type="button" class="icon-action-btn line-edit-btn" title="Edit this line"><i class="fa-solid fa-pen"></i></button><button type="button" class="icon-action-btn danger-hover line-delete-btn" title="Delete"><i class="fa-solid fa-trash"></i></button></div></td>`;
    const accountSelect = tr.querySelector('.line-account');
    fillSimpleSelect(accountSelect, getJournalAccountOptions(), true, '-- Account --');
    const addAccountOption = document.createElement('option');
    addAccountOption.value = '__ADD_NEW_ACCOUNT__';
    addAccountOption.textContent = '+ Add new account';
    accountSelect.insertBefore(addAccountOption, accountSelect.options[1] || null);
    accountSelect.addEventListener('change', () => {
        if (accountSelect.value !== '__ADD_NEW_ACCOUNT__') return;
        accountSelect.value = '';
        openAccountModal(null, {
            onCreated: account => {
                const label = formatAccountLabel(account);
                const option = document.createElement('option');
                option.value = label;
                option.textContent = label;
                accountSelect.appendChild(option);
                accountSelect.value = label;
            }
        });
    });
    fillSimpleSelect(tr.querySelector('.line-name'), [...new Set([...customersDb.map(c => c.name), ...suppliersDb.map(s => s.name)])], true, '-- Name --');
    fillSimpleSelect(tr.querySelector('.line-vat'), VAT_OPTIONS, true, '-- VAT --');
    fillSimpleSelect(tr.querySelector('.line-location'), PRESBYTERIES, true, '-- Location --');
    fillOptGroupedSelect(tr.querySelector('.line-class'), getAllSubsectionsFlat(), true);
    const debitInput = tr.querySelector('.line-debit'), creditInput = tr.querySelector('.line-credit');
    debitInput.addEventListener('input', () => { if (parseFloat(debitInput.value) > 0) creditInput.value = ''; updateJournalTotals(); });
    creditInput.addEventListener('input', () => { if (parseFloat(creditInput.value) > 0) debitInput.value = ''; updateJournalTotals(); });
    tr.querySelector('.line-insert-btn').addEventListener('click', () => addJournalLine(tr));
    tr.querySelector('.line-edit-btn').addEventListener('click', () => { tr.classList.add('line-editing'); accountSelect.focus(); });
    tr.querySelector('.line-delete-btn').addEventListener('click', () => { tr.remove(); renumberLines('journal-lines-body'); updateJournalTotals(); });
    if (afterRow && afterRow.parentNode === tbody) afterRow.insertAdjacentElement('afterend', tr); else tbody.appendChild(tr);
    renumberLines('journal-lines-body');
    return tr;
}

function updateJournalTotals() {
    let debit = 0, credit = 0;
    qsa('#journal-lines-body tr').forEach(tr => {
        debit += parseFloat(tr.querySelector('.line-debit').value) || 0;
        credit += parseFloat(tr.querySelector('.line-credit').value) || 0;
    });
    $('journal-total-debit').textContent = formatRF(debit);
    $('journal-total-credit').textContent = formatRF(credit);

    const indicator = $('journal-balance-indicator');
    if (indicator) {
        const diff = Math.abs(debit - credit);
        if (diff < 0.01) {
            indicator.textContent = 'Balanced';
            indicator.className = 'status-pill status-approved';
        } else {
            indicator.textContent = `Unbalanced by ${formatRF(diff)} (optional)`;
            indicator.className = 'status-pill status-pending_approval';
        }
    }
}

async function openJournalModal() {
    $('journal-form').reset();
    $('journal-date').value = new Date().toISOString().split('T')[0];
    $('journal-lines-body').innerHTML = '';
    for (let i = 0; i < 4; i++) addJournalLine();
    updateJournalTotals();
    $('journal-no').value = nextSequentialReference('JRN', journalEntriesDb);
    openModal('journal-modal');
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
    // Debits and Credits are optional and never required to match — this
    // journal entry can be saved as-is, balanced or not.
    if (!lines.length) { showToast('error', 'Add at least one line before saving.'); return; }

    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
    const payload = sanitizePayload({
        date: $('journal-date').value || new Date().toISOString().split('T')[0],
        journalNo: $('journal-no').value.trim(),
        lines: JSON.stringify(lines),
        totalDebit, totalCredit, isBalanced,
        department: hasFullScope() ? currentScope.department : currentUser.department,
        presbytery: hasFullScope() ? currentScope.presbytery : currentUser.presbytery
    });

    const btn = keepOpen ? $('journal-save-new-btn') : $('journal-submit-btn');
    if (btn) btn.disabled = true;
    try {
        await addDoc(collection(db, COLLECTIONS.JOURNAL_ENTRIES), sanitizePayload({ ...payload, ...actorMeta(), createdAt: serverTimestamp() }));
        markReferenceUsed(payload.journalNo);
        const balanceNote = isBalanced
            ? `balanced at ${formatRF(totalDebit)}`
            : `saved as unbalanced — Debits ${formatRF(totalDebit)} vs Credits ${formatRF(totalCredit)}`;
        showToast('success', `Journal entry #${payload.journalNo || ''} ${balanceNote}.`);
        if (keepOpen) { await openJournalModal(); }
        else { closeModal('journal-modal'); }
    } catch (err) { showToast('error', "Couldn't save journal entry: " + err.message); }
    finally { if (btn) btn.disabled = false; }
}
