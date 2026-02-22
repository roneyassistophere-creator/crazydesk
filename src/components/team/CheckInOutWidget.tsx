'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase/config';
import {
  collection, addDoc, updateDoc, doc, serverTimestamp,
  getDocs, query, where, arrayUnion,
  Timestamp, onSnapshot, getDoc,
} from 'firebase/firestore';
import { auth } from '@/lib/firebase/config';
import { toast } from 'react-hot-toast';
import {
  Clock, Download, CheckCircle, XCircle,
  Link as LinkIcon, Coffee, Play, Monitor, Globe,
  ExternalLink, RefreshCw, AlertTriangle,
} from 'lucide-react';

// Apple logo SVG (lucide-react doesn't include brand icons)
const AppleIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

const WindowsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M3 12V6.75l6-1.32v6.48L3 12zm6.98.04l.02 6.47-6.98-1.01V13l6.96.04zM10.7 5.09L20 3.5V12h-9.3V5.09zM20 13v8.5l-9.3-1.59V13H20z" />
  </svg>
);

interface CheckInOutWidgetProps {
  onStatusChange?: (isOnline: boolean) => void;
  compact?: boolean;
}

export default function CheckInOutWidget({
  onStatusChange,
  compact = false,
}: CheckInOutWidgetProps) {
  const { user, profile } = useAuth();

  // Core state
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionSource, setSessionSource] = useState<'browser' | 'desktop' | null>(null);
  const [checkInTime, setCheckInTime] = useState<Date | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [totalBreakSeconds, setTotalBreakSeconds] = useState(0);
  const [breakStartMs, setBreakStartMs] = useState<number | null>(null);

  // UI state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportText, setReportText] = useState('');
  const [proofLink, setProofLink] = useState('');
  const [loading, setLoading] = useState(false);

  // Modal flow: 0=hidden, 1=choose method, 2=choose platform (mac/win), 3=open mac app, 4=open win tracker
  const [modalStep, setModalStep] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [waitingForDesktop, setWaitingForDesktop] = useState(false);
  const [isStaleDesktop, setIsStaleDesktop] = useState(false);
  const [waitingForPythonTracker, setWaitingForPythonTracker] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokenRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastHeartbeatRef = useRef<Date | null>(null);

  // Format seconds to HH:MM:SS
  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  // Real-time Firestore listener - keeps web in sync with active session
  useEffect(() => {
    if (!user) return;

    // Query by userId only — filter status client-side.
    // Using only a single where() avoids composite index requirements.
    // This ensures onSnapshot fires when desktop app changes status to 'completed'
    // via REST API — the doc is still in the result set, we just see its new status.
    const q = query(
      collection(db, 'work_logs'),
      where('userId', '==', user.uid),
    );

    const unsub = onSnapshot(q, (snap) => {
      // Filter for active/break sessions client-side
      const activeDocs = snap.docs.filter((d) => {
        const s = d.data().status;
        return s === 'active' || s === 'break';
      });

      if (activeDocs.length === 0) {
        setIsCheckedIn(false);
        setIsOnBreak(false);
        setCurrentSessionId(null);
        setSessionSource(null);
        setCheckInTime(null);
        setElapsedTime(0);
        setTotalBreakSeconds(0);
        setBreakStartMs(null);
        setWaitingForDesktop(false);
        setIsStaleDesktop(false);
        lastHeartbeatRef.current = null;
        onStatusChange?.(false);
        return;
      }

      // Pick the most recent session (sort client-side)
      const sorted = activeDocs
        .map((d) => ({ id: d.id, data: d.data() }))
        .sort((a, b) => {
          const ta = a.data.checkInTime?.toDate?.()?.getTime() ?? 0;
          const tb = b.data.checkInTime?.toDate?.()?.getTime() ?? 0;
          return tb - ta;
        });

      const docSnap = sorted[0];
      const data = docSnap.data;

      setIsCheckedIn(true);
      setCurrentSessionId(docSnap.id);
      const source = (data.source || 'browser') as 'browser' | 'desktop';
      setSessionSource(source);
      setWaitingForDesktop(false);
      setModalStep(0);
      onStatusChange?.(true);

      const ciTime = data.checkInTime?.toDate?.() ?? new Date();
      setCheckInTime(prev => {
        if (prev && prev.getTime() === ciTime.getTime()) return prev;
        return ciTime;
      });

      // Track heartbeat for desktop sessions
      if (source === 'desktop') {
        const hb = data.lastHeartbeat?.toDate?.() ?? null;
        lastHeartbeatRef.current = hb;
        // Check if stale (no heartbeat for > 2 minutes)
        if (hb) {
          const ageMs = Date.now() - hb.getTime();
          setIsStaleDesktop(ageMs > 2 * 60 * 1000);
        } else {
          // No heartbeat field at all — check if session is older than 2min
          const sessionAge = Date.now() - ciTime.getTime();
          setIsStaleDesktop(sessionAge > 2 * 60 * 1000);
        }
      } else {
        setIsStaleDesktop(false);
        lastHeartbeatRef.current = null;
      }

      const breaks: Array<{ startTime: any; endTime?: any }> = data.breaks || [];
      const onBreak = data.status === 'break';
      setIsOnBreak(onBreak);

      let totalBrk = 0;
      let currentBreakStart: number | null = null;
      for (const b of breaks) {
        if (b.endTime) {
          const s = b.startTime?.toDate?.()?.getTime() ?? 0;
          const e = b.endTime?.toDate?.()?.getTime() ?? 0;
          totalBrk += Math.max(0, (e - s) / 1000);
        } else if (onBreak) {
          // Open break — capture the start time so we can subtract it live
          currentBreakStart = b.startTime?.toDate?.()?.getTime() ?? null;
        }
      }
      setTotalBreakSeconds(Math.floor(totalBrk));
      setBreakStartMs(currentBreakStart);
    }, (error) => {
      console.error('CheckInOutWidget onSnapshot error:', error);
    });

    return () => unsub();
  }, [user, onStatusChange]);

  // Periodic stale desktop session check (every 30s)
  useEffect(() => {
    if (staleCheckRef.current) clearInterval(staleCheckRef.current);

    if (isCheckedIn && sessionSource === 'desktop') {
      staleCheckRef.current = setInterval(() => {
        const hb = lastHeartbeatRef.current;
        if (hb) {
          const ageMs = Date.now() - hb.getTime();
          setIsStaleDesktop(ageMs > 2 * 60 * 1000);
        }
      }, 30_000);
    }

    return () => {
      if (staleCheckRef.current) clearInterval(staleCheckRef.current);
    };
  }, [isCheckedIn, sessionSource]);

  // Auto-refresh token for existing desktop sessions (handles page reloads)
  // When the component mounts and sees an active desktop session, it tries to
  // reach the Python tracker and send a fresh Firebase token so heartbeats keep working.
  useEffect(() => {
    if (!isCheckedIn || sessionSource !== 'desktop' || !user) return;

    let cancelled = false;

    const refreshDesktopToken = async () => {
      try {
        // Check if the Python tracker is reachable
        const statusRes = await fetch(`${PYTHON_TRACKER_URL}/api/status`, {
          signal: AbortSignal.timeout(2000),
        }).catch(() => null);

        if (!statusRes?.ok || cancelled) return;

        const token = await auth.currentUser?.getIdToken(true);
        if (!token || cancelled) return;

        // Send fresh token to Python tracker
        await fetch(`${PYTHON_TRACKER_URL}/api/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
          signal: AbortSignal.timeout(5000),
        });

        if (cancelled) return;

        // Re-establish periodic token refresh (every 50 min)
        if (tokenRefreshRef.current) clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = setInterval(async () => {
          try {
            const freshToken = await auth.currentUser?.getIdToken(true);
            if (freshToken) {
              fetch(`${PYTHON_TRACKER_URL}/api/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: freshToken }),
              }).catch(() => {});
            }
          } catch (e) {
            console.warn('Token refresh to Python tracker failed:', e);
          }
        }, 50 * 60 * 1000);

        console.log('Auto-refreshed token with Python tracker');
      } catch (e) {
        // Python tracker may not be running (macOS user) — that's OK
        console.debug('Auto token refresh to Python tracker skipped:', e);
      }
    };

    // Slight delay to let auth settle after page load
    const timer = setTimeout(refreshDesktopToken, 2000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isCheckedIn, sessionSource, user]);

  // Timer tick
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (isCheckedIn && checkInTime) {
      const tick = () => {
        const now = Date.now();
        const total = Math.floor((now - checkInTime.getTime()) / 1000);
        setElapsedTime(Math.max(0, total));
      };
      tick();
      timerRef.current = setInterval(tick, 1000);
    } else {
      setElapsedTime(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isCheckedIn, checkInTime]);

  // Clean up token refresh on unmount or when session ends
  useEffect(() => {
    if (!isCheckedIn && tokenRefreshRef.current) {
      clearInterval(tokenRefreshRef.current);
      tokenRefreshRef.current = null;
    }
    return () => {
      if (tokenRefreshRef.current) clearInterval(tokenRefreshRef.current);
    };
  }, [isCheckedIn]);

  // Helper: open deep link without navigating away from current page
  const openDeepLink = useCallback((url: string) => {
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    setTimeout(() => iframe.remove(), 2000);
  }, []);

  // CHECK-IN: Show step 1 modal
  const handleCheckIn = useCallback(() => {
    if (!user || loading || isCheckedIn) return;
    setModalStep(1);
  }, [user, loading, isCheckedIn]);

  // BROWSER CHECK-IN: Instant, optimistic
  const handleBrowserCheckIn = useCallback(async () => {
    if (!user) return;
    setModalStep(0);
    setLoading(true);

    // Optimistic: set local state immediately so timer starts
    const now = new Date();
    setIsCheckedIn(true);
    setCheckInTime(now);
    setSessionSource('browser');
    setIsOnBreak(false);
    setTotalBreakSeconds(0);
    setBreakStartMs(null);

    try {
      const docRef = await addDoc(collection(db, 'work_logs'), {
        userId: user.uid,
        userDisplayName: user.displayName || profile?.displayName || 'Unknown',
        checkInTime: serverTimestamp(),
        status: 'active',
        source: 'browser',
        breaks: [],
      });
      setCurrentSessionId(docRef.id);
      toast.success('Checked in!');
    } catch (err: any) {
      console.error('Browser check-in error:', err);
      // Roll back optimistic state
      setIsCheckedIn(false);
      setCheckInTime(null);
      setSessionSource(null);
      toast.error('Failed to check in');
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  // DESKTOP CHECK-IN: Show platform picker (step 2)
  const handleDesktopCheckIn = useCallback(() => {
    setModalStep(2);
  }, []);

  // macOS desktop: show step 3 (deep link)
  const handleMacDesktop = useCallback(() => {
    setModalStep(3);
  }, []);

  // Windows desktop: show step 4 (Python tracker)
  const handleWindowsDesktop = useCallback(() => {
    setModalStep(4);
  }, []);

  // macOS: send the deep link to Electron desktop app
  const handleOpenDesktopApp = useCallback(async () => {
    if (!user) return;
    setModalStep(0);
    setLoading(true);
    setWaitingForDesktop(true);

    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (token) {
        const params = new URLSearchParams({
          token,
          uid: user.uid,
          name: user.displayName || profile?.displayName || 'User',
          email: user.email || '',
          photo: user.photoURL || '',
        });
        openDeepLink(`crazydesk://checkin?${params.toString()}`);

        // Start token refresh interval (re-send every 50 min)
        if (tokenRefreshRef.current) clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = setInterval(async () => {
          try {
            const freshToken = await auth.currentUser?.getIdToken(true);
            if (freshToken) {
              openDeepLink(`crazydesk://refresh?token=${encodeURIComponent(freshToken)}`);
            }
          } catch (e) {
            console.warn('Token refresh failed:', e);
          }
        }, 50 * 60 * 1000);
      }
    } catch {
      // protocol may not be registered
    }

    // If desktop doesn't respond within 8 seconds, stop waiting
    setTimeout(() => {
      setWaitingForDesktop(false);
      setLoading(false);
    }, 8000);
  }, [user, profile, openDeepLink]);

  // Windows: connect to Python tracker via local HTTP server
  const PYTHON_TRACKER_URL = 'http://127.0.0.1:59210';

  const handleConnectPythonTracker = useCallback(async () => {
    if (!user) return;
    setModalStep(0);
    setLoading(true);
    setWaitingForPythonTracker(true);

    try {
      // First check if the Python tracker is running
      const statusRes = await fetch(`${PYTHON_TRACKER_URL}/api/status`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
      if (!statusRes || !statusRes.ok) {
        toast.error('Python Tracker is not running.\nPlease start it first: python crazydesk_tracker.py');
        setWaitingForPythonTracker(false);
        setLoading(false);
        return;
      }

      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        toast.error('Could not get auth token');
        setWaitingForPythonTracker(false);
        setLoading(false);
        return;
      }

      const res = await fetch(`${PYTHON_TRACKER_URL}/api/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          uid: user.uid,
          name: user.displayName || profile?.displayName || 'User',
        }),
        signal: AbortSignal.timeout(10000),
      });

      const data = await res.json();
      if (data.ok) {
        toast.success(data.resumed ? 'Reconnected to active session!' : 'Checked in via Python Tracker!');

        // Start token refresh interval (POST to Python tracker every 50 min)
        if (tokenRefreshRef.current) clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = setInterval(async () => {
          try {
            const freshToken = await auth.currentUser?.getIdToken(true);
            if (freshToken) {
              fetch(`${PYTHON_TRACKER_URL}/api/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: freshToken }),
              }).catch(() => {});
            }
          } catch (e) {
            console.warn('Token refresh to Python tracker failed:', e);
          }
        }, 50 * 60 * 1000);
      } else {
        toast.error(`Check-in failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      console.error('Python Tracker connection error:', err);
      toast.error('Could not connect to Python Tracker.\nMake sure it\'s running on port 59210.');
    } finally {
      setWaitingForPythonTracker(false);
      setLoading(false);
    }
  }, [user, profile]);

  // BREAK CONTROLS
  const handleStartBreak = useCallback(async () => {
    if (!currentSessionId) return;
    setLoading(true);
    setIsOnBreak(true); // optimistic

    try {
      if (sessionSource === 'desktop') {
        // Send break to Python tracker
        try {
          const res = await fetch(`${PYTHON_TRACKER_URL}/api/break`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || 'Break failed');
          toast.success('Break started');
        } catch (fetchErr) {
          // Fallback to Firestore
          console.warn('Tracker unreachable, starting break via Firestore:', fetchErr);
          const ref = doc(db, 'work_logs', currentSessionId);
          await updateDoc(ref, {
            status: 'break',
            breaks: arrayUnion({ startTime: Timestamp.now() }),
          });
          toast.success('Break started');
        }
      } else {
        const ref = doc(db, 'work_logs', currentSessionId);
        await updateDoc(ref, {
          status: 'break',
          breaks: arrayUnion({ startTime: Timestamp.now() }),
        });
        toast.success('Break started');
      }
    } catch (err: any) {
      console.error('Start break error:', err);
      setIsOnBreak(false);
      toast.error('Failed to start break');
    } finally {
      setLoading(false);
    }
  }, [currentSessionId, sessionSource]);

  const handleEndBreak = useCallback(async () => {
    if (!currentSessionId) return;
    setLoading(true);
    setIsOnBreak(false); // optimistic

    try {
      if (sessionSource === 'desktop') {
        // Send resume to Python tracker
        try {
          const res = await fetch(`${PYTHON_TRACKER_URL}/api/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || 'Resume failed');
          toast.success('Break ended');
        } catch (fetchErr) {
          // Fallback to Firestore
          console.warn('Tracker unreachable, ending break via Firestore:', fetchErr);
          const ref = doc(db, 'work_logs', currentSessionId);
          const snap = await getDocs(
            query(collection(db, 'work_logs'), where('__name__', '==', currentSessionId)),
          );
          if (!snap.empty) {
            const data = snap.docs[0].data();
            const breaks = [...(data.breaks || [])];
            if (breaks.length > 0 && !breaks[breaks.length - 1].endTime) {
              const startT = breaks[breaks.length - 1].startTime?.toDate?.();
              const endT = new Date();
              breaks[breaks.length - 1] = {
                ...breaks[breaks.length - 1],
                endTime: Timestamp.now(),
                durationMinutes: startT
                  ? Math.round((endT.getTime() - startT.getTime()) / 60000)
                  : 0,
              };
              await updateDoc(ref, { status: 'active', breaks });
            }
          }
          toast.success('Break ended');
        }
      } else {
        const ref = doc(db, 'work_logs', currentSessionId);
        const snap = await getDocs(
          query(collection(db, 'work_logs'), where('__name__', '==', currentSessionId)),
        );
        if (!snap.empty) {
          const data = snap.docs[0].data();
          const breaks = [...(data.breaks || [])];
          if (breaks.length > 0 && !breaks[breaks.length - 1].endTime) {
            const startT = breaks[breaks.length - 1].startTime?.toDate?.();
            const endT = new Date();
            breaks[breaks.length - 1] = {
              ...breaks[breaks.length - 1],
              endTime: Timestamp.now(),
              durationMinutes: startT
                ? Math.round((endT.getTime() - startT.getTime()) / 60000)
                : 0,
            };
            await updateDoc(ref, { status: 'active', breaks });
            toast.success('Break ended');
          }
        }
      }
    } catch (err: any) {
      console.error('End break error:', err);
      setIsOnBreak(true);
      toast.error('Failed to end break');
    } finally {
      setLoading(false);
    }
  }, [currentSessionId, sessionSource]);

  // FORCE CLOSE stale desktop session
  const handleForceCloseDesktop = useCallback(async () => {
    if (!currentSessionId || !checkInTime) return;
    setLoading(true);
    try {
      const now = new Date();
      const totalMin = Math.round((now.getTime() - checkInTime.getTime()) / 60000);
      const curBreak = (isOnBreak && breakStartMs) ? Math.floor((Date.now() - breakStartMs) / 1000) : 0;
      const breakMin = Math.round((totalBreakSeconds + curBreak) / 60);

      const ref = doc(db, 'work_logs', currentSessionId);
      await updateDoc(ref, {
        checkOutTime: serverTimestamp(),
        status: 'completed',
        durationMinutes: totalMin,
        breakDurationMinutes: breakMin,
        report: '[Auto] Desktop app became unresponsive — session closed from browser',
        attachments: [],
        flagged: true,
        flagReason: 'Desktop app heartbeat stopped — auto-closed from browser',
      });

      setIsCheckedIn(false);
      setIsOnBreak(false);
      setCurrentSessionId(null);
      setSessionSource(null);
      setCheckInTime(null);
      setElapsedTime(0);
      setTotalBreakSeconds(0);
      setBreakStartMs(null);
      setIsStaleDesktop(false);
      toast.success('Stale desktop session closed');
    } catch (err: any) {
      console.error('Force close error:', err);
      toast.error('Failed to close session');
    } finally {
      setLoading(false);
    }
  }, [currentSessionId, checkInTime, totalBreakSeconds, isOnBreak, breakStartMs]);

  // MANUAL SYNC — re-read the session from Firestore
  const handleSync = useCallback(async () => {
    if (!currentSessionId) return;
    setLoading(true);
    try {
      const ref = doc(db, 'work_logs', currentSessionId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === 'completed' || data.status === 'cancelled') {
          // Desktop already checked out — clear local state
          setIsCheckedIn(false);
          setIsOnBreak(false);
          setCurrentSessionId(null);
          setSessionSource(null);
          setCheckInTime(null);
          setElapsedTime(0);
          setTotalBreakSeconds(0);
          setBreakStartMs(null);
          setIsStaleDesktop(false);
          toast.success('Session already completed — synced!');
        } else {
          toast.success('Session is still active');
        }
      } else {
        // Doc doesn't exist anymore
        setIsCheckedIn(false);
        setCurrentSessionId(null);
        toast.success('Session not found — synced!');
      }
    } catch (err: any) {
      console.error('Sync error:', err);
      toast.error('Sync failed');
    } finally {
      setLoading(false);
    }
  }, [currentSessionId]);

  // RECONNECT — try Python tracker HTTP first (Windows), fall back to deep link (macOS)
  const handleReconnectDesktop = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken(true);
      if (!token) {
        toast.error('Could not get auth token');
        setLoading(false);
        return;
      }

      // 1. Try Python tracker HTTP first (Windows)
      try {
        const statusRes = await fetch(`${PYTHON_TRACKER_URL}/api/status`, {
          signal: AbortSignal.timeout(2000),
        }).catch(() => null);

        if (statusRes?.ok) {
          // Python tracker is running — send fresh token via /api/checkin (handles reconnection)
          const res = await fetch(`${PYTHON_TRACKER_URL}/api/checkin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              uid: user.uid,
              name: user.displayName || profile?.displayName || 'User',
            }),
            signal: AbortSignal.timeout(10000),
          });
          const data = await res.json();
          if (data.ok) {
            // Restart token refresh interval for Python tracker
            if (tokenRefreshRef.current) clearInterval(tokenRefreshRef.current);
            tokenRefreshRef.current = setInterval(async () => {
              try {
                const freshToken = await auth.currentUser?.getIdToken(true);
                if (freshToken) {
                  fetch(`${PYTHON_TRACKER_URL}/api/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: freshToken }),
                  }).catch(() => {});
                }
              } catch (e) {
                console.warn('Token refresh to Python tracker failed:', e);
              }
            }, 50 * 60 * 1000);

            setIsStaleDesktop(false);
            toast.success('Reconnected to Python Tracker!');
            setLoading(false);
            return;
          }
        }
      } catch (e) {
        console.debug('Python tracker not available, trying deep link...', e);
      }

      // 2. Fall back to macOS deep link
      const params = new URLSearchParams({
        token,
        uid: user.uid,
        name: user.displayName || profile?.displayName || 'User',
        email: user.email || '',
        photo: user.photoURL || '',
      });
      openDeepLink(`crazydesk://checkin?${params.toString()}`);

      // Restart token refresh interval for deep link (macOS)
      if (tokenRefreshRef.current) clearInterval(tokenRefreshRef.current);
      tokenRefreshRef.current = setInterval(async () => {
        try {
          const freshToken = await auth.currentUser?.getIdToken(true);
          if (freshToken) {
            openDeepLink(`crazydesk://refresh?token=${encodeURIComponent(freshToken)}`);
          }
        } catch (e) {
          console.warn('Token refresh failed:', e);
        }
      }, 50 * 60 * 1000);

      toast.success('Reconnect signal sent to desktop app');
      // Give the desktop app time to reconnect and update heartbeat
      setTimeout(() => {
        setIsStaleDesktop(false);
        setLoading(false);
      }, 5000);
      return;
    } catch (err) {
      console.error('Reconnect error:', err);
      toast.error('Failed to reconnect');
    }
    setLoading(false);
  }, [user, profile, openDeepLink]);

  // CHECK-OUT — opens report modal (works for both browser and desktop sessions)
  const handleCheckOut = useCallback(() => {
    setShowReportModal(true);
  }, []);

  const submitCheckOut = useCallback(async () => {
    if (!currentSessionId || !checkInTime) return;
    setLoading(true);
    try {
      // For desktop sessions, send checkout to Python tracker
      if (sessionSource === 'desktop') {
        try {
          const res = await fetch(`${PYTHON_TRACKER_URL}/api/checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ report: reportText || '', proofLink: proofLink || '' }),
          });
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || 'Checkout failed');
        } catch (fetchErr) {
          // If tracker is unreachable, fall through to direct Firestore update
          console.warn('Python tracker unreachable, checking out via Firestore directly:', fetchErr);
          const now = new Date();
          const totalMin = Math.round((now.getTime() - checkInTime.getTime()) / 60000);
          const curBreak = (isOnBreak && breakStartMs) ? Math.floor((Date.now() - breakStartMs) / 1000) : 0;
          const breakMin = Math.round((totalBreakSeconds + curBreak) / 60);
          const ref = doc(db, 'work_logs', currentSessionId);
          await updateDoc(ref, {
            checkOutTime: serverTimestamp(),
            status: 'completed',
            durationMinutes: totalMin,
            breakDurationMinutes: breakMin,
            report: reportText || '',
            attachments: proofLink ? [proofLink] : [],
          });
        }
      } else {
        // Browser session — update Firestore directly
        const now = new Date();
        const totalMin = Math.round((now.getTime() - checkInTime.getTime()) / 60000);
        const curBreak = (isOnBreak && breakStartMs) ? Math.floor((Date.now() - breakStartMs) / 1000) : 0;
        const breakMin = Math.round((totalBreakSeconds + curBreak) / 60);
        const ref = doc(db, 'work_logs', currentSessionId);
        await updateDoc(ref, {
          checkOutTime: serverTimestamp(),
          status: 'completed',
          durationMinutes: totalMin,
          breakDurationMinutes: breakMin,
          report: reportText || '',
          attachments: proofLink ? [proofLink] : [],
        });
      }

      // Optimistic clear
      setIsCheckedIn(false);
      setIsOnBreak(false);
      setCurrentSessionId(null);
      setSessionSource(null);
      setCheckInTime(null);
      setElapsedTime(0);
      setTotalBreakSeconds(0);
      setBreakStartMs(null);
      setShowReportModal(false);
      setReportText('');
      setProofLink('');
      toast.success('Checked out successfully');
    } catch (err: any) {
      console.error('Check-out error:', err);
      toast.error('Failed to check out');
    } finally {
      setLoading(false);
    }
  }, [currentSessionId, checkInTime, totalBreakSeconds, isOnBreak, breakStartMs, reportText, proofLink, sessionSource]);

  // RENDER
  if (!user) return null;

  // Compute current ongoing break duration (updates each render triggered by timer tick)
  const currentBreakSec = (isOnBreak && breakStartMs) ? Math.floor((Date.now() - breakStartMs) / 1000) : 0;
  const effectiveBreakSeconds = totalBreakSeconds + currentBreakSec;
  const workSeconds = Math.max(0, elapsedTime - effectiveBreakSeconds);

  // Modals renderer (shared by compact and full)
  const renderModals = () => (
    <>
      {/* ═══ STEP 1: Choose Method ═══ */}
      {modalStep === 1 && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg flex items-center gap-2 mb-1">
              <Clock className="w-5 h-5 text-success" /> Check In
            </h3>
            <p className="text-sm text-base-content/60 mb-4">
              How would you like to track your work?
            </p>

            <div className="flex flex-col gap-3">
              {/* Continue in Browser */}
              <button
                className="btn btn-success btn-block gap-3 justify-start text-left h-auto py-4"
                onClick={handleBrowserCheckIn}
                disabled={loading}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-sm shrink-0" />
                ) : (
                  <Globe className="w-5 h-5 shrink-0" />
                )}
                <div>
                  <div className="font-bold text-sm">Continue in Browser</div>
                  <div className="text-xs opacity-80 font-normal">Timer &amp; manual tracking</div>
                </div>
              </button>

              {/* Use Desktop App */}
              <button
                className="btn btn-outline btn-block gap-3 justify-start text-left h-auto py-4"
                onClick={handleDesktopCheckIn}
                disabled={loading}
              >
                <Monitor className="w-5 h-5 shrink-0" />
                <div>
                  <div className="font-bold text-sm">Use Desktop App</div>
                  <div className="text-xs opacity-70 font-normal">Screen &amp; camera capture, full tracking</div>
                </div>
              </button>
            </div>

            <div className="modal-action mt-4">
              <button className="btn btn-ghost btn-sm" onClick={() => setModalStep(0)}>
                Cancel
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setModalStep(0)} />
        </div>
      )}

      {/* ═══ STEP 2: Choose Platform (macOS / Windows) ═══ */}
      {modalStep === 2 && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg flex items-center gap-2 mb-1">
              <Monitor className="w-5 h-5 text-primary" /> Choose Your Platform
            </h3>
            <p className="text-sm text-base-content/60 mb-4">
              Select your operating system to connect the right tracker.
            </p>

            <div className="flex flex-col gap-3">
              {/* macOS — Electron desktop app via deep link */}
              <button
                className="btn btn-outline btn-block gap-3 justify-start text-left h-auto py-4"
                onClick={handleMacDesktop}
              >
                <AppleIcon className="w-5 h-5 shrink-0" />
                <div>
                  <div className="font-bold text-sm">macOS</div>
                  <div className="text-xs opacity-70 font-normal">CrazyDesk Desktop App (Electron)</div>
                </div>
              </button>

              {/* Windows — Python tracker via local HTTP server */}
              <button
                className="btn btn-outline btn-block gap-3 justify-start text-left h-auto py-4"
                onClick={handleWindowsDesktop}
              >
                <WindowsIcon className="w-5 h-5 shrink-0" />
                <div>
                  <div className="font-bold text-sm">Windows</div>
                  <div className="text-xs opacity-70 font-normal">CrazyDesk Python Tracker</div>
                </div>
              </button>
            </div>

            <div className="modal-action mt-3">
              <button className="btn btn-ghost btn-sm" onClick={() => setModalStep(1)}>
                ← Back
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalStep(0)}>
                Cancel
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setModalStep(0)} />
        </div>
      )}

      {/* ═══ STEP 3: Open macOS Desktop App (Electron deep link) ═══ */}
      {modalStep === 3 && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg flex items-center gap-2 mb-1">
              <AppleIcon className="w-5 h-5 text-primary" /> Open macOS App
            </h3>
            <p className="text-sm text-base-content/60 mb-4">
              CrazyDesk Tracker will open and automatically check you in with
              full screen &amp; camera tracking.
            </p>

            <div className="flex flex-col gap-3">
              <button
                className="btn btn-primary btn-block gap-2"
                onClick={handleOpenDesktopApp}
                disabled={loading}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <ExternalLink className="w-4 h-4" />
                )}
                Open CrazyDesk App
              </button>

              <div className="divider text-xs text-base-content/40 my-0">OR</div>

              <a
                href="/downloads/CrazyDeskTracker.zip"
                download="CrazyDeskTracker.zip"
                className="btn btn-ghost btn-sm gap-2"
              >
                <Download className="w-4 h-4" /> Download macOS App
              </a>

              <p className="text-xs text-base-content/40 text-center mt-1">
                After extracting, if macOS says the app is damaged, open Terminal and run:<br />
                <code className="text-primary/80 select-all">xattr -cr &quot;CrazyDesk Tracker.app&quot;</code>
              </p>
            </div>

            <div className="modal-action mt-3">
              <button className="btn btn-ghost btn-sm" onClick={() => setModalStep(2)}>
                ← Back
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalStep(0)}>
                Cancel
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setModalStep(0)} />
        </div>
      )}

      {/* ═══ STEP 4: Connect Windows Python Tracker ═══ */}
      {modalStep === 4 && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-lg flex items-center gap-2 mb-1">
              <WindowsIcon className="w-5 h-5 text-primary" /> Windows Tracker
            </h3>
            <p className="text-sm text-base-content/60 mb-4">
              Make sure <strong>CrazyDeskTracker.exe</strong> is running, then click connect.
            </p>

            <div className="flex flex-col gap-3">
              <button
                className="btn btn-primary btn-block gap-2"
                onClick={handleConnectPythonTracker}
                disabled={loading}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <Monitor className="w-4 h-4" />
                )}
                Connect to Tracker
              </button>

              <div className="divider text-xs text-base-content/40 my-0">OR</div>

              <a
                href="/downloads/CrazyDeskTracker.exe"
                download="CrazyDeskTracker.exe"
                className="btn btn-ghost btn-sm gap-2"
              >
                <Download className="w-4 h-4" /> Download Windows Tracker
              </a>
            </div>

            <div className="modal-action mt-3">
              <button className="btn btn-ghost btn-sm" onClick={() => setModalStep(2)}>
                ← Back
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setModalStep(0)}>
                Cancel
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setModalStep(0)} />
        </div>
      )}

      {/* ═══ CHECK-OUT REPORT MODAL ═══ */}
      {showReportModal && (
        <div className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-success" /> Check Out Report
            </h3>

            <div className="py-4 space-y-3">
              <div className="stats stats-horizontal w-full bg-base-300">
                <div className="stat py-2 px-3">
                  <div className="stat-title text-xs">Work Time</div>
                  <div className="stat-value text-lg">{fmt(workSeconds)}</div>
                </div>
                <div className="stat py-2 px-3">
                  <div className="stat-title text-xs">Breaks</div>
                  <div className="stat-value text-lg">{fmt(effectiveBreakSeconds)}</div>
                </div>
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm">
                    What did you work on? (optional)
                  </span>
                </label>
                <textarea
                  className="textarea textarea-bordered h-24 text-sm"
                  placeholder="Describe what you accomplished today..."
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                />
              </div>

              <div className="form-control">
                <label className="label">
                  <span className="label-text text-sm">
                    Proof of work link (optional)
                  </span>
                </label>
                <div className="input-group">
                  <span className="bg-base-300 px-3 flex items-center">
                    <LinkIcon className="w-4 h-4" />
                  </span>
                  <input
                    type="url"
                    className="input input-bordered w-full text-sm"
                    placeholder="https://github.com/.../pull/42"
                    value={proofLink}
                    onChange={(e) => setProofLink(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="modal-action">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setShowReportModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-success btn-sm gap-1"
                onClick={submitCheckOut}
                disabled={loading}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Submit &amp; Check Out
              </button>
            </div>
          </div>
          <div
            className="modal-backdrop"
            onClick={() => setShowReportModal(false)}
          />
        </div>
      )}
    </>
  );

  // Compact mode (sidebar)
  if (compact) {
    return (
      <>
        <div className="flex items-center gap-2">
          {isCheckedIn ? (
            <>
              <span className={`badge badge-sm gap-1 ${isOnBreak ? 'badge-warning' : isStaleDesktop ? 'badge-error' : 'badge-success'}`}>
                <Clock className="w-3 h-3" /> {fmt(workSeconds)}
              </span>
              {sessionSource === 'desktop' && !isStaleDesktop && (
                <span className="badge badge-info badge-xs">Desktop</span>
              )}
              {isStaleDesktop && (
                <div className="dropdown dropdown-end">
                  <button
                    tabIndex={0}
                    className="badge badge-error badge-xs gap-1 cursor-pointer hover:brightness-110"
                    disabled={loading}
                    title="Desktop app offline — click for options"
                  >
                    <AlertTriangle className="w-2.5 h-2.5" /> Stale
                  </button>
                  <ul tabIndex={0} className="dropdown-content z-50 menu menu-xs p-1 shadow bg-base-200 rounded-box w-32">
                    <li>
                      <button onClick={handleReconnectDesktop} disabled={loading} className="text-info text-xs">
                        <RefreshCw className="w-3 h-3" /> Reconnect
                      </button>
                    </li>
                    <li>
                      <button onClick={handleForceCloseDesktop} disabled={loading} className="text-error text-xs">
                        <XCircle className="w-3 h-3" /> Force Close
                      </button>
                    </li>
                  </ul>
                </div>
              )}
              {isOnBreak && <span className="badge badge-warning badge-xs">Break</span>}
            </>
          ) : (waitingForDesktop || waitingForPythonTracker) ? (
            <span className="badge badge-sm badge-ghost gap-1">
              <span className="loading loading-spinner loading-xs" /> Connecting...
            </span>
          ) : (
            <button
              className="btn btn-xs btn-success"
              onClick={handleCheckIn}
              disabled={loading}
            >
              Check In
            </button>
          )}
        </div>
        {renderModals()}
      </>
    );
  }

  // Full widget
  return (
    <>
      <div className="card bg-base-200 shadow-lg">
        <div className="card-body p-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="card-title text-sm font-semibold">
              <Clock className="w-4 h-4" /> Work Session
            </h3>
            {isCheckedIn && sessionSource && (
              <span
                className={`badge badge-sm gap-1 ${
                  sessionSource === 'desktop' ? 'badge-info' : 'badge-warning'
                }`}
              >
                {sessionSource === 'desktop' ? (
                  <><Monitor className="w-3 h-3" /> Desktop</>
                ) : (
                  <><Globe className="w-3 h-3" /> Browser</>
                )}
              </span>
            )}
          </div>

          {/* NOT CHECKED IN */}
          {!isCheckedIn && !waitingForDesktop && (
            <div className="flex flex-col items-center gap-3 py-4">
              <p className="text-base-content/60 text-sm">
                Ready to start your work session?
              </p>
              <button
                className="btn btn-success btn-md gap-2"
                onClick={handleCheckIn}
                disabled={loading}
              >
                {loading ? (
                  <span className="loading loading-spinner loading-sm" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Check In
              </button>
            </div>
          )}

          {/* WAITING FOR DESKTOP / PYTHON TRACKER */}
          {(waitingForDesktop || waitingForPythonTracker) && !isCheckedIn && (
            <div className="flex flex-col items-center gap-3 py-4">
              <span className="loading loading-spinner loading-md text-primary" />
              <p className="text-sm text-base-content/60">
                {waitingForPythonTracker ? 'Connecting to Python Tracker...' : 'Waiting for Desktop App to connect...'}
              </p>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => { setWaitingForDesktop(false); setWaitingForPythonTracker(false); setLoading(false); }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* CHECKED IN */}
          {isCheckedIn && (
            <div className="flex flex-col gap-3">
              {/* Timer */}
              <div className="text-center">
                {isOnBreak ? (
                  <>
                    <div className="text-sm font-mono text-base-content/40 mb-1">
                      Work: {fmt(workSeconds)}
                    </div>
                    <div className="text-3xl font-mono font-bold text-warning animate-pulse">
                      {fmt(currentBreakSec)}
                    </div>
                    <span className="badge badge-warning badge-sm mt-2 gap-1">
                      <Coffee className="w-3 h-3" /> On Break
                    </span>
                  </>
                ) : (
                  <>
                    <div className="text-3xl font-mono font-bold text-primary">
                      {fmt(workSeconds)}
                    </div>
                  </>
                )}
                <div className="text-xs text-base-content/50 mt-1">
                  Total: {fmt(elapsedTime)} · Breaks: {fmt(effectiveBreakSeconds)}
                </div>
              </div>

              {/* Browser session controls */}
              {sessionSource === 'browser' && (
                <div className="flex gap-2 justify-center">
                  {!isOnBreak ? (
                    <>
                      <button
                        className="btn btn-warning btn-sm gap-1"
                        onClick={handleStartBreak}
                        disabled={loading}
                      >
                        <Coffee className="w-3.5 h-3.5" /> Break
                      </button>
                      <button
                        className="btn btn-error btn-sm gap-1"
                        onClick={handleCheckOut}
                        disabled={loading}
                      >
                        <XCircle className="w-3.5 h-3.5" /> Check Out
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-success btn-sm gap-1"
                      onClick={handleEndBreak}
                      disabled={loading}
                    >
                      <Play className="w-3.5 h-3.5" /> Resume Work
                    </button>
                  )}
                </div>
              )}

              {/* Desktop session: show sync controls */}
              {sessionSource === 'desktop' && (
                <div className="flex flex-col items-center gap-2">
                  {isStaleDesktop ? (
                    <>
                      <div className="flex items-center gap-1 text-warning text-xs">
                        <AlertTriangle className="w-3 h-3" />
                        Desktop app appears offline
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-info btn-xs gap-1"
                          onClick={handleReconnectDesktop}
                          disabled={loading}
                        >
                          {loading ? <span className="loading loading-spinner loading-xs" /> : <RefreshCw className="w-3 h-3" />}
                          Reconnect
                        </button>
                        <button
                          className="btn btn-warning btn-xs gap-1"
                          onClick={handleForceCloseDesktop}
                          disabled={loading}
                        >
                          {loading ? <span className="loading loading-spinner loading-xs" /> : <XCircle className="w-3 h-3" />}
                          Force Close
                        </button>
                        <button
                          className="btn btn-ghost btn-xs gap-1"
                          onClick={handleSync}
                          disabled={loading}
                        >
                          <RefreshCw className="w-3 h-3" /> Sync
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-info">
                          <Monitor className="w-3 h-3 inline mr-1" />
                          Managed from Desktop App
                        </p>
                        <button
                          className="btn btn-ghost btn-xs gap-1"
                          onClick={handleSync}
                          disabled={loading}
                          title="Refresh session status"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex gap-2 mt-1">
                        {!isOnBreak ? (
                          <>
                            <button
                              className="btn btn-warning btn-sm gap-1"
                              onClick={handleStartBreak}
                              disabled={loading}
                            >
                              <Coffee className="w-3.5 h-3.5" /> Break
                            </button>
                            <button
                              className="btn btn-error btn-sm gap-1"
                              onClick={handleCheckOut}
                              disabled={loading}
                            >
                              <XCircle className="w-3.5 h-3.5" /> Check Out
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn btn-success btn-sm gap-1"
                            onClick={handleEndBreak}
                            disabled={loading}
                          >
                            <Play className="w-3.5 h-3.5" /> Resume Work
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {renderModals()}
    </>
  );
}
