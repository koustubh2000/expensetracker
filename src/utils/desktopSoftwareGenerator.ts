import { UserAccount, UserVaultData } from '../types/finance';

/**
 * Generates a 100% self-contained, zero-dependency Windows Desktop Application (.hta)
 * or Universal Portable Offline App (.html) pre-loaded with the user's current database.
 * On Windows, .hta files are executed directly by the OS (mshta.exe) as a standalone
 * desktop software window without any browser address bar or Node.js requirement.
 */
export function generateStandaloneDesktopSoftware(
  users: UserAccount[],
  vault: UserVaultData,
  mode: 'hta' | 'html'
): string {
  const embeddedState = JSON.stringify({ users, vault });

  const htaHeader =
    mode === 'hta'
      ? `<HTA:APPLICATION
    ID="PocketLedgerVaultApp"
    APPLICATIONNAME="PocketLedger Vault"
    BORDER="thick"
    BORDERSTYLE="normal"
    CAPTION="yes"
    MAXIMIZEBUTTON="yes"
    MINIMIZEBUTTON="yes"
    SHOWINTASKBAR="yes"
    SINGLEINSTANCE="yes"
    SYSMENU="yes"
    VERSION="1.0.0"
    WINDOWSTATE="normal" />`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PocketLedger Vault — Standalone Offline Desktop Software</title>
  ${htaHeader}
  <style>
    :root {
      --bg: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #10b981;
      --danger: #f43f5e;
    }
    body.light {
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #e2e8f0;
      --text: #0f172a;
      --muted: #64748b;
    }
    * { box-sizing: border-box; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif; }
    body { margin: 0; background: var(--bg); color: var(--text); min-height: 100vh; }
    header { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; background: var(--card); border-bottom: 1px solid var(--border); }
    .brand { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
    .badge { font-size: 12px; color: var(--accent); font-family: monospace; }
    .container { max-width: 1360px; margin: 0 auto; padding: 24px; }
    .grid-4 { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px; }
    .card-title { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    .card-value { font-size: 22px; font-weight: 700; font-family: monospace; }
    .tabs { display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; }
    button { background: var(--accent); color: #fff; border: none; padding: 9px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
    button.secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
    button.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; }
    th { color: var(--muted); font-weight: 600; }
    .right { text-align: right; font-family: monospace; }
    input, select { background: var(--bg); color: var(--text); border: 1px solid var(--border); padding: 8px 12px; border-radius: 8px; font-size: 13px; width: 100%; }
    .form-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>PocketLedger Vault</span>
      <span class="badge">Offline Desktop Edition</span>
    </div>
    <div style="display:flex; gap:10px; align-items:center;">
      <button class="secondary" onclick="toggleTheme()">Toggle Dark / Light</button>
      <button class="secondary" onclick="exportDatabaseFile()">Save Local .db.json File</button>
      <button onclick="lockOrUnlock()" id="lockBtn">Lock Session</button>
    </div>
  </header>

  <div id="loginGate" class="container hidden" style="max-width:460px; margin-top:60px;">
    <div class="card">
      <h2 style="margin-top:0;">Unlock Offline Desktop Vault</h2>
      <p style="font-size:13px; color:var(--muted);">Default Admin Login: <strong>admin</strong> / <strong>admin</strong></p>
      <div style="margin-bottom:12px;">
        <label style="font-size:12px; display:block; margin-bottom:4px;">Username</label>
        <input id="loginUser" value="admin" />
      </div>
      <div style="margin-bottom:16px;">
        <label style="font-size:12px; display:block; margin-bottom:4px;">Password</label>
        <input id="loginPass" type="password" value="admin" />
      </div>
      <button style="width:100%;" onclick="performLogin()">Sign In Offline</button>
    </div>
  </div>

  <div id="appWorkspace" class="container">
    <div class="grid-4" id="kpiStrip"></div>

    <div class="tabs">
      <button id="tabBtn-records" class="active" onclick="showTab('records')">Ledger & Add Record</button>
      <button id="tabBtn-people" class="secondary" onclick="showTab('people')">People, Expected Money & Export Bill</button>
      <button id="tabBtn-dreams" class="secondary" onclick="showTab('dreams')">Dream Investments & Money Storage</button>
    </div>

    <!-- Tab 1: Records -->
    <div id="tab-records">
      <div class="card" style="margin-bottom:20px;">
        <h3 style="margin-top:0; font-size:15px;">Add New Transaction Record (Supports "Other" Custom Category)</h3>
        <div class="form-row">
          <div>
            <label style="font-size:11px; color:var(--muted);">Title</label>
            <input id="txTitle" placeholder="e.g. Monthly Groceries" />
          </div>
          <div>
            <label style="font-size:11px; color:var(--muted);">Amount ($)</label>
            <input id="txAmount" type="number" step="0.01" placeholder="0.00" />
          </div>
          <div>
            <label style="font-size:11px; color:var(--muted);">Type</label>
            <select id="txType">
              <option value="expense">Expense</option>
              <option value="income">Income / Incoming</option>
              <option value="dream_investment">Dream Investment</option>
              <option value="lending_out">Lending Out</option>
              <option value="expected_incoming">Expecting Money</option>
              <option value="other">Other (Custom)</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px; color:var(--muted);">Category (Includes Other)</label>
            <select id="txCat" onchange="toggleCustomCat()">
              <option value="Groceries & Dining">Groceries & Dining</option>
              <option value="Salary & Payroll">Salary & Payroll</option>
              <option value="Housing & Rent">Housing & Rent</option>
              <option value="Dream Home Corpus">Dream Home Corpus</option>
              <option value="Client Invoice Receivable">Client Invoice Receivable</option>
              <option value="Other">Other (Custom Category)</option>
            </select>
          </div>
          <div id="customCatBox" class="hidden">
            <label style="font-size:11px; color:var(--muted);">Custom Category (Other)</label>
            <input id="txCustomCat" placeholder="Enter custom category" />
          </div>
        </div>
        <button onclick="addRecord()">+ Save Record to Offline DB</button>
      </div>

      <div class="card">
        <h3 style="margin-top:0; font-size:15px;">Transaction History</h3>
        <table>
          <thead>
            <tr><th>Date</th><th>Title</th><th>Type</th><th>Category</th><th class="right">Amount</th></tr>
          </thead>
          <tbody id="txTableBody"></tbody>
        </table>
      </div>
    </div>

    <!-- Tab 2: People & Bills -->
    <div id="tab-people" class="hidden">
      <div class="card">
        <h3 style="margin-top:0; font-size:15px;">People, Lending & Bill Exporter</h3>
        <div id="peopleList"></div>
      </div>
    </div>

    <!-- Tab 3: Dream Vaults -->
    <div id="tab-dreams" class="hidden">
      <div class="card">
        <h3 style="margin-top:0; font-size:15px;">Dream Investments & Money Storage Vaults</h3>
        <div id="dreamsList" class="grid-4"></div>
      </div>
    </div>
  </div>

  <script>
    const INITIAL_DATA = ${embeddedState};
    const STORAGE_KEY = 'pocketledger_standalone_desktop_v1';
    let state = INITIAL_DATA;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) state = JSON.parse(saved);
    } catch (e) {}

    function saveState() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
      renderAll();
    }

    function toggleTheme() {
      document.body.classList.toggle('light');
    }

    function lockOrUnlock() {
      const gate = document.getElementById('loginGate');
      const ws = document.getElementById('appWorkspace');
      const btn = document.getElementById('lockBtn');
      if (ws.classList.contains('hidden')) {
        performLogin();
      } else {
        ws.classList.add('hidden');
        gate.classList.remove('hidden');
        btn.textContent = 'Unlock Vault';
      }
    }

    function performLogin() {
      const u = document.getElementById('loginUser').value.trim().toLowerCase();
      const p = document.getElementById('loginPass').value;
      const matched = state.users.find(x => x.username.toLowerCase() === u && x.passwordHash === p);
      if (!matched) {
        alert('Invalid credentials. Default admin login is admin / admin.');
        return;
      }
      document.getElementById('loginGate').classList.add('hidden');
      document.getElementById('appWorkspace').classList.remove('hidden');
      document.getElementById('lockBtn').textContent = 'Lock Session';
    }

    function showTab(name) {
      ['records', 'people', 'dreams'].forEach(t => {
        document.getElementById('tab-' + t).classList.toggle('hidden', t !== name);
        document.getElementById('tabBtn-' + t).className = (t === name) ? 'active' : 'secondary';
      });
    }

    function toggleCustomCat() {
      const val = document.getElementById('txCat').value;
      document.getElementById('customCatBox').classList.toggle('hidden', val !== 'Other');
    }

    function addRecord() {
      const title = document.getElementById('txTitle').value.trim();
      const amount = parseFloat(document.getElementById('txAmount').value);
      const type = document.getElementById('txType').value;
      const cat = document.getElementById('txCat').value;
      const customCat = document.getElementById('txCustomCat').value.trim();
      if (!title || !amount || amount <= 0) return;
      state.vault.transactions.unshift({
        id: 'tx-' + Date.now(),
        date: new Date().toISOString().slice(0, 10),
        title,
        amount,
        type,
        category: cat,
        customCategory: cat === 'Other' ? customCat : undefined,
        accountId: state.vault.accounts[0]?.id || 'acc-1',
        paymentMethod: 'Offline Desktop Entry',
        status: 'completed'
      });
      document.getElementById('txTitle').value = '';
      document.getElementById('txAmount').value = '';
      saveState();
    }

    function exportBillForPerson(personId) {
      const p = state.vault.people.find(x => x.id === personId);
      if (!p) return;
      const items = state.vault.expectedItems.filter(i => i.personId === personId);
      let txt = 'STATEMENT OF ACCOUNT & BILL FOR: ' + p.name + '\\n----------------------------------------\\n';
      let net = 0;
      items.forEach(i => {
        const due = Math.max(0, i.amount - i.settledAmount);
        net += due;
        txt += '[' + i.date + '] ' + i.title + ' | Total: $' + i.amount + ' | Paid: $' + i.settledAmount + ' | Due: $' + due + '\\n';
      });
      txt += '----------------------------------------\\nNET BALANCE PAYABLE: $' + net.toFixed(2);
      const blob = new Blob([txt], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Bill_' + p.name.replace(/\\s+/g, '_') + '.txt';
      a.click();
    }

    function exportDatabaseFile() {
      const blob = new Blob([JSON.stringify(state.vault, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'PocketLedger_Local_Vault.db.json';
      a.click();
    }

    function renderAll() {
      const txs = state.vault.transactions || [];
      let inc = 0, exp = 0, drm = 0;
      txs.forEach(t => {
        if (t.type === 'income') inc += t.amount;
        else if (t.type === 'expense') exp += t.amount;
        else if (t.type === 'dream_investment') drm += t.amount;
      });
      const dreamTotal = (state.vault.dreamVaults || []).reduce((s, d) => s + d.currentAmount, 0);
      document.getElementById('kpiStrip').innerHTML =
        '<div class="card"><div class="card-title">Total Income</div><div class="card-value" style="color:#10b981;">+$' + inc.toLocaleString() + '</div></div>' +
        '<div class="card"><div class="card-title">Total Expenses</div><div class="card-value" style="color:#f43f5e;">-$' + exp.toLocaleString() + '</div></div>' +
        '<div class="card"><div class="card-title">Dream Investments Stored</div><div class="card-value" style="color:#8b5cf6;">$' + dreamTotal.toLocaleString() + '</div></div>' +
        '<div class="card"><div class="card-title">Active Records</div><div class="card-value">' + txs.length + '</div></div>';

      document.getElementById('txTableBody').innerHTML = txs.map(t => {
        const cat = t.category === 'Other' && t.customCategory ? 'Other (' + t.customCategory + ')' : t.category;
        return '<tr><td>' + t.date + '</td><td><strong>' + t.title + '</strong></td><td>' + t.type + '</td><td>' + cat + '</td><td class="right">$' + t.amount.toLocaleString() + '</td></tr>';
      }).join('');

      document.getElementById('peopleList').innerHTML = (state.vault.people || []).map(p => {
        return '<div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--border);">' +
          '<div><strong>' + p.name + '</strong> <span style="color:var(--muted); font-size:12px;">(' + p.relationship + ')</span></div>' +
          '<button onclick="exportBillForPerson(\\'' + p.id + '\\')">Export Bill for ' + p.name + '</button></div>';
      }).join('');

      document.getElementById('dreamsList').innerHTML = (state.vault.dreamVaults || []).map(d => {
        return '<div class="card"><div class="card-title">' + d.storageType + '</div><div style="font-weight:700; margin-bottom:8px;">' + d.name + '</div><div class="card-value" style="color:#10b981;">$' + d.currentAmount.toLocaleString() + '</div><div style="font-size:12px; color:var(--muted);">Target: $' + d.targetAmount.toLocaleString() + '</div></div>';
      }).join('');
    }
    renderAll();
  </script>
</body>
</html>`;
}

/**
 * Generates a one-click Windows .exe Packager script that builds a native
 * PocketLedgerVault.exe executable using Electron Packager.
 */
export function generateWindowsExeBuilderBatch(): string {
  return `@echo off
TITLE PocketLedger Vault - Native Windows .EXE Compiler & Launcher
echo ============================================================================
echo   PocketLedger Vault - Native Windows .EXE Desktop Builder (Electron)
echo ============================================================================
echo.
echo [Step 1/3] Installing local dependencies...
call npm install
echo.
echo [Step 2/3] Building production React + local database bundle...
call npm run build
echo.
echo [Step 3/3] Packaging standalone Windows .EXE (PocketLedgerVault.exe)...
call npx --yes @electron/packager . PocketLedgerVault --platform=win32 --arch=x64 --out=dist-exe --overwrite
echo.
echo ============================================================================
echo   SUCCESS! Your native .exe is ready inside:
echo   .\\dist-exe\\PocketLedgerVault-win32-x64\\PocketLedgerVault.exe
echo ============================================================================
pause
`;
}
