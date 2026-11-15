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

let petWindow = null;
let dashboardWindow = null;
let backendProcess = null;
let isWizardActive = false;
let isPetLocked = true;

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

function createPetWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;

  // Room for the egg machine and the speech bubble above it
  const initialWidth = 320;
  const initialHeight = 460;
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

  // Right-click context menu
  petWindow.webContents.on('context-menu', () => {
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
        label: isPetLocked ? '🔓 Unlock Position (Move Duck)' : '🔒 Lock Position',
        click: () => {
          isPetLocked = !isPetLocked;
          petWindow.webContents.send('menu-toggle-lock', isPetLocked);
        },
      },
      {
        label: '🌾 Feed Duck (🌽)',
        click: () => petWindow.webContents.send('menu-feed-duck'),
      },
      { type: 'separator' },
      {
        label: '⚡ Toggle Demo Mode (D)',
        click: () => petWindow.webContents.send('menu-toggle-demo'),
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
          { label: 'Feed Duck (🌽)', click: () => petWindow.webContents.send('menu-feed-duck') },
          { label: 'Give 10 corn (demo)', click: () => petWindow.webContents.send('menu-add-corn', 10) },
          { label: 'Start over as an egg', click: () => petWindow.webContents.send('menu-reset-growth') },
        ],
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

ipcMain.on('pet-move-by', (event, { dx, dy }) => {
  if (!petWindow) return;
  const [x, y] = petWindow.getPosition();
  petWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
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
  const initialWidth = 320;
  const initialHeight = 460;
  const initialX = screenWidth - initialWidth - 60;
  const initialY = screenHeight - initialHeight - 10;
  petWindow.setBounds({ x: initialX, y: initialY, width: initialWidth, height: initialHeight });
});

ipcMain.on('pet-set-locked', (event, locked) => {
  isPetLocked = !!locked;
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

app.whenReady().then(async () => {
  const isAlive = await checkBackendAlive();
  if (!isAlive) {
    startBackend();
  }

  createPetWindow();

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
