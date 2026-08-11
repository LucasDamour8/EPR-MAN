/* ======================================================================
   EPR FINANCIAL & OPERATIONS SYSTEM
   Single-page app: no reloads, everything re-renders instantly (AJAX-style)
   from in-memory data. Swap the *Db arrays + persist functions for real
   API calls to move this onto a backend.
====================================================================== */

// ---------------------------------------------------------------------
// 1. FIXED ORGANIZATION STRUCTURE
//    Every EPR presbytery carries this exact same set of departments;
//    each sub-section is what an individual user gets assigned to manage.
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
    "EPR Presbytery Zinga",
    "EPR Presbytery Kigali",
    "EPR Presbytery Remera",
    "EPR Presbytery Gitarama",
    "EPR Presbytery Rubengera",
    "EPR Presbytery Kirinda",
    "EPR Presbytery Gisenyi"
];

const ROLE_LABELS = { superadmin: "Superadmin", manager: "Manager", finance: "Finance User" };

// ---------------------------------------------------------------------
// 2. IN-MEMORY DATA (seed) — id counters kept separately
// ---------------------------------------------------------------------
let usersDb = [
    { id: "u1", email: "admin@epr.org", password: "admin", name: "Central Superadmin", role: "superadmin", presbytery: "ALL", department: "ALL", subsection: "ALL" },
    { id: "u2", email: "growth@epr.org", password: "123", name: "Jean Ndayisaba", role: "finance", presbytery: "EPR Presbytery Kigali", department: "Department of Church Growth", subsection: "Youth" },
    { id: "u3", email: "health@epr.org", password: "123", name: "Marie Claire", role: "manager", presbytery: "EPR Presbytery Gisenyi", department: "Department of Health", subsection: "Health Projects" }
];
let userIdSeq = 4;

let transactionsDb = [
    { id: 1, date: "2026-08-10", type: "Income", desc: "Youth Ministry Offering", amount: 250000, department: "Department of Church Growth", subsection: "Youth", presbytery: "EPR Presbytery Kigali", createdBy: "growth@epr.org" },
    { id: 2, date: "2026-08-09", type: "Expense", desc: "Health Center Medical Supplies", amount: 120000, department: "Department of Health", subsection: "Health Projects", presbytery: "EPR Presbytery Gisenyi", createdBy: "health@epr.org" },
    { id: 3, date: "2026-08-08", type: "Income", desc: "Project SCA Grant", amount: 1500000, department: "Department of Development and Diakonia", subsection: "Project SCA", presbytery: "EPR Presbytery Remera", createdBy: "admin@epr.org" },
    { id: 4, date: "2026-08-05", type: "Asset", desc: "Office Equipment Purchase", amount: 640000, department: "Department of Finance and Administration", subsection: "Functioning", presbytery: "EPR Presbytery Zinga", createdBy: "admin@epr.org" },
    { id: 5, date: "2026-08-03", type: "Expense", desc: "School Materials", amount: 310000, department: "Department of Education", subsection: "Education", presbytery: "EPR Presbytery Gitarama", createdBy: "admin@epr.org" }
];
let txIdSeq = 6;

// ---------------------------------------------------------------------
// 3. APPLICATION STATE
// ---------------------------------------------------------------------
let currentUser = null;

let currentScope = { presbytery: "ALL", department: "ALL" };   // superadmin scope selector
let searchQuery = "";                                          // global live search
let txFilters = { type: "ALL", from: "", to: "" };              // transactions view filters
let pendingConfirm = null;                                      // {text, onConfirm}
let activeOrgTab = "departments";

// ---------------------------------------------------------------------
// 4. DOM SHORTCUTS
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const authContainer = $('auth-container');
const appContainer = $('app-container');
const loginForm = $('login-form');
const authError = $('auth-error');
const globalSearch = $('global-search');

// ---------------------------------------------------------------------
// 5. INIT
// ---------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    buildStaticSelectOptions();
    setupEventListeners();
    populateSubsections('user-dept', 'user-subsection');
});

function buildStaticSelectOptions() {
    // Superadmin scope selectors
    fillSelect($('sa-presbytery-select'), PRESBYTERIES, "ALL", "-- All Presbyteries --", true);
    fillSelect($('sa-department-select'), Object.keys(EPR_STRUCTURE), "ALL", "-- All Departments --", true);

    // User-admin form selects
    fillSelect($('user-pres'), PRESBYTERIES);
    fillSelect($('user-dept'), Object.keys(EPR_STRUCTURE));

    // Sidebar quick filters
    renderSidebarFilters();
}

function fillSelect(select, values, prependValue, prependLabel, keepPrepend) {
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
    allDept.type = 'button';
    allDept.className = 'nav-item filter-dept';
    allDept.dataset.dept = 'ALL';
    allDept.innerHTML = `<i class="fa-solid fa-layer-group"></i> All Departments`;
    deptMenu.appendChild(allDept);

    Object.keys(EPR_STRUCTURE).forEach(d => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item filter-dept';
        btn.dataset.dept = d;
        btn.innerHTML = `<i class="fa-solid ${DEPT_ICONS[d] || 'fa-building'}"></i> ${shortDeptName(d)}`;
        deptMenu.appendChild(btn);
    });

    const allPres = document.createElement('button');
    allPres.type = 'button';
    allPres.className = 'nav-item filter-pres';
    allPres.dataset.pres = 'ALL';
    allPres.innerHTML = `<i class="fa-solid fa-globe"></i> All Presbyteries`;
    presMenu.appendChild(allPres);

    PRESBYTERIES.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-item filter-pres';
        btn.dataset.pres = p;
        btn.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${p.replace('EPR Presbytery ', '')}`;
        presMenu.appendChild(btn);
    });

    // (Re)bind click handlers since nodes were rebuilt
    qsa('.filter-dept', deptMenu).forEach(item => item.addEventListener('click', onSidebarDeptFilter));
    qsa('.filter-pres', presMenu).forEach(item => item.addEventListener('click', onSidebarPresFilter));
}

function shortDeptName(d) { return d.replace('Department of ', ''); }

// ---------------------------------------------------------------------
// 6. EVENT WIRING
// ---------------------------------------------------------------------
function setupEventListeners() {
    // ---- Auth ----
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = $('login-email').value.trim();
        const pass = $('login-password').value;
        const foundUser = usersDb.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === pass);

        if (foundUser) {
            currentUser = foundUser;
            authError.textContent = "";
            loginForm.reset();
            initAppSession();
        } else {
            authError.textContent = "Invalid email or password. Please try again.";
        }
    });

    qsa('.demo-fill').forEach(btn => {
        btn.addEventListener('click', () => {
            $('login-email').value = btn.dataset.email;
            $('login-password').value = btn.dataset.pass;
        });
    });

    qsa('.pw-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = $(btn.dataset.toggleFor);
            const icon = btn.querySelector('i');
            if (target.type === 'password') {
                target.type = 'text'; icon.className = 'fa-solid fa-eye-slash';
            } else {
                target.type = 'password'; icon.className = 'fa-solid fa-eye';
            }
        });
    });

    $('logout-btn').addEventListener('click', () => {
        currentUser = null;
        appContainer.classList.add('hidden');
        authContainer.classList.remove('hidden');
        $('profile-dropdown').classList.add('hidden');
    });

    // ---- Sidebar mobile toggle ----
    $('hamburger-btn').addEventListener('click', () => toggleSidebar(true));
    $('sidebar-close-btn').addEventListener('click', () => toggleSidebar(false));
    $('sidebar-overlay').addEventListener('click', () => toggleSidebar(false));

    // ---- Profile dropdown ----
    $('profile-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        $('profile-dropdown').classList.toggle('hidden');
    });
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
    qsa('.nav-item[data-view]').forEach(item => {
        item.addEventListener('click', () => switchView(item.getAttribute('data-view')));
    });

    // ---- Sidebar Quick Filters (bound in renderSidebarFilters) ----

    // ---- Superadmin Dropdown Filters ----
    $('sa-presbytery-select').addEventListener('change', (e) => {
        currentScope.presbytery = e.target.value;
        refreshAllViews();
    });
    $('sa-department-select').addEventListener('change', (e) => {
        currentScope.department = e.target.value;
        refreshAllViews();
    });
    $('scope-reset-btn').addEventListener('click', () => {
        currentScope = { presbytery: 'ALL', department: 'ALL' };
        $('sa-presbytery-select').value = 'ALL';
        $('sa-department-select').value = 'ALL';
        refreshAllViews();
        showToast('info', 'Scope reset to all presbyteries and departments.');
    });

    // ---- Global Search (live, no reload) ----
    globalSearch.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        $('search-clear-btn').style.display = searchQuery ? 'inline-flex' : 'none';
        renderSearchDropdown();
        refreshAllViews();
    });
    globalSearch.addEventListener('focus', () => { if (searchQuery) renderSearchDropdown(); });
    $('search-clear-btn').addEventListener('click', () => {
        globalSearch.value = '';
        searchQuery = '';
        $('search-clear-btn').style.display = 'none';
        $('search-results-dropdown').classList.add('hidden');
        refreshAllViews();
    });

    // ---- Transactions view filters ----
    $('tx-filter-type').addEventListener('change', (e) => { txFilters.type = e.target.value; refreshAllViews(); });
    $('tx-filter-from').addEventListener('change', (e) => { txFilters.from = e.target.value; refreshAllViews(); });
    $('tx-filter-to').addEventListener('change', (e) => { txFilters.to = e.target.value; refreshAllViews(); });
    $('tx-filter-reset').addEventListener('click', () => {
        txFilters = { type: 'ALL', from: '', to: '' };
        $('tx-filter-type').value = 'ALL'; $('tx-filter-from').value = ''; $('tx-filter-to').value = '';
        refreshAllViews();
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

    // ---- Users table row actions (event delegation) ----
    $('users-table-body').addEventListener('click', onUsersTableClick);

    // ---- Transaction modal ----
    const txModal = $('tx-modal');
    $('open-tx-modal-btn').addEventListener('click', () => openTxModal());
    $('close-tx-modal').addEventListener('click', () => closeTxModal());
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

    // Escape key closes modals / dropdowns
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
    highlightSidebarFilters();
    refreshAllViews();
    toggleSidebar(false);
}

function onSidebarPresFilter(e) {
    e.preventDefault();
    if (currentUser.role !== 'superadmin') return;
    const pres = e.currentTarget.getAttribute('data-pres');
    $('sa-presbytery-select').value = pres;
    currentScope.presbytery = pres;
    switchView('transactions');
    highlightSidebarFilters();
    refreshAllViews();
    toggleSidebar(false);
}

function highlightSidebarFilters() {
    qsa('.filter-dept').forEach(b => b.classList.toggle('active-filter', b.dataset.dept === currentScope.department));
    qsa('.filter-pres').forEach(b => b.classList.toggle('active-filter', b.dataset.pres === currentScope.presbytery));
}

// ---------------------------------------------------------------------
// 7. VIEW SWITCHING
// ---------------------------------------------------------------------
function switchView(target) {
    qsa('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.getAttribute('data-view') === target));
    qsa('.view-panel').forEach(panel => panel.classList.remove('active'));
    $(`view-${target}`).classList.add('active');
    if (target === 'departments') renderOrgChart();
}

// ---------------------------------------------------------------------
// 8. SESSION INITIALIZER
// ---------------------------------------------------------------------
function initAppSession() {
    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');

    $('user-display-name').textContent = currentUser.name;
    $('avatar-initials').textContent = initials(currentUser.name);
    $('pd-name').textContent = currentUser.name;
    $('pd-email').textContent = currentUser.email;
    $('pd-role-badge').textContent = ROLE_LABELS[currentUser.role] || currentUser.role;
    $('pd-role-badge').className = `badge role-${currentUser.role}`;
    $('pd-presbytery').textContent = currentUser.presbytery === 'ALL' ? 'All presbyteries' : currentUser.presbytery;
    $('pd-department').textContent = currentUser.department === 'ALL' ? 'All departments' : currentUser.department;
    $('pd-subsection').textContent = currentUser.subsection === 'ALL' ? 'All sections' : currentUser.subsection;

    const isSuper = currentUser.role === 'superadmin';
    $('admin-menu-item').classList.toggle('hidden', !isSuper);
    $('superadmin-filter-bar').classList.toggle('hidden', !isSuper);
    $('dept-filter-title').parentElement && null;
    $('dept-sidebar-menu').parentElement.style.display = isSuper ? '' : 'none';
    $('dept-filter-title').style.display = isSuper ? '' : 'none';
    $('pres-sidebar-menu').style.display = isSuper ? '' : 'none';
    $('pres-filter-title').style.display = isSuper ? '' : 'none';

    if (isSuper) {
        currentScope = { presbytery: 'ALL', department: 'ALL' };
        $('sa-presbytery-select').value = 'ALL';
        $('sa-department-select').value = 'ALL';
        $('user-scope-line').textContent = 'Full system access';
    } else {
        currentScope = { presbytery: currentUser.presbytery, department: currentUser.department };
        $('user-scope-line').textContent = `${shortDeptName(currentUser.department)} · ${currentUser.presbytery.replace('EPR Presbytery ', '')}`;
    }

    switchView('overview');
    renderUsersTable();
    renderOrgChart();
    refreshAllViews();
}

function initials(name) {
    return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
}

// ---------------------------------------------------------------------
// 9. SUBSECTION POPULATION HELPERS
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
// 10. TRANSACTION MODAL
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

function onSubmitTxForm(e) {
    e.preventDefault();
    const editId = $('tx-edit-id').value;
    const isSuper = currentUser.role === 'superadmin';

    let dept = currentUser.department, subsec = currentUser.subsection, pres = currentUser.presbytery;
    if (isSuper) {
        dept = $('tx-dept').value; subsec = $('tx-subsection').value; pres = $('tx-pres').value;
    }

    const payload = {
        date: $('tx-date').value || new Date().toISOString().split('T')[0],
        type: $('tx-type').value,
        desc: $('tx-desc').value.trim(),
        amount: parseFloat($('tx-amount').value),
        department: dept,
        subsection: subsec,
        presbytery: pres
    };

    if (!payload.desc || isNaN(payload.amount) || payload.amount < 0) {
        showToast('error', 'Please provide a valid description and amount.');
        return;
    }

    if (editId) {
        const tx = transactionsDb.find(t => String(t.id) === String(editId));
        if (tx) Object.assign(tx, payload);
        showToast('success', 'Transaction updated.');
    } else {
        transactionsDb.unshift({ id: txIdSeq++, createdBy: currentUser.email, ...payload });
        showToast('success', 'Transaction saved.');
    }

    closeTxModal();
    refreshAllViews();
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
        openConfirmModal(`Delete the transaction "${tx.desc}" (${formatRF(tx.amount)})? This cannot be undone.`, () => {
            transactionsDb = transactionsDb.filter(t => String(t.id) !== String(tx.id));
            showToast('success', 'Transaction deleted.');
            refreshAllViews();
        });
    }
}

// ---------------------------------------------------------------------
// 11. USER FORM (create / edit)
// ---------------------------------------------------------------------
function onSubmitUserForm(e) {
    e.preventDefault();
    const editId = $('user-edit-id').value;
    const role = $('user-role').value;
    const isSuper = role === 'superadmin';

    const email = $('user-email').value.trim().toLowerCase();
    const dup = usersDb.find(u => u.email.toLowerCase() === email && String(u.id) !== String(editId));
    if (dup) { showToast('error', 'A user with that email already exists.'); return; }

    const payload = {
        name: $('user-name').value.trim(),
        email: email,
        password: $('user-password').value,
        role: role,
        presbytery: isSuper ? 'ALL' : $('user-pres').value,
        department: isSuper ? 'ALL' : $('user-dept').value,
        subsection: isSuper ? 'ALL' : $('user-subsection').value
    };

    if (!payload.name || !payload.email || payload.password.length < 3) {
        showToast('error', 'Fill in name, a valid email, and a password of at least 3 characters.');
        return;
    }
    if (!isSuper && (!payload.presbytery || !payload.department || !payload.subsection)) {
        showToast('error', 'Assign a presbytery, department and sub-section for this role.');
        return;
    }

    if (editId) {
        const u = usersDb.find(x => String(x.id) === String(editId));
        if (u) Object.assign(u, payload);
        showToast('success', `${payload.name} updated.`);
    } else {
        usersDb.push({ id: 'u' + userIdSeq++, ...payload });
        showToast('success', `${payload.name} created and assigned successfully.`);
    }

    resetUserForm();
    renderUsersTable();
    refreshAllViews();
}

function resetUserForm() {
    $('add-user-form').reset();
    $('user-edit-id').value = '';
    $('user-form-title').textContent = 'Add New System User';
    $('user-submit-btn').textContent = 'Create & Assign User';
    $('user-cancel-edit-btn').classList.add('hidden');
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
        $('user-password').value = u.password;
        $('user-role').value = u.role;
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
        openConfirmModal(`Remove user "${u.name}" (${u.email})? They will lose access immediately.`, () => {
            usersDb = usersDb.filter(x => String(x.id) !== String(u.id));
            showToast('success', 'User removed.');
            renderUsersTable();
            refreshAllViews();
        });
    }
}

// ---------------------------------------------------------------------
// 12. CONFIRM MODAL + TOASTS
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
    el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${message}</span>`;
    container.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 250); }, 3200);
}

// ---------------------------------------------------------------------
// 13. CORE DATA FILTER ENGINE
// ---------------------------------------------------------------------
function getFilteredTransactions() {
    return transactionsDb.filter(tx => {
        // Non-superadmin: hard-locked to own department + presbytery, always —
        // regardless of any other control on screen. They never see other scopes.
        if (currentUser.role !== 'superadmin') {
            if (tx.department !== currentUser.department || tx.presbytery !== currentUser.presbytery) return false;
        } else {
            if (currentScope.presbytery !== 'ALL' && tx.presbytery !== currentScope.presbytery) return false;
            if (currentScope.department !== 'ALL' && tx.department !== currentScope.department) return false;
        }

        if (txFilters.type !== 'ALL' && tx.type !== txFilters.type) return false;
        if (txFilters.from && tx.date < txFilters.from) return false;
        if (txFilters.to && tx.date > txFilters.to) return false;

        if (searchQuery) {
            const q = searchQuery;
            const hay = [tx.desc, tx.department, tx.subsection, tx.presbytery, tx.type, tx.amount.toString(), tx.date].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

// ---------------------------------------------------------------------
// 14. MASTER RENDER
// ---------------------------------------------------------------------
function refreshAllViews() {
    const list = getFilteredTransactions();
    const isSuper = currentUser.role === 'superadmin';

    // ---- Scope indicator text ----
    const scopeDesc = isSuper
        ? `Presbytery: [${currentScope.presbytery}] | Department: [${currentScope.department}]`
        : `Presbytery: [${currentUser.presbytery}] | Department: [${currentUser.department}] (locked to your assignment)`;
    $('scope-indicator').textContent = `Current Scope: ${scopeDesc}`;
    $('statement-scope').textContent = scopeDesc;
    $('stmt-generated-line').textContent = `Generated ${new Date().toLocaleString()} by ${currentUser.name} (${ROLE_LABELS[currentUser.role]})`;

    // ---- Aggregates ----
    let income = 0, expense = 0, assets = 0, liabilities = 0;
    list.forEach(tx => {
        if (tx.type === 'Income') income += tx.amount;
        if (tx.type === 'Expense') expense += tx.amount;
        if (tx.type === 'Asset') assets += tx.amount;
        if (tx.type === 'Liability') liabilities += tx.amount;
    });
    const netProfit = income - expense;
    const netWorth = assets - liabilities;

    // ---- Overview cards ----
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

    // ---- Reports / statement ----
    $('stmt-income').textContent = formatRF(income);
    $('stmt-expenses').textContent = formatRF(expense);
    $('stmt-net').textContent = formatRF(netProfit);
    $('stmt-assets').textContent = formatRF(assets);
    $('stmt-liabilities').textContent = formatRF(liabilities);
    $('stmt-equity').textContent = formatRF(netWorth);

    // ---- Tables & breakdowns ----
    renderTransactionsTable(list);
    renderDeptBreakdown(list, isSuper);

    // ---- Sidebar counts / active filters ----
    $('nav-tx-count').textContent = list.length;
    $('nav-users-count').textContent = usersDb.length;
    highlightSidebarFilters();
}

function renderDeptBreakdown(list, isSuper) {
    const wrap = $('dept-breakdown-wrap');
    const grid = $('dept-breakdown-grid');
    // Only meaningful when looking at more than one department (superadmin, ALL scope)
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
            refreshAllViews();
        });
        grid.appendChild(card);
    });
}

function renderTransactionsTable(list) {
    const tbody = $('tx-table-body');
    tbody.innerHTML = '';
    const isSuper = currentUser.role === 'superadmin';

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
            <td>${tx.presbytery.replace('EPR Presbytery ', '')}</td>
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
    if (usersDb.length === 0) {
        tbody.innerHTML = `<tr class="table-empty-row"><td colspan="6">No users configured yet.</td></tr>`;
        return;
    }
    usersDb.forEach(u => {
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
// 15. DEPARTMENTS / PRESBYTERIES ORG CHART VIEW
// ---------------------------------------------------------------------
function renderOrgChart() {
    const isSuper = currentUser.role === 'superadmin';
    const deptGrid = $('org-dept-grid');
    deptGrid.innerHTML = '';
    Object.entries(EPR_STRUCTURE).forEach(([dept, subs]) => {
        const isMine = !isSuper && dept === currentUser.department;
        const managers = usersDb.filter(u => u.department === dept);
        const card = document.createElement('div');
        card.className = `org-dept-card${isMine ? ' mine' : ''}`;
        card.innerHTML = `
            <div class="odc-head"><i class="fa-solid ${DEPT_ICONS[dept] || 'fa-building'}"></i> ${shortDeptName(dept)}</div>
            <div class="odc-body">${subs.map(s => `<div class="odc-sub">${s}</div>`).join('')}</div>
            <div class="odc-count"><i class="fa-solid fa-user-gear"></i> ${managers.length} user${managers.length === 1 ? '' : 's'} assigned</div>
        `;
        if (isSuper) {
            card.addEventListener('click', () => {
                $('sa-department-select').value = dept;
                currentScope.department = dept;
                switchView('transactions');
                refreshAllViews();
            });
        }
        deptGrid.appendChild(card);
    });

    const presGrid = $('org-pres-grid');
    presGrid.innerHTML = '';
    PRESBYTERIES.forEach(p => {
        const isMine = !isSuper && p === currentUser.presbytery;
        const count = usersDb.filter(u => u.presbytery === p).length;
        const card = document.createElement('div');
        card.className = `pres-card${isMine ? ' mine' : ''}`;
        card.innerHTML = `
            <i class="fa-solid fa-location-dot"></i>
            <div class="pc-name">${p.replace('EPR Presbytery ', '')}</div>
            <div class="pc-count">${count} user${count === 1 ? '' : 's'}</div>
        `;
        if (isSuper) {
            card.addEventListener('click', () => {
                $('sa-presbytery-select').value = p;
                currentScope.presbytery = p;
                switchView('transactions');
                refreshAllViews();
            });
        }
        presGrid.appendChild(card);
    });
}

// ---------------------------------------------------------------------
// 16. GLOBAL LIVE SEARCH DROPDOWN
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
                <span>${escapeHtml(tx.desc)}<br><span class="sr-meta">${shortDeptName(tx.department)} · ${tx.presbytery.replace('EPR Presbytery ', '')}</span></span>
                <span style="font-weight:700;color:${tx.type === 'Expense' || tx.type === 'Liability' ? 'var(--danger)' : 'var(--success)'}">${formatRF(tx.amount)}</span>
            `;
            row.addEventListener('click', () => {
                switchView('transactions');
                dropdown.classList.add('hidden');
            });
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
// 17. EXPORT
// ---------------------------------------------------------------------
function exportReportToExcel() {
    const list = getFilteredTransactions();
    if (list.length === 0) { showToast('error', 'Nothing to export in the current scope.'); return; }
    const data = list.map(item => ({
        Date: item.date,
        Type: item.type,
        Description: item.desc,
        Department: item.department,
        Section: item.subsection,
        Presbytery: item.presbytery,
        Amount: item.amount,
        RecordedBy: item.createdBy
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "EPR Report");
    XLSX.writeFile(workbook, "EPR_Financial_Report.xlsx");
    showToast('success', `Exported ${list.length} records to Excel.`);
}

// ---------------------------------------------------------------------
// 18. HELPERS
// ---------------------------------------------------------------------
const formatRF = (amount) => "RF " + Number(amount || 0).toLocaleString();

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
