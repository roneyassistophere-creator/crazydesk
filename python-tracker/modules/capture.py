"""
CrazyDesk Tracker — Screen + Camera capture module
===================================================
Screen capture  : mss (works on Windows, macOS, Linux — no prompts)
Camera capture  : OpenCV (cv2)
Upload          : Supabase Storage via supabase_upload module

FLOW  — 1. Play notification sound + show "Capturing in 60s" countdown
         2. At 3, 2, 1 seconds remaining → play sound each second
         3. At 0s → capture screen + camera → upload → log

LOCK  — Only ONE capture can run at a time.
"""

import io
import logging
import os
import random
import sys
import threading
import time

import cv2
import mss
from PIL import Image

from modules.firebase_api import (
    get_session,
    has_session,
    save_tracker_log,
    check_capture_commands,
    complete_capture_command,
)
from modules.supabase_upload import upload_image

logger = logging.getLogger("crazydesk.capture")

CAPTURE_MIN_MIN = 10
CAPTURE_MAX_MIN = 30
REMOTE_POLL_SEC = 15
COUNTDOWN_SECONDS = 60          # 1-minute warning before capture
POST_CAPTURE_COOLDOWN_SEC = 120  # 2 min cooldown after any capture


def _random_delay_sec() -> float:
    return (CAPTURE_MIN_MIN + random.random() * (CAPTURE_MAX_MIN - CAPTURE_MIN_MIN)) * 60


# ── Sound helpers (Windows: winsound, else: print bell) ────────

def _play_beep():
    """Play a short notification 'tung' sound."""
    try:
        if sys.platform == "win32":
            import winsound
            # 800 Hz for 150 ms — a clean "tung" tone
            winsound.Beep(800, 150)
        else:
            # On other platforms, print terminal bell as fallback
            print("\a", end="", flush=True)
    except Exception as e:
        logger.debug("Beep failed: %s", e)


# ── Capture lock ───────────────────────────────────────────────

_capture_in_progress = False
_capture_lock = threading.Lock()
_countdown_cancel = threading.Event()

# GUI callback for countdown display (set from main tracker)
_on_countdown_tick = None   # fn(remaining_seconds, capture_type) or None
_on_countdown_done = None   # fn() — called when countdown finishes


def is_capture_in_progress() -> bool:
    return _capture_in_progress


def set_countdown_callbacks(on_tick=None, on_done=None):
    """Set GUI callbacks for countdown display updates."""
    global _on_countdown_tick, _on_countdown_done
    _on_countdown_tick = on_tick
    _on_countdown_done = on_done


# ── Screen capture ─────────────────────────────────────────────

def capture_screen() -> bytes | None:
    """Take a silent screenshot. Returns JPEG bytes or None."""
    try:
        with mss.mss() as sct:
            # Grab the primary monitor (index 1; index 0 is "all monitors combined")
            monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
            shot = sct.grab(monitor)
            img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")

            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=80)
            jpeg_bytes = buf.getvalue()
            logger.info("Screenshot captured: %d bytes (%dx%d)", len(jpeg_bytes), img.width, img.height)
            return jpeg_bytes
    except Exception as e:
        logger.error("Screen capture error: %s", e)
        return None


# ── Camera capture ─────────────────────────────────────────────

def _is_blank_frame(frame, threshold: float = 12.0) -> bool:
    """Return True if the frame is mostly black / blank."""
    import numpy as np
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray)) < threshold


def capture_camera() -> bytes | None:
    """Take a silent webcam photo. Returns JPEG bytes or None."""
    cap = None
    try:
        cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)   # DirectShow is more reliable on Windows
        if not cap.isOpened():
            logger.warning("Camera not available (DirectShow), trying default backend")
            cap = cv2.VideoCapture(0)
            if not cap.isOpened():
                logger.warning("Camera not available")
                return None

        # Force a reasonable resolution so the sensor activates properly
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

        # Discard warmup frames so sensor auto-exposure / white-balance can settle.
        # Many webcams need 10-30 frames before producing a usable image.
        warmup_frames = 20
        for _ in range(warmup_frames):
            cap.read()
        time.sleep(0.3)          # extra settling time after warmup reads

        # Now read the real frame — retry a couple of times if still blank
        frame = None
        for attempt in range(5):
            ret, candidate = cap.read()
            if not ret or candidate is None:
                logger.warning("Camera read failed on attempt %d", attempt + 1)
                time.sleep(0.2)
                continue
            if _is_blank_frame(candidate):
                logger.info("Blank frame on attempt %d, retrying…", attempt + 1)
                time.sleep(0.3)
                continue
            frame = candidate
            break

        if frame is None:
            logger.warning("Camera produced only blank / unreadable frames after retries")
            return None

        success, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not success:
            logger.warning("JPEG encode failed")
            return None

        jpeg_bytes = buf.tobytes()
        logger.info("Camera captured: %d bytes (%dx%d)", len(jpeg_bytes), frame.shape[1], frame.shape[0])
        return jpeg_bytes

    except Exception as e:
        logger.warning("Camera capture error: %s", e)
        return None
    finally:
        if cap is not None:
            cap.release()


# ── Countdown + capture (screen + camera → upload → save log) ──

def _run_countdown(capture_type: str):
    """
    Run a 60-second countdown with sound effects.
    - Plays a 'tung' sound at start
    - Notifies GUI every second with remaining time
    - Plays 'tung' sound at 3, 2, 1 seconds
    Can be cancelled via _countdown_cancel event.
    """
    _countdown_cancel.clear()

    # Initial notification sound
    _play_beep()
    logger.info("Countdown started: %s capture in %d seconds", capture_type, COUNTDOWN_SECONDS)

    for remaining in range(COUNTDOWN_SECONDS, 0, -1):
        if _countdown_cancel.is_set():
            logger.info("Countdown cancelled")
            if _on_countdown_done:
                try:
                    _on_countdown_done()
                except Exception:
                    pass
            return False

        # Notify GUI
        if _on_countdown_tick:
            try:
                _on_countdown_tick(remaining, capture_type)
            except Exception:
                pass

        # Play beep at 3, 2, 1 seconds
        if remaining <= 3:
            _play_beep()

        _countdown_cancel.wait(1.0)

    # Countdown done — notify GUI
    if _on_countdown_done:
        try:
            _on_countdown_done()
        except Exception:
            pass

    return True


def perform_capture(capture_type: str = "auto") -> dict:
    """
    Perform a full capture cycle with countdown warning:
      1. 60-second countdown with sounds
      2. screen + camera capture
      3. upload → save tracker log.
    Returns {"screenshot_url": ..., "camera_url": ..., "flagged": bool}.
    Only one capture can run at a time (locked).
    """
    global _capture_in_progress

    # Guard: skip if another capture already running
    with _capture_lock:
        if _capture_in_progress:
            logger.warning("Skipping %s capture — another capture in progress", capture_type)
            return {"screenshot_url": None, "camera_url": None, "flagged": False, "skipped": True}
        _capture_in_progress = True

    try:
        session = get_session()
        uid = session["uid"]
        display_name = session["display_name"]

        if not uid:
            logger.warning("No session UID, skipping capture")
            return {"screenshot_url": None, "camera_url": None, "flagged": True}

        logger.info("=== Starting %s capture for user: %s ===", capture_type, uid)

        # Step 1: Countdown warning
        if not _run_countdown(capture_type):
            return {"screenshot_url": None, "camera_url": None, "flagged": False, "skipped": True}

        # Step 2: Capture
        screen_bytes = capture_screen()
        camera_bytes = capture_camera()

        screenshot_url = None
        camera_url = None

        if screen_bytes:
            screenshot_url = upload_image(screen_bytes, "screen", uid)
        else:
            logger.warning("Screen capture returned None")

        if camera_bytes:
            camera_url = upload_image(camera_bytes, "camera", uid)
        else:
            logger.warning("Camera capture returned None")

        flagged = not screenshot_url and not camera_url

        # Step 3: Save log
        try:
            save_tracker_log({
                "userId": uid,
                "userDisplayName": display_name,
                "screenshotUrl": screenshot_url or "",
                "cameraImageUrl": camera_url or "",
                "type": "flagged" if flagged else capture_type,
                "flagged": flagged,
                "source": "desktop",
                **({"flagReason": "Both camera and screen capture failed"} if flagged else {}),
            })
        except Exception as e:
            logger.error("Failed to save tracker log: %s", e)

        logger.info("=== %s capture complete ===", capture_type)
        return {"screenshot_url": screenshot_url, "camera_url": camera_url, "flagged": flagged}

    finally:
        with _capture_lock:
            _capture_in_progress = False


# ── Auto-capture scheduler (with cooldown + lock awareness) ────

_auto_timer: threading.Timer | None = None
_auto_callback = None
_auto_running = False


def _schedule_next(delay: float | None = None):
    global _auto_timer
    if not _auto_running:
        return
    if delay is None:
        delay = _random_delay_sec()
    logger.info("Next auto-capture in ~%.0f min", delay / 60)
    _auto_timer = threading.Timer(delay, _do_auto_capture)
    _auto_timer.daemon = True
    _auto_timer.start()


def _reschedule_after_capture():
    """Push the next auto-capture out by cooldown + random delay."""
    global _auto_timer
    if _auto_timer:
        _auto_timer.cancel()
        _auto_timer = None
    if _auto_running:
        delay = POST_CAPTURE_COOLDOWN_SEC + _random_delay_sec()
        _schedule_next(delay)


def _do_auto_capture():
    if not _auto_running:
        return
    if _capture_in_progress:
        logger.info("Auto-capture skipped — another capture in progress, rescheduling")
        _schedule_next(POST_CAPTURE_COOLDOWN_SEC)
        return
    try:
        result = perform_capture("auto")
        if not result.get("skipped") and _auto_callback:
            _auto_callback(result)
    except Exception as e:
        logger.error("Auto-capture error: %s", e)
    _reschedule_after_capture()


def start_auto_capture(on_capture=None):
    global _auto_timer, _auto_callback, _auto_running
    stop_auto_capture()
    _auto_running = True
    _auto_callback = on_capture

    # First capture 3-5 min after check-in
    first_delay = (3 + random.random() * 2) * 60
    logger.info("First capture in ~%.0f min", first_delay / 60)
    _auto_timer = threading.Timer(first_delay, _do_auto_capture)
    _auto_timer.daemon = True
    _auto_timer.start()


def stop_auto_capture():
    global _auto_timer, _auto_running
    _auto_running = False
    if _auto_timer:
        _auto_timer.cancel()
        _auto_timer = None


# ── Remote capture command poller ──────────────────────────────

_remote_thread: threading.Thread | None = None
_remote_running = False
_remote_callback = None


def _remote_poll_loop():
    while _remote_running:
        try:
            if has_session():
                commands = check_capture_commands()
                if commands:
                    logger.info("Found %d pending remote capture command(s)", len(commands))
                # Process only the first command to prevent rapid-fire captures
                for cmd in commands[:1]:
                    if _capture_in_progress:
                        logger.info("Remote capture skipped — another capture in progress, will retry")
                        break
                    cmd_id = cmd.get("_id")
                    logger.info("Executing remote capture command: %s", cmd_id)
                    result = perform_capture("manual")
                    if not result.get("skipped") and _remote_callback:
                        _remote_callback(result)
                    if cmd_id:
                        complete_capture_command(cmd_id)
                    # Reschedule auto-capture so it doesn't overlap
                    _reschedule_after_capture()
        except Exception as e:
            logger.warning("Remote poller error: %s", e)
        time.sleep(REMOTE_POLL_SEC)


def start_remote_poller(on_capture=None):
    global _remote_thread, _remote_running, _remote_callback
    stop_remote_poller()
    _remote_running = True
    _remote_callback = on_capture
    _remote_thread = threading.Thread(target=_remote_poll_loop, daemon=True)
    _remote_thread.start()


def stop_remote_poller():
    global _remote_running, _remote_thread
    _remote_running = False
    _remote_thread = None


# ── Convenience start/stop all ─────────────────────────────────

def start_all_tracking(on_capture=None):
    start_auto_capture(on_capture)
    start_remote_poller(on_capture)


def stop_all_tracking():
    global _capture_in_progress
    _countdown_cancel.set()          # cancel any running countdown
    stop_auto_capture()
    stop_remote_poller()
    with _capture_lock:
        _capture_in_progress = False
