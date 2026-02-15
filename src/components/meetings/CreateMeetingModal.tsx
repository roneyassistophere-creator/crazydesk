'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { collection, addDoc, updateDoc, doc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Loader2, X, Calendar, Link as LinkIcon, Users, Clock } from 'lucide-react';
import { UserProfile } from '@/types/auth';
import { Meeting } from '@/types/meeting';
import { format } from 'date-fns';

interface CreateMeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  meetingToEdit?: Meeting | null;
}

export default function CreateMeetingModal({ isOpen, onClose, meetingToEdit }: CreateMeetingModalProps) {
  const { user, profile } = useAuth();
  const { users } = useUsers();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    meetingLink: '',
    date: '',
    time: '',
  });

  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  
  // Populate form data when editing
  useEffect(() => {
    if (meetingToEdit && isOpen) {
        const date = meetingToEdit.scheduledAt.toDate();
        setFormData({
            title: meetingToEdit.title,
            description: meetingToEdit.description || '',
            meetingLink: meetingToEdit.meetingLink || '',
            date: format(date, 'yyyy-MM-dd'),
            time: format(date, 'HH:mm'),
        });
        
        // Exclude current user from selected so logic works same as create
        // But logic below adds current user anyway.
        // We just need the list of OTHER participants for the UI selection
        const otherParticipants = meetingToEdit.participants.filter(pid => pid !== meetingToEdit.createdBy.uid);
        setSelectedParticipants(otherParticipants);
    } else if (!meetingToEdit && isOpen) {
        // Reset if creating new
        setFormData({
            title: '',
            description: '',
            meetingLink: '',
            date: '',
            time: '',
        });
        setSelectedParticipants([]);
    }
  }, [meetingToEdit, isOpen]);

  if (!isOpen || !user) return null;

  const toggleParticipant = (uid: string) => {
    setSelectedParticipants(prev => 
      prev.includes(uid) 
        ? prev.filter(id => id !== uid)
        : [...prev, uid]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);

    try {
      // Combine date and time into a Timestamp
      const scheduledDate = new Date(`${formData.date}T${formData.time}`);
      
      const participantDetails = users
        .filter(u => selectedParticipants.includes(u.uid))
        .map(u => ({
          uid: u.uid,
          displayName: u.displayName || u.email || 'Unknown',
          email: u.email || '',
        }));

      // Ensure creator is in participantDetails
      const isCreatorInDetails = participantDetails.some(p => p.uid === user.uid);
      if (!isCreatorInDetails) {
          participantDetails.push({
              uid: user.uid,
              displayName: profile?.displayName || user.email || 'Unknown',
              email: user.email || ''
          });
      }
      
      const allParticipantIds = participantDetails.map(p => p.uid);

      if (meetingToEdit) {
        await updateDoc(doc(db, 'meetings', meetingToEdit.id), {
          title: formData.title,
          description: formData.description,
          meetingLink: formData.meetingLink,
          scheduledAt: Timestamp.fromDate(scheduledDate),
          participants: allParticipantIds,
          participantDetails: participantDetails,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, 'meetings'), {
          title: formData.title,
          description: formData.description,
          meetingLink: formData.meetingLink,
          scheduledAt: Timestamp.fromDate(scheduledDate),
          createdBy: {
            uid: user.uid,
            displayName: profile?.displayName || user.email,
            email: user.email
          },
          participants: allParticipantIds,
          participantDetails: participantDetails,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      onClose();
      // Reset is handled by useEffect on open
      if (!meetingToEdit) {
        setFormData({
            title: '',
            description: '',
            meetingLink: '',
            date: '',
            time: '',
        });
        setSelectedParticipants([]);
      }
    } catch (error) {
      console.error('Error saving meeting:', error);
      alert('Failed to save meeting. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  // Group users for better selection
  const managers = users.filter(u => u.role === 'MANAGER' && u.uid !== user.uid);
  const teamMembers = users.filter(u => u.role === 'TEAM_MEMBER' && u.uid !== user.uid);
  const others = users.filter(u => !['MANAGER', 'TEAM_MEMBER'].includes(u.role) && u.uid !== user.uid);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="card bg-base-100 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="card-body p-0 flex flex-col min-h-0">
            {/* Header */}
            <div className="p-6 border-b border-base-200 flex justify-between items-center shrink-0">
                <h2 className="card-title text-2xl">{meetingToEdit ? 'Update Meeting' : 'Schedule Meeting'}</h2>
                <button onClick={onClose} className="btn btn-ghost btn-circle btn-sm">
                    <X size={20} />
                </button>
            </div>

            {/* Scrollable Form Content */}
            <div className="overflow-y-auto p-6 flex-1 min-h-0 custom-scrollbar">
                <form id="create-meeting-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
                    
                    {/* Title */}
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text font-medium">Subject / Title</span>
                        </label>
                        <input 
                            type="text" 
                            placeholder="e.g. Weekly Sync"
                            className="input input-bordered w-full" 
                            value={formData.title}
                            onChange={e => setFormData({...formData, title: e.target.value})}
                            required
                        />
                    </div>

                    {/* Date and Time */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text font-medium flex items-center gap-2">
                                    <Calendar size={14} /> Date
                                </span>
                            </label>
                            <input 
                                type="date" 
                                className="input input-bordered w-full" 
                                value={formData.date}
                                onChange={e => setFormData({...formData, date: e.target.value})}
                                required
                            />
                        </div>
                        <div className="form-control w-full">
                            <label className="label">
                                <span className="label-text font-medium flex items-center gap-2">
                                    <Clock size={14} /> Time
                                </span>
                            </label>
                            <input 
                                type="time" 
                                className="input input-bordered w-full" 
                                value={formData.time}
                                onChange={e => setFormData({...formData, time: e.target.value})}
                                required
                            />
                        </div>
                    </div>

                    {/* Link */}
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text font-medium flex items-center gap-2">
                                <LinkIcon size={14} /> Meeting Link <span className="text-xs font-normal opacity-60">(Optional)</span>
                            </span>
                        </label>
                        <input 
                            type="url" 
                            placeholder="https://meet.google.com/..."
                            className="input input-bordered w-full" 
                            value={formData.meetingLink}
                            onChange={e => setFormData({...formData, meetingLink: e.target.value})}
                        />
                    </div>

                    {/* Description */}
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text font-medium">Description (Optional)</span>
                        </label>
                        <textarea 
                            className="textarea textarea-bordered h-20" 
                            placeholder="Agenda details..."
                            value={formData.description}
                            onChange={e => setFormData({...formData, description: e.target.value})}
                        ></textarea>
                    </div>

                    {/* Participants Selection */}
                    <div className="form-control w-full">
                        <label className="label">
                            <span className="label-text font-medium flex items-center gap-2">
                                <Users size={14} /> Invite Participants
                            </span>
                            <span className="label-text-alt">{selectedParticipants.length} selected</span>
                        </label>
                        
                        <div className="bg-base-200/50 rounded-lg p-3 border border-base-200 h-48 overflow-y-auto">
                            {users.length === 0 ? (
                                <div className="text-center py-4 opacity-50 text-sm">Loading users...</div>
                            ) : (
                                <div className="space-y-4">
                                    {managers.length > 0 && (
                                        <div>
                                            <div className="text-xs font-bold uppercase opacity-50 mb-2 px-1">Managers</div>
                                            <div className="space-y-1">
                                                {managers.map(u => (
                                                    <label key={u.uid} className="flex items-center gap-3 p-2 hover:bg-base-100 rounded-lg cursor-pointer transition-colors">
                                                        <input 
                                                            type="checkbox" 
                                                            className="checkbox checkbox-sm checkbox-primary"
                                                            checked={selectedParticipants.includes(u.uid)}
                                                            onChange={() => toggleParticipant(u.uid)}
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium">{u.displayName || u.email}</span>
                                                            <span className="text-xs opacity-50">{u.email}</span>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {teamMembers.length > 0 && (
                                        <div>
                                            <div className="text-xs font-bold uppercase opacity-50 mb-2 px-1">Team Members</div>
                                            <div className="space-y-1">
                                                {teamMembers.map(u => (
                                                    <label key={u.uid} className="flex items-center gap-3 p-2 hover:bg-base-100 rounded-lg cursor-pointer transition-colors">
                                                        <input 
                                                            type="checkbox" 
                                                            className="checkbox checkbox-sm checkbox-primary"
                                                            checked={selectedParticipants.includes(u.uid)}
                                                            onChange={() => toggleParticipant(u.uid)}
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium">{u.displayName || u.email}</span>
                                                            <span className="text-xs opacity-50">{u.email}</span>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                     {others.length > 0 && (
                                        <div>
                                            <div className="text-xs font-bold uppercase opacity-50 mb-2 px-1">Others</div>
                                            <div className="space-y-1">
                                                {others.map(u => (
                                                    <label key={u.uid} className="flex items-center gap-3 p-2 hover:bg-base-100 rounded-lg cursor-pointer transition-colors">
                                                        <input 
                                                            type="checkbox" 
                                                            className="checkbox checkbox-sm checkbox-primary"
                                                            checked={selectedParticipants.includes(u.uid)}
                                                            onChange={() => toggleParticipant(u.uid)}
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-medium">{u.displayName || u.email}</span>
                                                            <span className="text-xs opacity-50">{u.email}</span>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </form>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-base-200 flex justify-end gap-2 shrink-0 bg-base-100">
                <button 
                  type="button" 
                  className="btn btn-ghost" 
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  form="create-meeting-form"
                  className={`btn btn-primary ${loading && 'loading'}`}
                  disabled={loading}
                >
                  {loading ? 'Saving...' : (meetingToEdit ? 'Update Meeting' : 'Schedule Meeting')}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}
