'use client';

import React, { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, updateDoc, deleteDoc, doc, addDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/context/AuthContext';
import {
  Inbox, Send, Check, X, Clock, AlertCircle, Flag, Calendar,
  ChevronDown, ChevronRight, CheckSquare, LayoutList, Sun,
  CalendarRange, CalendarDays, FileText, User, Trash2,
} from 'lucide-react';

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

interface TaskRequestsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TaskRequestsPanel({ isOpen, onClose }: TaskRequestsPanelProps) {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [incoming, setIncoming] = useState<TaskRequestDoc[]>([]);
  const [outgoing, setOutgoing] = useState<TaskRequestDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when panel opens
  useEffect(() => {
    if (isOpen) {
      setIncoming([]);
      setOutgoing([]);
      setLoading(true);
      setError(null);
      setRejectingId(null);
      setRejectNote('');
      setProcessingId(null);
      setExpandedId(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!user || !isOpen) return;

    // Simple single-field queries — no orderBy to avoid composite index requirement
    // Sort client-side instead
    const inQ = query(
      collection(db, 'task_requests'),
      where('toUserId', '==', user.uid)
    );
    const unsubIn = onSnapshot(inQ, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskRequestDoc));
      items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setIncoming(items);
      setLoading(false);
      setError(null);
    }, (err) => {
      console.error('Incoming task requests error:', err);
      setError('Failed to load incoming requests.');
      setLoading(false);
    });

    const outQ = query(
      collection(db, 'task_requests'),
      where('fromUserId', '==', user.uid)
    );
    const unsubOut = onSnapshot(outQ, (snap) => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as TaskRequestDoc));
      items.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setOutgoing(items);
      setLoading(false);
    }, (err) => {
      console.error('Outgoing task requests error:', err);
      setError('Failed to load sent requests.');
      setLoading(false);
    });

    return () => { unsubIn(); unsubOut(); };
  }, [user, isOpen]);

  const handleAccept = async (req: TaskRequestDoc) => {
    if (!user || !profile || processingId) return;
    setProcessingId(req.id);

    try {
      // Mark request as accepted FIRST to prevent duplicate clicks
      await updateDoc(doc(db, 'task_requests', req.id), {
        status: 'accepted',
        respondedAt: serverTimestamp(),
      });

      // Create the actual task in tasks collection for the current user
      const now = new Date();
      let deadline = req.deadline || '';

      // For recurring tasks, set a default deadline if not provided
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
      console.error('Error rejecting task request:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (reqId: string) => {
    if (processingId) return;
    setProcessingId(reqId);
    try {
      await deleteDoc(doc(db, 'task_requests', reqId));
    } catch (err) {
      console.error('Error cancelling task request:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const pendingIncoming = incoming.filter(r => r.status === 'pending');
  const resolvedIncoming = incoming.filter(r => r.status !== 'pending');
  const pendingOutgoing = outgoing.filter(r => r.status === 'pending');
  const resolvedOutgoing = outgoing.filter(r => r.status !== 'pending');

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
    const map: Record<string, string> = {
      urgent: 'badge-error',
      high: 'badge-warning',
      normal: 'badge-info',
      low: 'badge-success',
    };
    return map[priority || 'normal'] || 'badge-ghost';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return 'badge-warning';
      case 'accepted': return 'badge-success';
      case 'rejected': return 'badge-error';
      case 'cancelled': return 'badge-ghost';
      default: return 'badge-ghost';
    }
  };

  const formatDate = (ts: Timestamp | null) => {
    if (!ts || !ts.toDate) return '';
    return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-lg relative">
        <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
          <X className="w-4 h-4" />
        </button>

        <h3 className="font-bold text-lg mb-4">Task Requests</h3>

        {/* Error banner */}
        {error && (
          <div className="alert alert-error alert-sm mb-4 text-xs">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('incoming')}
            className={`btn btn-sm gap-2 flex-1 ${tab === 'incoming' ? 'btn-primary' : 'btn-ghost border border-base-200'}`}
          >
            <Inbox className="w-4 h-4" />
            Incoming
            {pendingIncoming.length > 0 && (
              <span className="badge badge-xs badge-warning">{pendingIncoming.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab('outgoing')}
            className={`btn btn-sm gap-2 flex-1 ${tab === 'outgoing' ? 'btn-primary' : 'btn-ghost border border-base-200'}`}
          >
            <Send className="w-4 h-4" />
            Sent
            {pendingOutgoing.length > 0 && (
              <span className="badge badge-xs badge-warning">{pendingOutgoing.length}</span>
            )}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        ) : tab === 'incoming' ? (
          /* ──── INCOMING TAB ──── */
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {incoming.length === 0 ? (
              <div className="text-center py-8 text-base-content/40">
                <Inbox className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm italic">No incoming task requests</p>
              </div>
            ) : (
              <>
                {/* Pending requests first */}
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
                                <button className="btn btn-xs btn-error" onClick={() => { setProcessingId(req.id); handleReject(req.id); }} disabled={processingId === req.id}>
                                  {processingId === req.id ? <span className="loading loading-spinner loading-xs"></span> : null} Reject
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 mt-3 justify-end">
                              <button
                                onClick={() => setRejectingId(req.id)}
                                className="btn btn-xs btn-ghost text-error gap-1"
                                disabled={processingId === req.id}
                              >
                                <X className="w-3 h-3" /> Reject
                              </button>
                              <button
                                onClick={() => handleAccept(req)}
                                className="btn btn-xs btn-success text-white gap-1"
                                disabled={processingId === req.id}
                              >
                                {processingId === req.id ? <span className="loading loading-spinner loading-xs"></span> : <Check className="w-3 h-3" />} Accept
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resolved requests */}
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
                                <span className="font-medium text-sm">
                                  {req.title || <span className="italic text-base-content/40">No title</span>}
                                </span>
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
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* ──── OUTGOING TAB ──── */
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {outgoing.length === 0 ? (
              <div className="text-center py-8 text-base-content/40">
                <Send className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm italic">No sent task requests</p>
              </div>
            ) : (
              <>
                {/* Pending outgoing with cancel button */}
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
                                <span className="font-medium text-sm">
                                  {req.title || <span className="italic text-base-content/40">No title</span>}
                                </span>
                                <span className="badge badge-xs badge-warning">pending</span>
                                {req.priority && <span className={`badge badge-xs ${getPriorityBadge(req.priority)}`}>{req.priority}</span>}
                              </div>
                              <div className="text-xs text-base-content/50 mt-0.5">
                                To <span className="font-medium">{req.toUserName}</span>
                                {req.createdAt && <span> · {formatDate(req.createdAt)}</span>}
                              </div>
                              {req.description && (
                                <p className="text-xs text-base-content/60 mt-1">{req.description}</p>
                              )}
                              {req.deadline && (
                                <div className="flex items-center gap-1 mt-1 text-xs text-base-content/50">
                                  <Calendar className="w-3 h-3" /> Due: {new Date(req.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2 mt-3 justify-end">
                            <button
                              onClick={() => handleCancel(req.id)}
                              className="btn btn-xs btn-ghost text-error gap-1"
                              disabled={!!processingId}
                            >
                              {processingId === req.id ? <span className="loading loading-spinner loading-xs"></span> : <Trash2 className="w-3 h-3" />}
                              Cancel Request
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resolved outgoing */}
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
                                <span className="font-medium text-sm">
                                  {req.title || <span className="italic text-base-content/40">No title</span>}
                                </span>
                                <span className={`badge badge-xs ${getStatusBadge(req.status)}`}>{req.status}</span>
                                {req.priority && <span className={`badge badge-xs ${getPriorityBadge(req.priority)}`}>{req.priority}</span>}
                              </div>
                              <div className="text-xs text-base-content/50 mt-0.5">
                                To <span className="font-medium">{req.toUserName}</span>
                                {req.createdAt && <span> · {formatDate(req.createdAt)}</span>}
                              </div>
                            </div>
                            {expandedId === req.id
                              ? <ChevronDown className="w-4 h-4 text-base-content/30 shrink-0" />
                              : <ChevronRight className="w-4 h-4 text-base-content/30 shrink-0" />
                            }
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
        )}
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </div>
  );
}
