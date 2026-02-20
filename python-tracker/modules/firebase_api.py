"""
CrazyDesk Tracker — Firebase REST API module
=============================================
Uses Firestore REST API with Firebase ID token (Bearer auth).
Mirrors the Electron desktop-app/modules/firebase.mjs functionality.
"""

import time
import logging
import requests
from datetime import datetime, timezone

logger = logging.getLogger("crazydesk.firebase")

PROJECT_ID = "crazy-desk"
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"

# ── Session state ──────────────────────────────────────────────
_token: str | None = None
_uid: str | None = None
_display_name: str | None = None


def set_session(token: str, uid: str, display_name: str):
    global _token, _uid, _display_name
    _token = token
    _uid = uid
    _display_name = display_name
    logger.info("Session set for user: %s (%s)", display_name, uid)


def get_session() -> dict:
    return {"token": _token, "uid": _uid, "display_name": _display_name}


def has_session() -> bool:
    return bool(_token and _uid)


def refresh_token(new_token: str):
    global _token
    _token = new_token
    logger.info("Token refreshed")


# ── Firestore value converters ─────────────────────────────────

def _to_firestore(val):
    """Convert a Python value to Firestore REST value format."""
    if val is None:
        return {"nullValue": None}
    if isinstance(val, bool):
        return {"booleanValue": val}
    if isinstance(val, int):
        return {"integerValue": str(val)}
    if isinstance(val, float):
        return {"doubleValue": val}
    if isinstance(val, str):
        return {"stringValue": val}
    if isinstance(val, datetime):
        return {"timestampValue": val.isoformat()}
    if isinstance(val, list):
        return {"arrayValue": {"values": [_to_firestore(v) for v in val]}}
    if isinstance(val, dict):
        fields = {}
        for k, v in val.items():
            if v is not None:
                fields[k] = _to_firestore(v)
        return {"mapValue": {"fields": fields}}
    return {"stringValue": str(val)}


def _from_firestore(val: dict):
    """Convert a Firestore REST value to Python."""
    if "stringValue" in val:
        return val["stringValue"]
    if "integerValue" in val:
        return int(val["integerValue"])
    if "doubleValue" in val:
        return val["doubleValue"]
    if "booleanValue" in val:
        return val["booleanValue"]
    if "nullValue" in val:
        return None
    if "timestampValue" in val:
        return val["timestampValue"]
    if "arrayValue" in val:
        return [_from_firestore(v) for v in val.get("arrayValue", {}).get("values", [])]
    if "mapValue" in val:
        obj = {}
        for k, v in val.get("mapValue", {}).get("fields", {}).items():
            obj[k] = _from_firestore(v)
        return obj
    return None


def _from_doc(doc: dict) -> dict:
    """Convert a Firestore document to a flat dict with _id."""
    obj = {}
    for k, v in doc.get("fields", {}).items():
        obj[k] = _from_firestore(v)
    parts = doc["name"].split("/")
    obj["_id"] = parts[-1]
    return obj


def _build_fields(data: dict) -> dict:
    return {k: _to_firestore(v) for k, v in data.items() if v is not None}


# ── HTTP helpers ───────────────────────────────────────────────

def _firestore_req(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{BASE}{path}"
    headers = {
        "Authorization": f"Bearer {_token}",
        "Content-Type": "application/json",
    }
    logger.debug("Firestore %s %s", method, path.split("?")[0])
    resp = requests.request(method, url, headers=headers, json=body, timeout=15)
    if not resp.ok:
        logger.error("Firestore %s %s => %d: %s", method, path.split("?")[0], resp.status_code, resp.text[:300])
        resp.raise_for_status()
    return resp.json()


# ── Work Logs ──────────────────────────────────────────────────

def get_active_session() -> dict | None:
    """Query for active/break work_log for current user."""
    body = {
        "structuredQuery": {
            "from": [{"collectionId": "work_logs"}],
            "where": {
                "compositeFilter": {
                    "op": "AND",
                    "filters": [
                        {"fieldFilter": {"field": {"fieldPath": "userId"}, "op": "EQUAL", "value": {"stringValue": _uid}}},
                        {"compositeFilter": {
                            "op": "OR",
                            "filters": [
                                {"fieldFilter": {"field": {"fieldPath": "status"}, "op": "EQUAL", "value": {"stringValue": "active"}}},
                                {"fieldFilter": {"field": {"fieldPath": "status"}, "op": "EQUAL", "value": {"stringValue": "break"}}},
                            ],
                        }},
                    ],
                },
            },
            "orderBy": [{"field": {"fieldPath": "checkInTime"}, "direction": "DESCENDING"}],
            "limit": 1,
        },
    }
    resp = requests.post(
        f"{BASE}:runQuery",
        headers={"Authorization": f"Bearer {_token}", "Content-Type": "application/json"},
        json=body,
        timeout=15,
    )
    if not resp.ok:
        logger.error("getActiveSession failed: %d %s", resp.status_code, resp.text[:200])
        return None
    results = resp.json()
    if not results or not results[0].get("document"):
        return None
    return _from_doc(results[0]["document"])


def check_in() -> str:
    """Create a new work_log (check-in). Returns the document ID."""
    now = datetime.now(timezone.utc)
    data = {
        "userId": _uid,
        "userDisplayName": _display_name,
        "checkInTime": now,
        "status": "active",
        "source": "desktop",
        "breaks": [],
    }
    doc = _firestore_req("POST", "/work_logs", {"fields": _build_fields(data)})
    doc_id = doc["name"].split("/")[-1]

    # Update member_profiles
    try:
        _firestore_req(
            "PATCH",
            f"/member_profiles/{_uid}?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=lastActive",
            {"fields": {
                "isOnline": {"booleanValue": True},
                "lastActive": {"timestampValue": now.isoformat()},
            }},
        )
    except Exception as e:
        logger.warning("member_profiles update: %s", e)

    return doc_id


def _get_session_by_id(session_id: str) -> dict | None:
    try:
        doc = _firestore_req("GET", f"/work_logs/{session_id}")
        return _from_doc(doc)
    except Exception:
        return None


def start_break(session_id: str):
    session = _get_session_by_id(session_id)
    if not session:
        return
    breaks = session.get("breaks", []) or []
    breaks.append({"startTime": datetime.now(timezone.utc)})
    _firestore_req(
        "PATCH",
        f"/work_logs/{session_id}?updateMask.fieldPaths=status&updateMask.fieldPaths=breaks",
        {"fields": {
            "status": {"stringValue": "break"},
            "breaks": _to_firestore(breaks),
        }},
    )


def resume_work(session_id: str):
    session = _get_session_by_id(session_id)
    if not session:
        return
    breaks = session.get("breaks", []) or []
    if breaks:
        last = breaks[-1]
        if not last.get("endTime"):
            now = datetime.now(timezone.utc)
            last["endTime"] = now
            start_str = last.get("startTime", "")
            if isinstance(start_str, str):
                start_ms = datetime.fromisoformat(start_str.replace("Z", "+00:00")).timestamp() * 1000
            else:
                start_ms = start_str.timestamp() * 1000
            last["durationMinutes"] = round((now.timestamp() * 1000 - start_ms) / 60000)

    _firestore_req(
        "PATCH",
        f"/work_logs/{session_id}?updateMask.fieldPaths=status&updateMask.fieldPaths=breaks",
        {"fields": {
            "status": {"stringValue": "active"},
            "breaks": _to_firestore(breaks),
        }},
    )


def check_out(session_id: str, check_in_time_ms: int, report: str, proof_link: str, total_break_sec: int):
    """Check out with report."""
    session = _get_session_by_id(session_id)
    now = datetime.now(timezone.utc)
    now_ms = int(now.timestamp() * 1000)

    breaks = (session or {}).get("breaks", []) or []
    added_break_sec = 0

    # Close open break if any
    if breaks:
        last = breaks[-1]
        if not last.get("endTime"):
            last["endTime"] = now
            start_str = last.get("startTime", "")
            if isinstance(start_str, str):
                start_ms = datetime.fromisoformat(start_str.replace("Z", "+00:00")).timestamp() * 1000
            else:
                start_ms = start_str.timestamp() * 1000
            last["durationMinutes"] = round((now_ms - start_ms) / 60000)
            added_break_sec = int((now_ms - start_ms) / 1000)

    total_raw = round((now_ms - check_in_time_ms) / 60000) if check_in_time_ms else 0
    total_break_min = round((total_break_sec + added_break_sec) / 60)

    mask = "&".join([
        "updateMask.fieldPaths=checkOutTime",
        "updateMask.fieldPaths=status",
        "updateMask.fieldPaths=durationMinutes",
        "updateMask.fieldPaths=breakDurationMinutes",
        "updateMask.fieldPaths=report",
        "updateMask.fieldPaths=attachments",
        "updateMask.fieldPaths=breaks",
    ])

    _firestore_req(
        "PATCH",
        f"/work_logs/{session_id}?{mask}",
        {"fields": {
            "checkOutTime": {"timestampValue": now.isoformat()},
            "status": {"stringValue": "completed"},
            "durationMinutes": {"integerValue": str(max(0, total_raw - total_break_min))},
            "breakDurationMinutes": {"integerValue": str(total_break_min)},
            "report": {"stringValue": report or ""},
            "attachments": _to_firestore([proof_link] if proof_link else []),
            "breaks": _to_firestore(breaks),
        }},
    )

    # Update member_profiles
    try:
        _firestore_req(
            "PATCH",
            f"/member_profiles/{_uid}?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=lastActive",
            {"fields": {
                "isOnline": {"booleanValue": False},
                "lastActive": {"timestampValue": now.isoformat()},
            }},
        )
    except Exception as e:
        logger.warning("member_profiles update: %s", e)


def emergency_check_out(session_id: str, check_in_time_ms: int, total_break_sec: int):
    """Emergency checkout when app is closing without manual checkout."""
    if not session_id or not _token:
        return
    try:
        now = datetime.now(timezone.utc)
        now_ms = int(now.timestamp() * 1000)
        total_raw = round((now_ms - check_in_time_ms) / 60000) if check_in_time_ms else 0
        total_break_min = round((total_break_sec or 0) / 60)

        mask = "&".join([
            "updateMask.fieldPaths=checkOutTime",
            "updateMask.fieldPaths=status",
            "updateMask.fieldPaths=durationMinutes",
            "updateMask.fieldPaths=breakDurationMinutes",
            "updateMask.fieldPaths=report",
            "updateMask.fieldPaths=attachments",
            "updateMask.fieldPaths=flagged",
            "updateMask.fieldPaths=flagReason",
        ])

        _firestore_req(
            "PATCH",
            f"/work_logs/{session_id}?{mask}",
            {"fields": {
                "checkOutTime": {"timestampValue": now.isoformat()},
                "status": {"stringValue": "completed"},
                "durationMinutes": {"integerValue": str(max(0, total_raw - total_break_min))},
                "breakDurationMinutes": {"integerValue": str(total_break_min)},
                "report": {"stringValue": "[Auto] App closed without manual checkout"},
                "attachments": _to_firestore([]),
                "flagged": {"booleanValue": True},
                "flagReason": {"stringValue": "App quit or crashed without manual checkout"},
            }},
        )

        # Update member_profiles
        _firestore_req(
            "PATCH",
            f"/member_profiles/{_uid}?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=lastActive",
            {"fields": {
                "isOnline": {"booleanValue": False},
                "lastActive": {"timestampValue": now.isoformat()},
            }},
        )
        logger.info("Emergency checkout completed for session: %s", session_id)
    except Exception as e:
        logger.error("Emergency checkout failed: %s", e)


# ── Tracker Logs ───────────────────────────────────────────────

def save_tracker_log(data: dict):
    payload = {**data, "timestamp": datetime.now(timezone.utc)}
    return _firestore_req("POST", "/tracker_logs", {"fields": _build_fields(payload)})


# ── Activity Logs ──────────────────────────────────────────────

def save_activity_log(data: dict):
    payload = {**data, "timestamp": datetime.now(timezone.utc), "period": "5min"}
    return _firestore_req("POST", "/activity_logs", {"fields": _build_fields(payload)})


# ── Capture Commands ───────────────────────────────────────────

def check_capture_commands() -> list[dict]:
    """Query pending capture commands for this user."""
    if not _uid or not _token:
        return []
    body = {
        "structuredQuery": {
            "from": [{"collectionId": "capture_commands"}],
            "where": {
                "compositeFilter": {
                    "op": "AND",
                    "filters": [
                        {"fieldFilter": {"field": {"fieldPath": "userId"}, "op": "EQUAL", "value": {"stringValue": _uid}}},
                        {"fieldFilter": {"field": {"fieldPath": "status"}, "op": "EQUAL", "value": {"stringValue": "pending"}}},
                    ],
                },
            },
            "limit": 5,
        },
    }
    resp = requests.post(
        f"{BASE}:runQuery",
        headers={"Authorization": f"Bearer {_token}", "Content-Type": "application/json"},
        json=body,
        timeout=15,
    )
    if not resp.ok:
        logger.error("checkCaptureCommands failed: %d %s", resp.status_code, resp.text[:200])
        return []

    results = resp.json()
    commands = []
    for r in results:
        if r.get("document"):
            commands.append(_from_doc(r["document"]))
    return commands


def complete_capture_command(command_id: str):
    _firestore_req(
        "PATCH",
        f"/capture_commands/{command_id}?updateMask.fieldPaths=status&updateMask.fieldPaths=completedAt",
        {"fields": {
            "status": {"stringValue": "completed"},
            "completedAt": {"timestampValue": datetime.now(timezone.utc).isoformat()},
        }},
    )


# ── Heartbeat ──────────────────────────────────────────────────

def update_heartbeat(session_id: str):
    if not session_id or not _token:
        return
    try:
        _firestore_req(
            "PATCH",
            f"/work_logs/{session_id}?updateMask.fieldPaths=lastHeartbeat",
            {"fields": {
                "lastHeartbeat": {"timestampValue": datetime.now(timezone.utc).isoformat()},
            }},
        )
    except Exception as e:
        logger.warning("Heartbeat failed: %s", e)
