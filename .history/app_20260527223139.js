
<!-- ============================================================
     SCRIPTS
 

/* =========================================================
   STATE MANAGEMENT (LocalStorage-based with Firebase hooks)
   ========================================================= */
const DB = {
  get: (key) => { try { return JSON.parse(localStorage.getItem('rp_' + key)) || []; } catch { return []; } },
  set: (key, val) => { localStorage.setItem('rp_' + key, JSON.stringify(val)); },
  getObj: (key) => { try { return JSON.parse(localStorage.getItem('rp_' + key)) || {}; } catch { return {}; } },
  setObj: (key, val) => { localStorage.setItem('rp_' + key, JSON.stringify(val)); }
};

let AppState = {
  tenants: DB.get('tenants'),
  rooms: DB.get('rooms'),
  payments: DB.get('payments'),
  expenses: DB.get('expenses'),
  notices: DB.get('notices'),
  settings: DB.getObj('settings'),
  auth: DB.getObj('auth'),
  editTenantId: null,
  currentPaymentTenant: null,
  tenantFilter: 'all',
  payFilter: 'all',
  roomFilter: 'all',
};

function save() {
  DB.set('tenants', AppState.tenants);
  DB.set('rooms', AppState.rooms);
  DB.set('payments', AppState.payments);
  DB.set('expenses', AppState.expenses);
  DB.set('notices', AppState.notices);
  DB.setObj('settings', AppState.settings);
  tryFirebaseSync();
}

/* =========================================================
   FIREBASE (Stub – connect via Settings page)
   ========================================================= */
let firebaseApp = null, firebaseDB = null;

function initFirebase(config) {
  try {
    // Firebase v10 modular SDK import (stub – user should include SDK)
    showToast('Firebase config saved. Add Firebase SDK for full cloud sync.', 'info');
  } catch (e) { showToast('Firebase init error: ' + e.message, 'error'); }
}
function tryFirebaseSync() { /* No-op until Firebase is connected */ }

function saveFirebaseConfig() {
  const raw = document.getElementById('firebase-config-input').value.trim();
  if (!raw) { showToast('Please paste your Firebase config JSON', 'error'); return; }
  try {
    const cfg = JSON.parse(raw);
    AppState.settings.firebaseConfig = cfg;
    save();
    initFirebase(cfg);
    showToast('Firebase configuration saved!', 'success');
  } catch { showToast('Invalid JSON config', 'error'); }
}

/* =========================================================
   AUTHENTICATION
   ========================================================= */
const ADMIN_EMAIL = 'admin@rentpro.com';
const ADMIN_PASS = 'admin123';

function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-pass').value;
  if (!email || !pass) { showLoginError('Please enter email and password.'); return; }

  // Demo / local auth
  const storedPass = AppState.settings.adminPassword || ADMIN_PASS;
  const storedEmail = AppState.settings.adminEmail || ADMIN_EMAIL;
  if (email === storedEmail && pass === storedPass) {
    AppState.auth = { loggedIn: true, email, name: AppState.settings.adminName || 'Admin', time: Date.now() };
    DB.setObj('auth', AppState.auth);
    enterApp();
  } else {
    showLoginError('Invalid credentials. Try admin@rentpro.com / admin123');
  }
}

function enterApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app-shell').classList.add('active');
  const name = AppState.auth.name || 'Admin';
  const initial = name[0].toUpperCase();
  document.getElementById('sidebar-avatar').textContent = initial;
  document.getElementById('sidebar-name').textContent = name;
  document.getElementById('topbar-avatar').textContent = initial;
  initDashboard();
  renderNotifications();
}

function doLogout() {
  Swal.fire({ title: 'Logout?', text: 'Are you sure you want to sign out?', icon: 'question', showCancelButton: true, confirmButtonColor: '#e53e3e', confirmButtonText: 'Logout' })
    .then(r => { if (r.isConfirmed) { AppState.auth = {}; DB.setObj('auth', {}); location.reload(); } });
}

function showLoginError(msg) {
  showToast(msg, 'error');
}

function showForgotModal() { openModal('forgot-modal'); }
function sendResetEmail() {
  const email = document.getElementById('forgot-email').value;
  if (!email) { showToast('Please enter email', 'error'); return; }
  showToast('Reset link sent to ' + email + ' (demo mode – no actual email sent)', 'info');
  closeModal('forgot-modal');
}

/* =========================================================
   NAVIGATION
   ========================================================= */
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');

  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => {
    if (l.getAttribute('onclick') && l.getAttribute('onclick').includes(`'${page}'`)) l.classList.add('active');
  });

  const titles = { dashboard:'Dashboard', tenants:'Tenants', 'add-tenant':'Add Tenant', rooms:'Rooms', payments:'Payments', expenses:'Expenses', reports:'Reports', notices:'Notices', settings:'Settings' };
  document.getElementById('topbar-title').textContent = titles[page] || page;

  if (page === 'dashboard') initDashboard();
  if (page === 'tenants') renderTenants();
  if (page === 'add-tenant') initAddTenantForm();
  if (page === 'rooms') renderRooms();
  if (page === 'payments') renderPayments();
  if (page === 'expenses') renderExpenses();
  if (page === 'reports') initReports();
  if (page === 'notices') renderNotices();

  closeSidebar();
}

function toggleSidebar() {
  const s = document.getElementById('sidebar');
  const o = document.getElementById('sidebar-overlay');
  s.classList.toggle('open');
  o.classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

/* =========================================================
   DARK MODE
   ========================================================= */
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('theme-icon').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
  document.getElementById('theme-label').textContent = isDark ? 'Dark' : 'Light';
  AppState.settings.theme = isDark ? 'light' : 'dark';
  save();
  // Refresh charts
  setTimeout(() => { if (document.getElementById('page-dashboard').classList.contains('active')) initDashboard(); }, 100);
}

/* =========================================================
   DASHBOARD
   ========================================================= */
let incomeChart = null, occupancyChart = null;

function initDashboard() {
  const tenants = AppState.tenants;
  const rooms = AppState.rooms;
  const payments = AppState.payments;

  const totalRooms = rooms.length;
  const occupied = tenants.filter(t => t.status !== 'old').length;
  const available = rooms.filter(r => r.status === 'available').length;
  const totalTenants = tenants.filter(t => t.status !== 'old').length;
  const totalMonthlyIncome = tenants.filter(t => t.status !== 'old').reduce((s, t) => s + Number(t.rent || 0), 0);
  const dueCount = payments.filter(p => p.status === 'due' || p.status === 'partial').length;

  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-door-open"></i></div><div><div class="stat-value">${totalRooms}</div><div class="stat-label">Total Rooms</div><div class="stat-change up"><i class="fas fa-check-circle"></i> ${available} Available</div></div></div>
    <div class="stat-card"><div class="stat-icon green"><i class="fas fa-home"></i></div><div><div class="stat-value">${occupied}</div><div class="stat-label">Occupied Rooms</div></div></div>
    <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-users"></i></div><div><div class="stat-value">${totalTenants}</div><div class="stat-label">Total Tenants</div></div></div>
    <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-taka-sign"></i></div><div><div class="stat-value">৳${totalMonthlyIncome.toLocaleString()}</div><div class="stat-label">Monthly Income</div></div></div>
    <div class="stat-card"><div class="stat-icon red"><i class="fas fa-exclamation-circle"></i></div><div><div class="stat-value">${dueCount}</div><div class="stat-label">Due Payments</div></div></div>
    <div class="stat-card"><div class="stat-icon teal"><i class="fas fa-file-invoice"></i></div><div><div class="stat-value">${payments.filter(p=>p.status==='paid').length}</div><div class="stat-label">Paid This Month</div></div></div>
  `;

  document.getElementById('due-count-badge').textContent = dueCount;
  document.getElementById('income-year-badge').textContent = new Date().getFullYear();

  renderDashPayments();
  renderDashTenants();
  renderDashAlerts();
  renderIncomeChart();
  renderOccupancyChart();
  renderNotifications();
}

function renderDashPayments() {
  const pays = [...AppState.payments].reverse().slice(0, 6);
  const tbody = document.getElementById('dash-payments-body');
  if (!pays.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">No payments yet</td></tr>'; return; }
  tbody.innerHTML = pays.map(p => {
    const t = AppState.tenants.find(t => t.id === p.tenantId);
    return `<tr>
      <td><div style="display:flex;align-items:center;gap:8px;"><div class="tenant-avatar">${(t?.name||'?')[0].toUpperCase()}</div><span>${t?.name||'Unknown'}</span></div></td>
      <td style="font-weight:700;font-family:'Syne',sans-serif;">৳${Number(p.paid).toLocaleString()}</td>
      <td style="color:var(--text-muted);">${p.month} ${p.year}</td>
      <td>${statusBadge(p.status)}</td>
    </tr>`;
  }).join('');
}

function renderDashTenants() {
  const tns = [...AppState.tenants].reverse().slice(0, 6);
  const tbody = document.getElementById('dash-tenants-body');
  if (!tns.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">No tenants yet</td></tr>'; return; }
  tbody.innerHTML = tns.map(t => `<tr>
    <td><div style="display:flex;align-items:center;gap:8px;"><div class="tenant-avatar">${t.name[0].toUpperCase()}</div><span>${t.name}</span></div></td>
    <td><span class="badge badge-primary">${t.room}</span></td>
    <td style="font-weight:700;">৳${Number(t.rent).toLocaleString()}</td>
    <td>${statusBadge(t.status||'active')}</td>
  </tr>`).join('');
}

function renderDashAlerts() {
  const alerts = [];
  const today = new Date();
  AppState.tenants.forEach(t => {
    if (t.status === 'old') return;
    if (t.agreeEnd) {
      const end = new Date(t.agreeEnd);
      const daysLeft = Math.ceil((end - today) / 86400000);
      if (daysLeft <= 30 && daysLeft >= 0) alerts.push({ type: 'warning', icon: 'fas fa-file-contract', msg: `Agreement for <b>${t.name}</b> (Room ${t.room}) expires in <b>${daysLeft} days</b>` });
      if (daysLeft < 0) alerts.push({ type: 'danger', icon: 'fas fa-exclamation-triangle', msg: `Agreement for <b>${t.name}</b> (Room ${t.room}) has <b>expired</b>` });
    }
  });
  AppState.payments.forEach(p => {
    if (p.status === 'due') {
      const t = AppState.tenants.find(x => x.id === p.tenantId);
      alerts.push({ type: 'danger', icon: 'fas fa-money-bill', msg: `<b>${t?.name||'Unknown'}</b> has unpaid rent for <b>${p.month} ${p.year}</b> — Due: ৳${p.due}` });
    }
  });
  const el = document.getElementById('dash-alerts');
  if (!alerts.length) { el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--success);"><i class="fas fa-check-circle" style="font-size:24px;margin-bottom:8px;display:block;"></i>No alerts — all good!</div>'; return; }
  el.innerHTML = alerts.map(a => `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);">
      <div class="stat-icon ${a.type==='warning'?'orange':'red'}" style="width:34px;height:34px;border-radius:8px;font-size:13px;flex-shrink:0;"><i class="${a.icon}"></i></div>
      <span style="font-size:13.5px;">${a.msg}</span>
    </div>
  `).join('');
}

function renderIncomeChart() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const data = months.map((m, i) => {
    const fullMonth = ['January','February','March','April','May','June','July','August','September','October','November','December'][i];
    return AppState.payments.filter(p => p.month === fullMonth && p.status !== 'due').reduce((s, p) => s + Number(p.paid||0), 0);
  });

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const textColor = isDark ? '#8b949e' : '#6b7a99';

  const ctx = document.getElementById('incomeChart').getContext('2d');
  if (incomeChart) incomeChart.destroy();
  incomeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [{
        label: 'Income (৳)',
        data,
        backgroundColor: 'rgba(26,86,219,0.12)',
        borderColor: '#1a56db',
        borderWidth: 2,
        borderRadius: 6,
        hoverBackgroundColor: 'rgba(26,86,219,0.25)',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ৳' + c.parsed.y.toLocaleString() } } },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: "'Plus Jakarta Sans'" } } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, callback: v => '৳' + v.toLocaleString(), font: { family: "'Plus Jakarta Sans'" } } }
      }
    }
  });
}

function renderOccupancyChart() {
  const total = AppState.rooms.length || 1;
  const occ = AppState.tenants.filter(t => t.status !== 'old').length;
  const avail = Math.max(0, total - occ);
  const maint = AppState.rooms.filter(r => r.status === 'maintenance').length;

  const ctx = document.getElementById('occupancyChart').getContext('2d');
  if (occupancyChart) occupancyChart.destroy();
  occupancyChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Occupied', 'Available', 'Maintenance'],
      datasets: [{ data: [occ, avail, maint], backgroundColor: ['#1a56db','#0ea965','#d97706'], borderWidth: 0 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '72%',
      plugins: { legend: { position: 'bottom', labels: { font: { family: "'Plus Jakarta Sans'" }, padding: 16 } } }
    }
  });
}

/* =========================================================
   TENANTS
   ========================================================= */
function renderTenants() {
  const q = (document.getElementById('tenant-search').value || '').toLowerCase();
  let list = AppState.tenants.filter(t => {
    if (AppState.tenantFilter === 'active') return t.status !== 'old';
    if (AppState.tenantFilter === 'due') {
      return AppState.payments.some(p => p.tenantId === t.id && p.status === 'due');
    }
    if (AppState.tenantFilter === 'old') return t.status === 'old';
    return true;
  }).filter(t => {
    if (!q) return true;
    return (t.name||'').toLowerCase().includes(q) || (t.mobile||'').includes(q) || (t.nid||'').includes(q) || (t.room||'').toLowerCase().includes(q);
  });

  document.getElementById('tenant-count-label').textContent = `Showing ${list.length} tenant(s)`;
  const tbody = document.getElementById('tenants-body');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="icon"><i class="fas fa-users"></i></div><div class="title">No Tenants Found</div><div class="desc">Add your first tenant to get started</div><button class="btn btn-primary" onclick="showPage('add-tenant')"><i class="fas fa-plus"></i> Add Tenant</button></div></td></tr>`;
    return;
  }
  tbody.innerHTML = list.map((t, i) => {
    const hasDue = AppState.payments.some(p => p.tenantId === t.id && p.status === 'due');
    return `<tr>
      <td style="color:var(--text-muted);font-weight:600;">${i + 1}</td>
      <td><div style="display:flex;align-items:center;gap:10px;"><div class="tenant-avatar">${t.name[0].toUpperCase()}</div><div><div style="font-weight:600;">${t.name}</div><div style="font-size:11px;color:var(--text-muted);">${t.id}</div></div></div></td>
      <td>${t.mobile}</td>
      <td><span class="badge badge-primary">${t.room}</span></td>
      <td style="font-weight:700;">৳${Number(t.rent).toLocaleString()}</td>
      <td style="color:var(--text-muted);">${formatDate(t.entryDate)}</td>
      <td>${hasDue ? '<span class="badge badge-danger"><i class="fas fa-exclamation-circle"></i> Due</span>' : statusBadge(t.status||'active')}</td>
      <td><div class="action-btns">
        <button class="btn btn-sm btn-outline" onclick="viewTenant('${t.id}')"><i class="fas fa-eye"></i></button>
        <button class="btn btn-sm btn-outline" onclick="editTenant('${t.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-success" onclick="quickPayment('${t.id}')"><i class="fas fa-money-bill"></i></button>
        <button class="btn btn-sm btn-danger" onclick="deleteTenant('${t.id}')"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');
}

function filterTenants() { renderTenants(); }
function setTenantFilter(f, el) {
  AppState.tenantFilter = f;
  document.querySelectorAll('#tenant-filters .filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderTenants();
}

function viewTenant(id) {
  const t = AppState.tenants.find(x => x.id === id);
  if (!t) return;
  AppState.currentPaymentTenant = id;

  const payments = AppState.payments.filter(p => p.tenantId === id);
  const totalPaid = payments.reduce((s, p) => s + Number(p.paid||0), 0);
  const totalDue = payments.reduce((s, p) => s + Number(p.due||0), 0);

  document.getElementById('tenant-detail-body').innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${t.name[0].toUpperCase()}</div>
      <div>
        <div class="profile-name">${t.name}</div>
        <div class="profile-id">${t.id} &nbsp;|&nbsp; Agreement: ${t.agreementNo||'N/A'}</div>
        <div class="profile-badges">
          <div class="profile-badge"><i class="fas fa-door-open"></i> Room ${t.room}</div>
          <div class="profile-badge"><i class="fas fa-phone"></i> ${t.mobile}</div>
          <div class="profile-badge"><i class="fas fa-taka-sign"></i> ৳${Number(t.rent).toLocaleString()}/mo</div>
        </div>
      </div>
    </div>
    <div style="padding:20px;">
      <div class="grid-2" style="margin-bottom:16px;">
        <div class="stat-card"><div class="stat-icon green"><i class="fas fa-check-circle"></i></div><div><div class="stat-value">৳${totalPaid.toLocaleString()}</div><div class="stat-label">Total Paid</div></div></div>
        <div class="stat-card"><div class="stat-icon red"><i class="fas fa-exclamation-circle"></i></div><div><div class="stat-value">৳${totalDue.toLocaleString()}</div><div class="stat-label">Total Due</div></div></div>
      </div>

      <div class="grid-2">
        <div>
          <div class="form-section-title"><i class="fas fa-user"></i> Personal Details</div>
          ${detailRow('Father', t.father)} ${detailRow('Mother', t.mother)} ${detailRow('Spouse', t.spouse)}
          ${detailRow('NID', t.nid)} ${detailRow('Profession', t.profession)}
          ${detailRow('Alt Mobile', t.altMobile)} ${detailRow('Permanent Address', t.permAddr)}
          ${detailRow('Present Address', t.presAddr)}
        </div>
        <div>
          <div class="form-section-title"><i class="fas fa-home"></i> Room Details</div>
          ${detailRow('Room No', t.room)} ${detailRow('Floor', t.floor)} ${detailRow('Building', t.building)}
          ${detailRow('Monthly Rent', '৳' + Number(t.rent).toLocaleString())}
          ${detailRow('Advance', '৳' + Number(t.advance||0).toLocaleString())}
          ${detailRow('Entry Date', formatDate(t.entryDate))}
          ${detailRow('Agreement Start', formatDate(t.agreeStart))}
          ${detailRow('Agreement End', formatDate(t.agreeEnd))}
          ${detailRow('Emergency Contact', t.emgName + ' (' + t.emgPhone + ')')}
        </div>
      </div>

      <div class="form-section-title" style="margin-top:20px;"><i class="fas fa-history"></i> Payment History</div>
      <div class="payment-timeline">
        ${payments.length ? payments.reverse().map(p => `
          <div class="pt-item">
            <div class="pt-dot" style="background:${p.status==='paid'?'var(--success)':p.status==='partial'?'var(--warning)':'var(--danger)'};"></div>
            <div class="pt-content">
              <div class="month">${p.month} ${p.year} — ৳${Number(p.paid).toLocaleString()} ${statusBadge(p.status)}</div>
              <div class="details">Date: ${formatDate(p.date)} | Receipt: ${p.receiptNo} | Due: ৳${p.due||0}</div>
            </div>
          </div>
        `).join('') : '<div style="color:var(--text-muted);font-size:13px;">No payment records found</div>'}
      </div>

      <div style="margin-top:16px;text-align:center;">
        <canvas id="qr-canvas" style="border-radius:8px;"></canvas>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">QR Code — Tenant ID: ${t.id}</div>
      </div>
    </div>
  `;
  openModal('tenant-detail-modal');
  setTimeout(() => {
    try { QRCode.toCanvas(document.getElementById('qr-canvas'), t.id + '|' + t.name + '|Room:' + t.room, { width: 100 }); } catch(e) {}
  }, 200);
}

function detailRow(label, val) {
  if (!val) return '';
  return `<div style="display:flex;gap:10px;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;">
    <span style="min-width:140px;color:var(--text-muted);font-weight:600;">${label}</span>
    <span style="color:var(--text);">${val}</span>
  </div>`;
}

function editTenant(id) {
  AppState.editTenantId = id;
  document.getElementById('add-tenant-title').textContent = 'Edit Tenant';
  showPage('add-tenant');
  const t = AppState.tenants.find(x => x.id === id);
  if (!t) return;
  setTimeout(() => {
    ['name','father','mother','spouse','nid','profession','mobile','altMobile','permAddr','presAddr','floor','building','rent','advance','entryDate','agreeStart','agreeEnd','emgName','emgPhone','notes'].forEach(f => {
      const el = document.getElementById('tf-' + kebab(f));
      if (el) el.value = t[f] || '';
    });
    document.getElementById('tf-tid').value = t.id;
    document.getElementById('tf-agreement-no').value = t.agreementNo;
    const roomSel = document.getElementById('tf-room');
    if (roomSel) roomSel.value = t.room;
    const elecSel = document.getElementById('tf-elec');
    if (elecSel) elecSel.value = t.elec || 'included';
    document.getElementById('tf-water').value = t.water || '';
  }, 100);
}

function kebab(s) {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function deleteTenant(id) {
  Swal.fire({ title: 'Delete Tenant?', text: 'This action cannot be undone!', icon: 'warning', showCancelButton: true, confirmButtonColor: '#e53e3e', confirmButtonText: 'Delete' })
    .then(r => {
      if (r.isConfirmed) {
        AppState.tenants = AppState.tenants.filter(t => t.id !== id);
        AppState.payments = AppState.payments.filter(p => p.tenantId !== id);
        save();
        renderTenants();
        initDashboard();
        showToast('Tenant deleted', 'success');
      }
    });
}

function quickPayment(id) {
  AppState.currentPaymentTenant = id;
  openPaymentModal(id);
}

function openPaymentFromDetail() {
  closeModal('tenant-detail-modal');
  openPaymentModal(AppState.currentPaymentTenant);
}

/* =========================================================
   ADD / EDIT TENANT FORM
   ========================================================= */
function initAddTenantForm() {
  if (!AppState.editTenantId) {
    document.getElementById('add-tenant-title').textContent = 'Add New Tenant';
    document.getElementById('tf-tid').value = generateTenantId();
    document.getElementById('tf-agreement-no').value = generateAgreementNo();
    document.getElementById('tf-entry-date').value = today();
    document.getElementById('tf-agree-start').value = today();
    const endDate = new Date(); endDate.setFullYear(endDate.getFullYear() + 1);
    document.getElementById('tf-agree-end').value = endDate.toISOString().split('T')[0];
  }
  populateRoomSelect();
}

function populateRoomSelect() {
  const sel = document.getElementById('tf-room');
  const availRooms = AppState.rooms.filter(r => r.status === 'available' || r.status === 'occupied');
  sel.innerHTML = '<option value="">-- Select Room --</option>' + availRooms.map(r => `<option value="${r.number}">${r.number} (${r.floor}, ${r.type})</option>`).join('');
}

function saveTenant() {
  const name = document.getElementById('tf-name').value.trim();
  const mobile = document.getElementById('tf-mobile').value.trim();
  const room = document.getElementById('tf-room').value;
  const rent = document.getElementById('tf-rent').value;

  if (!name || !mobile || !room || !rent) {
    showToast('Please fill required fields (Name, Mobile, Room, Rent)', 'error');
    return;
  }

  const t = {
    id: document.getElementById('tf-tid').value,
    agreementNo: document.getElementById('tf-agreement-no').value,
    name, mobile, room, rent: Number(rent),
    father: v('tf-father'), mother: v('tf-mother'), spouse: v('tf-spouse'),
    nid: v('tf-nid'), profession: v('tf-profession'), altMobile: v('tf-alt-mobile'),
    permAddr: v('tf-perm-addr'), presAddr: v('tf-pres-addr'),
    floor: v('tf-floor'), building: v('tf-building'),
    advance: v('tf-advance'), elec: v('tf-elec'), water: v('tf-water'),
    entryDate: v('tf-entry-date'), agreeStart: v('tf-agree-start'), agreeEnd: v('tf-agree-end'),
    emgName: v('tf-emg-name'), emgPhone: v('tf-emg-phone'),
    notes: v('tf-notes'),
    status: 'active',
    createdAt: AppState.editTenantId ? (AppState.tenants.find(x => x.id === document.getElementById('tf-tid').value)?.createdAt || nowISO()) : nowISO(),
  };

  // Family members
  const rows = document.querySelectorAll('#family-body tr');
  t.family = [];
  rows.forEach(row => {
    const inputs = row.querySelectorAll('input');
    if (inputs[0] && inputs[0].value) {
      t.family.push({ name: inputs[0].value, relation: inputs[1]?.value, age: inputs[2]?.value, nid: inputs[3]?.value });
    }
  });

  if (AppState.editTenantId) {
    const idx = AppState.tenants.findIndex(x => x.id === t.id);
    if (idx !== -1) AppState.tenants[idx] = t;
    else AppState.tenants.push(t);
    showToast('Tenant updated successfully!', 'success');
    AppState.editTenantId = null;
  } else {
    // Update room status
    const roomObj = AppState.rooms.find(r => r.number === room);
    if (roomObj) { roomObj.status = 'occupied'; roomObj.tenantId = t.id; }
    AppState.tenants.push(t);
    showToast('Tenant added successfully!', 'success');
  }

  save();
  resetTenantForm();
  showPage('tenants');
  initDashboard();
}

function v(id) { const el = document.getElementById(id); return el ? el.value : ''; }

function resetTenantForm() {
  document.getElementById('tenant-form').reset();
  document.getElementById('tf-tid').value = generateTenantId();
  document.getElementById('tf-agreement-no').value = generateAgreementNo();
  document.getElementById('tf-entry-date').value = today();
  AppState.editTenantId = null;
  ['photo-preview','nid-front-preview','nid-back-preview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function addFamilyRow() {
  const tbody = document.getElementById('family-body');
  const row = document.createElement('tr');
  row.innerHTML = `
    <td><input type="text" class="form-control" placeholder="Name" style="padding:7px 10px;"/></td>
    <td><input type="text" class="form-control" placeholder="Relation" style="padding:7px 10px;"/></td>
    <td><input type="number" class="form-control" placeholder="Age" style="padding:7px 10px;"/></td>
    <td><input type="text" class="form-control" placeholder="NID/Birth Cert" style="padding:7px 10px;"/></td>
    <td><button type="button" class="btn btn-danger btn-xs" onclick="removeFamilyRow(this)"><i class="fas fa-times"></i></button></td>
  `;
  tbody.appendChild(row);
}
function removeFamilyRow(btn) { btn.closest('tr').remove(); }

function previewUpload(input, previewId) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById(previewId);
    img.src = e.target.result;
    img.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function previewAgreement() {
  const name = v('tf-name');
  if (!name) { showToast('Please fill in tenant name first', 'error'); return; }
  const t = {
    name, father: v('tf-father'), mother: v('tf-mother'), spouse: v('tf-spouse'),
    nid: v('tf-nid'), mobile: v('tf-mobile'), room: v('tf-room'), floor: v('tf-floor'),
    building: v('tf-building') || 'RentPro Building', rent: v('tf-rent'),
    advance: v('tf-advance'), agreeStart: v('tf-agree-start'), agreeEnd: v('tf-agree-end'),
    agreementNo: v('tf-agreement-no'), id: v('tf-tid'),
  };
  showAgreementPreview(t);
  openModal('agreement-modal');
}

/* =========================================================
   ROOMS
   ========================================================= */
function renderRooms() {
  const filter = AppState.roomFilter;
  let rooms = AppState.rooms.filter(r => filter === 'all' ? true : r.status === filter);
  const grid = document.getElementById('rooms-grid');
  if (!rooms.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="icon"><i class="fas fa-door-open"></i></div><div class="title">No Rooms Found</div><div class="desc">Add your first room to manage</div><button class="btn btn-primary" onclick="openRoomModal()"><i class="fas fa-plus"></i> Add Room</button></div>`;
    return;
  }
  grid.innerHTML = rooms.map(r => {
    const tenant = AppState.tenants.find(t => t.room === r.number && t.status !== 'old');
    return `<div class="room-card ${r.status}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div class="room-number">${r.number}</div>
          <div class="room-floor">${r.floor} • ${r.type}</div>
        </div>
        ${roomStatusBadge(r.status)}
      </div>
      ${tenant ? `<div style="padding:10px 0 6px;border-top:1px solid var(--border);margin-top:10px;font-size:12.5px;"><i class="fas fa-user" style="color:var(--primary);margin-right:6px;"></i><b>${tenant.name}</b></div>` : ''}
      <div class="room-info">
        <div class="room-rent">৳${Number(r.rent||0).toLocaleString()}<span style="font-size:11px;color:var(--text-muted);font-weight:400;">/mo</span></div>
      </div>
      <div class="room-actions">
        <button class="btn btn-sm btn-outline" onclick="openRoomModal('${r.id}')"><i class="fas fa-edit"></i> Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteRoom('${r.id}')"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');
}

function filterRooms(f, el) {
  AppState.roomFilter = f;
  document.querySelectorAll('.page#page-rooms .filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderRooms();
}

function openRoomModal(id = null) {
  document.getElementById('room-edit-id').value = id || '';
  document.getElementById('room-modal-title').textContent = id ? 'Edit Room' : 'Add Room';
  if (id) {
    const r = AppState.rooms.find(x => x.id === id);
    if (r) {
      document.getElementById('rm-number').value = r.number;
      document.getElementById('rm-floor').value = r.floor;
      document.getElementById('rm-type').value = r.type;
      document.getElementById('rm-rent').value = r.rent;
      document.getElementById('rm-status').value = r.status;
    }
  } else {
    document.getElementById('rm-number').value = '';
    document.getElementById('rm-floor').value = '';
    document.getElementById('rm-rent').value = '';
    document.getElementById('rm-status').value = 'available';
  }
  openModal('room-modal');
}

function saveRoom() {
  const number = document.getElementById('rm-number').value.trim();
  if (!number) { showToast('Room number is required', 'error'); return; }
  const id = document.getElementById('room-edit-id').value;
  const room = {
    id: id || genId(),
    number,
    floor: document.getElementById('rm-floor').value,
    type: document.getElementById('rm-type').value,
    rent: Number(document.getElementById('rm-rent').value) || 0,
    status: document.getElementById('rm-status').value,
  };
  if (id) {
    const idx = AppState.rooms.findIndex(r => r.id === id);
    if (idx !== -1) AppState.rooms[idx] = room;
  } else {
    AppState.rooms.push(room);
  }
  save();
  closeModal('room-modal');
  renderRooms();
  showToast('Room saved!', 'success');
}

function deleteRoom(id) {
  Swal.fire({ title: 'Delete Room?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#e53e3e' })
    .then(r => {
      if (r.isConfirmed) {
        AppState.rooms = AppState.rooms.filter(r => r.id !== id);
        save();
        renderRooms();
        showToast('Room deleted', 'success');
      }
    });
}

/* =========================================================
   PAYMENTS
   ========================================================= */
function openPaymentModal(tenantId = null) {
  const sel = document.getElementById('pay-tenant');
  sel.innerHTML = '<option value="">-- Select Tenant --</option>' + AppState.tenants.filter(t => t.status !== 'old').map(t => `<option value="${t.id}">${t.name} (Room ${t.room})</option>`).join('');
  if (tenantId) { sel.value = tenantId; onPayTenantChange(); }

  // Default month to current
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('pay-month').value = months[new Date().getMonth()];
  document.getElementById('pay-year').value = new Date().getFullYear();
  document.getElementById('pay-date').value = today();

  // Populate month filter
  const mf = document.getElementById('payment-month-filter');
  mf.innerHTML = '<option value="">All Months</option>' + months.map(m => `<option>${m}</option>`).join('');

  openModal('payment-modal');
}

function onPayTenantChange() {
  const id = document.getElementById('pay-tenant').value;
  const t = AppState.tenants.find(x => x.id === id);
  if (t) {
    document.getElementById('pay-room').value = t.room;
    document.getElementById('pay-rent').value = t.rent;
    document.getElementById('pay-amount').value = t.rent;
    calcDue();
  }
}

function calcDue() {
  const rent = Number(document.getElementById('pay-rent').value) || 0;
  const paid = Number(document.getElementById('pay-amount').value) || 0;
  document.getElementById('pay-due').value = Math.max(0, rent - paid);
}

function savePayment() {
  const tenantId = document.getElementById('pay-tenant').value;
  const paid = Number(document.getElementById('pay-amount').value);
  const month = document.getElementById('pay-month').value;
  if (!tenantId || !paid || !month) { showToast('Please fill required fields', 'error'); return; }

  const rent = Number(document.getElementById('pay-rent').value) || 0;
  const due = Math.max(0, rent - paid);
  const payment = {
    id: genId(),
    receiptNo: generateReceiptNo(),
    tenantId,
    month,
    year: document.getElementById('pay-year').value,
    rent,
    paid,
    due,
    status: due === 0 ? 'paid' : (paid > 0 ? 'partial' : 'due'),
    date: document.getElementById('pay-date').value,
    collector: document.getElementById('pay-collector').value,
    notes: document.getElementById('pay-notes').value,
    createdAt: nowISO(),
  };
  AppState.payments.push(payment);
  save();
  closeModal('payment-modal');
  showReceipt(payment);
  renderPayments();
  initDashboard();
  showToast('Payment recorded & receipt generated!', 'success');
}

function renderPayments() {
  const q = (document.getElementById('payment-search').value || '').toLowerCase();
  const mf = document.getElementById('payment-month-filter').value;
  let list = AppState.payments.filter(p => {
    if (AppState.payFilter !== 'all' && p.status !== AppState.payFilter) return false;
    if (mf && p.month !== mf) return false;
    const t = AppState.tenants.find(x => x.id === p.tenantId);
    if (q && !(t?.name||'').toLowerCase().includes(q) && !(p.month||'').toLowerCase().includes(q) && !(t?.room||'').toLowerCase().includes(q)) return false;
    return true;
  }).reverse();

  const tbody = document.getElementById('payments-body');
  if (!list.length) { tbody.innerHTML = '<tr><td colspan="10"><div class="empty-state"><div class="icon"><i class="fas fa-receipt"></i></div><div class="title">No Payments Found</div></div></td></tr>'; return; }
  tbody.innerHTML = list.map(p => {
    const t = AppState.tenants.find(x => x.id === p.tenantId);
    return `<tr>
      <td style="font-size:11px;color:var(--text-muted);">${p.receiptNo}</td>
      <td><div style="font-weight:600;">${t?.name||'Unknown'}</div></td>
      <td><span class="badge badge-primary">${t?.room||'-'}</span></td>
      <td>${p.month} ${p.year}</td>
      <td>৳${Number(p.rent).toLocaleString()}</td>
      <td style="color:var(--success);font-weight:700;">৳${Number(p.paid).toLocaleString()}</td>
      <td style="color:${p.due > 0 ? 'var(--danger)' : 'var(--text-muted)'};font-weight:700;">৳${Number(p.due||0).toLocaleString()}</td>
      <td style="color:var(--text-muted);">${formatDate(p.date)}</td>
      <td>${statusBadge(p.status)}</td>
      <td><div class="action-btns">
        <button class="btn btn-sm btn-outline" onclick="showReceipt(AppState.payments.find(x=>x.id==='${p.id}'))"><i class="fas fa-receipt"></i></button>
        <button class="btn btn-sm btn-danger" onclick="deletePayment('${p.id}')"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');
}

function filterPayments() { renderPayments(); }
function setPayFilter(f, el) {
  AppState.payFilter = f;
  document.querySelectorAll('#page-payments .filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderPayments();
}

function deletePayment(id) {
  Swal.fire({ title: 'Delete payment?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#e53e3e' })
    .then(r => { if (r.isConfirmed) { AppState.payments = AppState.payments.filter(p => p.id !== id); save(); renderPayments(); showToast('Payment deleted', 'success'); } });
}

/* =========================================================
   RECEIPT
   ========================================================= */
let currentReceipt = null;

function showReceipt(payment) {
  if (!payment) return;
  currentReceipt = payment;
  const t = AppState.tenants.find(x => x.id === payment.tenantId);
  const settings = AppState.settings;
  document.getElementById('receipt-body').innerHTML = `
    <div class="receipt" id="printable-receipt">
      <div class="receipt-header">
        <div class="receipt-logo">Rent<span>Pro</span></div>
        <div class="receipt-subtitle">${settings.building || 'Rent Management System'}</div>
        <div style="font-size:12px;color:#6b7a99;margin-top:4px;">${settings.address || ''}</div>
        <div style="font-size:15px;font-weight:800;margin-top:10px;color:#1a2035;font-family:'Syne',sans-serif;">RENT RECEIPT</div>
        <div style="font-size:11px;color:#6b7a99;">Receipt No: ${payment.receiptNo}</div>
      </div>
      <div class="receipt-row"><span class="key">Tenant Name</span><span class="val">${t?.name||'Unknown'}</span></div>
      <div class="receipt-row"><span class="key">Room Number</span><span class="val">${t?.room||'-'}</span></div>
      <div class="receipt-row"><span class="key">Payment Month</span><span class="val">${payment.month} ${payment.year}</span></div>
      <div class="receipt-row"><span class="key">Monthly Rent</span><span class="val">৳${Number(payment.rent).toLocaleString()}</span></div>
      <div class="receipt-row"><span class="key">Amount Paid</span><span class="val" style="color:#0ea965;">৳${Number(payment.paid).toLocaleString()}</span></div>
      <div class="receipt-row"><span class="key">Due Amount</span><span class="val" style="color:${payment.due>0?'#e53e3e':'#0ea965'};">৳${Number(payment.due||0).toLocaleString()}</span></div>
      <div class="receipt-row"><span class="key">Payment Date</span><span class="val">${formatDate(payment.date)}</span></div>
      <div class="receipt-row"><span class="key">Status</span><span class="val">${payment.status.toUpperCase()}</span></div>
      ${payment.collector ? `<div class="receipt-row"><span class="key">Collected By</span><span class="val">${payment.collector}</span></div>` : ''}
      <div class="receipt-total"><span class="key">Total Paid</span><span class="val">৳${Number(payment.paid).toLocaleString()}</span></div>
      <div class="receipt-sig">
        <div class="sig"><div class="line"></div><div class="label">Tenant Signature</div></div>
        <div class="sig"><div class="line"></div><div class="label">Manager Signature</div></div>
      </div>
      <div class="receipt-footer">
        Thank you for your payment! • ${settings.building || 'RentPro'}<br/>
        Generated on ${new Date().toLocaleDateString('en-BD')}
      </div>
    </div>
  `;
  openModal('receipt-modal');
}

function printReceipt() {
  const content = document.getElementById('printable-receipt').innerHTML;
  const win = window.open('', '_blank');
  win.document.write(`<html><head><title>Rent Receipt</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Syne:wght@700;800&display=swap" rel="stylesheet">
    <style>
      body{font-family:'Plus Jakarta Sans',sans-serif;padding:30px;background:#fff;}
      .receipt{max-width:420px;margin:0 auto;border:2px solid #e5e9f2;border-radius:14px;padding:28px;}
      .receipt-header{text-align:center;border-bottom:2px dashed #e5e9f2;padding-bottom:16px;margin-bottom:16px;}
      .receipt-logo{font-family:'Syne',sans-serif;font-size:22px;font-weight:800;}
      .receipt-logo span{color:#f97316;}
      .receipt-row{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f4f6fb;font-size:13px;}
      .receipt-total{display:flex;justify-content:space-between;padding:14px 0 0;font-weight:800;}
      .receipt-footer{text-align:center;margin-top:18px;padding-top:14px;border-top:2px dashed #e5e9f2;font-size:11px;color:#6b7a99;}
      .receipt-sig{display:flex;justify-content:space-between;margin-top:32px;}
      .receipt-sig .sig{text-align:center;flex:1;}
      .receipt-sig .sig .line{border-bottom:1.5px solid #e5e9f2;margin-bottom:8px;height:32px;}
      .receipt-sig .sig .label{font-size:11px;color:#6b7a99;font-weight:600;}
      @media print{body{padding:0;}}
    </style></head><body>${content}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 500);
}

function downloadReceiptPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a5' });
  const t = AppState.tenants.find(x => x.id === currentReceipt?.tenantId);
  const p = currentReceipt;
  if (!p) return;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('RentPro', 74, 20, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('RENT RECEIPT', 74, 28, { align: 'center' });
  doc.text(`Receipt No: ${p.receiptNo}`, 74, 34, { align: 'center' });

  doc.setDrawColor(229, 233, 242);
  doc.line(15, 38, 133, 38);

  const rows = [
    ['Tenant Name', t?.name || 'Unknown'],
    ['Room Number', t?.room || '-'],
    ['Payment Month', `${p.month} ${p.year}`],
    ['Monthly Rent', `BDT ${Number(p.rent).toLocaleString()}`],
    ['Amount Paid', `BDT ${Number(p.paid).toLocaleString()}`],
    ['Due Amount', `BDT ${Number(p.due || 0).toLocaleString()}`],
    ['Payment Date', formatDate(p.date)],
    ['Status', p.status.toUpperCase()],
  ];

  let y = 46;
  rows.forEach(([k, v]) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
    doc.text(k, 18, y);
    doc.setFont('helvetica', 'normal');
    doc.text(v, 80, y);
    doc.setDrawColor(244, 246, 251);
    doc.line(15, y + 2, 133, y + 2);
    y += 9;
  });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(`Total Paid: BDT ${Number(p.paid).toLocaleString()}`, 74, y + 10, { align: 'center' });

  doc.save(`receipt_${p.receiptNo}.pdf`);
}

/* =========================================================
   AGREEMENT PDF
   ========================================================= */
function showAgreementPreview(t) {
  const settings = AppState.settings;
  document.getElementById('agreement-preview-body').innerHTML = `
    <div class="agreement-paper" id="agreement-doc">
      <h2>ভাড়াটিয়া চুক্তিপত্র<br/><small style="font-size:13px;">(Tenancy Agreement)</small></h2>
      <p>এই চুক্তিপত্র আজ <b>${formatDate(t.agreeStart || new Date().toISOString().split('T')[0])}</b> তারিখে নিম্নলিখিত পক্ষদ্বয়ের মধ্যে সম্পাদিত হইল।</p>
      <br/>
      <b>বাড়িওয়ালার তথ্য / Owner Information:</b>
      <div class="field-row"><span class="field-label">নাম / Name:</span><span class="field-val">${settings.owner || '__________________'}</span></div>
      <div class="field-row"><span class="field-label">ঠিকানা / Address:</span><span class="field-val">${settings.address || '__________________'}</span></div>
      <div class="field-row"><span class="field-label">ফোন / Phone:</span><span class="field-val">${settings.phone || '__________________'}</span></div>
      <br/>
      <b>ভাড়াটিয়ার তথ্য / Tenant Information:</b>
      <div class="field-row"><span class="field-label">নাম / Name:</span><span class="field-val">${t.name}</span></div>
      <div class="field-row"><span class="field-label">পিতার নাম / Father:</span><span class="field-val">${t.father || '__________________'}</span></div>
      <div class="field-row"><span class="field-label">মাতার নাম / Mother:</span><span class="field-val">${t.mother || '__________________'}</span></div>
      <div class="field-row"><span class="field-label">NID নম্বর:</span><span class="field-val">${t.nid || '__________________'}</span></div>
      <div class="field-row"><span class="field-label">মোবাইল / Mobile:</span><span class="field-val">${t.mobile || '__________________'}</span></div>
      <div class="field-row"><span class="field-label">স্থায়ী ঠিকানা / Permanent Address:</span><span class="field-val">${t.permAddr || '__________________'}</span></div>
      <br/>
      <b>ভাড়া সংক্রান্ত তথ্য / Rent Details:</b>
      <div class="field-row"><span class="field-label">ভবনের নাম / Building:</span><span class="field-val">${t.building || settings.building || '__________________'}</span></div>
      <div class="field-row"><span class="field-label">কক্ষ নম্বর / Room No:</span><span class="field-val">${t.room}</span></div>
      <div class="field-row"><span class="field-label">তলা / Floor:</span><span class="field-val">${t.floor || '__________________'}</span></div>
      <div class="field-row"><span class="field-label">মাসিক ভাড়া / Monthly Rent:</span><span class="field-val">৳${Number(t.rent || 0).toLocaleString()}</span></div>
      <div class="field-row"><span class="field-label">অগ্রিম / Advance:</span><span class="field-val">৳${Number(t.advance || 0).toLocaleString()}</span></div>
      <div class="field-row"><span class="field-label">চুক্তির মেয়াদ / Agreement Period:</span><span class="field-val">${formatDate(t.agreeStart)} থেকে ${formatDate(t.agreeEnd)}</span></div>
      <div class="field-row"><span class="field-label">চুক্তি নম্বর / Agreement No:</span><span class="field-val">${t.agreementNo || '__________________'}</span></div>
      <br/>
      <b>শর্তাবলী / Terms & Conditions:</b>
      <ol style="margin-left:20px;margin-top:8px;line-height:2;">
        <li>প্রতি মাসের ১-৫ তারিখের মধ্যে ভাড়া পরিশোধ করতে হবে।</li>
        <li>Rent must be paid between 1st–5th of each month.</li>
        <li>বিনা অনুমতিতে বাসস্থান পরিবর্তন করা যাবে না।</li>
        <li>সম্পত্তির ক্ষতি করলে ক্ষতিপূরণ দিতে হবে।</li>
        <li>চুক্তি বাতিলের ক্ষেত্রে ৩০ দিনের নোটিশ দিতে হবে।</li>
        <li>আইন বহির্ভূত কোনো কার্যক্রম করা যাবে না।</li>
      </ol>
      <br/><br/>
      <div style="display:flex;justify-content:space-between;margin-top:40px;">
        <div style="text-align:center;">
          <div style="border-bottom:1px solid #333;width:180px;margin:0 auto 8px;"></div>
          <div>বাড়িওয়ালার স্বাক্ষর / Owner Signature</div>
        </div>
        <div style="text-align:center;">
          <div style="border-bottom:1px solid #333;width:180px;margin:0 auto 8px;"></div>
          <div>ভাড়াটিয়ার স্বাক্ষর / Tenant Signature</div>
        </div>
        <div style="text-align:center;">
          <div style="border-bottom:1px solid #333;width:180px;margin:0 auto 8px;"></div>
          <div>সাক্ষীর স্বাক্ষর / Witness Signature</div>
        </div>
      </div>
    </div>
  `;
}

function downloadAgreementPDF() {
  if (document.getElementById('agreement-preview-body').innerHTML === '') {
    const t = AppState.tenants.find(x => x.id === AppState.currentPaymentTenant);
    if (t) showAgreementPreview(t);
  }
  const el = document.getElementById('agreement-doc');
  if (!el) { showToast('No agreement to download', 'error'); return; }
  html2canvas(el, { scale: 2, useCORS: true }).then(canvas => {
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const ratio = canvas.height / canvas.width;
    const width = 190;
    const height = width * ratio;
    doc.addImage(imgData, 'PNG', 10, 10, width, height);
    doc.save(`agreement_${AppState.currentPaymentTenant || 'tenant'}.pdf`);
    showToast('Agreement PDF downloaded!', 'success');
  });
}

/* =========================================================
   EXPENSES
   ========================================================= */
function openExpenseModal() {
  document.getElementById('exp-date').value = today();
  openModal('expense-modal');
}

function saveExpense() {
  const amount = Number(document.getElementById('exp-amount').value);
  if (!amount) { showToast('Please enter amount', 'error'); return; }
  const expense = {
    id: genId(),
    category: document.getElementById('exp-cat').value,
    amount,
    date: document.getElementById('exp-date').value,
    desc: document.getElementById('exp-desc').value,
    createdAt: nowISO(),
  };
  AppState.expenses.push(expense);
  save();
  closeModal('expense-modal');
  renderExpenses();
  showToast('Expense added!', 'success');
}

function renderExpenses() {
  const list = [...AppState.expenses].reverse();
  const total = list.reduce((s, e) => s + Number(e.amount||0), 0);
  const thisMonth = list.filter(e => e.date && e.date.startsWith(new Date().toISOString().substr(0,7))).reduce((s, e) => s + Number(e.amount||0), 0);
  document.getElementById('total-expense-val').textContent = '৳' + total.toLocaleString();
  document.getElementById('this-month-expense').textContent = '৳' + thisMonth.toLocaleString();

  const catIcons = { 'Electricity': 'fas fa-bolt', 'Water': 'fas fa-tint', 'Maintenance': 'fas fa-tools', 'Staff Salary': 'fas fa-user-tie', 'Other': 'fas fa-ellipsis-h' };
  const catColors = { 'Electricity': 'orange', 'Water': 'blue', 'Maintenance': 'teal', 'Staff Salary': 'purple', 'Other': 'gray' };

  const el = document.getElementById('expenses-list');
  if (!list.length) { el.innerHTML = '<div class="empty-state"><div class="icon"><i class="fas fa-receipt"></i></div><div class="title">No Expenses</div><div class="desc">Track your building expenses here</div></div>'; return; }
  el.innerHTML = list.map(e => `
    <div class="expense-row">
      <div class="expense-icon ${catColors[e.category] || 'orange'}"><i class="${catIcons[e.category] || 'fas fa-receipt'}"></i></div>
      <div>
        <div class="expense-name">${e.category}</div>
        <div class="expense-date">${formatDate(e.date)} ${e.desc ? '— ' + e.desc : ''}</div>
      </div>
      <div class="expense-amount">-৳${Number(e.amount).toLocaleString()}</div>
      <button class="btn btn-xs btn-danger" style="margin-left:10px;" onclick="deleteExpense('${e.id}')"><i class="fas fa-trash"></i></button>
    </div>
  `).join('');
}

function deleteExpense(id) {
  AppState.expenses = AppState.expenses.filter(e => e.id !== id);
  save();
  renderExpenses();
  showToast('Expense deleted', 'success');
}

/* =========================================================
   REPORTS
   ========================================================= */
let reportIncomeChart = null, expenseChart = null;

function initReports() {
  const tenants = AppState.tenants;
  const payments = AppState.payments;
  const rooms = AppState.rooms;

  const totalIncome = payments.filter(p => p.status !== 'due').reduce((s, p) => s + Number(p.paid||0), 0);
  const totalDue = payments.filter(p => p.status === 'due' || p.status === 'partial').reduce((s, p) => s + Number(p.due||0), 0);
  const occupancyRate = rooms.length ? Math.round((tenants.filter(t=>t.status!=='old').length / rooms.length) * 100) : 0;
  const totalExpenses = AppState.expenses.reduce((s, e) => s + Number(e.amount||0), 0);

  document.getElementById('report-stats').innerHTML = `
    <div class="stat-card"><div class="stat-icon green"><i class="fas fa-money-bill-wave"></i></div><div><div class="stat-value">৳${totalIncome.toLocaleString()}</div><div class="stat-label">Total Income</div></div></div>
    <div class="stat-card"><div class="stat-icon red"><i class="fas fa-exclamation-circle"></i></div><div><div class="stat-value">৳${totalDue.toLocaleString()}</div><div class="stat-label">Total Due</div></div></div>
    <div class="stat-card"><div class="stat-icon orange"><i class="fas fa-receipt"></i></div><div><div class="stat-value">৳${totalExpenses.toLocaleString()}</div><div class="stat-label">Total Expenses</div></div></div>
    <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-percent"></i></div><div><div class="stat-value">${occupancyRate}%</div><div class="stat-label">Occupancy Rate</div></div></div>
  `;

  // Monthly income chart
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fullMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const incomeData = months.map((m, i) => payments.filter(p => p.month === fullMonths[i] && p.status !== 'due').reduce((s, p) => s + Number(p.paid||0), 0));

  const ctx1 = document.getElementById('reportIncomeChart').getContext('2d');
  if (reportIncomeChart) reportIncomeChart.destroy();
  reportIncomeChart = new Chart(ctx1, {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'Income', data: incomeData,
        borderColor: '#1a56db', backgroundColor: 'rgba(26,86,219,0.08)',
        borderWidth: 2, fill: true, tension: 0.4, pointRadius: 4,
      }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { callback: v => '৳' + v } } } }
  });

  // Expense breakdown
  const expCats = ['Electricity','Water','Maintenance','Staff Salary','Other'];
  const expData = expCats.map(c => AppState.expenses.filter(e => e.category === c).reduce((s, e) => s + Number(e.amount||0), 0));
  const ctx2 = document.getElementById('expenseChart').getContext('2d');
  if (expenseChart) expenseChart.destroy();
  expenseChart = new Chart(ctx2, {
    type: 'pie',
    data: {
      labels: expCats,
      datasets: [{ data: expData, backgroundColor: ['#f97316','#1a56db','#0d9488','#7c3aed','#6b7a99'], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });

  // Due report
  const dueBody = document.getElementById('due-report-body');
  const dues = payments.filter(p => p.status === 'due' || p.status === 'partial');
  if (!dues.length) { dueBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--success);padding:20px;"><i class="fas fa-check-circle"></i> No due payments!</td></tr>'; return; }
  dueBody.innerHTML = dues.map(p => {
    const t = AppState.tenants.find(x => x.id === p.tenantId);
    return `<tr>
      <td><b>${t?.name||'Unknown'}</b></td>
      <td><span class="badge badge-primary">${t?.room||'-'}</span></td>
      <td>${t?.mobile||'-'}</td>
      <td>${p.month} ${p.year}</td>
      <td style="color:var(--danger);font-weight:800;font-family:'Syne',sans-serif;">৳${Number(p.due||0).toLocaleString()}</td>
    </tr>`;
  }).join('');
}

function exportReportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text('RentPro - Monthly Report', 105, 20, { align: 'center' });
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 105, 28, { align: 'center' });
  doc.line(15, 32, 195, 32);
  let y = 42;
  const payments = AppState.payments;
  const totalIncome = payments.filter(p => p.status !== 'due').reduce((s, p) => s + Number(p.paid||0), 0);
  const totalDue = payments.filter(p => p.status === 'due').reduce((s, p) => s + Number(p.due||0), 0);
  doc.setFontSize(12); doc.setFont('helvetica','bold');
  doc.text('Summary', 15, y); y += 8;
  doc.setFontSize(10); doc.setFont('helvetica','normal');
  doc.text(`Total Income: BDT ${totalIncome.toLocaleString()}`, 20, y); y += 7;
  doc.text(`Total Due: BDT ${totalDue.toLocaleString()}`, 20, y); y += 7;
  doc.text(`Active Tenants: ${AppState.tenants.filter(t=>t.status!=='old').length}`, 20, y); y += 7;
  doc.text(`Total Rooms: ${AppState.rooms.length}`, 20, y);
  doc.save('rentpro_report.pdf');
  showToast('Report PDF downloaded!', 'success');
}

function exportDueReport() {
  const dues = AppState.payments.filter(p => p.status === 'due' || p.status === 'partial');
  if (!dues.length) { showToast('No due payments to export', 'info'); return; }
  const data = dues.map(p => {
    const t = AppState.tenants.find(x => x.id === p.tenantId);
    return { Name: t?.name||'', Room: t?.room||'', Phone: t?.mobile||'', Month: p.month + ' ' + p.year, Due: '৳' + Number(p.due||0).toLocaleString() };
  });
  exportToExcel(data, 'due_report');
}

/* =========================================================
   NOTICES
   ========================================================= */
function openNoticeModal() { openModal('notice-modal'); }

function saveNotice() {
  const title = document.getElementById('notice-title').value.trim();
  if (!title) { showToast('Title is required', 'error'); return; }
  AppState.notices.push({
    id: genId(), title,
    type: document.getElementById('notice-type').value,
    msg: document.getElementById('notice-msg').value,
    createdAt: nowISO(),
  });
  save();
  closeModal('notice-modal');
  renderNotices();
  renderNotifications();
  showToast('Notice published!', 'success');
}

function renderNotices() {
  const el = document.getElementById('notices-body');
  if (!AppState.notices.length) { el.innerHTML = '<div class="empty-state"><div class="icon"><i class="fas fa-bell-slash"></i></div><div class="title">No Notices</div><div class="desc">Post notices for tenants</div></div>'; return; }
  el.innerHTML = [...AppState.notices].reverse().map(n => `
    <div style="display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid var(--border);">
      <div class="stat-icon ${n.type==='danger'?'red':n.type==='warning'?'orange':'blue'}" style="width:36px;height:36px;border-radius:8px;font-size:14px;flex-shrink:0;"><i class="fas ${n.type==='danger'?'fa-exclamation-triangle':n.type==='warning'?'fa-exclamation-circle':'fa-info-circle'}"></i></div>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:14px;">${n.title}</div>
        <div style="color:var(--text-muted);font-size:13px;margin-top:4px;">${n.msg}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">${formatDate(n.createdAt?.split('T')[0])}</div>
      </div>
      <button class="btn btn-xs btn-danger" onclick="deleteNotice('${n.id}')"><i class="fas fa-trash"></i></button>
    </div>
  `).join('');
}

function deleteNotice(id) {
  AppState.notices = AppState.notices.filter(n => n.id !== id);
  save();
  renderNotices();
  renderNotifications();
}

/* =========================================================
   NOTIFICATIONS
   ========================================================= */
function renderNotifications() {
  const notifs = [];
  const today = new Date();
  AppState.notices.slice(-3).forEach(n => notifs.push({ type: n.type, icon: 'fas fa-bell', title: n.title, time: formatDate(n.createdAt?.split('T')[0]) }));
  AppState.tenants.forEach(t => {
    if (t.agreeEnd) {
      const d = new Date(t.agreeEnd);
      const daysLeft = Math.ceil((d - today) / 86400000);
      if (daysLeft <= 30 && daysLeft >= 0) notifs.push({ type: 'warning', icon: 'fas fa-file-contract', title: `${t.name}'s agreement expires in ${daysLeft} days`, time: 'Agreement Alert' });
    }
  });
  AppState.payments.filter(p => p.status === 'due').slice(0,3).forEach(p => {
    const t = AppState.tenants.find(x => x.id === p.tenantId);
    notifs.push({ type: 'danger', icon: 'fas fa-money-bill', title: `${t?.name||'Tenant'} — Rent due (${p.month})`, time: 'Payment Due' });
  });

  const list = document.getElementById('notif-list');
  list.innerHTML = notifs.slice(0, 6).map(n => `
    <div class="notif-item">
      <div class="notif-icon ${n.type==='danger'?'red':n.type==='warning'?'orange':'blue'}" style="background:${n.type==='danger'?'var(--danger-light)':n.type==='warning'?'var(--accent-light)':'var(--primary-light)'};"><i class="${n.icon}" style="color:${n.type==='danger'?'var(--danger)':n.type==='warning'?'var(--accent)':'var(--primary)'};"></i></div>
      <div class="notif-text"><div class="title">${n.title}</div><div class="time">${n.time}</div></div>
    </div>
  `).join('') || '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">No new notifications</div>';

  document.getElementById('notif-count-label').textContent = notifs.length ? `${Math.min(notifs.length, 6)} alerts` : '';
  document.getElementById('notif-dot').style.display = notifs.length ? 'block' : 'none';
}

function toggleNotifPanel() {
  document.getElementById('notif-panel').classList.toggle('show');
}

document.addEventListener('click', e => {
  if (!e.target.closest('#notif-btn') && !e.target.closest('#notif-panel')) {
    document.getElementById('notif-panel').classList.remove('show');
  }
});

/* =========================================================
   SETTINGS
   ========================================================= */
function saveSettings() {
  AppState.settings.building = document.getElementById('set-building').value;
  AppState.settings.owner = document.getElementById('set-owner').value;
  AppState.settings.phone = document.getElementById('set-phone').value;
  AppState.settings.address = document.getElementById('set-address').value;
  AppState.settings.holding = document.getElementById('set-holding').value;
  save();
  showToast('Settings saved!', 'success');
}

function saveAdminProfile() {
  AppState.settings.adminName = document.getElementById('set-admin-name').value;
  AppState.settings.adminEmail = document.getElementById('set-admin-email').value;
  const newPass = document.getElementById('set-new-pass').value;
  if (newPass) AppState.settings.adminPassword = newPass;
  save();
  showToast('Profile updated!', 'success');
}

function loadSettingsForm() {
  const s = AppState.settings;
  if (s.building) document.getElementById('set-building').value = s.building;
  if (s.owner) document.getElementById('set-owner').value = s.owner;
  if (s.phone) document.getElementById('set-phone').value = s.phone;
  if (s.address) document.getElementById('set-address').value = s.address;
  if (s.adminName) document.getElementById('set-admin-name').value = s.adminName;
  if (s.adminEmail) document.getElementById('set-admin-email').value = s.adminEmail || 'admin@rentpro.com';
}

/* =========================================================
   DATA BACKUP / RESTORE
   ========================================================= */
function exportBackup() {
  const data = { tenants: AppState.tenants, rooms: AppState.rooms, payments: AppState.payments, expenses: AppState.expenses, notices: AppState.notices, settings: AppState.settings, exportedAt: nowISO() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `rentpro_backup_${today()}.json`;
  a.click();
  showToast('Backup downloaded!', 'success');
}

function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      Swal.fire({ title: 'Import Backup?', text: 'This will overwrite all current data!', icon: 'warning', showCancelButton: true, confirmButtonColor: '#e53e3e' })
        .then(r => {
          if (r.isConfirmed) {
            if (data.tenants) AppState.tenants = data.tenants;
            if (data.rooms) AppState.rooms = data.rooms;
            if (data.payments) AppState.payments = data.payments;
            if (data.expenses) AppState.expenses = data.expenses;
            if (data.notices) AppState.notices = data.notices;
            if (data.settings) AppState.settings = data.settings;
            save();
            initDashboard();
            showToast('Backup imported successfully!', 'success');
          }
        });
    } catch { showToast('Invalid backup file', 'error'); }
  };
  reader.readAsText(file);
}

function clearAllData() {
  Swal.fire({ title: 'Clear All Data?', text: 'This PERMANENTLY deletes everything!', icon: 'warning', showCancelButton: true, confirmButtonColor: '#e53e3e', confirmButtonText: 'Yes, Delete All' })
    .then(r => {
      if (r.isConfirmed) {
        AppState.tenants = []; AppState.rooms = []; AppState.payments = []; AppState.expenses = []; AppState.notices = [];
        save(); initDashboard(); showToast('All data cleared', 'warning');
      }
    });
}

function loadDemoData() {
  Swal.fire({ title: 'Load Demo Data?', text: 'This will add sample tenants, rooms, and payments.', icon: 'info', showCancelButton: true, confirmButtonText: 'Load Demo' })
    .then(r => {
      if (!r.isConfirmed) return;
      AppState.rooms = [
        { id: genId(), number: '101', floor: 'Ground', type: 'Family', rent: 8000, status: 'occupied' },
        { id: genId(), number: '102', floor: 'Ground', type: 'Single Bed', rent: 5000, status: 'occupied' },
        { id: genId(), number: '201', floor: '1st', type: 'Family', rent: 9000, status: 'occupied' },
        { id: genId(), number: '202', floor: '1st', type: 'Double Bed', rent: 7000, status: 'available' },
        { id: genId(), number: '301', floor: '2nd', type: 'Studio', rent: 6000, status: 'available' },
        { id: genId(), number: '302', floor: '2nd', type: 'Family', rent: 10000, status: 'maintenance' },
      ];
      const t1id = generateTenantId(); const t2id = generateTenantId(); const t3id = generateTenantId();
      AppState.tenants = [
        { id: t1id, agreementNo: generateAgreementNo(), name: 'Mohammad Rahman', father: 'Abdul Rahman', mobile: '01712345678', room: '101', floor: 'Ground', building: 'Green Valley', rent: 8000, advance: 16000, entryDate: '2024-01-15', agreeStart: '2024-01-15', agreeEnd: '2025-01-14', status: 'active', profession: 'Business', nid: '1234567890', emgName: 'Karim', emgPhone: '01987654321', permAddr: 'Comilla, Dhaka', presAddr: 'Mirpur, Dhaka', createdAt: '2024-01-15T10:00:00Z' },
        { id: t2id, agreementNo: generateAgreementNo(), name: 'Fatema Begum', father: 'Nurul Islam', mobile: '01812345678', room: '102', floor: 'Ground', building: 'Green Valley', rent: 5000, advance: 10000, entryDate: '2024-03-01', agreeStart: '2024-03-01', agreeEnd: '2025-02-28', status: 'active', profession: 'Homemaker', nid: '9876543210', emgName: 'Rahim', emgPhone: '01611111111', permAddr: 'Sylhet', presAddr: 'Banani, Dhaka', createdAt: '2024-03-01T09:00:00Z' },
        { id: t3id, agreementNo: generateAgreementNo(), name: 'Kamal Hossain', father: 'Salam Hossain', mobile: '01912345678', room: '201', floor: '1st', building: 'Green Valley', rent: 9000, advance: 18000, entryDate: '2023-06-10', agreeStart: '2023-06-10', agreeEnd: '2024-06-09', status: 'active', profession: 'Service', nid: '1122334455', emgName: 'Ripon', emgPhone: '01522222222', permAddr: 'Chittagong', presAddr: 'Gulshan, Dhaka', createdAt: '2023-06-10T08:00:00Z' },
      ];
      const months = ['January','February','March','April'];
      AppState.payments = [];
      months.forEach((month, i) => {
        AppState.payments.push({ id: genId(), receiptNo: generateReceiptNo(), tenantId: t1id, month, year: '2025', rent: 8000, paid: 8000, due: 0, status: 'paid', date: `2025-0${i+1}-05`, collector: 'Admin', createdAt: nowISO() });
        AppState.payments.push({ id: genId(), receiptNo: generateReceiptNo(), tenantId: t2id, month, year: '2025', rent: 5000, paid: i < 3 ? 5000 : 3000, due: i < 3 ? 0 : 2000, status: i < 3 ? 'paid' : 'partial', date: `2025-0${i+1}-03`, collector: 'Admin', createdAt: nowISO() });
        if (i < 3) AppState.payments.push({ id: genId(), receiptNo: generateReceiptNo(), tenantId: t3id, month, year: '2025', rent: 9000, paid: 9000, due: 0, status: 'paid', date: `2025-0${i+1}-04`, collector: 'Admin', createdAt: nowISO() });
      });
      // Due payment
      AppState.payments.push({ id: genId(), receiptNo: generateReceiptNo(), tenantId: t3id, month: 'April', year: '2025', rent: 9000, paid: 0, due: 9000, status: 'due', date: '', collector: '', createdAt: nowISO() });

      AppState.expenses = [
        { id: genId(), category: 'Electricity', amount: 3500, date: '2025-04-30', desc: 'Common area electricity', createdAt: nowISO() },
        { id: genId(), category: 'Water', amount: 1200, date: '2025-04-28', desc: 'Monthly water bill', createdAt: nowISO() },
        { id: genId(), category: 'Maintenance', amount: 4000, date: '2025-04-15', desc: 'Elevator repair', createdAt: nowISO() },
        { id: genId(), category: 'Staff Salary', amount: 8000, date: '2025-04-01', desc: 'Security & cleaner', createdAt: nowISO() },
      ];

      AppState.settings = { ...AppState.settings, building: 'Green Valley Apartments', owner: 'Haji Abdul Karim', phone: '01711111111', address: 'House 12, Road 5, Mirpur, Dhaka', holding: 'DHK-001-2024' };
      save();
      initDashboard();
      loadSettingsForm();
      showToast('Demo data loaded!', 'success');
    });
}

/* =========================================================
   EXCEL EXPORT
   ========================================================= */
function exportTenantExcel() {
  if (!AppState.tenants.length) { showToast('No tenants to export', 'info'); return; }
  const data = AppState.tenants.map(t => ({
    'Tenant ID': t.id, 'Name': t.name, 'Father': t.father, 'Mobile': t.mobile,
    'NID': t.nid, 'Room': t.room, 'Floor': t.floor, 'Rent': t.rent,
    'Entry Date': t.entryDate, 'Agreement End': t.agreeEnd, 'Status': t.status
  }));
  exportToExcel(data, 'tenants');
}

function exportToExcel(data, name) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `${name}_${today()}.xlsx`);
  showToast('Excel file downloaded!', 'success');
}

/* =========================================================
   MODALS
   ========================================================= */
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
});

/* =========================================================
   TOASTS
   ========================================================= */
function showToast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast-msg ${type}`;
  toast.innerHTML = `<span class="icon">${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(60px)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 300); }, 3000);
}

/* =========================================================
   HELPERS
   ========================================================= */
function genId() { return Math.random().toString(36).substr(2, 9).toUpperCase(); }
function generateTenantId() { return 'TN' + Date.now().toString().substr(-6); }
function generateAgreementNo() { return 'AGR-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 9000 + 1000); }
function generateReceiptNo() { return 'RCP-' + Date.now().toString().substr(-8); }
function today() { return new Date().toISOString().split('T')[0]; }
function nowISO() { return new Date().toISOString(); }
function formatDate(d) { if (!d) return '-'; try { return new Date(d).toLocaleDateString('en-BD', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; } }

function statusBadge(s) {
  const map = { active: 'success', paid: 'success', due: 'danger', partial: 'warning', old: 'gray', maintenance: 'warning', available: 'success', occupied: 'primary' };
  const icons = { active: 'fa-circle-check', paid: 'fa-check', due: 'fa-exclamation', partial: 'fa-circle-half-stroke', old: 'fa-clock', available: 'fa-door-open', occupied: 'fa-home', maintenance: 'fa-tools' };
  return `<span class="badge badge-${map[s]||'gray'}"><i class="fas ${icons[s]||'fa-circle'}"></i> ${s.charAt(0).toUpperCase()+s.slice(1)}</span>`;
}

function roomStatusBadge(s) {
  return statusBadge(s);
}

/* =========================================================
   INIT
   ========================================================= */
function init() {
  // Apply theme
  const theme = AppState.settings.theme || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'dark') { document.getElementById('theme-icon').className = 'fas fa-sun'; document.getElementById('theme-label').textContent = 'Light'; }

  // Check auth
  if (AppState.auth?.loggedIn) {
    enterApp();
  }

  // Load settings form
  loadSettingsForm();

  // Login on Enter
  document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('login-email').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

  // Populate payment year
  document.getElementById('pay-year').value = new Date().getFullYear();

  // Update due count badge
  const dueCount = AppState.payments.filter(p => p.status === 'due').length;
  document.getElementById('due-count-badge').textContent = dueCount;
  if (!dueCount) document.getElementById('due-count-badge').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', init);
