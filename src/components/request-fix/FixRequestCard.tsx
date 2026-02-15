'use client';

import { useState } from 'react';
import { FixRequest } from '@/types/fixRequest';
import { useAuth } from '@/context/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { db } from '@/lib/firebase/config';
import { doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { 
  Trash2, 
  ArrowRight, 
  CheckCircle, 
  User, 
  AlertCircle,
  Briefcase,
  MoreVertical,
  X,
  ExternalLink,
  RotateCcw
} from 'lucide-react';
import Link from 'next/link';
import { UserRole } from '@/types/auth';

interface FixRequestCardProps {
  request: FixRequest;
}

export default function FixRequestCard({ request }: FixRequestCardProps) {
  const { user, profile } = useAuth();
  const { users } = useUsers(); // Fetch users for reallocation
  const [loading, setLoading] = useState(false);
  const [showReassign, setShowReassign] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newAssignee, setNewAssignee] = useState('');

  // Permissions
  const isRequester = user?.uid === request.requesterId;
  const isAdmin = profile?.role === 'ADMIN';
  const isManager = profile?.role === 'MANAGER';
  const isAssignedToMe = user?.uid === request.assignedToId;
  const isClaimedByMe = user?.uid === request.claimedById;
  
  // Can delete: Requester, Admin, or Manager
  const canDelete = isRequester || isAdmin || isManager;

  // Can take action (move to In Progress):
  // - If assigned: Assignee, Admin, or Manager
  // - If unassigned: anyone
  const canTakeAction = request.status === 'open' && (
    !request.assignedToId || 
    isAssignedToMe ||
    isAdmin ||
    isManager
  );

  // Can reassign:
  // - Assigned person, claimed person, or Admin/Manager
  // - AND status is NOT completed
  const canReassign = request.status !== 'completed' && (
    isAssignedToMe ||
    isClaimedByMe ||
    isAdmin ||
    isManager
  );

  // Can mark fixed (move to Completed):
  // - Only the person working on it (claimedBy) or Admin/Manager
  const canMarkFixed = request.status === 'in_progress' && (
    isClaimedByMe || 
    isAdmin || 
    isManager
  );

  const canRevertToOpen = request.status === 'in_progress' && (
    isClaimedByMe || isAdmin || isManager
  );

  const canRevertToInProgress = request.status === 'completed' && (
    isClaimedByMe || isAdmin || isManager
  );

  const handleTakeAction = async () => {
    if (!user || loading) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'fix_requests', request.id), {
        status: 'in_progress',
        claimedById: user.uid,
        claimedByName: profile?.displayName || user.email,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating request:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkFixed = async () => {
    if (!user || loading) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'fix_requests', request.id), {
        status: 'completed',
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error completing request:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'fix_requests', request.id));
    } catch (error) {
      console.error('Error deleting request:', error);
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };
  
  const handleReassign = async () => {
    if (!newAssignee || loading) return;
    setLoading(true);
    try {
      const isUnassign = newAssignee === 'unassign';
      const assignedUser = users.find(u => u.uid === newAssignee);
      
      const updates: any = {
        assignedToId: isUnassign ? null : (assignedUser?.uid || null),
        assignedToName: isUnassign ? null : (assignedUser?.displayName || null),
        assignedToEmail: isUnassign ? null : (assignedUser?.email || null),
        updatedAt: serverTimestamp()
      };

      // If it was already claimed, unclaim it so the new person has to 'Take Action'
      if (request.status === 'in_progress') {
        updates.status = 'open';
        updates.claimedById = null;
        updates.claimedByName = null;
      }

      await updateDoc(doc(db, 'fix_requests', request.id), updates);
      setShowReassign(false);
    } catch (error) {
      console.error('Error reassigning request:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async (targetStatus: 'open' | 'in_progress') => {
    if (!user || loading) return;
    setLoading(true);
    try {
      const updates: any = {
        status: targetStatus,
        updatedAt: serverTimestamp()
      };

      if (targetStatus === 'open') {
        // Stop working -> remove claims, but KEEP original assignment if any
        updates.claimedById = null;
        updates.claimedByName = null;
      }
      
      // If moving back to in_progress from completed, we keep the original claimedBy
      
      await updateDoc(doc(db, 'fix_requests', request.id), updates);
    } catch (error) {
      console.error('Error reverting request:', error);
    } finally {
      setLoading(false);
    }
  };

  // Priority Badge Color
  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'critical': return 'badge-error';
      case 'high': return 'badge-warning';
      case 'medium': return 'badge-info';
      case 'low': return 'badge-ghost';
      default: return 'badge-ghost';
    }
  };

  return (
    <div className="card bg-base-100 shadow-sm border border-base-200 hover:shadow-md transition-shadow group relative text-sm">
      <div className="card-body p-3 gap-2">
        {/* Delete Confirmation Overlay */}
        {showDeleteConfirm && (
          <div className="absolute inset-0 bg-base-100 z-20 p-4 rounded-2xl flex flex-col justify-center gap-3 text-center animate-in fade-in duration-200">
            <h4 className="font-bold text-base">Delete this request?</h4>
            <p className="text-xs text-base-content/70">This action cannot be undone.</p>
            <div className="flex gap-2 justify-center w-full">
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                className="btn btn-sm btn-ghost w-1/2"
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete}
                className="btn btn-sm btn-error w-1/2 text-white"
                disabled={loading}
              >
                {loading ? <span className="loading loading-spinner loading-xs"></span> : 'Delete'}
              </button>
            </div>
          </div>
        )}

        {/* Reassign Overlay */}
        {showReassign && (
          <div className="absolute inset-0 bg-base-100 z-10 p-4 rounded-2xl flex flex-col justify-center gap-2 animate-in fade-in duration-200">
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-sm">Reassign Request</span>
              <button onClick={() => setShowReassign(false)} className="btn btn-ghost btn-xs btn-circle">
                <X size={14} />
              </button>
            </div>
            <select 
              className="select select-bordered select-sm w-full"
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
            >
              <option value="">Select teammate...</option>
              <option value="unassign">-- Unassign (Make Available to All) --</option>
              <optgroup label="Managers">
                {users
                  .filter(u => u.role === 'MANAGER' || u.allowedRoles?.includes('MANAGER'))
                  .map(u => (
                    <option key={`manager-${u.uid}`} value={u.uid}>
                      {u.displayName || u.email}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Team Members">
                {users
                  .filter(u => u.role === 'TEAM_MEMBER' || u.allowedRoles?.includes('TEAM_MEMBER'))
                  .map(u => (
                    <option key={`team-${u.uid}`} value={u.uid}>
                      {u.displayName || u.email}
                    </option>
                  ))}
              </optgroup>
            </select>
            <button 
              onClick={handleReassign}
              className="btn btn-primary btn-sm w-full"
              disabled={!newAssignee || loading}
            >
              Confirm Reassign
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-start -mt-0.5">
          <div className={`badge badge-xs py-2 font-semibold ${getPriorityColor(request.priority)}`}>
            {request.priority.toUpperCase()}
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {canReassign && !showReassign && (
               <button 
                onClick={() => setShowReassign(true)}
                className="btn btn-ghost btn-xs btn-square h-6 w-6 min-h-0 text-base-content/40 hover:text-primary tooltip tooltip-left"
                data-tip="Reassign"
              >
                <MoreVertical size={14} />
              </button>
            )}
            {canDelete && !showReassign && (
              <button 
                onClick={handleDelete}
                className="btn btn-ghost btn-xs btn-square h-6 w-6 min-h-0 text-base-content/40 hover:text-error tooltip tooltip-left"
                data-tip="Delete"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="min-h-0">
          <h3 className="font-semibold text-sm leading-snug mb-0.5 line-clamp-1 truncate" title={request.title}>
            <span className="text-base-content/40 mr-1 font-normal text-xs">#{typeof request.ticketNumber === 'number' ? request.ticketNumber : ''}</span>
            {request.title}
          </h3>
          <p className="text-xs text-base-content/60 line-clamp-2 mb-1.5 leading-relaxed">{request.description}</p>
          {request.link && (
            <a 
              href={request.link} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-[10px] text-primary flex items-center gap-1 hover:underline w-fit bg-primary/5 px-2 py-0.5 rounded-full"
            >
              <ExternalLink size={10} />
              View Resource
            </a>
          )}
        </div>

        {/* Metadata */}
        <div className="text-[10px] text-base-content/50 flex flex-col gap-0.5 border-t border-base-200 pt-1.5">
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-1">
               <span className="opacity-70">From:</span>
               <span className="font-medium text-base-content/70 truncate max-w-[100px]">{request.requesterName}</span>
             </div>
             {/* Optional: Add date here if needed */}
          </div>
          
          {request.assignedToId && (
            <div className="flex items-center gap-1 text-info">
              <span className="opacity-70">To:</span>
              <span className="font-medium truncate max-w-[100px]">{request.assignedToName}</span>
            </div>
          )}

          {request.claimedById && request.status === 'in_progress' && (
            <div className="flex items-center gap-1 text-primary">
              <span className="opacity-70">Worker:</span>
              <span className="font-medium truncate max-w-[100px]">{request.claimedByName}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="card-actions justify-end mt-0.5 flex-col gap-1.5">
          {request.status === 'in_progress' && canRevertToOpen && (
            <button 
              onClick={() => handleRevert('open')}
              className="btn btn-xs btn-ghost w-full text-base-content/50 hover:text-warning gap-1"
              title="Stop working and move back to Open"
              disabled={loading}
            >
              <RotateCcw size={12} />
              Stop Working
            </button>
          )}

          {canTakeAction && (
            <button 
              onClick={handleTakeAction}
              className="btn btn-sm btn-primary w-full gap-2"
              disabled={loading}
            >
              Take Action
              <ArrowRight size={14} />
            </button>
          )}

          {canMarkFixed && (
            <button 
              onClick={handleMarkFixed}
              className="btn btn-sm btn-success text-white w-full gap-2"
              disabled={loading}
            >
              Mark Fixed
              <CheckCircle size={14} />
            </button>
          )}
          
          {request.status === 'completed' && (
             <div className="w-full">
               <div className="w-full text-center py-1 text-sm text-success font-medium flex items-center justify-center gap-2 bg-success/10 rounded-lg mb-1">
                 <CheckCircle size={16} />
                 Resolved
               </div>
               {canRevertToInProgress && (
                 <button 
                  onClick={() => handleRevert('in_progress')}
                  className="btn btn-xs btn-ghost w-full text-base-content/50 hover:text-info gap-1"
                  disabled={loading}
                 >
                   <RotateCcw size={12} />
                   Reopen
                 </button>
               )}
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
