'use client';

import { useState, useEffect } from 'react';
import { useTeamData } from '@/hooks/team/useTeamData';
import { MemberProfile } from '@/types/team';
import TeamMemberCard from '@/components/team/TeamMemberCard';
import MemberDetailsModal from '@/components/team/MemberDetailsModal';
import EditMemberModal from '@/components/team/EditMemberModal';
import CheckInOutWidget from '@/components/team/CheckInOutWidget';
import CreateMeetingModal from '@/components/meetings/CreateMeetingModal';
import MeetingListCard from '@/components/meetings/MeetingListCard';
import ChatModal from '@/components/team/ChatModal';
import WeeklyRotaView from '@/components/team/WeeklyRotaView';
import { useAuth } from '@/context/AuthContext';
import { Clock, Loader2, Plus, Calendar, AlertTriangle, LayoutGrid, CalendarRange } from 'lucide-react';
import { collection, onSnapshot, query, where, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { WorkLog } from '@/types/workLog';
import { Meeting } from '@/types/meeting';

type SortStatus = 'active' | 'scheduled' | 'upcoming' | 'offline';

export default function TeamAvailability() {
  const { members, loading } = useTeamData();
  const { user, profile } = useAuth();
  const [activeLogs, setActiveLogs] = useState<Record<string, WorkLog>>({});
  const [selectedMember, setSelectedMember] = useState<MemberProfile | null>(null);
  const [editingMember, setEditingMember] = useState<MemberProfile | null>(null);

  // Meetings state
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [meetingToEdit, setMeetingToEdit] = useState<Meeting | null>(null);
  const [meetingToDelete, setMeetingToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Chat state
  const [chatTarget, setChatTarget] = useState<{ uid: string; displayName: string; photoURL?: string } | null>(null);

  // View toggle: 'cards' or 'rota'
  const [view, setView] = useState<'cards' | 'rota'>('cards');

  // Fetch real-time active work logs
  useEffect(() => {
    const q = query(
      collection(db, 'work_logs'), 
      where('status', 'in', ['active', 'break'])
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsMap: Record<string, WorkLog> = {};
      snapshot.forEach(doc => {
        const data = doc.data() as WorkLog;
        logsMap[data.userId] = { ...data, id: doc.id };
      });
      setActiveLogs(logsMap);
    }, (error) => {
      console.error('Team availability onSnapshot error:', error);
    });

    return () => unsubscribe();
  }, []);

  // Fetch meetings for current user
  useEffect(() => {
    if (!user) return;

    const isManagerOrAdmin = profile?.role === 'ADMIN' || profile?.role === 'MANAGER';

    const q = isManagerOrAdmin
      ? query(collection(db, 'meetings'))
      : query(
          collection(db, 'meetings'),
          where('participants', 'array-contains', user.uid)
        );

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Meeting));
      const now = new Date();
      // Only upcoming meetings
      const upcoming = data.filter(m => {
        if (!m.scheduledAt?.toDate) return false;
        return m.scheduledAt.toDate() >= now;
      });
      upcoming.sort((a, b) => {
        const ta = a.scheduledAt?.toDate ? a.scheduledAt.toDate().getTime() : 0;
        const tb = b.scheduledAt?.toDate ? b.scheduledAt.toDate().getTime() : 0;
        return ta - tb;
      });
      setMeetings(upcoming);
    }, (err) => {
      console.error('Meetings onSnapshot error:', err);
    });

    return () => unsub();
  }, [user, profile]);

  const handleEditMeeting = (meeting: Meeting) => {
    setMeetingToEdit(meeting);
    setMeetingModalOpen(true);
  };

  const handleDeleteMeetingClick = (meetingId: string) => {
    setMeetingToDelete(meetingId);
  };

  const confirmDeleteMeeting = async () => {
    if (!meetingToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'meetings', meetingToDelete));
    } catch (err) {
      console.error('Error deleting meeting:', err);
    } finally {
      setIsDeleting(false);
      setMeetingToDelete(null);
    }
  };

  // Helper to determine status and sort priority
  const getMemberSortInfo = (member: MemberProfile) => {
      const activeLog = activeLogs[member.uid];
      const now = new Date();
      const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
      const currentMin = now.getHours() * 60 + now.getMinutes();
      
      let status: SortStatus = 'offline';
      let nextSlotMinutes = Infinity;

      // check if active work log exists
      if (activeLog) {
          status = 'active';
          return { status, nextSlotMinutes, name: member.displayName };
      }

      // Check schedule
      if (member.availableSlots && member.availableSlots.length > 0) {
          // Check if currently within a slot
          const isScheduledNow = member.availableSlots.some((slot: any) => {
              if (slot.day !== currentDay) return false;
              const [sh, sm] = slot.startTime.split(':').map(Number);
              const [eh, em] = slot.endTime.split(':').map(Number);
              const start = sh * 60 + sm;
              const end = eh * 60 + em;
              return currentMin >= start && currentMin < end;
          });

          if (isScheduledNow) {
              status = 'scheduled';
              return { status, nextSlotMinutes, name: member.displayName };
          }

          // Find confusing logic for "next slot" across all days
          // Simple approach: find next slot TODAY first, then look at tomorrow etc.
          // For sorting simplicity, let's just look at remaining slots today first
          const todaySlots = member.availableSlots.filter((slot: any) => slot.day === currentDay);
          const upcomingToday = todaySlots
              .map((slot: any) => {
                  const [sh, sm] = slot.startTime.split(':').map(Number);
                  return (sh * 60 + sm) - currentMin;
              })
              .filter(diff => diff > 0)
              .sort((a, b) => a - b)[0]; // Nearest future slot today
          
          if (upcomingToday !== undefined) {
              status = 'upcoming';
              nextSlotMinutes = upcomingToday;
          } else {
             // Logic for future days could go here, but for "upcoming" sorting usually means "soon today"
             // Defaults to Infinity if no slot today
          }
      }

      return { status, nextSlotMinutes, name: member.displayName };
  };

  // Sorting logic based on priority:
  // 1. Active (Status 'active')
  // 2. Scheduled Now (Status 'scheduled')
  // 3. Upcoming (Status 'upcoming') -> Sort by minutes until start
  // 4. Offline -> Sort alphabetically
  const sortedMembers = [...members].sort((a, b) => {
      const infoA = getMemberSortInfo(a);
      const infoB = getMemberSortInfo(b);

      // Rank mapping
      const rank = {
          'active': 1,
          'scheduled': 2,
          'upcoming': 3,
          'offline': 4
      };

      if (rank[infoA.status] !== rank[infoB.status]) {
          return rank[infoA.status] - rank[infoB.status];
      }

      // If both are 'upcoming', sort by time until slot
      if (infoA.status === 'upcoming' && infoB.status === 'upcoming') {
          return infoA.nextSlotMinutes - infoB.nextSlotMinutes;
      }

      // Default: Alphabetical
      return infoA.name.localeCompare(infoB.name);
  });

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary w-10 h-10" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
            <h1 className="text-2xl font-bold">Team Availability</h1>
            <p className="text-base-content/60 flex items-center gap-2 text-sm mt-1">
                <Clock size={16} />
                Check team schedules, meetings and current status.
            </p>
        </div>
        <div className="flex items-center gap-3">
          <CheckInOutWidget inline />
          <div className="w-px h-8 bg-base-300"></div>
          <button
            onClick={() => { setMeetingToEdit(null); setMeetingModalOpen(true); }}
            className="btn btn-sm btn-primary gap-2 transition-transform hover:scale-105"
          >
            <Plus size={16} />
            Schedule Meeting
          </button>
          <div className="w-px h-8 bg-base-300"></div>
          {/* View toggle */}
          <div className="join">
            <button
              className={`btn btn-sm join-item gap-1.5 ${view === 'cards' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView('cards')}
              title="Card View"
            >
              <LayoutGrid size={14} />
              <span className="hidden sm:inline">Cards</span>
            </button>
            <button
              className={`btn btn-sm join-item gap-1.5 ${view === 'rota' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView('rota')}
              title="Weekly Rotation"
            >
              <CalendarRange size={14} />
              <span className="hidden sm:inline">Rotation</span>
            </button>
          </div>
        </div>
      </div>

      {/* Upcoming Meetings Section */}
      {meetings.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2 pb-2 border-b border-base-200">
            <Calendar size={18} className="text-primary" />
            Upcoming Meetings
            <span className="badge badge-primary badge-outline ml-2">{meetings.length}</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {meetings.map(meeting => (
              <MeetingListCard
                key={meeting.id}
                meeting={meeting}
                onEdit={handleEditMeeting}
                onDelete={handleDeleteMeetingClick}
              />
            ))}
          </div>
        </div>
      )}

      {view === 'rota' ? (
        <WeeklyRotaView members={members} />
      ) : sortedMembers.length === 0 ? (
        <div className="text-center py-20 opacity-50">
            No team members found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sortedMembers.map(member => {
                const activeLog = activeLogs[member.uid];
                const displayMember = {
                    ...member,
                    isOnline: !!activeLog,
                    currentStatus: activeLog?.status || (getMemberSortInfo(member).status === 'scheduled' ? 'scheduled' : 'offline')
                };

                return (
                    <TeamMemberCard 
                        key={member.uid} 
                        member={displayMember} 
                        onClick={() => setSelectedMember(member)}
                        onEdit={() => setEditingMember(member)}
                        onChat={() => setChatTarget({
                          uid: member.uid,
                          displayName: member.displayName,
                          photoURL: member.photoURL,
                        })}
                    />
                );
            })}
        </div>
      )}

      {/* View Details Modal */}
      <MemberDetailsModal 
        member={selectedMember} 
        isOpen={!!selectedMember} 
        onClose={() => setSelectedMember(null)} 
      />

      {/* Edit Modal (Admin/Manager only) */}
      <EditMemberModal 
        member={editingMember} 
        isOpen={!!editingMember} 
        onClose={() => setEditingMember(null)} 
      />

      {/* Create / Edit Meeting Modal */}
      <CreateMeetingModal
        isOpen={meetingModalOpen}
        onClose={() => { setMeetingModalOpen(false); setMeetingToEdit(null); }}
        meetingToEdit={meetingToEdit}
      />

      {/* Chat Modal */}
      <ChatModal
        isOpen={!!chatTarget}
        onClose={() => setChatTarget(null)}
        targetUser={chatTarget}
      />

      {/* Delete Meeting Confirmation */}
      {meetingToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-base-100 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-base-200">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mb-2">
                <AlertTriangle size={32} className="text-error" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-base-content">Delete Meeting?</h3>
                <p className="text-sm text-base-content/60">This action cannot be undone.</p>
              </div>
              <div className="flex gap-3 w-full mt-4">
                <button onClick={() => setMeetingToDelete(null)} className="btn btn-ghost flex-1" disabled={isDeleting}>Cancel</button>
                <button onClick={confirmDeleteMeeting} className="btn btn-error flex-1" disabled={isDeleting}>
                  {isDeleting ? <><Loader2 size={16} className="animate-spin" /> Deleting...</> : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
