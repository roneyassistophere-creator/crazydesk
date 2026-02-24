'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase/config';
import { db } from '@/lib/firebase/config';
import {
  collection, addDoc, onSnapshot, query, where,
  orderBy, getDocs, deleteDoc, doc, Timestamp,
} from 'firebase/firestore';
import { WorkLog } from '@/types/workLog';
import {
  Image as ImageIcon, Clock, User, Eye, EyeOff,
  AlertTriangle, MousePointerClick, Monitor, Shield, Flag,
  Calendar, CalendarDays, CalendarRange, Trash2, Download, Camera,
  Users, ChevronRight,
} from 'lucide-react';
import { useUsers } from '@/hooks/useUsers';
import UserAvatar from '@/components/common/UserAvatar';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

/* ================================================================
   WEB TRACKER — VIEW-ONLY MODE
   ================================================================
   All screen & camera capturing is handled by the CrazyDesk
   Desktop App (Electron).  This page is now a dashboard for
   viewing tracker logs, activity stats, and managing logs.

   • No screen capture / camera capture code
   • No capture popups or getDisplayMedia calls
   • Activity tracking (clicks/keystrokes) still works here
   • Managers/admins can view all users' logs, filter, delete
   • Banner tells browser-only users to install the desktop app
   ================================================================ */

// ─── Types ────────────────────────────────────────────────────
interface TrackerLog {
  id: string;
  userId: string;
  userDisplayName: string;
  timestamp: any;
  screenshotUrl?: string;
  cameraImageUrl?: string;
  type: 'auto' | 'remote' | 'flagged';
  flagged?: boolean;
  flagReason?: string;
  source?: 'desktop' | 'browser';
}

interface ActivityStats {
  mouseClicks: number;
  keystrokes: number;
  lastActive: Date | null;
}

interface CheckedInUser {
  uid: string;
  name: string;
  isCheckedIn: boolean;
  source?: string;
}

type DateFilter = 'today' | 'yesterday' | 'last7' | 'last30' | 'all';

// ─── Constants ────────────────────────────────────────────────
const AUTO_DELETE_DAYS = 30;

// ─── Helpers ──────────────────────────────────────────────────
const dateRangeStart = (f: DateFilter): Date | null => {
  const n = new Date();
  n.setHours(0, 0, 0, 0);
  if (f === 'today') return n;
  if (f === 'yesterday') {
    const d = new Date(n);
    d.setDate(d.getDate() - 1);
    return d;
  }
  if (f === 'last7') {
    const d = new Date(n);
    d.setDate(d.getDate() - 7);
    return d;
  }
  if (f === 'last30') {
    const d = new Date(n);
    d.setDate(d.getDate() - 30);
    return d;
  }
  return null; // 'all'
};

const dateRangeEnd = (f: DateFilter): Date | null => {
  if (f === 'yesterday') {
    const n = new Date();
    n.setHours(0, 0, 0, 0);
    return n; // End of yesterday = start of today
  }
  return null;
};

// Format time as 12-hour with AM/PM
const formatTime12h = (date: Date): string => {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const filenameFromUrl = (url: string): string | null => {
  try { return url.split('/tracker-evidence/')[1] || null; } catch { return null; }
};

// ─── Component ────────────────────────────────────────────────
export default function WebTrackerPage() {
  const { user, profile } = useAuth();
  const searchParams = useSearchParams();
  const isManagerOrAdmin = profile?.role === 'MANAGER' || profile?.role === 'ADMIN';

  // Core
  const [activeLog, setActiveLog] = useState<WorkLog | null>(null);
  const [logs, setLogs] = useState<TrackerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackingActive, setTrackingActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lightbox for viewing images
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxLog, setLightboxLog] = useState<TrackerLog | null>(null);

  // Filters
  const [selectedUser, setSelectedUser] = useState<string>('ALL');
  const [userList, setUserList] = useState<CheckedInUser[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [deleting, setDeleting] = useState(false);
  const [sendingCapture, setSendingCapture] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Team sidebar data
  const { users: approvedUsers, loading: usersLoading } = useUsers();
  const teamMembers = approvedUsers.filter(u => u.uid !== user?.uid);

  // Activity
  const [activityStats, setActivityStats] = useState<ActivityStats>({
    mouseClicks: 0, keystrokes: 0, lastActive: null,
  });
  const activityRef = useRef<ActivityStats>({ mouseClicks: 0, keystrokes: 0, lastActive: null });
  const flushRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Is user using the desktop app? (check work_log source field)
  const [usingDesktopApp, setUsingDesktopApp] = useState(false);

  // ── URL params ──────────────────────────────────────────────
  useEffect(() => {
    const uid = searchParams.get('userId');
    if (uid) setSelectedUser(uid);
  }, [searchParams]);

  // ── Fetch user list (admin / manager) ───────────────────────
  useEffect(() => {
    if (!isManagerOrAdmin) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const users = snap.docs.map(d => ({
          uid: d.id,
          name: d.data().displayName || d.data().email || 'Unknown',
          isCheckedIn: false,
          source: undefined as string | undefined,
        }));
        const active = await getDocs(query(collection(db, 'work_logs'), where('status', 'in', ['active', 'break'])));
        const activeMap = new Map<string, string>();
        active.docs.forEach(d => {
          const data = d.data();
          activeMap.set(data.userId, data.source || 'browser');
        });
        setUserList(users.map(u => ({
          ...u,
          isCheckedIn: activeMap.has(u.uid),
          source: activeMap.get(u.uid),
        })));
      } catch (e) { console.error(e); }
    })();
  }, [isManagerOrAdmin]);

  // ── Monitor work session ────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    // Query by userId only — filter status client-side to avoid composite index
    // and ensure onSnapshot fires when desktop changes status via REST API
    const q = query(collection(db, 'work_logs'), where('userId', '==', user.uid));
    return onSnapshot(q, snap => {
      const activeDoc = snap.docs.find(d => {
        const s = d.data().status;
        return s === 'active' || s === 'break';
      });
      if (activeDoc) {
        const data = activeDoc.data();
        setActiveLog({ id: activeDoc.id, ...data } as WorkLog);
        setTrackingActive(true);
        setUsingDesktopApp(data.source === 'desktop');
      } else {
        setActiveLog(null);
        setTrackingActive(false);
        setUsingDesktopApp(false);
      }
    }, (error) => {
      console.error('WebTracker work_logs onSnapshot error:', error);
    });
  }, [user]);

  // ── Fetch tracker logs ──────────────────────────────────────
  // For admins/managers: always fetch ALL logs (single subscription)
  // and filter by selectedUser client-side for instant switching
  useEffect(() => {
    if (!user) return;
    const q = isManagerOrAdmin
      ? query(collection(db, 'tracker_logs'), orderBy('timestamp', 'desc'))
      : query(collection(db, 'tracker_logs'), where('userId', '==', user.uid), orderBy('timestamp', 'desc'));
    return onSnapshot(q, snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as TrackerLog)));
      setLoading(false);
    }, err => { setError(err.message); setLoading(false); });
  }, [user, isManagerOrAdmin]);

  // ── Filter logs by date AND selected user ───────────────────
  const filteredLogs = useMemo(() => {
    const start = dateRangeStart(dateFilter);
    const end = dateRangeEnd(dateFilter);
    return logs.filter(l => {
      // User filter (admin/manager only)
      if (isManagerOrAdmin && selectedUser !== 'ALL' && l.userId !== selectedUser) return false;
      const d = l.timestamp?.toDate?.();
      if (!d) return false;
      if (start && d < start) return false;
      if (end && d >= end) return false;
      return true;
    });
  }, [logs, dateFilter, selectedUser, isManagerOrAdmin]);

  // ── Auto-delete 30-day-old logs (admin, runs once) ─────────
  useEffect(() => {
    if (profile?.role !== 'ADMIN') return;
    (async () => {
      try {
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - AUTO_DELETE_DAYS);
        const snap = await getDocs(query(collection(db, 'tracker_logs'), where('timestamp', '<', Timestamp.fromDate(cutoff))));
        if (snap.empty) return;
        await Promise.all(snap.docs.map(async d => {
          const data = d.data();
          const files = [data.screenshotUrl, data.cameraImageUrl].map(filenameFromUrl).filter(Boolean) as string[];
          if (files.length) await supabase.storage.from('tracker-evidence').remove(files);
          await deleteDoc(d.ref);
        }));
        console.log(`Cleaned ${snap.size} logs older than ${AUTO_DELETE_DAYS} days`);
      } catch (e) { console.error('Cleanup:', e); }
    })();
  }, [profile]);

  // ── Activity tracking (browser-side: clicks + keystrokes) ───
  useEffect(() => {
    if (!trackingActive || !user || usingDesktopApp) return;
    const click = () => { activityRef.current.mouseClicks++; activityRef.current.lastActive = new Date(); };
    const key = () => { activityRef.current.keystrokes++; activityRef.current.lastActive = new Date(); };
    const move = () => { activityRef.current.lastActive = new Date(); };
    window.addEventListener('click', click);
    window.addEventListener('keydown', key);
    window.addEventListener('mousemove', move);

    flushRef.current = setInterval(async () => {
      const s = { ...activityRef.current };
      if (!s.mouseClicks && !s.keystrokes) return;
      try {
        await addDoc(collection(db, 'activity_logs'), {
          userId: user.uid, userDisplayName: profile?.displayName || user.email,
          timestamp: Timestamp.now(), mouseClicks: s.mouseClicks, keystrokes: s.keystrokes,
          lastActive: s.lastActive ? Timestamp.fromDate(s.lastActive) : null, period: '5min',
        });
        activityRef.current = { mouseClicks: 0, keystrokes: 0, lastActive: null };
        setActivityStats({ mouseClicks: 0, keystrokes: 0, lastActive: null });
      } catch (e) { console.error('Flush:', e); }
    }, 5 * 60_000);

    const ui = setInterval(() => setActivityStats({ ...activityRef.current }), 10_000);
    return () => {
      window.removeEventListener('click', click);
      window.removeEventListener('keydown', key);
      window.removeEventListener('mousemove', move);
      if (flushRef.current) clearInterval(flushRef.current);
      clearInterval(ui);
    };
  }, [trackingActive, user, profile, usingDesktopApp]);

  // ── Activity stats from Firestore (for desktop-app users) ───
  useEffect(() => {
    if (!trackingActive || !user || !usingDesktopApp) return;
    const targetUid = (isManagerOrAdmin && selectedUser !== 'ALL') ? selectedUser : user.uid;
    // Query activity_logs for today from the desktop app
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, 'activity_logs'),
      where('userId', '==', targetUid),
      where('timestamp', '>=', Timestamp.fromDate(todayStart)),
      orderBy('timestamp', 'desc'),
    );
    const unsub = onSnapshot(q, snap => {
      let totalClicks = 0;
      let totalKeys = 0;
      let latest: Date | null = null;
      snap.docs.forEach(d => {
        const data = d.data();
        totalClicks += data.mouseClicks || 0;
        totalKeys += data.keystrokes || 0;
        const ts = data.lastActive?.toDate?.() || data.timestamp?.toDate?.();
        if (ts && (!latest || ts > latest)) latest = ts;
      });
      setActivityStats({ mouseClicks: totalClicks, keystrokes: totalKeys, lastActive: latest });
    }, err => {
      console.error('Desktop activity_logs listener error:', err);
    });
    return () => unsub();
  }, [trackingActive, user, usingDesktopApp, isManagerOrAdmin, selectedUser]);

  // ── Delete helpers ──────────────────────────────────────────
  const deleteLogFiles = async (log: TrackerLog) => {
    const files = [log.screenshotUrl, log.cameraImageUrl]
      .map(u => u ? filenameFromUrl(u) : null).filter(Boolean) as string[];
    if (files.length) await supabase.storage.from('tracker-evidence').remove(files);
  };

  const handleDeleteLog = async (log: TrackerLog) => {
    if (!isManagerOrAdmin) return;
    try {
      await deleteLogFiles(log);
      await deleteDoc(doc(db, 'tracker_logs', log.id));
      toast.success('Log deleted');
    } catch { toast.error('Failed to delete'); }
  };

  const handleClearAllLogs = async () => {
    if (!isManagerOrAdmin || !filteredLogs.length) return;
    if (!confirm(`Delete ${filteredLogs.length} log(s)? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all(filteredLogs.map(async l => {
        await deleteLogFiles(l);
        await deleteDoc(doc(db, 'tracker_logs', l.id));
      }));
      toast.success(`${filteredLogs.length} log(s) deleted`);
    } catch { toast.error('Some logs could not be deleted'); }
    finally { setDeleting(false); }
  };

  // ── Remote capture (manager/admin triggers desktop app) ─────
  const handleRemoteCapture = async (targetUserId?: string) => {
    if (!isManagerOrAdmin || !user) return;
    const uid = targetUserId || (selectedUser !== 'ALL' ? selectedUser : null);
    if (!uid) {
      toast.error('Select a specific user first');
      return;
    }
    setSendingCapture(true);
    try {
      await addDoc(collection(db, 'capture_commands'), {
        userId: uid,
        type: 'remote',
        status: 'pending',
        requestedBy: user.uid,
        requestedAt: Timestamp.now(),
      });
      toast.success('Remote capture command sent');
    } catch (e: any) {
      console.error('Remote capture:', e);
      toast.error('Failed to send capture command');
    } finally {
      setSendingCapture(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────
  if (loading) return (
    <div className="p-8 flex justify-center"><span className="loading loading-spinner loading-lg" /></div>
  );

  const label: Record<DateFilter, string> = {
    today: 'Today',
    yesterday: 'Yesterday',
    last7: 'Last 7 Days',
    last30: 'Last 30 Days',
    all: 'All Time',
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
    <div className="flex-1 min-w-0 overflow-y-auto space-y-6">

      {/* ─── Error ─── */}
      {error && (
        <div role="alert" className="alert alert-error">
          <AlertTriangle size={20} />
          <div>
            <h3 className="font-bold">Error loading logs</h3>
            <div className="text-xs">{error}</div>
            {error.includes('index') && <div className="text-sm font-semibold mt-1">Check browser console for Firestore index link.</div>}
          </div>
        </div>
      )}

      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Web Tracker</h1>
          <p className="text-base-content/60">Activity monitoring &amp; capture logs.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Clear all */}
          {isManagerOrAdmin && filteredLogs.length > 0 && (
            <button onClick={handleClearAllLogs} disabled={deleting} className="btn btn-sm btn-error btn-outline">
              {deleting ? <span className="loading loading-spinner loading-xs" /> : <Trash2 size={16} />}
              <span className="hidden sm:inline">Clear All</span>
            </button>
          )}

          {/* Remote capture — admin/manager only */}
          {isManagerOrAdmin && (
            <button onClick={() => handleRemoteCapture()} disabled={sendingCapture} className="btn btn-sm btn-info btn-outline">
              {sendingCapture ? <span className="loading loading-spinner loading-xs" /> : <Camera size={16} />}
              <span className="hidden sm:inline">Remote Capture</span>
            </button>
          )}

          {/* Status */}
          <div className={`badge badge-lg gap-2 ${trackingActive ? (usingDesktopApp ? 'badge-success text-white' : 'badge-warning text-black') : 'badge-ghost'}`}>
            {trackingActive ? (usingDesktopApp ? <Monitor size={16} /> : <Eye size={16} />) : <EyeOff size={16} />}
            {trackingActive ? (usingDesktopApp ? 'Desktop App' : 'Browser Only') : 'Inactive'}
          </div>
        </div>
      </div>

      {/* ─── Desktop App Banner (for browser-only users) ─── */}
      {trackingActive && !usingDesktopApp && (
        <div className="alert alert-warning shadow-lg">
          <Monitor size={22} />
          <div className="flex-1">
            <h3 className="font-bold text-sm">You&apos;re checked in via browser</h3>
            <p className="text-xs">Screen &amp; camera captures require the <strong>CrazyDesk Desktop App</strong>. Install it for silent, automatic tracking with no popups or prompts.</p>
          </div>
          <a href="crazydesk://open" className="btn btn-sm btn-ghost border-warning/40">Open App</a>
          <a href="https://github.com/roneyassistophere-creator/crazydesk/releases" target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-warning">
            <Download size={14} /> Install
          </a>
        </div>
      )}

      {/* ─── Info for non-checked-in users ─── */}
      {!trackingActive && (
        <div className="alert alert-info shadow-sm">
          <Clock size={20} />
          <span>Check in to start tracking. Use the <strong>CrazyDesk Desktop App</strong> for automatic screen &amp; camera captures.</span>
        </div>
      )}

      {/* ─── Desktop App active notification ─── */}
      {trackingActive && usingDesktopApp && (
        <div className="alert bg-success/10 border border-success/30 shadow-sm">
          <Monitor size={20} className="text-success" />
          <span className="text-success">Desktop app is running — screen &amp; camera captures are automatic. This page shows your logs.</span>
        </div>
      )}

      {/* ─── Date filters ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          className="select select-bordered select-sm"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilter)}
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last7">Last 7 Days</option>
          <option value="last30">Last 30 Days</option>
          <option value="all">All Time</option>
        </select>
        <span className="text-sm text-base-content/50">{filteredLogs.length} log{filteredLogs.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ─── Activity Stats ─── */}
      {trackingActive && (
        <div className="stats stats-horizontal shadow-sm bg-base-100 border border-base-200 w-full">
          <div className="stat py-3 px-4">
            <div className="stat-figure text-primary"><MousePointerClick size={20} /></div>
            <div className="stat-title text-xs">Clicks</div>
            <div className="stat-value text-lg">{activityStats.mouseClicks}</div>
          </div>
          <div className="stat py-3 px-4">
            <div className="stat-figure text-secondary">⌨️</div>
            <div className="stat-title text-xs">Keystrokes</div>
            <div className="stat-value text-lg">{activityStats.keystrokes}</div>
          </div>
          <div className="stat py-3 px-4">
            <div className="stat-figure text-accent"><Shield size={20} /></div>
            <div className="stat-title text-xs">Captures ({label[dateFilter]})</div>
            <div className="stat-value text-lg">{filteredLogs.filter(l => !l.flagged).length}</div>
          </div>
          <div className="stat py-3 px-4">
            <div className="stat-figure text-error"><Flag size={20} /></div>
            <div className="stat-title text-xs">Flagged</div>
            <div className="stat-value text-lg text-error">{filteredLogs.filter(l => l.flagged).length}</div>
          </div>
        </div>
      )}

      {/* ─── Log Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredLogs.map(log => (
          <div
            key={log.id}
            className={`card bg-base-100 shadow-xl border cursor-pointer hover:shadow-2xl transition-shadow ${log.flagged ? 'border-error/50' : 'border-base-200'}`}
            onClick={() => {
              if (!log.flagged && (log.screenshotUrl || log.cameraImageUrl)) {
                setLightboxLog(log);
                setLightboxImage(log.screenshotUrl || log.cameraImageUrl || null);
              }
            }}
          >
            <figure className="relative h-48 bg-black/10 group">
              {log.flagged ? (
                <div className="flex flex-col items-center justify-center w-full h-full bg-error/5 text-error/60 p-4">
                  <Flag size={48} />
                  <span className="mt-2 text-xs text-center font-semibold">{log.flagReason || 'Flagged'}</span>
                </div>
              ) : log.screenshotUrl ? (
                <img src={log.screenshotUrl} alt="Screen" className="object-cover w-full h-full" />
              ) : (
                <div className="flex items-center justify-center w-full h-full text-base-content/30">
                  <ImageIcon size={48} /><span className="ml-2">No Screen</span>
                </div>
              )}

              {log.cameraImageUrl && !log.flagged && (
                <div
                  className="absolute bottom-2 right-2 w-16 h-16 rounded-lg overflow-hidden border-2 border-white shadow-lg cursor-pointer hover:scale-110 transition-transform"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxLog(log);
                    setLightboxImage(log.cameraImageUrl || null);
                  }}
                >
                  <img src={log.cameraImageUrl} alt="Camera" className="object-cover w-full h-full" />
                </div>
              )}

              <div className="absolute top-2 left-2 badge badge-sm bg-black/50 text-white border-none">
                {log.timestamp?.toDate?.() ? formatTime12h(log.timestamp.toDate()) : ''}
              </div>

              <div className={`absolute top-2 right-2 badge badge-sm border-none ${log.flagged ? 'badge-error text-white' : log.type === 'auto' ? 'badge-ghost' : 'badge-info text-white'}`}>
                {log.flagged ? 'FLAGGED' : log.type === 'auto' ? 'Auto' : 'Remote'}
              </div>

              {isManagerOrAdmin && (
                <button onClick={e => { e.stopPropagation(); handleDeleteLog(log); }}
                  className="absolute bottom-2 left-2 btn btn-xs btn-circle btn-error opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete log"><Trash2 size={12} /></button>
              )}
            </figure>
            <div className="card-body p-4">
              <div className="flex items-center gap-2 mb-1">
                <User size={14} className="text-base-content/60" />
                <span className="text-sm font-semibold">{log.userDisplayName}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-base-content/50">{log.timestamp?.toDate?.().toLocaleDateString() || ''}</div>
                {log.source && (
                  <div className={`badge badge-xs ${log.source === 'desktop' ? 'badge-success' : 'badge-warning'}`}>
                    {log.source === 'desktop' ? '🖥️ App' : '🌐 Web'}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {filteredLogs.length === 0 && (
          <div className="col-span-full text-center py-12 text-base-content/40">
            <ImageIcon size={48} className="mx-auto mb-4 opacity-50" />
            <p>No logs for {label[dateFilter].toLowerCase()}.</p>
          </div>
        )}
      </div>

      {/* ─── Image Lightbox Modal ─── */}
      {lightboxImage && lightboxLog && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => { setLightboxImage(null); setLightboxLog(null); }}
        >
          <div className="relative max-w-6xl max-h-[90vh] w-full" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button
              className="absolute -top-12 right-0 btn btn-sm btn-circle btn-ghost text-white hover:bg-white/20"
              onClick={() => { setLightboxImage(null); setLightboxLog(null); }}
            >
              ✕
            </button>

            {/* Main image */}
            <img
              src={lightboxImage}
              alt="Full size"
              className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
            />

            {/* Image info bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white p-4 rounded-b-lg flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold">{lightboxLog.userDisplayName}</span>
                <span className="text-sm opacity-70">
                  {lightboxLog.timestamp?.toDate?.()?.toLocaleDateString()} at {lightboxLog.timestamp?.toDate?.() ? formatTime12h(lightboxLog.timestamp.toDate()) : ''}
                </span>
                <span className={`badge badge-sm ${lightboxLog.type === 'auto' ? 'badge-ghost' : 'badge-info'}`}>
                  {lightboxLog.type === 'auto' ? 'Auto' : 'Remote'}
                </span>
              </div>

              {/* Toggle between screen and camera */}
              {lightboxLog.screenshotUrl && lightboxLog.cameraImageUrl && (
                <div className="flex gap-2">
                  <button
                    className={`btn btn-sm ${lightboxImage === lightboxLog.screenshotUrl ? 'btn-primary' : 'btn-ghost text-white'}`}
                    onClick={() => setLightboxImage(lightboxLog.screenshotUrl!)}
                  >
                    <Monitor size={16} /> Screen
                  </button>
                  <button
                    className={`btn btn-sm ${lightboxImage === lightboxLog.cameraImageUrl ? 'btn-primary' : 'btn-ghost text-white'}`}
                    onClick={() => setLightboxImage(lightboxLog.cameraImageUrl!)}
                  >
                    <Camera size={16} /> Camera
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

    {/* ─── Team Sidebar — Admin/Manager only ─── */}
    {isManagerOrAdmin && (
      <>
        {/* Collapsed toggle */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="shrink-0 flex flex-col items-center gap-2 bg-base-100 border border-base-200 rounded-xl p-2 shadow-sm hover:shadow-md transition-shadow self-start"
            title="Show team"
          >
            <Users className="w-5 h-5 text-primary" />
            <ChevronRight className="w-4 h-4 text-base-content/40 rotate-180" />
          </button>
        )}

        {/* Expanded sidebar */}
        {sidebarOpen && (
          <aside className="w-56 shrink-0 bg-base-100 border border-base-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
            {/* Sidebar Header */}
            <div className="p-3 border-b border-base-200 flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                Team
              </h3>
              <button
                onClick={() => setSidebarOpen(false)}
                className="btn btn-ghost btn-xs btn-circle"
                title="Collapse"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* All Users Button */}
            <div className="p-2 border-b border-base-200 space-y-1">
              <button
                onClick={() => setSelectedUser('ALL')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                  selectedUser === 'ALL'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-base-200 text-base-content'
                }`}
              >
                <Users className="w-5 h-5" />
                <span className="truncate">All Users</span>
              </button>
              <button
                onClick={() => setSelectedUser(user?.uid || '')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                  selectedUser === user?.uid
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-base-200 text-base-content'
                }`}
              >
                <UserAvatar
                  photoURL={profile?.photoURL}
                  displayName={profile?.displayName}
                  size="xs"
                  showRing={false}
                />
                <span className="truncate">My Logs</span>
              </button>
            </div>

            {/* Team Members List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {usersLoading ? (
                <div className="flex justify-center py-4">
                  <span className="loading loading-spinner loading-sm text-primary"></span>
                </div>
              ) : teamMembers.length === 0 ? (
                <p className="text-xs text-base-content/40 text-center py-4">No team members</p>
              ) : (
                teamMembers.map(member => {
                  const checkedIn = userList.find(u => u.uid === member.uid);
                  return (
                    <button
                      key={member.uid}
                      onClick={() => setSelectedUser(member.uid)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                        selectedUser === member.uid
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'hover:bg-base-200 text-base-content'
                      }`}
                      title={member.displayName || member.email || ''}
                    >
                      <div className="relative">
                        <UserAvatar
                          photoURL={member.photoURL}
                          displayName={member.displayName}
                          size="xs"
                          showRing={false}
                        />
                        {checkedIn?.isCheckedIn && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-base-100 bg-success" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="truncate text-sm">{member.displayName || 'Unknown'}</p>
                        <p className="truncate text-[10px] text-base-content/40">
                          {checkedIn?.isCheckedIn
                            ? (checkedIn.source === 'desktop' ? '🖥️ Desktop' : '🌐 Browser')
                            : '⚪ Offline'}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </>
    )}
    </div>
  );
}
