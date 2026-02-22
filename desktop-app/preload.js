/* ═══════════════════════════════════════════════════════════════
   Preload — Secure IPC bridge between main ↔ renderer
   ═══════════════════════════════════════════════════════════════ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Screen capture (silent — uses desktopCapturer in main process)
  captureScreen: () => ipcRenderer.invoke('capture-screen'),

  // Upload image to Supabase (runs in main process)
  uploadImage: (buffer, prefix, userId) => ipcRenderer.invoke('upload-image', { buffer, prefix, userId }),

  // Tray status update
  updateStatus: (status) => ipcRenderer.send('update-status', status),

  // Native notifications
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),

  // Deep link listener
  onDeepLink: (callback) => {
    ipcRenderer.on('deep-link', (_ev, data) => callback(data));
  },

  // App quitting listener — renderer should do emergency checkout
  onAppWillQuit: (callback) => {
    ipcRenderer.on('app-will-quit', () => callback());
  },

  // Sync session state to main process for emergency checkout
  syncSessionState: (state) => ipcRenderer.send('sync-session-state', state),

  // App info
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),

  // ─── NEW: Capture countdown notification ────────────────────

  // Play notification sound (tung/tink beep)
  playNotificationSound: () => ipcRenderer.send('play-notification-sound'),
});
