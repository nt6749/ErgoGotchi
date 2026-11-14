const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  movePet: (x, y) => ipcRenderer.send('pet-move', { x, y }),
  setPetBounds: (bounds) => ipcRenderer.send('pet-set-bounds', bounds),
  openDashboard: () => ipcRenderer.send('open-dashboard'),
  onRecalibrate: (callback) => ipcRenderer.on('menu-recalibrate', callback),
  onForceState: (callback) => ipcRenderer.on('menu-force-state', (event, state) => callback(state)),
  onToggleDemoMode: (callback) => ipcRenderer.on('menu-toggle-demo', callback),
});
