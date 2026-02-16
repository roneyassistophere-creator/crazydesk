'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { collection, query, orderBy, onSnapshot, where, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Meeting } from '@/types/meeting';
import CreateMeetingModal from '@/components/meetings/CreateMeetingModal';
import MeetingListCard from '@/components/meetings/MeetingListCard';
import { Plus, Loader2, Calendar, Clock, AlertTriangle } from 'lucide-react';

export default function MeetingsPage() {
  const { user, profile } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [meetingToEdit, setMeetingToEdit] = useState<Meeting | null>(null);
  const [meetingToDelete, setMeetingToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Fetch meetings where user is participant OR creator
    // Firestore "array-contains" only works for one field. 
    // We can fetch all meetings user is involved in by using a client-side filter or multiple queries.
    // Simpler approach for now: Query all meetings and filter client side? No, inefficient.
    // Query meetings where 'participants' array-contains user.uid.
    // Note: Creator adds logic should ensure creator is in participants list if they want to see it easily, 
    // OR we query specifically for createdBy.uid too.
    
    // Let's rely on `participants` array containing everyone involved including host.
    
    // Removing orderBy from query to avoid index requirement for now. Sorting client-side instead.
    const q = query(
      collection(db, 'meetings'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const meetingsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Meeting));
      
      // Client-side sort
      meetingsData.sort((a, b) => {
        const dateA = a.scheduledAt?.toDate ? a.scheduledAt.toDate().getTime() : 0;
        const dateB = b.scheduledAt?.toDate ? b.scheduledAt.toDate().getTime() : 0;
        return dateA - dateB;
      });
      
      setMeetings(meetingsData);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching meetings:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary w-10 h-10" />
      </div>
    );
  }

  const now = new Date();
  const upcomingMeetings = meetings.filter(m => {
      if (!m.scheduledAt?.toDate) return false;
      return m.scheduledAt.toDate() >= now;
  });
  const pastMeetings = meetings.filter(m => {
      if (!m.scheduledAt?.toDate) return false;
      return m.scheduledAt.toDate() < now;
  });

  // Sort upcoming meetings: Soonest first (Ascending)
  upcomingMeetings.sort((a, b) => {
      const timeA = a.scheduledAt?.toDate ? a.scheduledAt.toDate().getTime() : 0;
      const timeB = b.scheduledAt?.toDate ? b.scheduledAt.toDate().getTime() : 0;
      return timeA - timeB;
  });

  // Sort past meetings: Most recent first (Descending)
  pastMeetings.sort((a, b) => {
      const timeA = a.scheduledAt?.toDate ? a.scheduledAt.toDate().getTime() : 0;
      const timeB = b.scheduledAt?.toDate ? b.scheduledAt.toDate().getTime() : 0;
      return timeB - timeA;
  });

  const handleEdit = (meeting: Meeting) => {
    setMeetingToEdit(meeting);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (meetingId: string) => {
    setMeetingToDelete(meetingId);
  };

  const confirmDelete = async () => {
    if (!meetingToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'meetings', meetingToDelete));
    } catch (error) {
      console.error('Error deleting meeting:', error);
      alert('Failed to delete meeting.');
    } finally {
      setIsDeleting(false);
      setMeetingToDelete(null);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setMeetingToEdit(null);
  }

  return (
    <div className="p-6 h-[calc(100vh-4rem)] flex flex-col gap-6 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center bg-base-100 p-4 rounded-xl shadow-sm border border-base-200 shrink-0">
            <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
                Meetings
            </h1>
            <p className="text-sm text-base-content/60 mt-1">Schedule and manage team syncs.</p>
            </div>
            <button 
            onClick={() => {
                setMeetingToEdit(null);
                setIsModalOpen(true);
            }}
            className="btn btn-primary gap-2 transition-transform hover:scale-105"
            >
            <Plus size={18} />
            Schedule Meeting
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-4 space-y-8 pr-2">
            {/* Upcoming Section */}
            <div>
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2 pb-2 border-b border-base-200">
                    <Calendar size={18} className="text-primary" />
                    Upcoming Meetings
                    <span className="badge badge-primary badge-outline ml-2">{upcomingMeetings.length}</span>
                </h2>
                
                {upcomingMeetings.length === 0 ? (
                    <div className="text-center py-10 bg-base-200/50 rounded-xl border border-dashed border-base-300">
                        <p className="text-base-content/50 italic">No upcoming meetings scheduled.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {upcomingMeetings.map(meeting => (
                            <MeetingListCard 
                                key={meeting.id} 
                                meeting={meeting} 
                                onEdit={handleEdit}
                                onDelete={handleDeleteClick}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Past Section */}
            {pastMeetings.length > 0 && (
                <div className="opacity-60">
                    <h2 className="text-lg font-bold mb-4 flex items-center gap-2 pb-2 border-b border-base-200">
                        <Clock size={18} className="text-base-content" />
                        Past Meetings
                        <span className="badge badge-ghost ml-2">{pastMeetings.length}</span>
                    </h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {pastMeetings.map(meeting => (
                           <MeetingListCard 
                                key={meeting.id} 
                                meeting={meeting} 
                                onEdit={handleEdit}
                                onDelete={handleDeleteClick}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>

        <CreateMeetingModal 
            isOpen={isModalOpen} 
            onClose={closeModal} 
            meetingToEdit={meetingToEdit}
        />

        {/* Delete Confirmation Modal */}
        {meetingToDelete && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                <div className="bg-base-100 rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-base-200 animate-in zoom-in-95 duration-200">
                    <div className="flex flex-col items-center text-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-error/10 flex items-center justify-center mb-2">
                            <AlertTriangle size={32} className="text-error" />
                        </div>
                        
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold text-base-content">Delete Meeting?</h3>
                            <p className="text-sm text-base-content/60">
                                This action cannot be undone. Checks-in data associated with this meeting will remain safe.
                            </p>
                        </div>

                        <div className="flex gap-3 w-full mt-4">
                             <button 
                                onClick={() => setMeetingToDelete(null)}
                                className="btn btn-ghost flex-1"
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={confirmDelete}
                                className="btn btn-error flex-1"
                                disabled={isDeleting}
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 size={16} className="animate-spin" />
                                        Deleting...
                                    </>
                                ) : (
                                    'Delete'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
}
