/* ═══════════════════════════════════════════════════════════════
   Capture module — screen + camera capture with countdown warning
   ═══════════════════════════════════════════════════════════════
   SCREEN — uses electronAPI.captureScreen() → desktopCapturer
   CAMERA — uses navigator.mediaDevices.getUserMedia()

   FLOW  — 1. Show "Be prepared" warning popup with 60s countdown
            2. At 3s remaining → play 3 beep sounds (countdown)
            3. At 0s → capture screen + camera → upload → log

   LOCK  — Only ONE capture can run at a time. If a capture is
            already in progress (countdown or uploading), new
            requests are silently skipped. After any capture
            finishes, auto-capture is delayed by 2 minutes to
            prevent overlap.

   REMOTE — polls capture_commands collection for web-triggered
            capture requests. Executes them and marks as done.
   ═══════════════════════════════════════════════════════════════ */

import { saveTrackerLog, getSession, checkCaptureCommands, completeCaptureCommand } from './firebase.mjs';

const CAPTURE_MIN_MIN = 10;
const CAPTURE_MAX_MIN = 30;
const REMOTE_POLL_MS = 15_000;
const COUNTDOWN_SECONDS = 60; // 1-minute warning before capture
const POST_CAPTURE_COOLDOWN = 2 * 60_000; // 2 min cooldown after any capture

const randomDelay = () =>
  (CAPTURE_MIN_MIN + Math.random() * (CAPTURE_MAX_MIN - CAPTURE_MIN_MIN)) * 60_000;

// ═══════════════════════════════════════════════════════════════
// CAPTURE LOCK — prevents overlapping captures
// ═══════════════════════════════════════════════════════════════
let _captureInProgress = false;
let _countdownInterval = null;

function isCaptureInProgress() { return _captureInProgress; }

// ─── Screen capture (via main process IPC) ────────────────────
async function captureScreen() {
  try {
    console.log('[Capture] Requesting screen capture from main process...');
    const result = await window.electronAPI.captureScreen();

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
    const isBusy = e.message?.includes('Could not start video source') ||
                   e.name === 'NotReadableError' ||
                   e.name === 'AbortError' ||
                   e.message?.includes('Camera timeout') ||
                   e.name === 'NotFoundError';
    if (isBusy) {
      console.log('[Capture] Camera in use by another app — generating placeholder');
      return generateCameraBusyImage();
    }
    return null;
  } finally {
    stream?.getTracks().forEach(t => t.stop());
  }
}

// ─── Generate a placeholder image when camera is busy ─────────
function generateCameraBusyImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#1d232a';
  ctx.fillRect(0, 0, 640, 480);

  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(320, 180, 40, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(290, 150);
  ctx.lineTo(350, 210);
  ctx.stroke();

  ctx.fillStyle = '#ef4444';
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Camera Unavailable', 320, 260);

  ctx.fillStyle = '#a6adbb';
  ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('Camera is being used by another application', 320, 295);

  ctx.fillStyle = '#646d7a';
  ctx.font = '11px monospace';
  ctx.fillText(new Date().toLocaleString(), 320, 340);

  return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.8));
}

// ─── Show countdown warning and wait ──────────────────────────
function showCountdownAndWait(type) {
  return new Promise((resolve) => {
    // Clear any leftover interval from a previous countdown (safety)
    if (_countdownInterval) {
      clearInterval(_countdownInterval);
      _countdownInterval = null;
    }

    // Show the countdown modal
    window.dispatchEvent(new CustomEvent('show-capture-countdown', {
      detail: { type, seconds: COUNTDOWN_SECONDS },
    }));

    // Play initial notification sound
    try { window.electronAPI?.playNotificationSound(); } catch (e) {}

    let remaining = COUNTDOWN_SECONDS;

    _countdownInterval = setInterval(() => {
      remaining--;

      // Update the countdown display
      window.dispatchEvent(new CustomEvent('capture-countdown-tick', {
        detail: { remaining },
      }));

      // Play beep sounds at 3, 2, 1 seconds
      if (remaining <= 3 && remaining > 0) {
        try { window.electronAPI?.playNotificationSound(); } catch (e) {}
      }

      if (remaining <= 0) {
        clearInterval(_countdownInterval);
        _countdownInterval = null;
        // Hide the countdown modal
        window.dispatchEvent(new CustomEvent('capture-countdown-done'));
        resolve();
      }
    }, 1000);
  });
}

// ═══════════════════════════════════════════════════════════════
// performCapture — LOCKED: only one capture at a time
// ═══════════════════════════════════════════════════════════════
export async function performCapture(type = 'auto') {
  // ── Guard: skip if another capture is already running ──
  if (_captureInProgress) {
    console.warn(`[Capture] Skipping ${type} capture — another capture is already in progress`);
    return { screenshotUrl: null, cameraImageUrl: null, flagged: false, skipped: true, type };
  }

  const { uid, displayName } = getSession();
  if (!uid) {
    console.warn('[Capture] No session UID, skipping capture');
    return { screenshotUrl: null, cameraImageUrl: null, flagged: true, type };
  }

  // ── Acquire lock ──
  _captureInProgress = true;
  console.log(`[Capture] === Starting ${type} capture for user: ${uid} ===`);

  try {
    // Step 1: Show countdown warning and wait 60 seconds
    await showCountdownAndWait(type);

    // Step 2: Capture screen and camera in parallel (after countdown)
    const [screenBlob, camBlob] = await Promise.all([
      captureScreen(),
      captureCamera(),
    ]);

    // Step 3: Upload
    let screenshotUrl = null;
    let cameraImageUrl = null;
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

    // Step 4: Save tracker log
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

    console.log(`[Capture] === ${type} capture complete ===`);

    // Step 5: After capture, postpone the next auto-capture
    // so manual/remote captures don't get followed immediately by an auto one
    rescheduleAutoCapture();

    return { screenshotUrl, cameraImageUrl, flagged, type };
  } catch (e) {
    console.error(`[Capture] ${type} capture error:`, e);
    return { screenshotUrl: null, cameraImageUrl: null, flagged: true, type };
  } finally {
    // ── Release lock ──
    _captureInProgress = false;
    // Clean up any stuck countdown interval
    if (_countdownInterval) {
      clearInterval(_countdownInterval);
      _countdownInterval = null;
      window.dispatchEvent(new CustomEvent('capture-countdown-done'));
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Auto-capture scheduler (with reschedule support)
// ═══════════════════════════════════════════════════════════════
let autoTimer = null;
let _autoOnCapture = null; // Store callback so reschedule can reuse it

function scheduleNextAuto(delay) {
  if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  console.log(`[Tracker] Next auto-capture in ~${Math.round(delay / 60000)} min`);
  autoTimer = setTimeout(async () => {
    autoTimer = null;
    // Skip if a capture is already running
    if (_captureInProgress) {
      console.log('[Tracker] Auto-capture skipped — another capture in progress, rescheduling');
      scheduleNextAuto(POST_CAPTURE_COOLDOWN);
      return;
    }
    const result = await performCapture('auto');
    _autoOnCapture?.(result);
    // Schedule the next one (performCapture already calls rescheduleAutoCapture,
    // but this is a safety net in case it was skipped)
    if (!autoTimer) scheduleNextAuto(randomDelay());
  }, delay);
}

// Called after any capture to push the next auto-capture further out
function rescheduleAutoCapture() {
  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
  // Wait at least 2 min + a random 10-30 min delay before next auto
  const delay = POST_CAPTURE_COOLDOWN + randomDelay();
  scheduleNextAuto(delay);
}

export function startAutoCapture(onCapture) {
  stopAutoCapture();
  _autoOnCapture = onCapture;

  // First capture 3-5 min after check-in
  const firstDelay = (3 + Math.random() * 2) * 60_000;
  scheduleNextAuto(firstDelay);
}

export function stopAutoCapture() {
  if (autoTimer) {
    clearTimeout(autoTimer);
    autoTimer = null;
  }
  _autoOnCapture = null;
}

// ═══════════════════════════════════════════════════════════════
// Remote capture command poller
// ═══════════════════════════════════════════════════════════════
let remotePoller = null;

export function startRemotePoller(onCapture) {
  stopRemotePoller();

  async function processCommands() {
    try {
      const commands = await checkCaptureCommands();
      if (!commands.length) return;
      console.log(`[Remote] Found ${commands.length} pending command(s)`);

      // Process only the FIRST command — rest will be picked up next poll
      // This prevents rapid-fire multiple captures
      const cmd = commands[0];
      if (_captureInProgress) {
        console.log('[Remote] Capture in progress, will retry command next poll');
        return;
      }
      const captureType = cmd.type === 'manual' ? 'manual' : 'remote';
      console.log('[Remote] Executing capture command:', cmd._id, 'type:', captureType);
      const result = await performCapture(captureType);
      onCapture?.(result);
      await completeCaptureCommand(cmd._id);
    } catch (e) {
      console.warn('[Remote] Poller error:', e);
    }
  }

  // Initial check (with small delay to avoid immediate overlap with first auto-capture)
  setTimeout(processCommands, 5000);

  remotePoller = setInterval(processCommands, REMOTE_POLL_MS);
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
  // Clean up any in-progress countdown
  _captureInProgress = false;
  if (_countdownInterval) {
    clearInterval(_countdownInterval);
    _countdownInterval = null;
    window.dispatchEvent(new CustomEvent('capture-countdown-done'));
  }
}

export { captureScreen, captureCamera, isCaptureInProgress };
