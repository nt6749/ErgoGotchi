/**
 * Watches which app is in the foreground so the duck can react (TV, headphones, laptop).
 *
 * Privacy: window titles are read locally, reduced to a category by activityClassifier.cjs,
 * and only that category ({ scene, music }) is passed on. Titles are never stored, logged,
 * or sent to the renderer or the backend.
 *
 * Windows: one long-lived PowerShell process polls the foreground window (no native modules).
 * macOS:   `lsappinfo` reports the frontmost app name (no window titles, no permission prompts).
 * Other:   not supported; the duck simply stays in its default pose.
 */

const { spawn, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyActivity } = require('./activityClassifier.cjs');

const POLL_MS = 1500;

const WINDOWS_SCRIPT = `
param([int]$ParentPid)
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class ErgoForeground {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
while ($true) {
  # Stop when the app that started us is gone
  if (-not (Get-Process -Id $ParentPid)) { break }
  $h = [ErgoForeground]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [void][ErgoForeground]::GetWindowText($h, $sb, 512)
  $procId = 0
  [void][ErgoForeground]::GetWindowThreadProcessId($h, [ref]$procId)
  $name = ''
  $p = Get-Process -Id $procId
  if ($p) { $name = $p.ProcessName }
  $spotify = ''
  $s = Get-Process -Name Spotify | Where-Object { $_.MainWindowTitle } | Select-Object -First 1
  if ($s) { $spotify = $s.MainWindowTitle }
  $line = @{ proc = $name; title = $sb.ToString(); spotifyTitle = $spotify } | ConvertTo-Json -Compress
  try { [Console]::Out.WriteLine($line); [Console]::Out.Flush() } catch { break }
  Start-Sleep -Milliseconds ${POLL_MS}
}
`;

/**
 * Start watching. `onChange({ scene, music })` is called whenever the category changes.
 * Returns a function that stops the watcher.
 */
function startActivityWatcher(onChange) {
  let last = '';
  const report = (sample) => {
    const result = classifyActivity(sample);
    if (!result) return; // our own window is in front: keep the previous pose
    const key = `${result.scene}|${result.music}`;
    if (key === last) return;
    last = key;
    onChange(result);
  };

  if (process.platform === 'win32') return watchWindows(report);
  if (process.platform === 'darwin') return watchMac(report);
  return () => {};
}

function watchWindows(report) {
  let child = null;
  let scriptPath = null;
  try {
    // One fixed file name, rewritten on every start, so nothing piles up in the temp folder
    scriptPath = path.join(os.tmpdir(), 'ergogotchi-activity.ps1');
    fs.writeFileSync(scriptPath, WINDOWS_SCRIPT, 'utf8');
    child = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-ParentPid', String(process.pid)],
      { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }
    );
  } catch (e) {
    console.warn('[ErgoGotchi] Activity watcher could not start:', e && e.message);
    return () => {};
  }

  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        report(JSON.parse(line));
      } catch {
        // Ignore a malformed line
      }
    }
  });
  child.on('error', (e) => console.warn('[ErgoGotchi] Activity watcher error:', e && e.message));

  return () => {
    // The script also exits by itself once this process is gone, so a crash leaves nothing running
    try {
      child.kill();
    } catch {}
  };
}

function watchMac(report) {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    execFile('/bin/sh', ['-c', 'lsappinfo info -only name "$(lsappinfo front)"'], { timeout: 1200 }, (err, stdout) => {
      busy = false;
      if (err) return;
      // Output looks like: "LSDisplayName"="Safari"
      const m = /="([^"]*)"/.exec(String(stdout));
      if (m) report({ proc: m[1], title: '', spotifyTitle: '' });
    });
  }, POLL_MS);
  return () => clearInterval(timer);
}

module.exports = { startActivityWatcher };
