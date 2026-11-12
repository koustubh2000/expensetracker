const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronVault', {
  isElectron: true,
  getVaultDirectory: () => ipcRenderer.invoke('vault:get-dir'),
  saveFile: (filename, content) => ipcRenderer.invoke('vault:save-file', { filename, content }),
  readFile: (filename) => ipcRenderer.invoke('vault:read-file', { filename }),
  chooseFolder: () => ipcRenderer.invoke('vault:choose-folder'),
});
