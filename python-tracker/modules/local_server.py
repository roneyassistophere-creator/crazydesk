"""
CrazyDesk Tracker — Local HTTP server for web app communication
===============================================================
Replaces the Electron deep-link protocol (crazydesk://) with a
local HTTP server on port 59210. The web app sends POST requests
to exchange tokens and trigger actions.

Endpoints:
  GET  /api/status   → Check if tracker is running, get session info
  POST /api/checkin  → Receive token + user info from web, auto check-in
  POST /api/refresh  → Refresh the Firebase token
  POST /api/capture  → Trigger a manual/remote capture
  POST /api/checkout → Manual check-out with report

CORS headers are added so the web app (any origin) can call these.
"""

import json
import logging
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

logger = logging.getLogger("crazydesk.server")

PORT = 59210

# Callbacks set by main tracker
_on_checkin = None
_on_refresh = None
_on_capture = None
_on_checkout = None
_on_break = None
_on_resume = None
_get_status = None

_server: HTTPServer | None = None
_thread: threading.Thread | None = None


def set_handlers(
    on_checkin=None,
    on_refresh=None,
    on_capture=None,
    on_checkout=None,
    on_break=None,
    on_resume=None,
    get_status=None,
):
    global _on_checkin, _on_refresh, _on_capture, _on_checkout, _on_break, _on_resume, _get_status
    _on_checkin = on_checkin
    _on_refresh = on_refresh
    _on_capture = on_capture
    _on_checkout = on_checkout
    _on_break = on_break
    _on_resume = on_resume
    _get_status = get_status


class _Handler(BaseHTTPRequestHandler):
    """HTTP request handler with CORS support."""

    def log_message(self, format, *args):
        logger.debug("HTTP %s", format % args)

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json_response(self, status: int, data: dict):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        return json.loads(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/status":
            status = _get_status() if _get_status else {"running": True}
            self._json_response(200, status)
        else:
            self._json_response(404, {"error": "Not found"})

    def do_POST(self):
        try:
            data = self._read_json()
        except Exception:
            self._json_response(400, {"error": "Invalid JSON"})
            return

        if self.path == "/api/checkin":
            if not data.get("token") or not data.get("uid"):
                self._json_response(400, {"error": "Missing token or uid"})
                return
            result = _on_checkin(data) if _on_checkin else {"ok": False}
            self._json_response(200, result)

        elif self.path == "/api/refresh":
            if not data.get("token"):
                self._json_response(400, {"error": "Missing token"})
                return
            result = _on_refresh(data) if _on_refresh else {"ok": False}
            self._json_response(200, result)

        elif self.path == "/api/capture":
            result = _on_capture(data) if _on_capture else {"ok": False}
            self._json_response(200, result)

        elif self.path == "/api/checkout":
            result = _on_checkout(data) if _on_checkout else {"ok": False}
            self._json_response(200, result)

        elif self.path == "/api/break":
            result = _on_break(data) if _on_break else {"ok": False}
            self._json_response(200, result)

        elif self.path == "/api/resume":
            result = _on_resume(data) if _on_resume else {"ok": False}
            self._json_response(200, result)

        else:
            self._json_response(404, {"error": "Not found"})


def start_server():
    global _server, _thread
    stop_server()

    _server = HTTPServer(("127.0.0.1", PORT), _Handler)
    _thread = threading.Thread(target=_server.serve_forever, daemon=True)
    _thread.start()
    logger.info("Local API server started on http://127.0.0.1:%d", PORT)


def stop_server():
    global _server, _thread
    if _server:
        _server.shutdown()
        _server = None
    _thread = None
