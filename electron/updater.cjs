/**
 * updater.cjs
 *
 * Native GitHub Release Auto-Updater & System Startup Manager for ErgoGotchi.
 *  1. Checks https://api.github.com/repos/nt6749/sunhacks-project2/releases/latest
 *  2. Compares semver tags against app.getVersion()
 *  3. Downloads installer asset with real-time progress tracking
 *  4. Spawns installer detached and restarts ErgoGotchi
 *  5. Manages Windows / macOS launch-at-startup (openAtLogin)
 *
 * 100% native Node.js implementation: Zero external npm dependencies.
 */

const { app, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const REPO_OWNER = 'nt6749';
const REPO_NAME = 'sunhacks-project2';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

function parseVersion(v) {
  if (!v) return [0, 0, 0];
  const str = String(v).replace(/^v/, '').trim();
  return str.split('.').map((x) => parseInt(x, 10) || 0);
}

function compareVersions(v1, v2) {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const a = p1[i] || 0;
    const b = p2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

async function checkForUpdates() {
  const currentVersion = app.getVersion() || '1.0.1';

  try {
    const res = await fetch(GITHUB_API_URL, {
      headers: {
        'User-Agent': 'ErgoGotchi-Desktop-App',
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return {
          updateAvailable: false,
          currentVersion,
          latestVersion: currentVersion,
          error: 'No releases found on GitHub repository',
        };
      }
      throw new Error(`GitHub API returned status ${res.status}`);
    }

    const release = await res.json();
    const latestVersion = release.tag_name || release.name || '0.0.0';
    const isNewer = compareVersions(latestVersion, currentVersion) > 0;

    let targetAsset = null;
    if (Array.isArray(release.assets)) {
      if (process.platform === 'win32') {
        // Look for Windows installer .exe (prefer Setup wizard, then any .exe)
        targetAsset =
          release.assets.find((a) => a.name.toLowerCase().includes('setup') && a.name.toLowerCase().endsWith('.exe')) ||
          release.assets.find((a) => a.name.toLowerCase().endsWith('.exe') && !a.name.endsWith('.blockmap')) ||
          null;
      } else if (process.platform === 'darwin') {
        // Look for macOS DMG
        targetAsset =
          release.assets.find((a) => a.name.toLowerCase().endsWith('.dmg') && !a.name.endsWith('.blockmap')) ||
          null;
      } else {
        // Linux / other: generic asset
        targetAsset = release.assets.find((a) => !a.name.endsWith('.blockmap')) || null;
      }
    }

    return {
      updateAvailable: isNewer,
      currentVersion,
      latestVersion,
      releaseName: release.name || latestVersion,
      releaseNotes: release.body || '',
      publishedAt: release.published_at,
      asset: targetAsset
        ? {
            name: targetAsset.name,
            downloadUrl: targetAsset.browser_download_url,
            size: targetAsset.size,
          }
        : null,
    };
  } catch (err) {
    console.warn('[ErgoGotchi AutoUpdater] Check error:', err.message);
    return {
      updateAvailable: false,
      currentVersion,
      latestVersion: currentVersion,
      error: err.message,
    };
  }
}

async function downloadAndInstallUpdate(asset, onProgress) {
  if (!asset || !asset.downloadUrl) {
    throw new Error('No valid download URL provided for update');
  }

  const tempDir = app.getPath('temp');
  const tempFile = path.join(tempDir, asset.name || 'ErgoGotchi-Update.exe');

  console.log(`[ErgoGotchi AutoUpdater] Downloading update from ${asset.downloadUrl} to ${tempFile}...`);

  const response = await fetch(asset.downloadUrl, {
    headers: { 'User-Agent': 'ErgoGotchi-Desktop-App' },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : asset.size || 0;
  let receivedBytes = 0;

  const fileStream = fs.createWriteStream(tempFile);

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(Buffer.from(value));
    receivedBytes += value.length;
    if (onProgress && totalBytes > 0) {
      const percent = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
      onProgress({ percent, receivedBytes, totalBytes });
    }
  }

  await new Promise((resolve, reject) => {
    fileStream.end(resolve);
    fileStream.on('error', reject);
  });

  console.log('[ErgoGotchi AutoUpdater] Download completed! Launching installer...');

  if (process.platform === 'win32') {
    // Launch installer detached so it can proceed while this process exits
    const installer = spawn(tempFile, [], {
      detached: true,
      stdio: 'ignore',
    });
    installer.unref();
    setTimeout(() => {
      app.quit();
    }, 500);
  } else if (process.platform === 'darwin') {
    await shell.openPath(tempFile);
    setTimeout(() => {
      app.quit();
    }, 500);
  } else {
    await shell.openPath(tempFile);
  }

  return { success: true, path: tempFile };
}

function getLoginItemSettings() {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}

function setLoginItemSettings(openAtLogin) {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!openAtLogin,
      path: process.execPath,
      args: ['--autostart'],
    });
    return app.getLoginItemSettings().openAtLogin;
  } catch (err) {
    console.warn('[ErgoGotchi AutoUpdater] Failed to set login item settings:', err);
    return false;
  }
}

module.exports = {
  checkForUpdates,
  downloadAndInstallUpdate,
  getLoginItemSettings,
  setLoginItemSettings,
  compareVersions,
};
