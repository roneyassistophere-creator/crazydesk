/* ═══════════════════════════════════════════════════════════════
   Firebase REST API module — NO Firebase Auth SDK
   ═══════════════════════════════════════════════════════════════
   Uses Firestore REST API with the user's Firebase ID token
   (passed from the web app via deep link) as Bearer auth.
   Firebase validates the token and applies security rules
   as the original user.
   ═══════════════════════════════════════════════════════════════ */

const PROJECT_ID = 'crazy-desk';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// ─── Session state (set from renderer) ────────────────────────
let _token = null;
let _uid = null;
let _displayName = null;

export function setSession(token, uid, displayName) {
  _token = token;
  _uid = uid;
  _displayName = displayName;
}

export function getSession() {
  return { token: _token, uid: _uid, displayName: _displayName };
}

export function hasSession() {
  return !!_token && !!_uid;
}

// ─── HTTP helpers ─────────────────────────────────────────────
async function firestoreReq(method, path, body) {
  const url = `${BASE}${path}`;
  console.log(`[Firebase] ${method} ${path.split('?')[0]}`);
  const opts = {
    method,
    headers: {
      'Authorization': `Bearer ${_token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    console.error(`[Firebase] ERROR ${res.status}: ${text.substring(0, 300)}`);
    throw new Error(`Firestore ${method} ${path.split('?')[0]}: ${res.status}`);
  }
  return res.json();
}

// ─── Value converters ─────────────────────────────────────────
function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(val) {
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return new Date(val.timestampValue);
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      obj[k] = fromFirestoreValue(v);
    }
    return obj;
  }
  return null;
}

function fromFirestoreDoc(doc) {
  const obj = {};
  for (const [k, v] of Object.entries(doc.fields || {})) {
    obj[k] = fromFirestoreValue(v);
  }
  // Extract document ID from name
  const parts = doc.name.split('/');
  obj._id = parts[parts.length - 1];
  return obj;
}

function buildFields(data) {
  const fields = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

// ─── WORK LOGS ────────────────────────────────────────────────

// Query active/break sessions for current user
export async function getActiveSession() {
  // Firestore REST API: use OR composite for status in ['active', 'break']
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'work_logs' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: _uid } } },
            {
              compositeFilter: {
                op: 'OR',
                filters: [
                  { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'active' } } },
                  { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'break' } } },
                ],
              },
            },
          ],
        },
      },
      orderBy: [{ field: { fieldPath: 'checkInTime' }, direction: 'DESCENDING' }],
      limit: 1,
    },
  };

  const res = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[Firebase] getActiveSession failed:', res.status, text);
    return null;
  }

  const results = await res.json();
  if (!results || !results[0]?.document) return null;

  const doc = results[0].document;
  return fromFirestoreDoc(doc);
}

// Create a new work_log (check-in)
export async function checkIn() {
  const now = new Date().toISOString();
  const data = {
    userId: _uid,
    userDisplayName: _displayName,
    checkInTime: new Date(),
    status: 'active',
    source: 'desktop',
    breaks: [],
  };

  const res = await firestoreReq('POST', '/work_logs', { fields: buildFields(data) });
  const parts = res.name.split('/');
  const docId = parts[parts.length - 1];

  // Update member_profiles
  try {
    await firestoreReq('PATCH', `/member_profiles/${_uid}?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=lastActive`, {
      fields: {
        isOnline: { booleanValue: true },
        lastActive: { timestampValue: now },
      },
    });
  } catch (e) { console.warn('member_profiles update:', e.message); }

  return docId;
}

// Start break
export async function startBreak(sessionId) {
  const session = await getSessionById(sessionId);
  if (!session) return;

  const breaks = session.breaks || [];
  breaks.push({ startTime: new Date() });

  await firestoreReq('PATCH', `/work_logs/${sessionId}?updateMask.fieldPaths=status&updateMask.fieldPaths=breaks`, {
    fields: {
      status: { stringValue: 'break' },
      breaks: toFirestoreValue(breaks),
    },
  });
}

// Resume work (end break)
export async function resumeWork(sessionId) {
  const session = await getSessionById(sessionId);
  if (!session) return;

  const breaks = session.breaks || [];
  if (breaks.length > 0) {
    const last = breaks[breaks.length - 1];
    if (!last.endTime) {
      const now = new Date();
      last.endTime = now;
      const startMs = last.startTime instanceof Date ? last.startTime.getTime() : new Date(last.startTime).getTime();
      last.durationMinutes = Math.round((now.getTime() - startMs) / 60000);
    }
  }

  await firestoreReq('PATCH', `/work_logs/${sessionId}?updateMask.fieldPaths=status&updateMask.fieldPaths=breaks`, {
    fields: {
      status: { stringValue: 'active' },
      breaks: toFirestoreValue(breaks),
    },
  });
}

// Check out with report
export async function checkOut(sessionId, checkInTimeMs, report, proofLink, totalBreakSec) {
  const session = await getSessionById(sessionId);
  const now = new Date();

  let breaks = session?.breaks || [];
  let addedBreakSec = 0;

  // Close open break if any
  if (breaks.length > 0) {
    const last = breaks[breaks.length - 1];
    if (!last.endTime) {
      last.endTime = now;
      const startMs = last.startTime instanceof Date ? last.startTime.getTime() : new Date(last.startTime).getTime();
      last.durationMinutes = Math.round((now.getTime() - startMs) / 60000);
      addedBreakSec = Math.floor((now.getTime() - startMs) / 1000);
    }
  }

  const totalDurationRaw = checkInTimeMs ? Math.round((now.getTime() - checkInTimeMs) / 60000) : 0;
  const totalBreakMin = Math.round((totalBreakSec + addedBreakSec) / 60);

  const mask = 'updateMask.fieldPaths=checkOutTime&updateMask.fieldPaths=status&updateMask.fieldPaths=durationMinutes&updateMask.fieldPaths=breakDurationMinutes&updateMask.fieldPaths=report&updateMask.fieldPaths=attachments&updateMask.fieldPaths=breaks';

  await firestoreReq('PATCH', `/work_logs/${sessionId}?${mask}`, {
    fields: {
      checkOutTime: { timestampValue: now.toISOString() },
      status: { stringValue: 'completed' },
      durationMinutes: { integerValue: String(Math.max(0, totalDurationRaw - totalBreakMin)) },
      breakDurationMinutes: { integerValue: String(totalBreakMin) },
      report: { stringValue: report || '' },
      attachments: toFirestoreValue(proofLink ? [proofLink] : []),
      breaks: toFirestoreValue(breaks),
    },
  });

  // Update member_profiles
  try {
    await firestoreReq('PATCH', `/member_profiles/${_uid}?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=lastActive`, {
      fields: {
        isOnline: { booleanValue: false },
        lastActive: { timestampValue: now.toISOString() },
      },
    });
  } catch (e) { console.warn('member_profiles update:', e.message); }
}

// Get session by ID
async function getSessionById(sessionId) {
  try {
    const doc = await firestoreReq('GET', `/work_logs/${sessionId}`);
    return fromFirestoreDoc(doc);
  } catch {
    return null;
  }
}

// ─── TRACKER LOGS ─────────────────────────────────────────────

export async function saveTrackerLog(data) {
  const now = new Date().toISOString();
  const payload = {
    ...data,
    timestamp: new Date(),
  };
  return firestoreReq('POST', '/tracker_logs', { fields: buildFields(payload) });
}

// ─── ACTIVITY LOGS ────────────────────────────────────────────

export async function saveActivityLog(data) {
  const payload = {
    ...data,
    timestamp: new Date(),
    period: '5min',
  };
  return firestoreReq('POST', '/activity_logs', { fields: buildFields(payload) });
}

// ─── CAPTURE COMMANDS (listen for remote capture requests) ────

export async function checkCaptureCommands() {
  if (!_uid || !_token) {
    console.warn('[Firebase] checkCaptureCommands: no session');
    return [];
  }
  // Query for pending capture commands for this user
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'capture_commands' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: _uid } } },
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'pending' } } },
          ],
        },
      },
      limit: 5,
    },
  };

  const res = await fetch(`${BASE}:runQuery`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[Firebase] checkCaptureCommands failed:', res.status, text.substring(0, 200));
    return [];
  }

  const results = await res.json();
  const commands = [];
  for (const r of results) {
    if (r.document) {
      commands.push(fromFirestoreDoc(r.document));
    }
  }
  return commands;
}

// Mark capture command as completed
export async function completeCaptureCommand(commandId) {
  await firestoreReq('PATCH', `/capture_commands/${commandId}?updateMask.fieldPaths=status&updateMask.fieldPaths=completedAt`, {
    fields: {
      status: { stringValue: 'completed' },
      completedAt: { timestampValue: new Date().toISOString() },
    },
  });
}

// ─── TOKEN REFRESH ────────────────────────────────────────────
export function refreshToken(newToken) {
  _token = newToken;
}

// ─── HEARTBEAT — updates lastHeartbeat on the active work_log ──
export async function updateHeartbeat(sessionId) {
  if (!sessionId || !_token) return;
  try {
    await firestoreReq('PATCH', `/work_logs/${sessionId}?updateMask.fieldPaths=lastHeartbeat`, {
      fields: {
        lastHeartbeat: { timestampValue: new Date().toISOString() },
      },
    });
  } catch (e) {
    console.warn('[Firebase] heartbeat failed:', e.message);
  }
}

// ─── EMERGENCY CHECKOUT — for crashes / quit without report ──
export async function emergencyCheckOut(sessionId, checkInTimeMs, totalBreakSec) {
  if (!sessionId || !_token) return;
  try {
    const now = new Date();
    const totalDurationRaw = checkInTimeMs ? Math.round((now.getTime() - checkInTimeMs) / 60000) : 0;
    const totalBreakMin = Math.round((totalBreakSec || 0) / 60);

    const mask = 'updateMask.fieldPaths=checkOutTime&updateMask.fieldPaths=status&updateMask.fieldPaths=durationMinutes&updateMask.fieldPaths=breakDurationMinutes&updateMask.fieldPaths=report&updateMask.fieldPaths=attachments&updateMask.fieldPaths=flagged&updateMask.fieldPaths=flagReason';

    await firestoreReq('PATCH', `/work_logs/${sessionId}?${mask}`, {
      fields: {
        checkOutTime: { timestampValue: now.toISOString() },
        status: { stringValue: 'completed' },
        durationMinutes: { integerValue: String(Math.max(0, totalDurationRaw - totalBreakMin)) },
        breakDurationMinutes: { integerValue: String(totalBreakMin) },
        report: { stringValue: '[Auto] App closed without manual checkout' },
        attachments: toFirestoreValue([]),
        flagged: { booleanValue: true },
        flagReason: { stringValue: 'App quit or crashed without manual checkout' },
      },
    });

    // Update member_profiles
    await firestoreReq('PATCH', `/member_profiles/${_uid}?updateMask.fieldPaths=isOnline&updateMask.fieldPaths=lastActive`, {
      fields: {
        isOnline: { booleanValue: false },
        lastActive: { timestampValue: now.toISOString() },
      },
    }).catch(() => {});

    console.log('[Firebase] Emergency checkout completed for session:', sessionId);
  } catch (e) {
    console.error('[Firebase] Emergency checkout failed:', e.message);
  }
}
