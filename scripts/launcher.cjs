#!/usr/bin/env node
/**
 * ErgoGotchi All-in-One Unified Launcher.
 * Starts Backend (FastAPI port 8000), Frontend (Vite port 5173), and Electron Desktop Pet
 * with a single command. Handles graceful shutdown of all processes.
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const children = [];

function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/health`, (res) => {
      resolve(true);
    });
    req.on('error', () => {
      // Also try root if health endpoint doesn't exist on that port
      const req2 = http.get(`http://localhost:${port}/`, (res2) => {
        resolve(true);
      });
      req2.on('error', () => resolve(false));
      req2.setTimeout(400, () => {
        req2.destroy();
        resolve(false);
      });
    });
    req.setTimeout(400, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(port, maxTries = 30) {
  for (let i = 0; i < maxTries; i++) {
    const alive = await checkPort(port);
    if (alive) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function findPython() {
  if (process.platform === 'win32') {
    const venvPy = path.join(rootDir, '.venv', 'Scripts', 'python.exe');
    if (fs.existsSync(venvPy)) return venvPy;
    return 'python';
  } else {
    const venvPy = path.join(rootDir, '.venv', 'bin', 'python');
    if (fs.existsSync(venvPy)) return venvPy;
    return 'python3';
  }
}

async function main() {
  console.log('====================================================');
  console.log('👾 ErgoGotchi Unified All-in-One Launcher');
  console.log('   Starting Backend + Frontend + Desktop Companion');
  console.log('====================================================\n');

  // 1. Check or start Backend (Port 8000)
  const isBackendRunning = await checkPort(8000);
  if (isBackendRunning) {
    console.log('✓ Backend already active on http://localhost:8000');
  } else {
    const py = findPython();
    console.log(`🚀 Starting Backend with ${py}...`);
    const backendProc = spawn(py, ['backend/app/main.py'], {
      cwd: rootDir,
      env: { ...process.env, PYTHONPATH: path.join(rootDir, 'backend') },
      stdio: 'pipe',
    });

    backendProc.stdout.on('data', (d) => {
      const line = d.toString().trim();
      if (line.includes('Uvicorn running') || line.includes('Application startup complete')) {
        console.log(`[Backend] ✓ ${line}`);
      }
    });

    backendProc.stderr.on('data', (d) => {
      const line = d.toString().trim();
      if (line.includes('ERROR')) console.error(`[Backend Error] ${line}`);
    });

    children.push(backendProc);
    const backendReady = await waitForPort(8000);
    if (backendReady) {
      console.log('✓ Backend online at http://localhost:8000');
    } else {
      console.warn('⚠️ Backend taking longer to start; continuing in offline resilience mode...');
    }
  }

  // 2. Check or start Vite Frontend (Port 5173)
  const isViteRunning = await checkPort(5173);
  if (isViteRunning) {
    console.log('✓ Frontend server already active on http://localhost:5173');
  } else {
    console.log('⚡ Starting Vite dev server...');
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const viteProc = spawn(npmCmd, ['run', 'dev'], {
      cwd: rootDir,
      stdio: 'pipe',
    });

    viteProc.stdout.on('data', (d) => {
      const line = d.toString().trim();
      if (line.includes('Local:')) {
        console.log(`[Frontend] ✓ ${line}`);
      }
    });

    children.push(viteProc);
    await waitForPort(5173);
    console.log('✓ Frontend online at http://localhost:5173');
  }

  // 3. Launch Desktop App (Electron) or Browser
  const isWebOnly = process.argv.includes('--web');
  if (isWebOnly) {
    console.log('\n🌐 Web-only mode specified. Opening browser...');
    const openCmd =
      process.platform === 'darwin'
        ? 'open http://localhost:5173'
        : process.platform === 'win32'
        ? 'start http://localhost:5173'
        : 'xdg-open http://localhost:5173';
    try {
      execSync(openCmd);
    } catch (e) {}
  } else {
    console.log('🪟 Spawning Native Transparent Electron Desktop Pet...');
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const electronProc = spawn(npmCmd, ['run', 'electron'], {
      cwd: rootDir,
      stdio: 'inherit',
    });

    children.push(electronProc);

    electronProc.on('exit', () => {
      console.log('\n[ErgoGotchi] Desktop window closed. Shutting down stack...');
      cleanup();
    });
  }

  console.log('\n✨ ErgoGotchi is running! Press Ctrl+C in this terminal to stop all processes.\n');
}

function cleanup() {
  console.log('Shutting down background services...');
  for (const proc of children) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', proc.pid, '/f', '/t']);
      } else {
        proc.kill('SIGTERM');
      }
    } catch (e) {}
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

main().catch((err) => {
  console.error('Fatal launcher error:', err);
  cleanup();
});
