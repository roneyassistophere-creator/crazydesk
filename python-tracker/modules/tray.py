"""
CrazyDesk Tracker — System tray module
=======================================
Uses pystray to show a status icon in the system tray.
Works on Windows, macOS, and Linux.
"""

import logging
import threading

import pystray
from PIL import Image, ImageDraw

logger = logging.getLogger("crazydesk.tray")

_icon: pystray.Icon | None = None
_thread: threading.Thread | None = None
_status = "idle"

# Callbacks
_on_show_window = None
_on_open_dashboard = None
_on_quit = None


def _create_icon_image(status: str) -> Image.Image:
    """Generate a 64x64 tray icon with a status-colored dot."""
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background circle
    draw.ellipse([4, 4, size - 4, size - 4], fill=(30, 35, 42, 255))

    # Status dot in center
    color_map = {
        "active": (34, 197, 94),     # green
        "break": (234, 179, 8),      # yellow
        "idle": (100, 109, 122),     # gray
    }
    color = color_map.get(status, color_map["idle"])
    dot_size = 20
    cx, cy = size // 2, size // 2
    draw.ellipse(
        [cx - dot_size // 2, cy - dot_size // 2, cx + dot_size // 2, cy + dot_size // 2],
        fill=color,
    )

    return img


def _build_menu():
    status_text = {
        "active": "Checked In",
        "break": "On Break",
        "idle": "Waiting",
    }.get(_status, "Waiting")

    return pystray.Menu(
        pystray.MenuItem(f"CrazyDesk — {status_text}", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Open Web Dashboard", lambda: _on_open_dashboard and _on_open_dashboard()),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit", lambda: _on_quit and _on_quit()),
    )


def update_status(status: str):
    """Update the tray icon status: 'active', 'break', or 'idle'."""
    global _status
    _status = status
    if _icon:
        try:
            _icon.icon = _create_icon_image(status)
            _icon.menu = _build_menu()
        except Exception as e:
            logger.warning("Tray update error: %s", e)


def start_tray(on_open_dashboard=None, on_quit=None):
    """Start the system tray icon. Call from main thread or a daemon thread."""
    global _icon, _thread, _on_open_dashboard, _on_quit
    _on_open_dashboard = on_open_dashboard
    _on_quit = on_quit

    _icon = pystray.Icon(
        name="CrazyDesk",
        icon=_create_icon_image("idle"),
        title="CrazyDesk Tracker",
        menu=_build_menu(),
    )

    # pystray.run() blocks, so run in a thread
    _thread = threading.Thread(target=_icon.run, daemon=True)
    _thread.start()
    logger.info("System tray started")


def stop_tray():
    global _icon
    if _icon:
        try:
            _icon.stop()
        except Exception:
            pass
        _icon = None
