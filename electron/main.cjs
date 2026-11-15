/**
 * Electron Main Process for ErgoGotchi Desktop Shell.
 * Provides transparent, always-on-top, frameless window with native OS physics.
 */

const { app, BrowserWindow, screen, ipcMain, Menu } = require('electron');
const path = require('path');

let petWindow = null;
let dashboardWindow = null;

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

function createPetWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;

  // Room for the mascot's ±40px wander and the speech bubble above it
  const initialWidth = 280;
  const initialHeight = 320;
  const initialX = screenWidth - initialWidth - 60;
  const initialY = screenHeight - initialHeight - 10;

  petWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: initialX,
    y: initialY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // Critical: keeps MediaPipe & camera running even when backgrounded
    },
  });

  petWindow.setAlwaysOnTop(true, 'floating');
  if (process.platform === 'darwin') {
    petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // Load URL
  if (app.isPackaged) {
    petWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    petWindow.loadURL(VITE_DEV_SERVER_URL);
  }

  // Debug: set ERGO_DEVTOOLS=1 to open DevTools for the frameless pet window
  if (process.env.ERGO_DEVTOOLS === '1') {
    petWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Right-click context menu
  petWindow.webContents.on('context-menu', () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '🎯 Recalibrate Posture (C)',
        click: () => petWindow.webContents.send('menu-recalibrate'),
      },
      {
        label: '📊 Open Companion Dashboard',
        click: () => createDashboardWindow(),
      },
      {
        label: '⚡ Toggle Demo Mode (D)',
        click: () => petWindow.webContents.send('menu-toggle-demo'),
      },
      { type: 'separator' },
      {
        label: 'Force State: Thriving [1]',
        click: () => petWindow.webContents.send('menu-force-state', 'THRIVING'),
      },
      {
        label: 'Force State: Slouching [2]',
        click: () => petWindow.webContents.send('menu-force-state', 'SLOUCHING'),
      },
      {
        label: 'Force State: Wilted [3]',
        click: () => petWindow.webContents.send('menu-force-state', 'WILTED'),
      },
      { type: 'separator' },
      {
        label: 'Quit ErgoGotchi',
        click: () => app.quit(),
      },
    ]);
    contextMenu.popup(petWindow);
  });

  petWindow.on('closed', () => {
    petWindow = null;
  });
}

function createDashboardWindow() {
  if (dashboardWindow) {
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    title: 'ErgoGotchi Companion Dashboard - sunhacks 2026',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const dashboardUrl = app.isPackaged
    ? `file://${path.join(__dirname, '../dist/index.html')}?view=dashboard`
    : `${VITE_DEV_SERVER_URL}?view=dashboard`;

  dashboardWindow.loadURL(dashboardUrl);

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });
}

// IPC Handlers
ipcMain.on('pet-move', (event, { x, y }) => {
  if (petWindow) {
    petWindow.setPosition(x, y);
  }
});

ipcMain.on('pet-set-bounds', (event, bounds) => {
  if (petWindow) {
    petWindow.setBounds(bounds);
  }
});

ipcMain.on('open-dashboard', () => {
  createDashboardWindow();
});

app.whenReady().then(() => {
  createPetWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
