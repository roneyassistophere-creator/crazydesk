"""
CrazyDesk Tracker — GUI Application (tkinter + pystray)
=======================================================
Provides:
  • System tray icon with status color (green/yellow/gray)
  • Small status window showing connection state, timer, stats
  • Click tray → show/hide window, right-click → menu
  • Runs entirely without a console window (.pyw / --noconsole)
"""

import logging
import os
import sys
import threading
import time
import tkinter as tk
from tkinter import font as tkfont

import pystray
from PIL import Image, ImageDraw

logger = logging.getLogger("crazydesk.gui")

# ── Platform-aware font ────────────────────────────────────────
IS_MACOS = sys.platform == "darwin"
FONT_FAMILY = "SF Pro Text" if IS_MACOS else "Segoe UI"
MONO_FAMILY = "SF Mono" if IS_MACOS else "Consolas"

# ── Colors (dark theme matching the web app) ───────────────────
BG       = "#1d232a"
BG2      = "#242b33"
BG3      = "#2a323c"
TEXT     = "#a6adbb"
TEXT2    = "#646d7a"
WHITE    = "#ffffff"
PRIMARY  = "#6419e6"
SUCCESS  = "#22c55e"
WARNING  = "#eab308"
ERROR    = "#ef4444"
INFO     = "#3b82f6"


def _create_tray_icon(status: str) -> Image.Image:
    """64×64 tray icon with a status-coloured centre dot."""
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([2, 2, size - 2, size - 2], radius=12, fill=(30, 35, 42, 255))
    colors = {"active": (34, 197, 94), "break": (234, 179, 8), "idle": (100, 109, 122)}
    c = colors.get(status, colors["idle"])
    r = 14
    cx, cy = size // 2, size // 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    return img


class TrackerGUI:
    """
    Manages both the tkinter status window and the pystray tray icon.

    Call `run()` from the main thread — it enters the tkinter mainloop.
    All other interactions happen via thread-safe methods.
    """

    def __init__(self, on_quit=None, on_open_dashboard=None, on_checkout=None):
        self._on_quit = on_quit
        self._on_open_dashboard = on_open_dashboard
        self._on_checkout = on_checkout

        self._status = "idle"       # idle | active | break
        self._user_name = ""
        self._session_id = ""
        self._capture_count = 0
        self._clicks = 0
        self._keys = 0
        self._check_in_ms = 0
        self._total_break_sec = 0
        self._break_start_ms = 0
        self._is_on_break = False
        self._connected = False

        self._root: tk.Tk | None = None
        self._tray: pystray.Icon | None = None
        self._timer_label: tk.Label | None = None
        self._status_label: tk.Label | None = None
        self._user_label: tk.Label | None = None
        self._captures_label: tk.Label | None = None
        self._activity_label: tk.Label | None = None
        self._dot_canvas: tk.Canvas | None = None
        self._conn_label: tk.Label | None = None
        self._checkout_btn: tk.Button | None = None

    # ── Public thread-safe setters ─────────────────────────────

    def update_status(self, status: str):
        self._status = status
        self._schedule_ui(self._refresh_all)

    def update_session(self, *, user_name="", session_id="",
                       check_in_ms=0, total_break_sec=0,
                       break_start_ms=0, is_on_break=False):
        self._user_name = user_name
        self._session_id = session_id
        self._check_in_ms = check_in_ms
        self._total_break_sec = total_break_sec
        self._break_start_ms = break_start_ms
        self._is_on_break = is_on_break
        self._connected = bool(session_id)
        self._schedule_ui(self._refresh_all)

    def update_stats(self, captures=0, clicks=0, keys=0):
        self._capture_count = captures
        self._clicks = clicks
        self._keys = keys
        self._schedule_ui(self._refresh_stats)

    def clear_session(self):
        self._user_name = ""
        self._session_id = ""
        self._capture_count = 0
        self._clicks = 0
        self._keys = 0
        self._check_in_ms = 0
        self._total_break_sec = 0
        self._break_start_ms = 0
        self._is_on_break = False
        self._connected = False
        self._status = "idle"
        self._schedule_ui(self._refresh_all)

    def set_connected(self, connected: bool):
        self._connected = connected
        self._schedule_ui(self._refresh_all)

    # ── Lifecycle ──────────────────────────────────────────────

    def run(self):
        """Enter the main GUI loop (call from main thread)."""
        self._build_window()
        self._start_tray()
        self._tick_timer()
        self._root.mainloop()

    def request_quit(self):
        """Signal the GUI to shut down (thread-safe)."""
        self._schedule_ui(self._do_quit)

    # ── Window construction ────────────────────────────────────

    def _build_window(self):
        self._root = tk.Tk()
        self._root.title("CrazyDesk Tracker")
        self._root.configure(bg=BG)
        self._root.geometry("340x420")
        self._root.resizable(False, False)
        self._root.protocol("WM_DELETE_WINDOW", self._on_close_button)

        # Try to set icon — check multiple locations for .exe/.app and dev
        for base in [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."),
            os.path.dirname(os.path.abspath(sys.argv[0])),
            getattr(sys, "_MEIPASS", ""),  # PyInstaller bundle
        ]:
            if IS_MACOS:
                # macOS: use .png via PhotoImage
                png = os.path.join(base, "assets", "icon.png")
                if os.path.exists(png):
                    try:
                        icon_img = tk.PhotoImage(file=png)
                        self._root.iconphoto(True, icon_img)
                        break
                    except Exception:
                        pass
            else:
                # Windows: use .ico
                ico = os.path.join(base, "assets", "icon.ico")
                if os.path.exists(ico):
                    try:
                        self._root.iconbitmap(ico)
                        break
                    except Exception:
                        pass

        # ── Title bar ──────────────────────────────────────────
        title_frame = tk.Frame(self._root, bg=BG2, padx=12, pady=8)
        title_frame.pack(fill="x")

        self._dot_canvas = tk.Canvas(title_frame, width=12, height=12, bg=BG2,
                                     highlightthickness=0)
        self._dot_canvas.pack(side="left", padx=(0, 8))
        self._draw_dot("idle")

        tk.Label(title_frame, text="CrazyDesk Tracker", font=(FONT_FAMILY, 11, "bold"),
                 fg=TEXT2, bg=BG2).pack(side="left")

        ver_label = tk.Label(title_frame, text="v1.0.0", font=(FONT_FAMILY, 8),
                             fg=TEXT2, bg=BG2)
        ver_label.pack(side="right")

        # ── Connection status ──────────────────────────────────
        conn_frame = tk.Frame(self._root, bg=BG, padx=16)
        conn_frame.pack(fill="x", pady=(12, 4))

        self._conn_label = tk.Label(
            conn_frame,
            text="⏳ Waiting for web app connection...",
            font=(FONT_FAMILY, 9),
            fg=TEXT2, bg=BG, anchor="w",
        )
        self._conn_label.pack(fill="x")

        # ── User card ─────────────────────────────────────────
        user_frame = tk.Frame(self._root, bg=BG2, padx=14, pady=10)
        user_frame.pack(fill="x", padx=12, pady=(4, 0))

        self._user_label = tk.Label(
            user_frame, text="Not connected",
            font=(FONT_FAMILY, 10, "bold"), fg=WHITE, bg=BG2, anchor="w",
        )
        self._user_label.pack(fill="x")

        self._status_label = tk.Label(
            user_frame, text="Open web dashboard → Check In → Desktop → Windows",
            font=(FONT_FAMILY, 8), fg=TEXT2, bg=BG2, anchor="w", wraplength=290,
        )
        self._status_label.pack(fill="x", pady=(2, 0))

        # ── Timer ──────────────────────────────────────────────
        timer_frame = tk.Frame(self._root, bg=BG2, padx=14, pady=16)
        timer_frame.pack(fill="x", padx=12, pady=8)

        self._timer_label = tk.Label(
            timer_frame, text="00:00:00",
            font=(MONO_FAMILY, 32, "bold"), fg=PRIMARY, bg=BG2,
        )
        self._timer_label.pack()

        timer_sub = tk.Label(
            timer_frame, text="Work time",
            font=(FONT_FAMILY, 8), fg=TEXT2, bg=BG2,
        )
        timer_sub.pack()

        # ── Stats row ─────────────────────────────────────────
        stats_frame = tk.Frame(self._root, bg=BG2, padx=14, pady=10)
        stats_frame.pack(fill="x", padx=12, pady=(0, 8))

        for col in range(3):
            stats_frame.columnconfigure(col, weight=1)

        for i, (label_text, val) in enumerate([("Captures", "0"), ("Clicks", "0"), ("Keys", "0")]):
            cell = tk.Frame(stats_frame, bg=BG2)
            cell.grid(row=0, column=i, sticky="nsew", padx=4)
            vl = tk.Label(cell, text=val, font=(FONT_FAMILY, 16, "bold"), fg=WHITE, bg=BG2)
            vl.pack()
            tk.Label(cell, text=label_text, font=(FONT_FAMILY, 7), fg=TEXT2, bg=BG2).pack()

        self._captures_label = stats_frame.grid_slaves(row=0, column=0)[0].winfo_children()[0]
        self._activity_label_clicks = stats_frame.grid_slaves(row=0, column=1)[0].winfo_children()[0]
        self._activity_label_keys = stats_frame.grid_slaves(row=0, column=2)[0].winfo_children()[0]

        # ── Buttons ────────────────────────────────────────────
        btn_frame = tk.Frame(self._root, bg=BG, padx=12, pady=4)
        btn_frame.pack(fill="x")

        dash_btn = tk.Button(
            btn_frame, text="🌐 Open Dashboard",
            font=(FONT_FAMILY, 9), bg=BG3, fg=TEXT, relief="flat",
            activebackground=PRIMARY, activeforeground=WHITE,
            cursor="hand2", padx=12, pady=6,
            command=self._open_dashboard,
        )
        dash_btn.pack(fill="x", pady=(0, 4))
        self._checkout_btn = tk.Button(
            btn_frame, text="\u2713 Check Out",
            font=(FONT_FAMILY, 9, "bold"), bg=SUCCESS, fg=WHITE, relief="flat",
            activebackground="#16a34a", activeforeground=WHITE,
            cursor="hand2", padx=12, pady=6,
            command=self._show_checkout_dialog,
        )
        # Hidden by default — shown when session is active
        hide_btn = tk.Button(
            btn_frame, text="▬ Minimize to Tray",
            font=(FONT_FAMILY, 9), bg=BG3, fg=TEXT, relief="flat",
            activebackground=BG2, activeforeground=TEXT,
            cursor="hand2", padx=12, pady=6,
            command=self._on_close_button,
        )
        hide_btn.pack(fill="x", pady=(0, 4))

        quit_btn = tk.Button(
            btn_frame, text="✕ Quit Tracker",
            font=(FONT_FAMILY, 9), bg=ERROR, fg=WHITE, relief="flat",
            activebackground="#dc2626", activeforeground=WHITE,
            cursor="hand2", padx=12, pady=6,
            command=lambda: self._on_quit() if self._on_quit else self._do_quit(),
        )
        quit_btn.pack(fill="x")

        # ── Footer ─────────────────────────────────────────────
        footer = tk.Label(
            self._root, text="Listening on http://127.0.0.1:59210",
            font=(FONT_FAMILY, 7), fg=TEXT2, bg=BG,
        )
        footer.pack(side="bottom", pady=(4, 8))

    # ── Tray icon ──────────────────────────────────────────────

    def _start_tray(self):
        self._tray = pystray.Icon(
            name="CrazyDesk",
            icon=_create_tray_icon("idle"),
            title="CrazyDesk Tracker",
            menu=pystray.Menu(
                pystray.MenuItem("Show Window", self._show_window, default=True),
                pystray.MenuItem("Open Dashboard", lambda: self._open_dashboard()),
                pystray.Menu.SEPARATOR,
                pystray.MenuItem("Quit", lambda: self._on_quit() if self._on_quit else self._do_quit()),
            ),
        )
        t = threading.Thread(target=self._tray.run, daemon=True)
        t.start()

    def _update_tray_icon(self):
        if self._tray:
            try:
                self._tray.icon = _create_tray_icon(self._status)
                self._tray.title = f"CrazyDesk — {self._status_text()}"
            except Exception:
                pass

    def _status_text(self) -> str:
        return {"active": "Checked In", "break": "On Break", "idle": "Waiting"}.get(self._status, "Waiting")

    # ── UI refresh helpers ─────────────────────────────────────

    def _schedule_ui(self, fn):
        """Schedule fn on the tkinter main thread."""
        if self._root:
            try:
                self._root.after_idle(fn)
            except Exception:
                pass

    def _draw_dot(self, status):
        c = self._dot_canvas
        if not c:
            return
        c.delete("all")
        colors = {"active": SUCCESS, "break": WARNING, "idle": TEXT2}
        color = colors.get(status, TEXT2)
        c.create_oval(1, 1, 11, 11, fill=color, outline="")

    def _refresh_all(self):
        self._draw_dot(self._status)
        self._update_tray_icon()

        if self._connected and self._session_id:
            self._conn_label.config(text="✅ Connected — Tracking active", fg=SUCCESS)
            name_display = self._user_name or "User"
            self._user_label.config(text=name_display)
            if self._is_on_break:
                self._status_label.config(text="☕ On Break", fg=WARNING)
            else:
                self._status_label.config(text="🟢 Working — Screen & camera capture active", fg=SUCCESS)
            # Show checkout button
            if self._checkout_btn:
                self._checkout_btn.pack(fill="x", pady=(0, 4))
        elif self._connected:
            self._conn_label.config(text="✅ Connected", fg=SUCCESS)
        else:
            self._conn_label.config(text="⏳ Waiting for web app connection...", fg=TEXT2)
            self._user_label.config(text="Not connected")
            self._status_label.config(
                text="Open web dashboard → Check In → Desktop → Windows", fg=TEXT2
            )
            self._timer_label.config(text="00:00:00")
            # Hide checkout button
            if self._checkout_btn:
                self._checkout_btn.pack_forget()

        self._refresh_stats()

    def _refresh_stats(self):
        if self._captures_label:
            self._captures_label.config(text=str(self._capture_count))
        if self._activity_label_clicks:
            self._activity_label_clicks.config(text=str(self._clicks))
        if self._activity_label_keys:
            self._activity_label_keys.config(text=str(self._keys))

    def _tick_timer(self):
        """Update the timer display every second."""
        if self._check_in_ms and self._connected:
            now_ms = int(time.time() * 1000)
            cur_break = 0
            if self._break_start_ms:
                cur_break = int((now_ms - self._break_start_ms) / 1000)
            total_sec = max(0, int((now_ms - self._check_in_ms) / 1000))
            effective = max(0, total_sec - self._total_break_sec - cur_break)
            h = effective // 3600
            m = (effective % 3600) // 60
            s = effective % 60
            self._timer_label.config(text=f"{h:02d}:{m:02d}:{s:02d}")

        if self._root:
            self._root.after(1000, self._tick_timer)

    # ── Actions ────────────────────────────────────────────────

    def _show_window(self, *_args):
        if self._root:
            self._root.after(0, self._root.deiconify)
            self._root.after(0, self._root.lift)

    def _on_close_button(self):
        """Minimize to tray instead of closing."""
        if self._root:
            self._root.withdraw()

    def _open_dashboard(self):
        if self._on_open_dashboard:
            self._on_open_dashboard()

    def _show_checkout_dialog(self):
        """Open a modal dialog asking for the checkout report."""
        if not self._root or not self._session_id:
            return

        dlg = tk.Toplevel(self._root)
        dlg.title("Check Out")
        dlg.configure(bg=BG)
        dlg.geometry("360x280")
        dlg.resizable(False, False)
        dlg.transient(self._root)
        dlg.grab_set()

        tk.Label(
            dlg, text="Check Out Report",
            font=(FONT_FAMILY, 12, "bold"), fg=WHITE, bg=BG,
        ).pack(pady=(16, 4))

        tk.Label(
            dlg, text="What did you work on today?",
            font=(FONT_FAMILY, 9), fg=TEXT2, bg=BG,
        ).pack(pady=(0, 8))

        report_frame = tk.Frame(dlg, bg=BG3, padx=2, pady=2)
        report_frame.pack(fill="x", padx=16)
        report_text = tk.Text(
            report_frame, height=5, wrap="word",
            font=(FONT_FAMILY, 9), bg=BG2, fg=WHITE,
            insertbackground=WHITE, relief="flat",
            padx=8, pady=6,
        )
        report_text.pack(fill="x")
        report_text.focus_set()

        tk.Label(
            dlg, text="Proof link (optional)",
            font=(FONT_FAMILY, 8), fg=TEXT2, bg=BG, anchor="w",
        ).pack(fill="x", padx=16, pady=(8, 2))

        proof_entry = tk.Entry(
            dlg, font=(FONT_FAMILY, 9), bg=BG2, fg=WHITE,
            insertbackground=WHITE, relief="flat",
        )
        proof_entry.pack(fill="x", padx=16)

        btn_frame = tk.Frame(dlg, bg=BG)
        btn_frame.pack(fill="x", padx=16, pady=(12, 16))

        def _do_checkout():
            report = report_text.get("1.0", "end").strip()
            proof = proof_entry.get().strip()
            if not report:
                tk.Label(
                    dlg, text="Report is required!", font=(FONT_FAMILY, 8),
                    fg=ERROR, bg=BG,
                ).pack()
                return
            dlg.destroy()
            if self._on_checkout:
                # Run checkout in a thread to avoid blocking UI
                threading.Thread(
                    target=self._on_checkout,
                    args=(report, proof),
                    daemon=True,
                ).start()

        def _cancel():
            dlg.destroy()

        tk.Button(
            btn_frame, text="Cancel",
            font=(FONT_FAMILY, 9), bg=BG3, fg=TEXT, relief="flat",
            activebackground=BG2, activeforeground=TEXT,
            cursor="hand2", padx=16, pady=4,
            command=_cancel,
        ).pack(side="left")

        tk.Button(
            btn_frame, text="Submit & Check Out",
            font=(FONT_FAMILY, 9, "bold"), bg=SUCCESS, fg=WHITE, relief="flat",
            activebackground="#16a34a", activeforeground=WHITE,
            cursor="hand2", padx=16, pady=4,
            command=_do_checkout,
        ).pack(side="right")

    def _do_quit(self):
        if self._tray:
            try:
                self._tray.stop()
            except Exception:
                pass
        if self._root:
            try:
                self._root.quit()
                self._root.destroy()
            except Exception:
                pass
