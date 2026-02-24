'use client';

import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/context/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { UserProfile } from '@/types/auth';
import {
  X, ChevronRight, ChevronLeft, CheckSquare, LayoutList,
  Sun, CalendarRange, CalendarDays, Search, User, Send,
  Flag, Calendar, FileText,
} from 'lucide-react';

type TaskType = 'simple' | 'list' | 'recurring';
type Recurrence = 'daily' | 'weekly' | 'monthly';

interface RequestTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RequestTaskModal({ isOpen, onClose }: RequestTaskModalProps) {
  const { user, profile } = useAuth();
  const { users } = useUsers();

  // Steps: 1 = pick member, 2 = pick type, 3 = fill details, 4 = sent confirmation
  const [step, setStep] = useState(1);
  const [selectedMember, setSelectedMember] = useState<UserProfile | null>(null);
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [recurrence, setRecurrence] = useState<Recurrence>('daily');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [deadline, setDeadline] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [sending, setSending] = useState(false);

  const reset = () => {
    setStep(1);
    setSelectedMember(null);
    setTaskType(null);
    setRecurrence('daily');
    setTitle('');
    setDescription('');
    setPriority('normal');
    setDeadline('');
    setMemberSearch('');
    setSending(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const filteredMembers = users.filter(u => {
    if (u.uid === user?.uid) return false;
    const search = memberSearch.toLowerCase();
    return (
      (u.displayName || '').toLowerCase().includes(search) ||
      (u.email || '').toLowerCase().includes(search)
    );
  });

  const handleSelectMember = (member: UserProfile) => {
    setSelectedMember(member);
    setStep(2);
  };

  const handleSelectType = (type: TaskType, rec?: Recurrence) => {
    setTaskType(type);
    if (rec) setRecurrence(rec);
    setStep(3);
  };

  const handleSend = async () => {
    if (!user || !profile || !selectedMember || !taskType) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'task_requests'), {
        fromUserId: user.uid,
        fromUserName: profile.displayName || profile.email || 'Unknown',
        toUserId: selectedMember.uid,
        toUserName: selectedMember.displayName || selectedMember.email || 'Unknown',
        taskType,
        title: title || '',
        description: description || '',
        priority: priority || 'normal',
        deadline: deadline || '',
        recurrence: taskType === 'recurring' ? recurrence : null,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setStep(4);
    } catch (err) {
      console.error('Error sending task request:', err);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const priorities = [
    { value: 'urgent', label: 'Urgent', color: 'text-error bg-error/10 border-error/30' },
    { value: 'high', label: 'High', color: 'text-warning bg-warning/10 border-warning/30' },
    { value: 'normal', label: 'Normal', color: 'text-info bg-info/10 border-info/30' },
    { value: 'low', label: 'Low', color: 'text-success bg-success/10 border-success/30' },
  ];

  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md relative">
        {/* Close button */}
        <button onClick={handleClose} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">
          <X className="w-4 h-4" />
        </button>

        {/* Step 1: Pick team member */}
        {step === 1 && (
          <>
            <h3 className="font-bold text-lg mb-1">Request Task</h3>
            <p className="text-sm text-base-content/60 mb-4">Select a team member to assign a task to</p>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/40" />
              <input
                type="text"
                placeholder="Search members..."
                className="input input-sm input-bordered w-full pl-9"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredMembers.length === 0 ? (
                <div className="text-center py-6 text-base-content/40 italic text-sm">No members found</div>
              ) : (
                filteredMembers.map(member => (
                  <button
                    key={member.uid}
                    onClick={() => handleSelectMember(member)}
                    className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-base-200 transition-colors text-left cursor-pointer"
                  >
                    <div className="avatar placeholder">
                      <div className="bg-primary/10 text-primary rounded-full w-9 h-9 overflow-hidden flex items-center justify-center">
                        {member.photoURL ? (
                          <img src={member.photoURL} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold">
                            {(member.displayName || member.email || '?')[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{member.displayName || 'Unknown'}</div>
                      <div className="text-xs text-base-content/50 truncate">{member.email}</div>
                    </div>
                    <span className="badge badge-xs badge-ghost">{member.role}</span>
                    <ChevronRight className="w-4 h-4 text-base-content/30" />
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {/* Step 2: Pick task type */}
        {step === 2 && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => setStep(1)} className="btn btn-ghost btn-xs btn-circle">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="font-bold text-lg">Task Type</h3>
            </div>
            <p className="text-sm text-base-content/60 mb-4 ml-8">
              For <span className="font-semibold text-primary">{selectedMember?.displayName}</span>
            </p>

            <div className="space-y-2">
              <button
                onClick={() => handleSelectType('simple')}
                className="flex items-center gap-3 w-full p-3 rounded-lg border border-base-200 hover:border-primary hover:bg-primary/5 transition-all"
              >
                <CheckSquare className="w-5 h-5 text-primary" />
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">Simple Task</div>
                  <div className="text-xs text-base-content/50">A single task with a deadline</div>
                </div>
                <ChevronRight className="w-4 h-4 text-base-content/30" />
              </button>

              <button
                onClick={() => handleSelectType('list')}
                className="flex items-center gap-3 w-full p-3 rounded-lg border border-base-200 hover:border-secondary hover:bg-secondary/5 transition-all"
              >
                <LayoutList className="w-5 h-5 text-secondary" />
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">List Task</div>
                  <div className="text-xs text-base-content/50">A task group with sub-tasks</div>
                </div>
                <ChevronRight className="w-4 h-4 text-base-content/30" />
              </button>

              <div className="divider text-xs my-2">Recurring</div>

              <button
                onClick={() => handleSelectType('recurring', 'daily')}
                className="flex items-center gap-3 w-full p-3 rounded-lg border border-base-200 hover:border-accent hover:bg-accent/5 transition-all"
              >
                <Sun className="w-5 h-5 text-accent" />
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">Daily</div>
                  <div className="text-xs text-base-content/50">Repeats every day</div>
                </div>
                <ChevronRight className="w-4 h-4 text-base-content/30" />
              </button>

              <button
                onClick={() => handleSelectType('recurring', 'weekly')}
                className="flex items-center gap-3 w-full p-3 rounded-lg border border-base-200 hover:border-accent hover:bg-accent/5 transition-all"
              >
                <CalendarRange className="w-5 h-5 text-accent" />
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">Weekly</div>
                  <div className="text-xs text-base-content/50">Repeats every week</div>
                </div>
                <ChevronRight className="w-4 h-4 text-base-content/30" />
              </button>

              <button
                onClick={() => handleSelectType('recurring', 'monthly')}
                className="flex items-center gap-3 w-full p-3 rounded-lg border border-base-200 hover:border-accent hover:bg-accent/5 transition-all"
              >
                <CalendarDays className="w-5 h-5 text-accent" />
                <div className="text-left flex-1">
                  <div className="font-medium text-sm">Monthly</div>
                  <div className="text-xs text-base-content/50">Repeats every month</div>
                </div>
                <ChevronRight className="w-4 h-4 text-base-content/30" />
              </button>
            </div>
          </>
        )}

        {/* Step 3: Fill in details */}
        {step === 3 && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => setStep(2)} className="btn btn-ghost btn-xs btn-circle">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h3 className="font-bold text-lg">Task Details</h3>
            </div>
            <p className="text-sm text-base-content/60 mb-4 ml-8">
              {taskType === 'recurring'
                ? `${recurrence.charAt(0).toUpperCase() + recurrence.slice(1)} recurring task`
                : `${taskType === 'simple' ? 'Simple' : 'List'} task`
              }
              {' '}for <span className="font-semibold text-primary">{selectedMember?.displayName}</span>
            </p>
            <p className="text-xs text-base-content/40 mb-4 ml-8">All fields are optional. The recipient can fill in details later.</p>

            <div className="space-y-3">
              {/* Title */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-sm flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> Title
                  </span>
                </label>
                <input
                  type="text"
                  className="input input-sm input-bordered"
                  placeholder="Task title..."
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  autoFocus
                />
              </div>

              {/* Description */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-sm">Description</span>
                </label>
                <textarea
                  className="textarea textarea-bordered textarea-sm"
                  placeholder="Brief description or instructions..."
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              {/* Priority */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-sm flex items-center gap-1.5">
                    <Flag className="w-3.5 h-3.5" /> Priority
                  </span>
                </label>
                <div className="flex gap-2">
                  {priorities.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setPriority(p.value)}
                      className={`btn btn-xs flex-1 border ${priority === p.value ? p.color + ' font-bold' : 'btn-ghost'}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Deadline */}
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-sm flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> Deadline
                  </span>
                </label>
                <input
                  type="date"
                  className="input input-sm input-bordered"
                  value={deadline}
                  onChange={e => setDeadline(e.target.value)}
                />
              </div>
            </div>

            <div className="modal-action mt-6">
              <button className="btn btn-sm btn-ghost" onClick={handleClose}>Cancel</button>
              <button
                className="btn btn-sm btn-primary gap-2"
                onClick={handleSend}
                disabled={sending}
              >
                {sending ? <span className="loading loading-spinner loading-xs"></span> : <Send className="w-4 h-4" />}
                Send Request
              </button>
            </div>
          </>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Send className="w-8 h-8 text-success" />
            </div>
            <h3 className="font-bold text-lg mb-2">Request Sent!</h3>
            <p className="text-sm text-base-content/60 mb-6">
              Your task request has been sent to <span className="font-semibold text-primary">{selectedMember?.displayName}</span>.
              They will see it in their Task Manager.
            </p>
            <div className="flex gap-2 justify-center">
              <button className="btn btn-sm btn-ghost" onClick={handleClose}>Close</button>
              <button className="btn btn-sm btn-primary" onClick={reset}>Send Another</button>
            </div>
          </div>
        )}
      </div>
      <div className="modal-backdrop" onClick={handleClose} />
    </div>
  );
}
