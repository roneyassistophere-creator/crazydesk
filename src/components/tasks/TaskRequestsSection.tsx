'use client';

import React, { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, updateDoc, deleteDoc, doc,
  addDoc, getDocs, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/context/AuthContext';
import {
  Inbox, Send, Check, X, Clock, AlertCircle, Calendar,
  ChevronDown, ChevronRight, CheckSquare, LayoutList, Sun,
  CalendarRange, CalendarDays, User, Trash2, Eye, XCircle,
  CheckCircle, AlertTriangle,
} from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────
interface TaskRequestDoc {
  id: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  toUserName: string;
  taskType: 'simple' | 'list' | 'recurring';
  title: string;
  description?: string;
  priority?: string;
  deadline?: string;
  recurrence?: 'daily' | 'weekly' | 'monthly' | null;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: Timestamp | null;
  respondedAt?: Timestamp | null;
  responseNote?: string;
}

interface TrackedTaskDoc {
  id: string;
  title: string;
  type: 'simple' | 'list' | 'recurring';
  status: string;
  priority: string;
  deadline: string;
  recurrence?: string;
  createdBy: string;
  createdByName?: string;
  requestedByUserId?: string;
  requestedByUserName?: string;
  deletionPending?: boolean;
  deletionRequestedBy?: string;
  deletionRequestedByName?: string;
  deletionRequestedAt?: string;
  createdAt: Timestamp | null;
}

interface TaskRequestsSectionProps {
  isOpen: boolean;
  onSendRequest: () => void;
}

export default function TaskRequestsSection({ isOpen, onSendRequest }: TaskRequestsSectionProps) {
  const { user, profile } = useAuth();
  const isManagerOrAdmin = profile?.role === 'ADMIN' || profile?.role === 'MANAGER';

  const [tab, setTab] = useState<'incoming' | 'sent' | 'tracking'>('incoming');
  const [incoming, setIncoming] = useState<TaskRequestDoc[]>([]);
  const [outgoing, setOutgoing] = useState<TaskRequestDoc[]>([]);
  const [trackedTasks, setTrackedTasks] = useState<TrackedTaskDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when section opens
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      setRejectingId(null);
      setRejectNote('');
      setProcessingId(null);
      setExpandedId(null);
    }
  }, [isOpen]);

  // ─── Listeners ────────────────────────────────────────────
  useEffect(() => {
    if (!user || !isOpen) return;

    let loadCount = 0;
    const markLoaded = () => { loadCount++; if (loadCount >= 3) setLoading(false); };

    // Incoming requests (sent TO me)
    const inQ = query(collection(db, 'task_requests'), where('toUserId', '==', user.uid));
    const unsubIn = onSnapshot(inQ, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskRequestDoc));
      items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setIncoming(items);
      markLoaded();
    }, (err) => {
      console.error('Incoming requests error:', err);
      setError('Failed to load incoming requests.');
      markLoaded();
    });

    // Outgoing requests (sent BY me)
    const outQ = query(collection(db, 'task_requests'), where('fromUserId', '==', user.uid));
    const unsubOut = onSnapshot(outQ, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskRequestDoc));
      items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setOutgoing(items);
      markLoaded();
    }, (err) => {
      console.error('Outgoing requests error:', err);
      setError('Failed to load sent requests.');
      markLoaded();
    });

    // Tracked tasks (tasks created from my accepted requests)
    const trackQ = query(collection(db, 'tasks'), where('requestedByUserId', '==', user.uid));
    const unsubTrack = onSnapshot(trackQ, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as TrackedTaskDoc));
      items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setTrackedTasks(items);
      markLoaded();
    }, (err) => {
      console.error('Tracked tasks error:', err);
      setError('Failed to load tracked tasks.');
      markLoaded();
    });

    return () => { unsubIn(); unsubOut(); unsubTrack(); };
  }, [user, isOpen]);

  // ─── Handlers ─────────────────────────────────────────────
  const handleAccept = async (req: TaskRequestDoc) => {
    if (!user || !profile || processingId) return;
    setProcessingId(req.id);
    try {
      await updateDoc(doc(db, 'task_requests', req.id), {
        status: 'accepted',
        respondedAt: serverTimestamp(),
      });

      const now = new Date();
      let deadline = req.deadline || '';
      if (req.taskType === 'recurring' && !deadline) {
        const d = new Date();
        switch (req.recurrence) {
          case 'daily': d.setDate(d.getDate() + 1); break;
          case 'weekly': d.setDate(d.getDate() + 7); break;
          case 'monthly': d.setMonth(d.getMonth() + 1); break;
        }
        deadline = d.toISOString().split('T')[0];
      }

      const taskData: Record<string, unknown> = {
        title: req.title || '',
        type: req.taskType,
        status: 'todo',
        priority: req.priority || 'normal',
        deadline,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByName: profile.displayName || profile.email || 'Unknown',
        requestedByUserId: req.fromUserId,
        requestedByUserName: req.fromUserName,
      };

      if (req.taskType === 'recurring' && req.recurrence) {
        taskData.recurrence = req.recurrence;
        taskData.recurringTime = '';
        taskData.recurringDays = req.recurrence === 'weekly' ? [] : undefined;
        taskData.recurringDate = req.recurrence === 'monthly' ? now.getDate() : undefined;
        taskData.lastCompletedAt = '';
        taskData.lastAutoAdvanced = '';
      }
      if (req.taskType === 'list') {
        taskData.customColumns = [];
      }

      await addDoc(collection(db, 'tasks'), taskData);
    } catch (err) {
      console.error('Error accepting task request:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (reqId: string) => {
    if (processingId) return;
    setProcessingId(reqId);
    try {
      await updateDoc(doc(db, 'task_requests', reqId), {
        status: 'rejected',
        responseNote: rejectNote || '',
        respondedAt: serverTimestamp(),
      });
      setRejectingId(null);
      setRejectNote('');
    } catch (err) {
      console.error('Error rejecting:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelRequest = async (reqId: string) => {
    if (processingId) return;
    setProcessingId(reqId);
    try {
      await deleteDoc(doc(db, 'task_requests', reqId));
    } catch (err) {
      console.error('Error cancelling:', err);
    } finally {
      setProcessingId(null);
    }
  };

  // Approve deletion (requester approves task deletion from tracking)
  const handleApproveDeletion = async (task: TrackedTaskDoc) => {
    if (processingId) return;
    setProcessingId(task.id);
    try {
      // Delete subtasks first
      const subSnap = await getDocs(collection(db, 'tasks', task.id, 'subtasks'));
      for (const d of subSnap.docs) {
        await deleteDoc(doc(db, 'tasks', task.id, 'subtasks', d.id));
      }
      await deleteDoc(doc(db, 'tasks', task.id));
    } catch (err) {
      console.error('Error approving deletion:', err);
    } finally {
      setProcessingId(null);
    }
  };

  // Reject deletion (requester rejects, removes pending state)
  const handleRejectDeletion = async (task: TrackedTaskDoc) => {
    if (processingId) return;
    setProcessingId(task.id);
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        deletionPending: false,
        deletionRequestedBy: '',
        deletionRequestedByName: '',
        deletionRequestedAt: '',
      });
    } catch (err) {
      console.error('Error rejecting deletion:', err);
    } finally {
      setProcessingId(null);
    }
  };

  // Request deletion from tracking tab (requester initiates)
  const handleRequestDeletion = async (task: TrackedTaskDoc) => {
    if (!user || !profile || processingId) return;
    setProcessingId(task.id);
    try {
      await updateDoc(doc(db, 'tasks', task.id), {
        deletionPending: true,
        deletionRequestedBy: user.uid,
        deletionRequestedByName: profile.displayName || profile.email || 'Unknown',
        deletionRequestedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error requesting deletion:', err);
    } finally {
      setProcessingId(null);
    }
  };

  // ─── Computed ─────────────────────────────────────────────
  const pendingIncoming = incoming.filter(r => r.status === 'pending');
  const resolvedIncoming = incoming.filter(r => r.status !== 'pending');
  const pendingOutgoing = outgoing.filter(r => r.status === 'pending');
  const resolvedOutgoing = outgoing.filter(r => r.status !== 'pending');

  const activeTasks = trackedTasks.filter(t => t.status !== 'done');
  const completedTasks = trackedTasks.filter(t => t.status === 'done');
  const deletionPendingTasks = trackedTasks.filter(t => t.deletionPending);

  // ─── Helpers ──────────────────────────────────────────────
  const getTypeIcon = (type: string, recurrence?: string | null) => {
    if (type === 'list') return <LayoutList className="w-4 h-4 text-secondary" />;
    if (type === 'recurring') {
      switch (recurrence) {
        case 'daily': return <Sun className="w-4 h-4 text-accent" />;
        case 'weekly': return <CalendarRange className="w-4 h-4 text-accent" />;
        case 'monthly': return <CalendarDays className="w-4 h-4 text-accent" />;
        default: return <Sun className="w-4 h-4 text-accent" />;
      }
    }
    return <CheckSquare className="w-4 h-4 text-primary" />;
  };

  const getTypeLabel = (type: string, recurrence?: string | null) => {
    if (type === 'list') return 'List';
    if (type === 'recurring') return recurrence ? recurrence.charAt(0).toUpperCase() + recurrence.slice(1) : 'Recurring';
    return 'Simple';
  };

  const getPriorityBadge = (priority?: string) => {
    const map: Record<string, string> = { urgent: 'badge-error', high: 'badge-warning', normal: 'badge-info', low: 'badge-success' };
    return map[priority || 'normal'] || 'badge-ghost';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return 'badge-warning';
      case 'accepted': return 'badge-success';
      case 'rejected': return 'badge-error';
      case 'cancelled': return 'badge-ghost';
      case 'todo': return 'badge-warning';
      case 'in_progress': return 'badge-info';
      case 'review': return 'badge-accent';
      case 'done': return 'badge-success';
      default: return 'badge-ghost';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'todo': return 'To Do';
      case 'in_progress': return 'In Progress';
      case 'review': return 'Review';
      case 'done': return 'Done';
      default: return status;
    }
  };

  const formatDate = (ts: Timestamp | null) => {
    if (!ts || !ts.toDate) return '';
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="bg-base-100 border border-base-200 rounded-xl shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-200">
      {/* Section Header */}
      <div className="px-4 py-3 bg-base-200/30 border-b border-base-200">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Inbox className="w-4 h-4 text-primary" />
            Task Requests
          </h3>
          <button onClick={onSendRequest} className="btn btn-xs btn-primary gap-1">
            <Send className="w-3 h-3" /> Send Request
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="alert alert-error alert-sm mt-2 py-1 text-xs">
            <AlertCircle className="w-3 h-3" />
            <span>{error}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          <button
            onClick={() => setTab('incoming')}
            className={`btn btn-xs gap-1.5 ${tab === 'incoming' ? 'btn-primary' : 'btn-ghost'}`}
          >
            <Inbox className="w-3.5 h-3.5" />
            Incoming
            {pendingIncoming.length > 0 && (
              <span className="badge badge-xs badge-warning">{pendingIncoming.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab('sent')}
            className={`btn btn-xs gap-1.5 ${tab === 'sent' ? 'btn-primary' : 'btn-ghost'}`}
          >
            <Send className="w-3.5 h-3.5" />
            Sent
            {pendingOutgoing.length > 0 && (
              <span className="badge badge-xs badge-warning">{pendingOutgoing.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab('tracking')}
            className={`btn btn-xs gap-1.5 ${tab === 'tracking' ? 'btn-primary' : 'btn-ghost'}`}
          >
            <Eye className="w-3.5 h-3.5" />
            Track Requests
            {deletionPendingTasks.length > 0 && (
              <span className="badge badge-xs badge-error">{deletionPendingTasks.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-[400px] overflow-y-auto p-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        ) : tab === 'incoming' ? (
          /* ════════ INCOMING TAB ════════ */
          <div className="space-y-3">
            {incoming.length === 0 ? (
              <div className="text-center py-6 text-base-content/40">
                <Inbox className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm italic">No incoming requests</p>
              </div>
            ) : (
              <>
                {pendingIncoming.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">
                      Pending ({pendingIncoming.length})
                    </div>
                    <div className="space-y-2">
                      {pendingIncoming.map(req => (
                        <div key={req.id} className="border border-warning/30 bg-warning/5 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            {getTypeIcon(req.taskType, req.recurrence)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">
                                  {req.title || <span className="italic text-base-content/40">No title</span>}
                                </span>
                                <span className="badge badge-xs">{getTypeLabel(req.taskType, req.recurrence)}</span>
                                {req.priority && <span className={`badge badge-xs ${getPriorityBadge(req.priority)}`}>{req.priority}</span>}
                              </div>
                              <div className="text-xs text-base-content/50 mt-0.5">
                                From <span className="font-medium">{req.fromUserName}</span>
                                {req.createdAt && <span> · {formatDate(req.createdAt)}</span>}
                              </div>
                              {req.description && (
                                <p className="text-xs text-base-content/60 mt-1 bg-base-200/50 p-2 rounded">{req.description}</p>
                              )}
                              {req.deadline && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-base-content/50">
                                  <Calendar className="w-3 h-3" /> Due: {new Date(req.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </div>
                              )}
                            </div>
                          </div>

                          {rejectingId === req.id ? (
                            <div className="mt-3 space-y-2">
                              <textarea
                                className="textarea textarea-bordered textarea-sm w-full"
                                placeholder="Reason for rejection (optional)..."
                                rows={2}
                                value={rejectNote}
                                onChange={e => setRejectNote(e.target.value)}
                                autoFocus
                              />
                              <div className="flex gap-2 justify-end">
                                <button className="btn btn-xs btn-ghost" onClick={() => { setRejectingId(null); setRejectNote(''); }}>Cancel</button>
                                <button className="btn btn-xs btn-error" onClick={() => handleReject(req.id)} disabled={processingId === req.id}>
                                  {processingId === req.id && <span className="loading loading-spinner loading-xs"></span>} Reject
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 mt-3 justify-end">
                              <button onClick={() => setRejectingId(req.id)} className="btn btn-xs btn-ghost text-error gap-1" disabled={!!processingId}>
                                <X className="w-3 h-3" /> Reject
                              </button>
                              <button onClick={() => handleAccept(req)} className="btn btn-xs btn-success text-white gap-1" disabled={!!processingId}>
                                {processingId === req.id ? <span className="loading loading-spinner loading-xs"></span> : <Check className="w-3 h-3" />} Accept
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {resolvedIncoming.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">
                      Resolved ({resolvedIncoming.length})
                    </div>
                    <div className="space-y-2">
                      {resolvedIncoming.map(req => (
                        <div key={req.id} className="border border-base-200 rounded-lg p-3 opacity-70">
                          <div className="flex items-start gap-2">
                            {getTypeIcon(req.taskType, req.recurrence)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{req.title || <span className="italic text-base-content/40">No title</span>}</span>
                                <span className={`badge badge-xs ${getStatusBadge(req.status)}`}>{req.status}</span>
                              </div>
                              <div className="text-xs text-base-content/50 mt-0.5">
                                From <span className="font-medium">{req.fromUserName}</span>
                                {req.respondedAt && <span> · Responded {formatDate(req.respondedAt)}</span>}
                              </div>
                              {req.responseNote && (
                                <p className="text-xs text-base-content/60 mt-1 italic">Note: {req.responseNote}</p>
                              )}
                            </div>
                            <button
                              onClick={() => handleCancelRequest(req.id)}
                              className="btn btn-ghost btn-xs text-error opacity-60 hover:opacity-100 shrink-0"
                              disabled={!!processingId}
                              title="Delete request"
                            >
                              {processingId === req.id ? <span className="loading loading-spinner loading-xs"></span> : <Trash2 className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : tab === 'sent' ? (
          /* ════════ SENT TAB ════════ */
          <div className="space-y-3">
            {outgoing.length === 0 ? (
              <div className="text-center py-6 text-base-content/40">
                <Send className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm italic">No sent requests</p>
              </div>
            ) : (
              <>
                {pendingOutgoing.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">
                      Pending ({pendingOutgoing.length})
                    </div>
                    <div className="space-y-2">
                      {pendingOutgoing.map(req => (
                        <div key={req.id} className="border border-warning/30 bg-warning/5 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            {getTypeIcon(req.taskType, req.recurrence)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{req.title || <span className="italic text-base-content/40">No title</span>}</span>
                                <span className="badge badge-xs badge-warning">pending</span>
                                {req.priority && <span className={`badge badge-xs ${getPriorityBadge(req.priority)}`}>{req.priority}</span>}
                              </div>
                              <div className="text-xs text-base-content/50 mt-0.5">
                                To <span className="font-medium">{req.toUserName}</span>
                                {req.createdAt && <span> · {formatDate(req.createdAt)}</span>}
                              </div>
                              {req.description && <p className="text-xs text-base-content/60 mt-1">{req.description}</p>}
                              {req.deadline && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-base-content/50">
                                  <Calendar className="w-3 h-3" /> Due: {new Date(req.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3 justify-end">
                            <button onClick={() => handleCancelRequest(req.id)} className="btn btn-xs btn-ghost text-error gap-1" disabled={!!processingId}>
                              {processingId === req.id ? <span className="loading loading-spinner loading-xs"></span> : <Trash2 className="w-3 h-3" />}
                              Cancel
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {resolvedOutgoing.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">
                      Resolved ({resolvedOutgoing.length})
                    </div>
                    <div className="space-y-2">
                      {resolvedOutgoing.map(req => (
                        <div
                          key={req.id}
                          className={`border border-base-200 rounded-lg p-3 cursor-pointer transition-colors ${expandedId === req.id ? 'bg-base-200/30' : 'hover:bg-base-200/20'}`}
                          onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                        >
                          <div className="flex items-start gap-2">
                            {getTypeIcon(req.taskType, req.recurrence)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{req.title || <span className="italic text-base-content/40">No title</span>}</span>
                                <span className={`badge badge-xs ${getStatusBadge(req.status)}`}>{req.status}</span>
                              </div>
                              <div className="text-xs text-base-content/50 mt-0.5">
                                To <span className="font-medium">{req.toUserName}</span>
                                {req.createdAt && <span> · {formatDate(req.createdAt)}</span>}
                              </div>
                            </div>
                            {expandedId === req.id
                              ? <ChevronDown className="w-4 h-4 text-base-content/30 shrink-0" />
                              : <ChevronRight className="w-4 h-4 text-base-content/30 shrink-0" />}
                          </div>
                          {expandedId === req.id && (
                            <div className="mt-2 pt-2 border-t border-base-200 text-xs space-y-1">
                              <div><span className="font-medium">Type:</span> {getTypeLabel(req.taskType, req.recurrence)}</div>
                              {req.description && <div><span className="font-medium">Description:</span> {req.description}</div>}
                              {req.deadline && (
                                <div><span className="font-medium">Deadline:</span> {new Date(req.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                              )}
                              {req.status === 'rejected' && req.responseNote && (
                                <div className="text-error"><span className="font-medium">Rejection note:</span> {req.responseNote}</div>
                              )}
                              {req.respondedAt && (
                                <div className="text-base-content/40">Responded: {formatDate(req.respondedAt)}</div>
                              )}
                              <div className="flex justify-end pt-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCancelRequest(req.id); }}
                                  className="btn btn-xs btn-ghost text-error gap-1"
                                  disabled={!!processingId}
                                >
                                  {processingId === req.id ? <span className="loading loading-spinner loading-xs"></span> : <Trash2 className="w-3 h-3" />}
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* ════════ TRACKING TAB ════════ */
          <div className="space-y-3">
            {trackedTasks.length === 0 ? (
              <div className="text-center py-6 text-base-content/40">
                <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm italic">No tracked tasks yet</p>
                <p className="text-xs mt-1">Tasks from your accepted requests appear here</p>
              </div>
            ) : (
              <>
                {/* Deletion pending alerts */}
                {deletionPendingTasks.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-error uppercase tracking-wide mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Deletion Requests ({deletionPendingTasks.length})
                    </div>
                    <div className="space-y-2">
                      {deletionPendingTasks.map(task => (
                        <div key={`del-${task.id}`} className="border border-error/30 bg-error/5 rounded-lg p-3">
                          <div className="flex items-start gap-2">
                            {getTypeIcon(task.type, task.recurrence)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{task.title || 'Untitled'}</span>
                                <span className="badge badge-xs badge-error">Deletion Pending</span>
                              </div>
                              <div className="text-xs text-base-content/50 mt-0.5">
                                Assigned to <span className="font-medium">{task.createdByName || 'Unknown'}</span>
                                {task.deletionRequestedByName && (
                                  <span> · Requested by <span className="font-medium">{task.deletionRequestedBy === user?.uid ? 'you' : task.deletionRequestedByName}</span></span>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* Show approve/reject only if someone else requested deletion */}
                          {task.deletionRequestedBy !== user?.uid && (
                            <div className="flex gap-2 mt-3 justify-end">
                              <button
                                onClick={() => handleRejectDeletion(task)}
                                className="btn btn-xs btn-ghost gap-1"
                                disabled={!!processingId}
                              >
                                <XCircle className="w-3 h-3" /> Keep Task
                              </button>
                              <button
                                onClick={() => handleApproveDeletion(task)}
                                className="btn btn-xs btn-error gap-1"
                                disabled={!!processingId}
                              >
                                {processingId === task.id ? <span className="loading loading-spinner loading-xs"></span> : <Trash2 className="w-3 h-3" />}
                                Approve Deletion
                              </button>
                            </div>
                          )}
                          {task.deletionRequestedBy === user?.uid && (
                            <div className="mt-2 text-xs text-base-content/50 italic flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Waiting for approval from {task.createdByName}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active tasks */}
                {activeTasks.filter(t => !t.deletionPending).length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">
                      Active ({activeTasks.filter(t => !t.deletionPending).length})
                    </div>
                    <div className="space-y-2">
                      {activeTasks.filter(t => !t.deletionPending).map(task => (
                        <div key={task.id} className="border border-base-200 rounded-lg p-3 group">
                          <div className="flex items-start gap-2">
                            {getTypeIcon(task.type, task.recurrence)}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{task.title || 'Untitled'}</span>
                                <span className={`badge badge-xs ${getStatusBadge(task.status)}`}>{getStatusLabel(task.status)}</span>
                                <span className="badge badge-xs">{getTypeLabel(task.type, task.recurrence)}</span>
                                {task.priority && task.priority !== 'normal' && (
                                  <span className={`badge badge-xs ${getPriorityBadge(task.priority)}`}>{task.priority}</span>
                                )}
                              </div>
                              <div className="text-xs text-base-content/50 mt-0.5">
                                Assigned to <span className="font-medium">{task.createdByName || 'Unknown'}</span>
                                {task.deadline && (
                                  <span> · Due: {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                )}
                              </div>
                            </div>
                            {!isManagerOrAdmin && (
                              <button
                                onClick={() => handleRequestDeletion(task)}
                                className="btn btn-ghost btn-xs text-error opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Request deletion"
                                disabled={!!processingId}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed tasks */}
                {completedTasks.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-2">
                      Completed ({completedTasks.length})
                    </div>
                    <div className="space-y-2">
                      {completedTasks.map(task => (
                        <div key={task.id} className="border border-base-200 rounded-lg p-3 opacity-60">
                          <div className="flex items-start gap-2">
                            <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm line-through">{task.title || 'Untitled'}</span>
                                <span className="badge badge-xs badge-success">Done</span>
                              </div>
                              <div className="text-xs text-base-content/50 mt-0.5">
                                Completed by <span className="font-medium">{task.createdByName || 'Unknown'}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
