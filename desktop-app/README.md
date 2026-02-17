# CrazyDesk Desktop Tracker

Desktop companion app for CrazyDesk team management — handles check-in/out, breaks, reports, and **silent web tracking** (no browser prompts!).

## Why a Desktop App?

| Feature | Browser | Desktop App |
|---|---|---|
| Screen capture | Requires user gesture + screen picker every time | **Completely silent** — uses Electron's desktopCapturer |
| Camera capture | Permission prompt (first time) | **Auto-granted** — no prompts |
| System tray | ❌ | ✅ Green/yellow/gray status dot |
| Background operation | Tab must stay open | ✅ Runs in background, minimizes to tray |
| "Sharing your screen" banner | ✅ Always shown | ❌ No banner at all |

## Setup

```bash
cd desktop-app
npm install
```

## Run in Development

```bash
npm start
```

## Build Installers

```bash
# macOS
npm run build:mac

# Windows
npm run build:win

# Linux
npm run build:linux
```

Installers output to `desktop-app/dist/`.

## How It Works

1. **User opens web app** → clicks "Check In"
2. **Web app detects** desktop app installed → redirects via `crazydesk://checkin`
3. **Desktop app opens** → user is logged in → check-in starts
4. **Tracker runs silently**: screenshots every 10–30 min (no prompts, no banners)
5. **Camera captures** happen silently alongside each screenshot
6. **Tray icon** shows green (active), yellow (break), gray (idle)
7. **Check out** → user writes report → session ends → minimizes to tray

## Architecture

```
desktop-app/
├── main.js              # Electron main process (tray, IPC, desktopCapturer)
├── preload.js           # Secure IPC bridge
├── modules/
│   ├── firebase.mjs     # Auth + Firestore (same data as web app)
│   ├── supabase.mjs     # Image upload to tracker-evidence bucket
│   └── capture.mjs      # Silent screen + camera capture + scheduler
├── renderer/
│   └── index.html       # Full UI (login, timer, check-in/out, logs)
├── assets/
│   └── icon.svg         # App icon (convert to .png for builds)
├── .env                 # Firebase + Supabase credentials
└── package.json         # Electron + electron-builder config
```

## Deep Link Protocol

The app registers `crazydesk://` protocol. The web app can open it with:

```javascript
window.location.href = 'crazydesk://checkin';
```

## Icon

For production builds, convert `assets/icon.svg` to a 512×512 PNG:
```bash
# Using sips on macOS
# Or use any SVG-to-PNG converter
```

Place the PNG at `assets/icon.png`.
