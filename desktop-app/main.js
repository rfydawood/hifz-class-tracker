// Hifz Class Tracker for Windows (and later Mac/Linux).
//
// A thin desktop shell around the live website: the window opens
// https://rfydawood.github.io/hifz-class-tracker/, so every website release
// reaches the desktop app the next time it opens, with no rebuild. The
// website's service worker keeps it working offline after the first open.
// Only the shell itself (this folder) needs a new build, and that updates
// itself from GitHub Releases (electron-updater).
//
// Google sign-in: Google refuses its sign-in page inside app windows, so
// googleSignIn() opens desktop-signin.html in the computer's own browser and
// waits on a one-off 127.0.0.1 server for the ID token to come back (the
// "loopback" pattern Google recommends for desktop apps).
const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const { autoUpdater } = require('electron-updater');
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');

const APP_URL = 'https://rfydawood.github.io/hifz-class-tracker/';
const SIGNIN_URL = APP_URL + 'desktop-signin.html';
const SIGNIN_TIMEOUT_MS = 10 * 60 * 1000;

let win = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start);
  app.on('window-all-closed', () => app.quit());
}

function isAppUrl(url) {
  return url.startsWith(APP_URL) || url.startsWith('file:');
}

function start() {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 360,
    minHeight: 480,
    backgroundColor: '#E3EAEC',
    title: 'BreakLog',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Anything outside the app (help links, Google pages) opens in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });

  // Never opened online yet (so nothing cached): say so instead of a blank window.
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !url.startsWith(APP_URL)) return; // -3 = aborted
    win.loadFile(path.join(__dirname, 'offline.html'), { query: { retry: APP_URL } });
  });

  // F5 / Ctrl+R reload, F12 nothing (no menu, no dev tools for teachers).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
      e.preventDefault();
      win.webContents.reload();
    }
  });

  win.loadURL(APP_URL);

  if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify().catch(() => {});
}

// --- Google sign-in through the system browser -----------------------------

let pendingSignIn = null; // { cancel }

ipcMain.handle('google-sign-in', (event) => {
  const from = event.senderFrame && event.senderFrame.url;
  if (!from || !from.startsWith(APP_URL)) return null;
  if (pendingSignIn) pendingSignIn.cancel();
  return new Promise((resolve) => {
    const state = crypto.randomBytes(16).toString('hex');
    let done = false;
    const finish = (token) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      server.close();
      pendingSignIn = null;
      if (typeof token === 'string' && win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
      resolve(token || null);
    };
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/done' || u.searchParams.get('state') !== state) {
        res.writeHead(404).end();
        return;
      }
      const token = u.searchParams.get('t');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(donePage(!!token));
      finish(token);
    });
    const timer = setTimeout(() => finish(null), SIGNIN_TIMEOUT_MS);
    // Pressing Sign in again starts over: the earlier wait ends quietly. (Not
    // on window focus - Google's window closing by itself can hand focus back
    // to the app a moment before the browser hands the token over.)
    pendingSignIn = { cancel: () => finish({ superseded: true }) };
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      shell.openExternal(`${SIGNIN_URL}?port=${port}&state=${state}`);
    });
  });
});

function donePage(ok) {
  const msg = ok
    ? 'You are signed in. You can close this tab and go back to the BreakLog app.'
    : 'Sign-in did not finish. Go back to the BreakLog app and try again.';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>BreakLog</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#E3EAEC;color:#1F2E36;font:16px/1.5 system-ui,"Segoe UI",sans-serif}
.card{background:#fff;border-radius:16px;padding:32px 28px;max-width:380px;margin:16px;text-align:center;box-shadow:0 4px 20px rgba(31,46,54,.12)}</style>
</head><body><div class="card"><h1 style="font-size:20px;margin:0 0 8px">${ok ? 'Signed in' : 'Not signed in'}</h1><p style="margin:0">${msg}</p></div></body></html>`;
}
