"""
CrazyDesk Tracker — Activity tracking module (keyboard + mouse)
===============================================================
Uses pynput to track global mouse clicks and keystrokes.
Flushes counts to Firestore every 5 minutes.
"""

import logging
import threading
import time
from datetime import datetime, timezone

from pynput import mouse, keyboard

from modules.firebase_api import get_session, has_session, save_activity_log

logger = logging.getLogger("crazydesk.activity")

_mouse_clicks = 0
_keystrokes = 0
_lock = threading.Lock()

_mouse_listener: mouse.Listener | None = None
_keyboard_listener: keyboard.Listener | None = None
_flush_timer: threading.Timer | None = None
_running = False

FLUSH_INTERVAL_SEC = 5 * 60  # 5 minutes


def _on_click(x, y, button, pressed):
    global _mouse_clicks
    if pressed:
        with _lock:
            _mouse_clicks += 1


def _on_key_press(key):
    global _keystrokes
    with _lock:
        _keystrokes += 1


def _flush_loop():
    """Periodically flush activity counts to Firestore."""
    while _running:
        time.sleep(FLUSH_INTERVAL_SEC)
        if not _running:
            break
        flush_activity()


def flush_activity():
    """Send accumulated activity counts to Firestore and reset."""
    global _mouse_clicks, _keystrokes
    with _lock:
        clicks = _mouse_clicks
        keys = _keystrokes
        _mouse_clicks = 0
        _keystrokes = 0

    if not clicks and not keys:
        return

    if not has_session():
        return

    session = get_session()
    try:
        save_activity_log({
            "userId": session["uid"],
            "userDisplayName": session["display_name"],
            "mouseClicks": clicks,
            "keystrokes": keys,
            "lastActive": datetime.now(timezone.utc),
            "source": "desktop",
        })
        logger.info("Activity flushed: %d clicks, %d keystrokes", clicks, keys)
    except Exception as e:
        logger.error("Activity flush error: %s", e)
        # Put them back so they aren't lost
        with _lock:
            _mouse_clicks += clicks
            _keystrokes += keys


def get_counts() -> tuple[int, int]:
    """Return current (clicks, keystrokes) without resetting."""
    with _lock:
        return _mouse_clicks, _keystrokes


def start_activity_tracking():
    global _mouse_listener, _keyboard_listener, _flush_timer, _running
    stop_activity_tracking()
    _running = True

    _mouse_listener = mouse.Listener(on_click=_on_click)
    _mouse_listener.daemon = True
    _mouse_listener.start()

    _keyboard_listener = keyboard.Listener(on_press=_on_key_press)
    _keyboard_listener.daemon = True
    _keyboard_listener.start()

    _flush_timer = threading.Thread(target=_flush_loop, daemon=True)
    _flush_timer.start()

    logger.info("Activity tracking started (mouse + keyboard)")


def stop_activity_tracking():
    global _mouse_listener, _keyboard_listener, _flush_timer, _running
    _running = False

    if _mouse_listener:
        _mouse_listener.stop()
        _mouse_listener = None

    if _keyboard_listener:
        _keyboard_listener.stop()
        _keyboard_listener = None

    _flush_timer = None
    logger.info("Activity tracking stopped")
