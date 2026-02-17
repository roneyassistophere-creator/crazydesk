/* ═══════════════════════════════════════════════════════════════
   CrazyDesk Tracker — Electron Main Process (NO AUTH)
   ═══════════════════════════════════════════════════════════════
   • No sign-in screen — launched from web via deep link
   • Web passes Firebase ID token + user info via crazydesk://
   • All Firestore ops use the token as Bearer auth (REST API)
   • Screen + camera capture, check-in/out/break, report
   ═══════════════════════════════════════════════════════════════ */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const {
  app, BrowserWindow, Tray, Menu, ipcMain,
  nativeImage, desktopCapturer, Notification, shell,
  systemPreferences,
} = require('electron');
const path = require('path');

// ─── Supabase (runs in main process where npm packages work) ──
const { createClient } = require('@supabase/supabase-js');
const supabaseClient = createClient(
  process.env.SUPABASE_URL || 'https://lrdbybkovflytzygspdf.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxyZGJ5YmtvdmZseXR6eWdzcGRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTA5MzcsImV4cCI6MjA4NjcyNjkzN30.Y6vp5QUYBPTEx-7q9HOFHeBmiruFIUs7acRS0qwXExk',
);

// ─── Deep link protocol ───────────────────────────────────────
const PROTOCOL = 'crazydesk';
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// ─── Single instance ─────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_ev, argv) => {
    const url = argv.find(a => a.startsWith(`${PROTOCOL}://`));
    if (url) handleDeepLink(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ─── State ────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;

// Session state synced from renderer — used for emergency checkout in main process
let _activeSession = null; // { token, uid, sessionId, checkInTimeMs, totalBreakSec }

// ─── Create window ───────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 380,
    minHeight: 600,
    resizable: true,
    frame: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false, // Keep renderer active when window is hidden
    },
    icon: getTrayIcon('idle'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Ensure renderer stays active when window is hidden (for background captures)
  mainWindow.webContents.setBackgroundThrottling(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('ready-to-show', () => mainWindow.show());

  // Override Page Visibility API so captures work when window is hidden.
  // Without this, Chromium pauses timers/media when document.hidden = true.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      Object.defineProperty(document, 'hidden', { get: () => false });
      Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
    `).catch(() => {});
  });

  mainWindow.on('close', e => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check if launched with a deep link URL in argv
  const deepLinkArg = process.argv.find(a => a.startsWith(`${PROTOCOL}://`));
  if (deepLinkArg) {
    mainWindow.webContents.once('did-finish-load', () => {
      handleDeepLink(deepLinkArg);
    });
  }
}

// ─── Tray ────────────────────────────────────────────────────
function getTrayIcon(status) {
  const size = 16;
  const canvas = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="${
      status === 'active' ? '#22c55e' :
      status === 'break' ? '#eab308' :
      status === 'capturing' ? '#ef4444' : '#9ca3af'
    }"/>
  </svg>`;
  return nativeImage.createFromBuffer(Buffer.from(canvas));
}

function createTray() {
  tray = new Tray(getTrayIcon('idle'));
  updateTrayMenu('idle');
  tray.setToolTip('CrazyDesk Tracker');
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

function updateTrayMenu(status) {
  const statusText = status === 'active' ? '🟢 Checked In' :
                     status === 'break' ? '🟡 On Break' : '⚪ Waiting';
  const menu = Menu.buildFromTemplate([
    { label: `CrazyDesk — ${statusText}`, enabled: false },
    { type: 'separator' },
    { label: 'Open Window', click: () => mainWindow?.show() },
    { label: 'Open Web Dashboard', click: () => {
      shell.openExternal(process.env.WEB_APP_URL || 'http://localhost:3000');
    }},
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray?.setContextMenu(menu);
  tray?.setImage(getTrayIcon(status));
}

// ─── Deep link handler ───────────────────────────────────────
function handleDeepLink(url) {
  try {
    console.log('[DeepLink] Raw URL length:', url.length);

    // Manual parse — more robust than new URL() for long tokens
    // Format: crazydesk://action?key=val&key2=val2
    const withoutProtocol = url.replace(/^crazydesk:\/\//, '');
    const qIdx = withoutProtocol.indexOf('?');
    const action = qIdx >= 0 ? withoutProtocol.substring(0, qIdx) : withoutProtocol;
    const paramStr = qIdx >= 0 ? withoutProtocol.substring(qIdx + 1) : '';

    const params = {};
    if (paramStr) {
      for (const pair of paramStr.split('&')) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx >= 0) {
          const key = decodeURIComponent(pair.substring(0, eqIdx));
          const val = decodeURIComponent(pair.substring(eqIdx + 1));
          params[key] = val;
        }
      }
    }

    console.log('[DeepLink] action:', action, 'params keys:', Object.keys(params));
    console.log('[DeepLink] token length:', params.token?.length || 0);

    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('deep-link', { action, params });
    }
  } catch (e) {
    console.error('Deep link parse error:', e);
  }
}

// macOS open-url event
app.on('open-url', (_ev, url) => {
  _ev.preventDefault();
  if (mainWindow) {
    handleDeepLink(url);
  } else {
    // Store for when window is ready
    app._pendingDeepLink = url;
  }
});

// ─── IPC handlers ────────────────────────────────────────────

// Renderer syncs active session state so main process can do emergency checkout
ipcMain.on('sync-session-state', (_ev, state) => {
  _activeSession = state; // { token, uid, sessionId, checkInTimeMs, totalBreakSec } or null
  console.log('[Main] Session state synced:', state ? `session=${state.sessionId}` : 'cleared');
});

// Screen capture — SILENT, with macOS permission handling
ipcMain.handle('capture-screen', async () => {
  try {
    // Check macOS screen recording permission
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen');
      console.log(`[Capture] macOS screen recording permission status: ${status}`);
      if (status !== 'granted') {
        console.warn('[Capture] Screen recording not granted. Opening System Preferences...');
        // Open System Preferences to the Screen Recording pane
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
        // Return a flag so renderer knows to show a message
        return { permissionNeeded: true };
      }
    }

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    console.log('[Capture] desktopCapturer sources:', sources.length);
    if (!sources.length) {
      console.warn('[Capture] No screen sources found');
      return null;
    }
    const thumb = sources[0].thumbnail;
    const size = thumb.getSize();
    console.log(`[Capture] Screen thumbnail size: ${size.width}x${size.height}`);
    if (size.width === 0 || size.height === 0) {
      console.warn('[Capture] Screen thumbnail is empty — permission likely denied');
      if (process.platform === 'darwin') {
        shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
        return { permissionNeeded: true };
      }
      return null;
    }
    const jpeg = thumb.toJPEG(80);
    console.log(`[Capture] Screenshot JPEG size: ${jpeg.length} bytes`);
    return jpeg;
  } catch (e) {
    console.error('[Capture] Screen capture error:', e);
    return null;
  }
});

// Update tray status
ipcMain.on('update-status', (_ev, status) => {
  updateTrayMenu(status);
});

// Show native notification
ipcMain.on('notify', (_ev, { title, body }) => {
  new Notification({ title, body }).show();
});

// Get app version
ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  platform: process.platform,
}));

// Upload image to Supabase (runs in main process where npm works)
ipcMain.handle('upload-image', async (_ev, { buffer, prefix, userId }) => {
  try {
    const name = `${prefix}_${userId}_${Date.now()}.jpg`;
    const uint8 = Buffer.from(buffer);
    console.log(`[Upload] ${prefix} image: ${uint8.length} bytes → ${name}`);
    if (uint8.length < 100) {
      console.warn('[Upload] Buffer too small, skipping upload');
      return null;
    }
    const { data, error } = await supabaseClient.storage
      .from('tracker-evidence')
      .upload(name, uint8, { contentType: 'image/jpeg' });
    if (error || !data) {
      console.error('[Upload] Supabase error:', error);
      return null;
    }
    const url = supabaseClient.storage.from('tracker-evidence').getPublicUrl(name).data.publicUrl;
    console.log(`[Upload] Success: ${url}`);
    return url;
  } catch (e) {
    console.error('[Upload] Error:', e);
    return null;
  }
});

// ─── App lifecycle ───────────────────────────────────────────
app.whenReady().then(() => {
  createWindow();
  createTray();

  // Handle pending deep link (macOS)
  if (app._pendingDeepLink) {
    mainWindow.webContents.once('did-finish-load', () => {
      handleDeepLink(app._pendingDeepLink);
      delete app._pendingDeepLink;
    });
  }

  app.on('activate', () => {
    if (!mainWindow) createWindow();
    else mainWindow.show();
  });
});

// ─── Direct emergency checkout (main process, Node.js https) ─
function doEmergencyCheckout() {
  return new Promise((resolve) => {
    if (!_activeSession || !_activeSession.sessionId || !_activeSession.token) {
      console.log('[App] No active session to checkout');
      return resolve();
    }
    const { token, uid, sessionId, checkInTimeMs, totalBreakSec } = _activeSession;
    const now = new Date();
    const totalDurationRaw = checkInTimeMs ? Math.round((now.getTime() - checkInTimeMs) / 60000) : 0;
    const totalBreakMin = Math.round((totalBreakSec || 0) / 60);

    const mask = [
      'updateMask.fieldPaths=checkOutTime',
      'updateMask.fieldPaths=status',
      'updateMask.fieldPaths=durationMinutes',
      'updateMask.fieldPaths=breakDurationMinutes',
      'updateMask.fieldPaths=report',
      'updateMask.fieldPaths=attachments',
      'updateMask.fieldPaths=flagged',
      'updateMask.fieldPaths=flagReason',
    ].join('&');

    const docPath = `/projects/crazy-desk/databases/(default)/documents/work_logs/${sessionId}?${mask}`;
    const body = JSON.stringify({
      fields: {
        checkOutTime: { timestampValue: now.toISOString() },
        status: { stringValue: 'completed' },
        durationMinutes: { integerValue: String(Math.max(0, totalDurationRaw - totalBreakMin)) },
        breakDurationMinutes: { integerValue: String(totalBreakMin) },
        report: { stringValue: '[Auto] App closed without manual checkout' },
        attachments: { arrayValue: { values: [] } },
        flagged: { booleanValue: true },
        flagReason: { stringValue: 'App quit or crashed without manual checkout' },
      },
    });

    const https = require('https');
    const req = https.request({
      hostname: 'firestore.googleapis.com',
      port: 443,
      path: `/v1${docPath}`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 5000,
    }, (res) => {
      console.log(`[App] Emergency checkout response: ${res.statusCode}`);
      res.resume(); // consume response
      res.on('end', () => {
        // Also update member_profiles — fire and forget
        const profileBody = JSON.stringify({
          fields: {
            isOnline: { booleanValue: false },
            lastActive: { timestampValue: now.toISOString() },
          },
        });
        const profilePath = `/v1/projects/crazy-desk/databases/(default)/documents/member_profiles/${uid}?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=lastActive`;
        const pReq = https.request({
          hostname: 'firestore.googleapis.com',
          port: 443,
          path: profilePath,
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(profileBody),
          },
          timeout: 3000,
        }, (pRes) => {
          pRes.resume();
          pRes.on('end', resolve);
        });
        pReq.on('error', () => resolve());
        pReq.on('timeout', () => { pReq.destroy(); resolve(); });
        pReq.write(profileBody);
        pReq.end();
      });
    });
    req.on('error', (e) => { console.error('[App] Emergency checkout error:', e.message); resolve(); });
    req.on('timeout', () => { console.warn('[App] Emergency checkout timed out'); req.destroy(); resolve(); });
    req.write(body);
    req.end();

    // Safety fallback — resolve after 6s no matter what
    setTimeout(resolve, 6000);
  });
}

// ─── Quit handling ───────────────────────────────────────────
app.on('before-quit', (e) => {
  console.log('[App] before-quit event');
  app.isQuitting = true;

  // Prevent quit, do emergency checkout first, then quit
  if (_activeSession && _activeSession.sessionId) {
    e.preventDefault();
    console.log('[App] Doing emergency checkout before quit...');
    doEmergencyCheckout().then(() => {
      console.log('[App] Emergency checkout done, quitting now');
      _activeSession = null; // Clear so we don't loop
      app.quit();
    });
  }
});

app.on('will-quit', () => {
  console.log('[App] will-quit event');
});

app.on('window-all-closed', () => {
  // On macOS, stay in tray. On other platforms, quit.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
