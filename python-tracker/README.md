# CrazyDesk Python Tracker

Python replacement for the Electron desktop app on **Windows**. Uses a **local HTTP server** on port `59210` instead of the `crazydesk://` deep-link protocol, which was unreliable on Windows. Comes with a tkinter GUI and system tray icon.

> **macOS** users should continue using the Electron desktop app.

## Why Python instead of Electron?

| Issue | Electron (old) | Python (new) |
|---|---|---|
| Windows deep links | Broken / unreliable | N/A — uses local HTTP server |
| Custom protocol (`app://`) | MIME type issues on Windows | N/A — no custom protocol needed |
| Screen capture | `desktopCapturer` (works) | `mss` library (works everywhere) |
| Camera capture | WebRTC in renderer | OpenCV `cv2` (native, fast) |
| Activity tracking | Only within Electron window | Global mouse + keyboard via `pynput` |
| Package size | ~200MB (Chromium + Node) | ~50MB standalone .exe |
| Auto-start reliability | Windows NSIS installer issues | Simple .exe in startup folder |

## Quick Start (Standalone .exe)

1. Run `build.bat` (or see [Building the .exe](#building-the-exe) below)
2. Double-click `dist/CrazyDeskTracker.exe`
3. The tracker appears in your **system tray** with a small status window
4. Open the web dashboard → Check In → Desktop → **Windows**
5. The tracker connects automatically and starts capturing

## Development Setup

```bash
cd python-tracker
pip install -r requirements.txt
python crazydesk_tracker.py
```

### Requirements

- Python 3.11+
- A webcam (optional — captures are flagged if camera fails)

## Building the .exe

```bash
# Install dependencies (includes PyInstaller)
pip install -r requirements.txt

# Build (generates dist/CrazyDeskTracker.exe)
build.bat
```

Or manually:
```bash
python generate_icon.py
pyinstaller --name CrazyDeskTracker --onefile --noconsole --icon assets/icon.ico --add-data "assets;assets" --hidden-import pynput.keyboard._win32 --hidden-import pynput.mouse._win32 --hidden-import pystray._win32 --hidden-import PIL._tkinter_finder crazydesk_tracker.py
```

The output `.exe` is in `dist/CrazyDeskTracker.exe` (~40-60 MB).

## GUI Features

- **System tray icon** — Color-coded status dot (green=active, yellow=break, gray=idle)
- **Status window** — Shows connection state, work timer, capture count, activity stats
- **Minimize to tray** — Click the X button or "Minimize to Tray" to hide the window
- **Quit** — Click "Quit Tracker" or right-click tray → Quit (performs emergency checkout if needed)
- **Dark theme** — Matches the web dashboard design

## How It Works

```
┌─────────────────┐       POST /api/checkin         ┌─────────────────┐
│   Web Dashboard  │ ──────────────────────────────► │  Python Tracker  │
│   (Next.js)      │       { token, uid, name }      │  (port 59210)    │
│                  │ ◄────────────────────────────── │                  │
│                  │       { ok: true, sessionId }   │  • Screen capture│
│                  │                                  │  • Camera capture│
│                  │       GET /api/status            │  • Activity log  │
│                  │ ──────────────────────────────► │  • Heartbeat     │
│                  │ ◄────────────────────────────── │  • System tray   │
└─────────────────┘                                  └─────────────────┘
```

### API Endpoints

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/api/status` | — | Check if tracker is running + session info |
| `POST` | `/api/checkin` | `{ token, uid, name }` | Start session (token from Firebase Auth) |
| `POST` | `/api/refresh` | `{ token }` | Refresh expired Firebase token |
| `POST` | `/api/capture` | `{}` | Trigger a remote capture |
| `POST` | `/api/checkout` | `{ report, proofLink? }` | Check out with report |

### Web App Integration

The web app should:

```javascript
// Check if Python tracker is running
const isTrackerRunning = async () => {
  try {
    const res = await fetch('http://localhost:59210/api/status');
    return res.ok;
  } catch {
    return false;
  }
};

// Send check-in to tracker
const checkInViaTracker = async (token, uid, name) => {
  const res = await fetch('http://localhost:59210/api/checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, uid, name }),
  });
  return res.json();
};
```

## Features

- **Silent screen capture** — Takes screenshots every 10-30 minutes using `mss` (no prompts)
- **Silent camera capture** — Takes webcam photos alongside screenshots using OpenCV
- **Global activity tracking** — Monitors mouse clicks and keystrokes system-wide via `pynput`
- **Image upload** — Uploads to Supabase Storage (`tracker-evidence` bucket)
- **Firestore integration** — Work logs, tracker logs, activity logs via REST API
- **Remote capture** — Polls `capture_commands` collection for web-triggered captures
- **Heartbeat** — Updates `lastHeartbeat` on active work_log every 30s
- **Emergency checkout** — Auto-checks out if the script exits unexpectedly
- **System tray** — Shows status icon (green=active, yellow=break, gray=idle)

## Project Structure

```
python-tracker/
├── crazydesk_tracker.py       # Main entry point
├── build.bat                  # Build .exe script
├── generate_icon.py           # Generate tray/window icons
├── requirements.txt           # Python dependencies
├── README.md                  # This file
├── assets/                    # Generated icons (after running generate_icon.py)
│   ├── icon.ico
│   └── icon.png
└── modules/
    ├── __init__.py
    ├── firebase_api.py        # Firestore REST API (mirrors firebase.mjs)
    ├── supabase_upload.py     # Image upload to Supabase Storage
    ├── capture.py             # Screen + camera capture + scheduler
    ├── activity.py            # Global mouse/keyboard tracking
    ├── local_server.py        # HTTP server for web app communication
    ├── gui.py                 # tkinter GUI + pystray tray icon
    └── tray.py                # (legacy, unused)
```

## Auto-start on Windows Login

1. Press `Win+R`, type `shell:startup`, press Enter
2. Place a shortcut to `CrazyDeskTracker.exe` in that folder
3. The tracker will launch automatically on every login
