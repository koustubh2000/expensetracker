const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Default local folder inside user's system appData / Documents for offline storage
const getVaultDirectory = () => {
  const dir = path.join(app.getPath('documents'), 'PocketLedgerVault');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'PocketLedger Vault — Offline Personal Finance & Bill Manager',
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  // IPC Handlers for local file / folder database persistence
  ipcMain.handle('vault:get-dir', () => getVaultDirectory());

  ipcMain.handle('vault:save-file', async (_event, { filename, content }) => {
    const dir = getVaultDirectory();
    const target = path.join(dir, filename);
    fs.writeFileSync(target, content, 'utf-8');
    return { ok: true, path: target };
  });

  ipcMain.handle('vault:read-file', async (_event, { filename }) => {
    const dir = getVaultDirectory();
    const target = path.join(dir, filename);
    if (!fs.existsSync(target)) return { ok: false, content: null };
    return { ok: true, content: fs.readFileSync(target, 'utf-8'), path: target };
  });

  ipcMain.handle('vault:choose-folder', async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Local Folder for PocketLedger Database Files',
    });
    if (res.canceled || !res.filePaths.length) return null;
    return res.filePaths[0];
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
