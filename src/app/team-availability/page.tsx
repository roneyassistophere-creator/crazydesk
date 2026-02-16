'use client';

import { useState, useEffect } from 'react';
import { useTeamData } from '@/hooks/team/useTeamData';
import { MemberProfile, TimeSlot } from '@/types/team';
import TeamMemberCard from '@/components/team/TeamMemberCard';
import MemberDetailsModal from '@/components/team/MemberDetailsModal';
import EditMemberModal from '@/components/team/EditMemberModal';
import CheckInOutWidget from '@/components/team/CheckInOutWidget';
import { useAuth } from '@/context/AuthContext';
import { Clock, Loader2 } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { WorkLog } from '@/types/workLog';

type SortStatus = 'active' | 'scheduled' | 'upcoming' | 'offline';

export default function TeamAvailability() {
  const { members, loading } = useTeamData();
  const [activeLogs, setActiveLogs] = useState<Record<string, WorkLog>>({});
  const [selectedMember, setSelectedMember] = useState<MemberProfile | null>(null);
  const [editingMember, setEditingMember] = useState<MemberProfile | null>(null);

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
    });

    return () => unsubscribe();
  }, []);

  const handleStatusChange = () => {
     // Handled via real-time listener
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
                Check team schedules and current status.
            </p>
        </div>
        <CheckInOutWidget onStatusChange={handleStatusChange} compact={true} />
      </div>

      {sortedMembers.length === 0 ? (
        <div className="text-center py-20 opacity-50">
            No team members found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {sortedMembers.map(member => {
                const activeLog = activeLogs[member.uid];
                // Augment member with real-time status just for display if needed
                const displayMember = {
                    ...member,
                    isOnline: !!activeLog, // Override hook's isOnline with real log status
                    currentStatus: activeLog?.status || (getMemberSortInfo(member).status === 'scheduled' ? 'scheduled' : 'offline')
                };

                return (
                    <TeamMemberCard 
                        key={member.uid} 
                        member={displayMember} 
                        onClick={() => setSelectedMember(member)}
                        onEdit={() => setEditingMember(member)}
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
    </div>
  );
}
