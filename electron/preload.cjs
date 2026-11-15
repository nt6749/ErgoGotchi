const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  movePet: (x, y) => ipcRenderer.send('pet-move', { x, y }),
  setPetBounds: (bounds) => ipcRenderer.send('pet-set-bounds', bounds),
  openDashboard: () => ipcRenderer.send('open-dashboard'),
  setIgnoreMouse: (ignore) => ipcRenderer.send('pet-ignore-mouse', ignore),
  onRecalibrate: (callback) => ipcRenderer.on('menu-recalibrate', callback),
  onForceState: (callback) => ipcRenderer.on('menu-force-state', (event, state) => callback(state)),
  onToggleDemoMode: (callback) => ipcRenderer.on('menu-toggle-demo', callback),
  setCameraList: (cameras, activeId) => ipcRenderer.send('camera-list', { cameras, activeId }),
  onSelectCamera: (callback) => ipcRenderer.on('menu-select-camera', (event, deviceId) => callback(deviceId)),
  onActivity: (callback) => ipcRenderer.on('activity', (event, activity) => callback(activity)),
  onForceActivity: (callback) => ipcRenderer.on('menu-force-activity', (event, value) => callback(value)),
  onAddCorn: (callback) => ipcRenderer.on('menu-add-corn', (event, amount) => callback(amount)),
  onResetGrowth: (callback) => ipcRenderer.on('menu-reset-growth', () => callback()),
  onOpenWizard: (callback) => ipcRenderer.on('menu-open-wizard', callback),
  onSetDifficulty: (callback) => ipcRenderer.on('menu-set-difficulty', (event, level) => callback(level)),
  setWizardActive: (active) => ipcRenderer.send('wizard-active', active),
  centerPet: (width, height) => ipcRenderer.send('pet-center', { width, height }),
  dockPet: () => ipcRenderer.send('pet-dock-corner'),
});
