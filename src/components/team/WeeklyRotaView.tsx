'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { MemberProfile, TimeSlot, DAYS_OF_WEEK } from '@/types/team';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/context/AuthContext';
import { GripVertical, Save, X } from 'lucide-react';

interface WeeklyRotaViewProps {
  members: MemberProfile[];
}

// Full 24 hours (12am to 11pm)
const HOURS = Array.from({ length: 24 }, (_, i) => i); // 0..23
const HOUR_WIDTH = 80; // px per hour column
const ROW_HEIGHT = 36; // px per member row
const LABEL_WIDTH = 120; // px for the day/name label column

// Predefined colors for members (cycle through)
const MEMBER_COLORS = [
  { bg: 'bg-success/30', border: 'border-success/60', text: 'text-success-content', hex: 'oklch(65% 0.2 150 / 0.3)' },
  { bg: 'bg-info/30', border: 'border-info/60', text: 'text-info-content', hex: 'oklch(65% 0.17 240 / 0.3)' },
  { bg: 'bg-warning/30', border: 'border-warning/60', text: 'text-warning-content', hex: 'oklch(78% 0.18 75 / 0.3)' },
  { bg: 'bg-error/30', border: 'border-error/60', text: 'text-error-content', hex: 'oklch(58% 0.24 25 / 0.3)' },
  { bg: 'bg-primary/30', border: 'border-primary/60', text: 'text-primary-content', hex: 'oklch(59% 0.27 14 / 0.3)' },
  { bg: 'bg-secondary/30', border: 'border-secondary/60', text: 'text-secondary-content', hex: 'oklch(55% 0.18 290 / 0.3)' },
  { bg: 'bg-accent/30', border: 'border-accent/60', text: 'text-accent-content', hex: 'oklch(65% 0.18 180 / 0.3)' },
];

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function formatHour(hour: number): string {
  if (hour === 0 || hour === 24) return '12 am';
  if (hour === 12) return '12 pm';
  if (hour > 12) return `${hour - 12} pm`;
  return `${hour} am`;
}

// Snap to nearest 15 minutes
function snapTo15(mins: number): number {
  return Math.round(mins / 15) * 15;
}

interface SlotBar {
  member: MemberProfile;
  slot: TimeSlot;
  slotIndex: number; // index in member.availableSlots
  colorIndex: number;
}

export default function WeeklyRotaView({ members }: WeeklyRotaViewProps) {
  const { profile } = useAuth();
  const canEdit = profile?.role === 'ADMIN' || profile?.role === 'MANAGER';

  // Members that have at least one slot
  const membersWithSlots = members.filter(m => m.availableSlots && m.availableSlots.length > 0);

  // Assign color per member (consistent)
  const memberColorMap = new Map<string, number>();
  membersWithSlots.forEach((m, i) => {
    memberColorMap.set(m.uid, i % MEMBER_COLORS.length);
  });

  // Helper: get previous day name
  const prevDay = (day: string): string => {
    const idx = DAYS_OF_WEEK.indexOf(day as typeof DAYS_OF_WEEK[number]);
    return DAYS_OF_WEEK[(idx - 1 + 7) % 7];
  };

  // Helper: check if a slot is overnight (end <= start)
  const isOvernightSlot = (slot: TimeSlot): boolean => {
    return timeToMinutes(slot.endTime) <= timeToMinutes(slot.startTime);
  };

  // Get members that should appear on a given day (have a slot on that day OR have overnight spill from previous day)
  const getDayMembers = (day: string): MemberProfile[] => {
    const set = new Set<string>();
    const result: MemberProfile[] = [];
    for (const m of membersWithSlots) {
      const slots = getSlots(m);
      // Direct slots on this day
      const hasDirectSlot = slots.some(s => s.day === day);
      // Overnight spill from previous day
      const prev = prevDay(day);
      const hasSpill = slots.some(s => s.day === prev && isOvernightSlot(s));
      if ((hasDirectSlot || hasSpill) && !set.has(m.uid)) {
        set.add(m.uid);
        result.push(m);
      }
    }
    return result;
  };

  // Drag state for resizing/moving bars
  const [dragState, setDragState] = useState<{
    memberUid: string;
    slotIndex: number;
    day: string;
    type: 'move' | 'resize-start' | 'resize-end';
    startX: number;
    origStartMins: number;
    origEndMins: number;
  } | null>(null);

  const [pendingEdits, setPendingEdits] = useState<Map<string, TimeSlot[]>>(new Map());
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const getSlots = (member: MemberProfile): TimeSlot[] => {
    return pendingEdits.get(member.uid) || member.availableSlots || [];
  };

  // Handle drag
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const minutesDelta = snapTo15(Math.round((dx / HOUR_WIDTH) * 60));

    const member = membersWithSlots.find(m => m.uid === dragState.memberUid);
    if (!member) return;

    const currentSlots = [...getSlots(member)];
    const slot = currentSlots.find(
      (s, i) => i === dragState.slotIndex && s.day === dragState.day
    );
    if (!slot) return;

    if (dragState.type === 'move') {
      const duration = dragState.origEndMins - dragState.origStartMins;
      let newStart = dragState.origStartMins + minutesDelta;
      let newEnd = newStart + duration;
      // Clamp
      if (newStart < 0) { newStart = 0; newEnd = duration; }
      if (newEnd > 24 * 60) { newEnd = 24 * 60; newStart = newEnd - duration; }
      slot.startTime = minutesToTime(newStart);
      slot.endTime = minutesToTime(newEnd);
    } else if (dragState.type === 'resize-start') {
      let newStart = dragState.origStartMins + minutesDelta;
      if (newStart < 0) newStart = 0;
      if (newStart >= dragState.origEndMins - 15) newStart = dragState.origEndMins - 15;
      slot.startTime = minutesToTime(newStart);
    } else if (dragState.type === 'resize-end') {
      let newEnd = dragState.origEndMins + minutesDelta;
      if (newEnd > 24 * 60) newEnd = 24 * 60;
      if (newEnd <= dragState.origStartMins + 15) newEnd = dragState.origStartMins + 15;
      slot.endTime = minutesToTime(newEnd);
    }

    setPendingEdits(prev => new Map(prev).set(dragState.memberUid, currentSlots));
  }, [dragState, membersWithSlots, pendingEdits]);

  const handleMouseUp = useCallback(() => {
    setDragState(null);
  }, []);

  useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState, handleMouseMove, handleMouseUp]);

  const startDrag = (
    e: React.MouseEvent,
    memberUid: string,
    slotIndex: number,
    day: string,
    type: 'move' | 'resize-start' | 'resize-end',
    startMins: number,
    endMins: number,
  ) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    setDragState({
      memberUid,
      slotIndex,
      day,
      type,
      startX: e.clientX,
      origStartMins: startMins,
      origEndMins: endMins,
    });
  };

  const hasPendingEdits = pendingEdits.size > 0;

  const discardEdits = () => {
    setPendingEdits(new Map());
  };

  const saveEdits = async () => {
    setSaving(true);
    try {
      const promises: Promise<void>[] = [];
      pendingEdits.forEach((slots, uid) => {
        const member = membersWithSlots.find(m => m.uid === uid);
        if (!member) return;
        promises.push(
          setDoc(doc(db, 'member_profiles', uid), {
            uid,
            displayName: member.displayName,
            email: member.email,
            availableSlots: slots,
            updatedAt: serverTimestamp(),
          }, { merge: true })
        );
      });
      await Promise.all(promises);
      setPendingEdits(new Map());
    } catch (err) {
      console.error('Error saving rota edits:', err);
    } finally {
      setSaving(false);
    }
  };

  // Scroll to ~8am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 8 * HOUR_WIDTH;
    }
  }, []);

  // Get current time indicator position
  const now = new Date();
  const currentDayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const currentTimeLeft = (currentMins / 60) * HOUR_WIDTH;

  return (
    <div className="bg-base-200 rounded-xl border border-base-300 overflow-hidden">
      {/* Toolbar */}
      {canEdit && hasPendingEdits && (
        <div className="flex items-center gap-3 px-4 py-2 bg-warning/10 border-b border-warning/20">
          <span className="text-xs font-semibold text-warning">Unsaved changes</span>
          <div className="flex-1" />
          <button className="btn btn-xs btn-ghost gap-1" onClick={discardEdits} disabled={saving}>
            <X className="w-3 h-3" /> Discard
          </button>
          <button className="btn btn-xs btn-primary gap-1" onClick={saveEdits} disabled={saving}>
            {saving ? <span className="loading loading-spinner loading-xs" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        </div>
      )}

      {membersWithSlots.length === 0 ? (
        <div className="text-center py-12 text-base-content/40 text-sm">
          No members have scheduled slots yet.
        </div>
      ) : (
        <div className="flex">
          {/* Fixed left labels */}
          <div className="shrink-0" style={{ width: LABEL_WIDTH }}>
            {/* Header spacer */}
            <div className="h-10 border-b border-base-300 bg-base-200" />

            {DAYS_OF_WEEK.map(day => {
              const dayMembers = getDayMembers(day);
              if (dayMembers.length === 0) return null;

              return (
                <div key={day}>
                  {/* Day header */}
                  <div className={`h-8 flex items-center px-3 text-xs font-bold uppercase tracking-wider border-b border-base-300 ${day === currentDayName ? 'bg-primary/10 text-primary' : 'bg-base-200 text-base-content/50'}`}>
                    {day}
                  </div>
                  {/* Member rows */}
                  {dayMembers.map(member => (
                    <div
                      key={`${day}-${member.uid}`}
                      className="flex items-center px-3 border-b border-base-300/50"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-5 h-5 rounded-full bg-neutral text-neutral-content flex items-center justify-center text-[9px] font-bold shrink-0 overflow-hidden">
                          {member.photoURL ? (
                            <img src={member.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            member.displayName?.[0]?.toUpperCase() || '?'
                          )}
                        </div>
                        <span className="text-xs font-medium truncate">
                          {member.displayName?.split(' ')[0]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Scrollable timeline area */}
          <div className="flex-1 overflow-x-auto" ref={scrollRef}>
            <div style={{ minWidth: HOURS.length * HOUR_WIDTH }} className="relative">
              {/* Hour headers */}
              <div className="flex h-10 border-b border-base-300 sticky top-0 bg-base-200 z-10">
                {HOURS.map(hour => (
                  <div
                    key={hour}
                    className="shrink-0 flex items-center justify-center text-[11px] font-medium text-base-content/50 border-r border-base-300/50"
                    style={{ width: HOUR_WIDTH }}
                  >
                    {formatHour(hour)}
                  </div>
                ))}
              </div>

              {/* Day sections */}
              {DAYS_OF_WEEK.map(day => {
                const dayMembers = getDayMembers(day);
                if (dayMembers.length === 0) return null;

                return (
                  <div key={day}>
                    {/* Day header row spacer */}
                    <div className={`h-8 border-b border-base-300 relative ${day === currentDayName ? 'bg-primary/5' : ''}`}>
                      {/* Vertical grid lines */}
                      <div className="absolute inset-0 flex">
                        {HOURS.map(hour => (
                          <div key={hour} className="shrink-0 border-r border-base-300/30" style={{ width: HOUR_WIDTH }} />
                        ))}
                      </div>
                    </div>

                    {/* Member rows with bars */}
                    {dayMembers.map(member => {
                      const colorIdx = memberColorMap.get(member.uid) || 0;
                      const color = MEMBER_COLORS[colorIdx];
                      const memberSlots = getSlots(member).filter(s => s.day === day);

                      // Overnight spill: slots from previous day that cross midnight into this day
                      const prev = prevDay(day);
                      const spillSlots = getSlots(member).filter(s => s.day === prev && isOvernightSlot(s));

                      return (
                        <div
                          key={`${day}-${member.uid}`}
                          className="relative border-b border-base-300/30"
                          style={{ height: ROW_HEIGHT }}
                        >
                          {/* Vertical grid lines */}
                          <div className="absolute inset-0 flex pointer-events-none">
                            {HOURS.map(hour => (
                              <div key={hour} className="shrink-0 border-r border-base-300/20" style={{ width: HOUR_WIDTH }} />
                            ))}
                          </div>

                          {/* Overnight spill bars (from previous day, 00:00 → endTime) */}
                          {spillSlots.map((slot, sIdx) => {
                            const endMins = timeToMinutes(slot.endTime);
                            if (endMins <= 0) return null;
                            const widthPx = (endMins / 60) * HOUR_WIDTH;
                            return (
                              <div
                                key={`spill-${sIdx}`}
                                className={`absolute top-1 bottom-1 rounded-md ${color.bg} border ${color.border} border-l-2 border-l-dashed flex items-center overflow-hidden select-none opacity-80`}
                                style={{ left: 0, width: Math.max(widthPx, 20) }}
                              >
                                <div className="flex items-center gap-1 px-2 min-w-0 flex-1">
                                  <span className="text-[10px] font-semibold text-base-content truncate">
                                    {member.displayName?.split(' ')[0]}
                                  </span>
                                  {widthPx > 80 && (
                                    <span className="text-[9px] text-base-content/50 font-mono whitespace-nowrap">
                                      …–{slot.endTime}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {/* Slot bars */}
                          {memberSlots.map((slot, sIdx) => {
                            const globalIdx = getSlots(member).findIndex(
                              (s, i) => s.day === day && memberSlots.indexOf(s) === sIdx
                            );
                            const startMins = timeToMinutes(slot.startTime);
                            let endMins = timeToMinutes(slot.endTime);
                            // Handle overnight shifts (e.g. 14:00 → 02:00 means end is next day)
                            if (endMins <= startMins) endMins += 24 * 60;
                            // Clamp to 24h grid
                            const clampedEnd = Math.min(endMins, 24 * 60);
                            const startPx = (startMins / 60) * HOUR_WIDTH;
                            const widthPx = ((clampedEnd - startMins) / 60) * HOUR_WIDTH;

                            return (
                              <div
                                key={sIdx}
                                className={`absolute top-1 bottom-1 rounded-md ${color.bg} border ${color.border} flex items-center overflow-hidden ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''} select-none group/bar`}
                                style={{ left: startPx, width: Math.max(widthPx, 20) }}
                                onMouseDown={(e) => startDrag(e, member.uid, globalIdx, day, 'move', startMins, endMins)}
                              >
                                {/* Left resize handle */}
                                {canEdit && (
                                  <div
                                    className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover/bar:opacity-100 transition-opacity flex items-center"
                                    onMouseDown={(e) => startDrag(e, member.uid, globalIdx, day, 'resize-start', startMins, endMins)}
                                  >
                                    <div className="w-0.5 h-3 bg-base-content/30 rounded-full mx-auto" />
                                  </div>
                                )}

                                {/* Bar content */}
                                <div className="flex items-center gap-1 px-2 min-w-0 flex-1">
                                  <span className="text-[10px] font-semibold text-base-content truncate">
                                    {member.displayName?.split(' ')[0]}
                                  </span>
                                  {widthPx > 100 && (
                                    <span className="text-[9px] text-base-content/50 font-mono whitespace-nowrap">
                                      {slot.startTime}–{slot.endTime}
                                    </span>
                                  )}
                                </div>

                                {/* Right resize handle */}
                                {canEdit && (
                                  <div
                                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover/bar:opacity-100 transition-opacity flex items-center"
                                    onMouseDown={(e) => startDrag(e, member.uid, globalIdx, day, 'resize-end', startMins, endMins)}
                                  >
                                    <div className="w-0.5 h-3 bg-base-content/30 rounded-full mx-auto" />
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Current time indicator */}
                          {day === currentDayName && currentMins >= 0 && currentMins <= 24 * 60 && (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-error z-10 pointer-events-none"
                              style={{ left: currentTimeLeft }}
                            >
                              <div className="w-2 h-2 rounded-full bg-error -ml-0.75 -mt-0.5" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      {membersWithSlots.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap px-4 py-2.5 border-t border-base-300 bg-base-200/50">
          {membersWithSlots.map(member => {
            const colorIdx = memberColorMap.get(member.uid) || 0;
            const color = MEMBER_COLORS[colorIdx];
            return (
              <div key={member.uid} className="flex items-center gap-1.5 text-xs">
                <div className={`w-3 h-3 rounded-sm ${color.bg} border ${color.border}`} />
                <span className="text-base-content/70">{member.displayName?.split(' ')[0]}</span>
              </div>
            );
          })}
          {canEdit && (
            <span className="text-[10px] text-base-content/30 ml-auto">Drag bars to adjust schedules</span>
          )}
        </div>
      )}
    </div>
  );
}
