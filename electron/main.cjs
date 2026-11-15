/**
 * Electron Main Process for ErgoGotchi Desktop Shell.
 * Provides transparent, always-on-top, frameless window with native OS physics,
 * click-through mouse support, and automated backend service lifecycle management.
 */

const { app, BrowserWindow, screen, ipcMain, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const { startActivityWatcher } = require('./activityWatcher.cjs');
const {
  getAppVersion,
  checkForUpdates,
  downloadAndInstallUpdate,
  getLoginItemSettings,
  setLoginItemSettings,
} = require('./updater.cjs');

try {
  app.setName('ErgoGotchi');
  app.setVersion(getAppVersion());
} catch (e) {}

let petWindow = null;
let dashboardWindow = null;
let backendProcess = null;
let isWizardActive = false;
let currentDifficulty = 'normal';
let alwaysShowCorn = false;

// Cameras reported by the pet window, shown in its right-click menu
let cameraList = [];
let activeCameraId = null;

// What the user is doing (TV / music / work), so the duck can join in.
// `forcedActivity` is a manual override from the right-click menu, for demos.
let stopActivityWatcher = null;
let lastActivity = { scene: 'IDLE', music: false };
let forcedActivity = 'AUTO';
const ACTIVITY_CHOICES = [
  ['AUTO', 'Auto (follow my apps)'],
  ['WATCHING', 'Watching TV'],
  ['MUSIC', 'Listening to music'],
  ['WORKING', 'Working'],
  ['NONE', 'Nothing'],
];

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
const APP_ICON_PATH = process.platform === 'win32'
  ? path.join(__dirname, '../build/icon.ico')
  : path.join(__dirname, '../build/icon.png');

function checkBackendAlive() {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:8000/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(600, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startBackend() {
  const rootDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  let pythonPath = 'python3';
  if (process.platform === 'win32') {
    const venvWin = path.join(rootDir, '.venv', 'Scripts', 'python.exe');
    pythonPath = fs.existsSync(venvWin) ? venvWin : 'python';
  } else {
    const venvUnix = path.join(rootDir, '.venv', 'bin', 'python');
    pythonPath = fs.existsSync(venvUnix) ? venvUnix : 'python3';
  }

  const scriptPath = path.join(rootDir, 'backend', 'app', 'main.py');
  if (!fs.existsSync(scriptPath)) {
    console.log('[ErgoGotchi] No backend script found at path; running in offline edge mode.');
    return;
  }

  console.log(`[ErgoGotchi] Auto-starting backend using ${pythonPath}...`);
  try {
    backendProcess = spawn(pythonPath, [scriptPath], {
      cwd: rootDir,
      env: { ...process.env, PYTHONPATH: path.join(rootDir, 'backend') },
      stdio: 'pipe',
    });

    backendProcess.on('exit', () => {
      backendProcess = null;
    });
  } catch (e) {
    console.warn('[ErgoGotchi] Could not auto-spawn backend:', e);
  }
}

function stopBackend() {
  if (backendProcess) {
    console.log('[ErgoGotchi] Stopping background backend...');
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
      } else {
        backendProcess.kill('SIGTERM');
      }
    } catch (e) {}
    backendProcess = null;
  }
}

function getSavedPetPosition() {
  try {
    const p = path.join(app.getPath('userData'), 'pet-position.json');
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (typeof data.x === 'number' && typeof data.y === 'number') {
        return data;
      }
    }
  } catch (e) {}
  return null;
}

function savePetPosition(pos) {
  try {
    const p = path.join(app.getPath('userData'), 'pet-position.json');
    fs.writeFileSync(p, JSON.stringify(pos), 'utf8');
  } catch (e) {}
}

function createPetWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;

  // Room for the mascot's ±40px wander and the speech bubble above it
  const initialWidth = 280;
  const initialHeight = 320;
  const defaultX = screenWidth - initialWidth - 60;
  const defaultY = screenHeight - initialHeight - 10;

  const saved = getSavedPetPosition();
  const initialX = saved && typeof saved.x === 'number' ? saved.x : defaultX;
  const initialY = saved && typeof saved.y === 'number' ? saved.y : defaultY;

  petWindow = new BrowserWindow({
    icon: APP_ICON_PATH,
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

  // Clicks pass through the transparent window to whatever is underneath.
  // `forward` keeps mouse-move events flowing so the page can re-enable clicks while hovering the pet.
  petWindow.setIgnoreMouseEvents(true, { forward: true });
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

  // Right-click context menu (disabled while setup wizard is active)
  petWindow.webContents.on('context-menu', () => {
    if (isWizardActive) return;
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '🪄 Setup Wizard & Permissions',
        click: () => petWindow.webContents.send('menu-open-wizard'),
      },
      {
        label: '🎯 Recalibrate Posture (C)',
        click: () => petWindow.webContents.send('menu-recalibrate'),
      },
      {
        label: '📊 Open Companion Dashboard',
        click: () => createDashboardWindow(),
      },
      {
        label: '📌 Dock Pet to Corner',
        click: () => {
          if (!petWindow) return;
          const primaryDisplay = screen.getPrimaryDisplay();
          const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
          const initialWidth = 280;
          const initialHeight = 320;
          const initialX = screenWidth - initialWidth - 60;
          const initialY = screenHeight - initialHeight - 10;
          petWindow.setBounds({ x: initialX, y: initialY, width: initialWidth, height: initialHeight });
          savePetPosition({ x: initialX, y: initialY });
          petWindow.webContents.send('menu-pet-docked');
        },
      },
      {
        label: '🌽 Always Show Corn Level',
        type: 'checkbox',
        checked: alwaysShowCorn,
        click: (menuItem) => {
          alwaysShowCorn = menuItem.checked;
          if (petWindow && !petWindow.isDestroyed()) {
            petWindow.webContents.send('always-show-corn-changed', alwaysShowCorn);
          }
          if (dashboardWindow && !dashboardWindow.isDestroyed()) {
            dashboardWindow.webContents.send('always-show-corn-changed', alwaysShowCorn);
          }
        },
      },
      {
        label: '🔄 Check for Updates...',
        click: () => {
          createDashboardWindow();
          setTimeout(() => {
            if (dashboardWindow && !dashboardWindow.isDestroyed()) {
              dashboardWindow.webContents.send('menu-check-updates');
            }
          }, 500);
        },
      },
      {
        label: '⚡ Toggle Demo Mode (D)',
        click: () => petWindow.webContents.send('menu-toggle-demo'),
      },
      {
        label: '🎚️ Difficulty',
        submenu: [
          {
            label: 'Strict (0.5s reaction)',
            type: 'radio',
            checked: currentDifficulty === 'strict',
            click: () => {
              currentDifficulty = 'strict';
              petWindow.webContents.send('menu-set-difficulty', 'strict');
            },
          },
          {
            label: 'Normal (1.5s reaction)',
            type: 'radio',
            checked: currentDifficulty === 'normal',
            click: () => {
              currentDifficulty = 'normal';
              petWindow.webContents.send('menu-set-difficulty', 'normal');
            },
          },
          {
            label: 'Forgiving (3.0s reaction)',
            type: 'radio',
            checked: currentDifficulty === 'forgiving',
            click: () => {
              currentDifficulty = 'forgiving';
              petWindow.webContents.send('menu-set-difficulty', 'forgiving');
            },
          },
        ],
      },
      {
        label: '📷 Camera',
        submenu: cameraList.length
          ? cameraList.map((cam) => ({
              label: cam.label,
              type: 'radio',
              checked: cam.deviceId === activeCameraId,
              click: () => petWindow.webContents.send('menu-select-camera', cam.deviceId),
            }))
          : [{ label: 'No cameras found', enabled: false }],
      },
      {
        label: '🎬 Duck Activity',
        submenu: ACTIVITY_CHOICES.map(([value, label]) => ({
          label,
          type: 'radio',
          checked: forcedActivity === value,
          click: () => {
            forcedActivity = value;
            petWindow.webContents.send('menu-force-activity', value);
          },
        })),
      },
      {
        label: '🥚 Growth',
        submenu: [
          { label: 'Give 10 corn (demo)', click: () => petWindow.webContents.send('menu-add-corn', 10) },
          { label: 'Start over as an egg', click: () => petWindow.webContents.send('menu-reset-growth') },
        ],
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

  // A freshly loaded (or reloaded) page needs the current activity again
  petWindow.webContents.on('did-finish-load', () => {
    if (petWindow) petWindow.webContents.send('activity', lastActivity);
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
    icon: APP_ICON_PATH,
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
ipcMain.on('pet-move', (event, { x, y, save = false }) => {
  if (petWindow) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    petWindow.setPosition(rx, ry);
    if (save) {
      savePetPosition({ x: rx, y: ry });
    }
  }
});

ipcMain.on('pet-move-by', (event, { dx, dy, save = false }) => {
  if (petWindow) {
    const [currX, currY] = petWindow.getPosition();
    const nx = currX + Math.round(dx);
    const ny = currY + Math.round(dy);
    petWindow.setPosition(nx, ny);
    if (save) {
      savePetPosition({ x: nx, y: ny });
    }
  }
});

ipcMain.handle('get-pet-position', () => {
  if (petWindow) {
    const [x, y] = petWindow.getPosition();
    return { x, y };
  }
  return { x: 0, y: 0 };
});

ipcMain.on('pet-set-bounds', (event, bounds) => {
  if (!petWindow) return;
  if (bounds.center) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
    const w = bounds.width || 460;
    const h = bounds.height || 620;
    const x = Math.max(0, Math.round((screenWidth - w) / 2));
    const y = Math.max(0, Math.round((screenHeight - h) / 2));
    petWindow.setBounds({ x, y, width: w, height: h });
  } else {
    petWindow.setBounds(bounds);
  }
});

ipcMain.on('pet-center', (event, { width = 460, height = 620 } = {}) => {
  if (!petWindow) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
  const x = Math.max(0, Math.round((screenWidth - width) / 2));
  const y = Math.max(0, Math.round((screenHeight - height) / 2));
  petWindow.setBounds({ x, y, width, height });
});

ipcMain.on('pet-dock-corner', () => {
  if (!petWindow) return;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;
  const initialWidth = 280;
  const initialHeight = 320;
  const initialX = screenWidth - initialWidth - 60;
  const initialY = screenHeight - initialHeight - 10;
  petWindow.setBounds({ x: initialX, y: initialY, width: initialWidth, height: initialHeight });
  savePetPosition({ x: initialX, y: initialY });
  petWindow.webContents.send('menu-pet-docked');
});

ipcMain.on('set-always-show-corn', (event, show) => {
  alwaysShowCorn = !!show;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('always-show-corn-changed', alwaysShowCorn);
  }
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.webContents.send('always-show-corn-changed', alwaysShowCorn);
  }
});

ipcMain.on('pet-ignore-mouse', (event, ignore) => {
  if (petWindow) {
    petWindow.setIgnoreMouseEvents(!!ignore, { forward: true });
  }
});

// The pet window reports its cameras so the right-click menu can offer them
ipcMain.on('camera-list', (event, { cameras, activeId }) => {
  cameraList = Array.isArray(cameras) ? cameras : [];
  activeCameraId = activeId || null;
});

ipcMain.on('open-dashboard', () => {
  createDashboardWindow();
});

ipcMain.on('wizard-active', (event, active) => {
  isWizardActive = !!active;
});

// Auto-Updater & System Startup IPC Handlers
ipcMain.handle('check-for-updates', async () => {
  return await checkForUpdates();
});

ipcMain.handle('download-and-install-update', async (event, asset) => {
  return await downloadAndInstallUpdate(asset, (progress) => {
    if (petWindow && !petWindow.isDestroyed()) {
      petWindow.webContents.send('update-download-progress', progress);
    }
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.webContents.send('update-download-progress', progress);
    }
  });
});

ipcMain.handle('get-login-item-settings', () => {
  return getLoginItemSettings();
});

ipcMain.handle('set-login-item-settings', (event, openAtLogin) => {
  return setLoginItemSettings(openAtLogin);
});

ipcMain.handle('get-app-version', () => {
  return getAppVersion();
});

app.whenReady().then(async () => {
  const isAlive = await checkBackendAlive();
  if (!isAlive) {
    startBackend();
  }

  createPetWindow();

  // Background check for GitHub updates on app startup (after 3 seconds)
  setTimeout(async () => {
    try {
      const info = await checkForUpdates();
      if (info && info.updateAvailable) {
        console.log(`[ErgoGotchi AutoUpdater] Update available on startup: ${info.latestVersion}`);
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.webContents.send('update-available', info);
        }
        if (dashboardWindow && !dashboardWindow.isDestroyed()) {
          dashboardWindow.webContents.send('update-available', info);
        }
      }
    } catch (e) {
      console.warn('[ErgoGotchi AutoUpdater] Startup update check failed:', e);
    }
  }, 3000);

  stopActivityWatcher = startActivityWatcher((activity) => {
    lastActivity = activity;
    if (petWindow) petWindow.webContents.send('activity', activity);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
    }
  });
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('will-quit', () => {
  stopBackend();
  if (stopActivityWatcher) stopActivityWatcher();
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
