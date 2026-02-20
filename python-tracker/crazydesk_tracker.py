#!/usr/bin/env python3
"""
CrazyDesk Tracker — Main entry point
=====================================
Python replacement for the Electron desktop app (Windows).
Runs a local HTTP server on port 59210 + a tkinter GUI with system tray.

Double-click the .exe or run:
    python crazydesk_tracker.py

The web app communicates via:
    POST http://localhost:59210/api/checkin  { token, uid, name }
    POST http://localhost:59210/api/refresh  { token }
    POST http://localhost:59210/api/capture  {}
    POST http://localhost:59210/api/checkout { report, proofLink }
    GET  http://localhost:59210/api/status
"""

import atexit
import logging
import os
import signal
import sys
import threading
import time
import webbrowser
from datetime import datetime, timezone

# ── Logging (to file when running as .exe, also to console) ────
log_dir = os.path.join(os.path.expanduser("~"), ".crazydesk")
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, "tracker.log")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.FileHandler(log_file, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("crazydesk")

from modules.firebase_api import (
    set_session,
    get_session,
    has_session,
    refresh_token,
    get_active_session,
    check_in,
    start_break,
    resume_work,
    check_out,
    emergency_check_out,
    update_heartbeat,
)
from modules.capture import perform_capture, start_all_tracking, stop_all_tracking
from modules.activity import (
    start_activity_tracking,
    stop_activity_tracking,
    flush_activity,
    get_counts,
)
from modules.local_server import set_handlers, start_server, stop_server, PORT
from modules.gui import TrackerGUI

# ── Session state ──────────────────────────────────────────────

session_id: str | None = None
check_in_time_ms: int | None = None
is_on_break: bool = False
break_start_ms: int | None = None
total_break_sec: int = 0
capture_count: int = 0

_heartbeat_running = False
_heartbeat_thread: threading.Thread | None = None
_shutdown_event = threading.Event()
_gui: TrackerGUI | None = None

WEB_APP_URL = "http://localhost:3000"


# ── Heartbeat ──────────────────────────────────────────────────

def _heartbeat_loop():
    while _heartbeat_running and not _shutdown_event.is_set():
        if session_id:
            try:
                update_heartbeat(session_id)
            except Exception:
                pass
        _shutdown_event.wait(30)


def start_heartbeat():
    global _heartbeat_thread, _heartbeat_running
    stop_heartbeat()
    _heartbeat_running = True
    _heartbeat_thread = threading.Thread(target=_heartbeat_loop, daemon=True)
    _heartbeat_thread.start()


def stop_heartbeat():
    global _heartbeat_running, _heartbeat_thread
    _heartbeat_running = False
    _heartbeat_thread = None


# ── GUI helpers ────────────────────────────────────────────────

def _sync_gui():
    """Push current state to the GUI."""
    if not _gui:
        return
    session = get_session()
    _gui.update_session(
        user_name=session.get("display_name", "") or "",
        session_id=session_id or "",
        check_in_ms=check_in_time_ms or 0,
        total_break_sec=total_break_sec,
        break_start_ms=break_start_ms or 0,
        is_on_break=is_on_break,
    )
    clicks, keys = get_counts()
    _gui.update_stats(captures=capture_count, clicks=clicks, keys=keys)


def _stats_updater():
    """Background thread that pushes activity stats to GUI every 10s."""
    while not _shutdown_event.is_set():
        _shutdown_event.wait(10)
        if _gui and session_id:
            clicks, keys = get_counts()
            _gui.update_stats(captures=capture_count, clicks=clicks, keys=keys)


# ── Tracking lifecycle ─────────────────────────────────────────

def on_capture_done(result):
    global capture_count
    capture_count += 1
    flagged = result.get("flagged", True)
    logger.info(
        "Capture #%d: screenshot=%s, camera=%s, flagged=%s",
        capture_count,
        "yes" if result.get("screenshot_url") else "no",
        "yes" if result.get("camera_url") else "no",
        flagged,
    )
    if _gui:
        clicks, keys = get_counts()
        _gui.update_stats(captures=capture_count, clicks=clicks, keys=keys)


def start_tracking():
    start_all_tracking(on_capture=on_capture_done)
    start_activity_tracking()
    start_heartbeat()
    if _gui:
        _gui.update_status("active")
    _sync_gui()
    logger.info("All tracking started")


def stop_tracking():
    stop_all_tracking()
    stop_activity_tracking()
    stop_heartbeat()
    if _gui:
        _gui.update_status("idle")
    logger.info("All tracking stopped")


# ── Emergency checkout on exit ─────────────────────────────────

def do_emergency_checkout():
    global session_id, check_in_time_ms
    if session_id and has_session():
        logger.info("Emergency checkout for session: %s", session_id)
        stop_tracking()
        flush_activity()
        try:
            emergency_check_out(session_id, check_in_time_ms or 0, total_break_sec)
        except Exception as e:
            logger.error("Emergency checkout failed: %s", e)
        session_id = None
        check_in_time_ms = None


# ── HTTP handler callbacks ─────────────────────────────────────

def handle_checkin(data: dict) -> dict:
    global session_id, check_in_time_ms, is_on_break, break_start_ms, total_break_sec, capture_count

    token = data["token"]
    uid = data["uid"]
    name = data.get("name", "User")

    set_session(token, uid, name)
    logger.info("Session received for: %s (%s)", name, uid)

    if _gui:
        _gui.set_connected(True)

    # Check for existing active session
    try:
        existing = get_active_session()
        if existing:
            session_id = existing["_id"]
            ci_time = existing.get("checkInTime", "")
            if isinstance(ci_time, str):
                check_in_time_ms = int(
                    datetime.fromisoformat(ci_time.replace("Z", "+00:00")).timestamp() * 1000
                )
            else:
                check_in_time_ms = int(ci_time * 1000) if ci_time else int(time.time() * 1000)

            is_on_break = existing.get("status") == "break"
            total_break_sec = 0
            break_start_ms = None

            for b in existing.get("breaks", []) or []:
                if b.get("endTime"):
                    s = b["startTime"]
                    e = b["endTime"]
                    if isinstance(s, str):
                        s = datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000
                    if isinstance(e, str):
                        e = datetime.fromisoformat(e.replace("Z", "+00:00")).timestamp() * 1000
                    total_break_sec += int((e - s) / 1000)

            if is_on_break:
                breaks = existing.get("breaks", []) or []
                if breaks:
                    last = breaks[-1]
                    if not last.get("endTime"):
                        s = last["startTime"]
                        if isinstance(s, str):
                            break_start_ms = int(
                                datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000
                            )
                        else:
                            break_start_ms = int(s * 1000)
                if _gui:
                    _gui.update_status("break")
            else:
                if _gui:
                    _gui.update_status("active")

            start_tracking()
            logger.info("Resumed existing session: %s", session_id)
            return {"ok": True, "resumed": True, "sessionId": session_id}
    except Exception as e:
        logger.warning("Failed to check existing session: %s", e)

    # Create new session
    try:
        session_id = check_in()
        check_in_time_ms = int(time.time() * 1000)
        is_on_break = False
        total_break_sec = 0
        break_start_ms = None
        capture_count = 0

        start_tracking()
        if _gui:
            _gui.update_status("active")
        logger.info("Checked in! Session: %s", session_id)
        return {"ok": True, "sessionId": session_id}
    except Exception as e:
        logger.error("Check-in failed: %s", e)
        return {"ok": False, "error": str(e)}


def handle_refresh(data: dict) -> dict:
    refresh_token(data["token"])
    return {"ok": True}


def handle_capture(data: dict) -> dict:
    global capture_count
    try:
        result = perform_capture("remote")
        capture_count += 1
        if _gui:
            clicks, keys = get_counts()
            _gui.update_stats(captures=capture_count, clicks=clicks, keys=keys)
        return {
            "ok": True,
            "flagged": result.get("flagged", True),
            "screenshotUrl": result.get("screenshot_url"),
            "cameraUrl": result.get("camera_url"),
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}


def handle_checkout(data: dict) -> dict:
    global session_id, check_in_time_ms, is_on_break, break_start_ms, total_break_sec

    if not session_id:
        return {"ok": False, "error": "No active session"}

    report = data.get("report", "")
    proof_link = data.get("proofLink", "")

    if not report:
        return {"ok": False, "error": "Report is required"}

    try:
        stop_tracking()
        flush_activity()
        check_out(session_id, check_in_time_ms or 0, report, proof_link, total_break_sec)

        session_id = None
        check_in_time_ms = None
        is_on_break = False
        break_start_ms = None
        total_break_sec = 0

        if _gui:
            _gui.clear_session()
        logger.info("Checked out successfully")
        return {"ok": True}
    except Exception as e:
        logger.error("Checkout failed: %s", e)
        return {"ok": False, "error": str(e)}


def handle_status() -> dict:
    clicks, keys = get_counts()
    return {
        "running": True,
        "version": "1.0.0",
        "platform": sys.platform,
        "hasSession": has_session(),
        "sessionId": session_id,
        "isOnBreak": is_on_break,
        "captureCount": capture_count,
        "clicks": clicks,
        "keystrokes": keys,
    }


# ── Main ───────────────────────────────────────────────────────

def handle_gui_checkout(report: str, proof_link: str):
    """Called from the GUI checkout dialog (runs in a background thread)."""
    global session_id, check_in_time_ms, is_on_break, break_start_ms, total_break_sec

    if not session_id:
        logger.warning("GUI checkout called but no active session")
        return

    logger.info("GUI checkout for session: %s", session_id)
    try:
        stop_tracking()
        flush_activity()
        check_out(session_id, check_in_time_ms or 0, report, proof_link, total_break_sec)

        session_id = None
        check_in_time_ms = None
        is_on_break = False
        break_start_ms = None
        total_break_sec = 0

        if _gui:
            _gui.clear_session()
        logger.info("GUI checkout completed successfully")
    except Exception as e:
        logger.error("GUI checkout failed: %s", e)


def cleanup():
    """Clean up all resources on exit."""
    do_emergency_checkout()
    stop_tracking()
    stop_server()
    logger.info("Goodbye!")


def _on_gui_quit():
    """Called when user clicks Quit in the GUI or tray."""
    logger.info("User requested quit...")
    cleanup()
    if _gui:
        _gui.request_quit()
    _shutdown_event.set()


def main():
    global _gui

    logger.info("=" * 60)
    logger.info("CrazyDesk Tracker (Python) starting...")
    logger.info("Platform: %s", sys.platform)
    logger.info("Log file: %s", log_file)
    logger.info("API server: http://127.0.0.1:%d", PORT)
    logger.info("=" * 60)

    # Register API handlers
    set_handlers(
        on_checkin=handle_checkin,
        on_refresh=handle_refresh,
        on_capture=handle_capture,
        on_checkout=handle_checkout,
        get_status=handle_status,
    )

    # Start local HTTP server (background thread)
    start_server()

    # Start stats updater thread
    stats_thread = threading.Thread(target=_stats_updater, daemon=True)
    stats_thread.start()

    # Register cleanup
    atexit.register(cleanup)

    # Handle Ctrl+C gracefully
    def signal_handler(sig, frame):
        logger.info("Received signal %s", sig)
        _on_gui_quit()

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    logger.info("Starting GUI...")

    # Create and run GUI (blocks on tkinter mainloop)
    _gui = TrackerGUI(
        on_quit=_on_gui_quit,
        on_open_dashboard=lambda: webbrowser.open(WEB_APP_URL),
        on_checkout=handle_gui_checkout,
    )
    _gui.run()  # blocks until window is destroyed

    # After GUI closes, ensure cleanup runs
    if not _shutdown_event.is_set():
        cleanup()
        _shutdown_event.set()


if __name__ == "__main__":
    main()
