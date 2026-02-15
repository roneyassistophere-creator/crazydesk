'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Loader2, Plus } from 'lucide-react';

interface CreateRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateRequestModal({ isOpen, onClose }: CreateRequestModalProps) {
  const { user, profile } = useAuth();
  const { users } = useUsers();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    link: '',
    priority: 'medium',
    assignedToId: '',
  });

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;

    setLoading(true);
    try {
      const assignedUser = users.find(u => u.uid === formData.assignedToId);

      // Get the next ticket number
      const q = query(
        collection(db, 'fix_requests'), 
        orderBy('ticketNumber', 'desc'), 
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      let nextTicketNumber = 0;
      
      if (!querySnapshot.empty) {
        const lastRequest = querySnapshot.docs[0].data();
        // If the last document has a ticketNumber, increment it. 
        // If existing docs don't have ticketNumber (legacy), start at 0 or max ID logic (but we assume 0 for clean start)
        if (typeof lastRequest.ticketNumber === 'number') {
          nextTicketNumber = lastRequest.ticketNumber + 1;
        }
      }

      await addDoc(collection(db, 'fix_requests'), {
        title: formData.title,
        ticketNumber: nextTicketNumber,
        description: formData.description,
        link: formData.link || null,
        priority: formData.priority,
        status: 'open',
        
        requesterId: user.uid,
        requesterName: profile.displayName || user.email,
        requesterEmail: user.email,
        
        assignedToId: assignedUser?.uid || null,
        assignedToName: assignedUser?.displayName || null,
        assignedToEmail: assignedUser?.email || null,
        
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setFormData({
        title: '',
        description: '',
        link: '',
        priority: 'medium',
        assignedToId: '',
      });
      onClose();
    } catch (error) {
      console.error('Error creating request:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="card bg-base-100 w-full max-w-lg shadow-xl">
        <form onSubmit={handleSubmit} className="card-body">
          <h2 className="card-title text-2xl mb-4">Request a Fix</h2>
          
          <div className="form-control w-full">
            <label className="label">
              <span className="label-text font-medium">Title</span>
            </label>
            <input 
              type="text" 
              placeholder="Brief summary of the issue..."
              className="input input-bordered w-full" 
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
              required
            />
          </div>

          <div className="form-control w-full">
            <label className="label">
              <span className="label-text font-medium">Link <span className="text-base-content/50 font-normal">(Optional)</span></span>
            </label>
            <input 
              type="url" 
              placeholder="https://..."
              className="input input-bordered w-full" 
              value={formData.link}
              onChange={e => setFormData({...formData, link: e.target.value})}
            />
          </div>

          <div className="form-control w-full">
            <label className="label">
              <span className="label-text font-medium">Description</span>
            </label>
            <textarea 
              className="textarea textarea-bordered h-24" 
              placeholder="Describe the problem in detail..."
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              required
            ></textarea>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="form-control w-full">
              <label className="label">
                <span className="label-text font-medium">Priority</span>
              </label>
              <select 
                className="select select-bordered w-full"
                value={formData.priority}
                onChange={e => setFormData({...formData, priority: e.target.value})}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div className="form-control w-full">
              <label className="label">
                <span className="label-text font-medium">Assign To (Optional)</span>
              </label>
              <select 
                className="select select-bordered w-full"
                value={formData.assignedToId}
                onChange={e => setFormData({...formData, assignedToId: e.target.value})}
              >
                <option value="">Anyone available</option>
                <optgroup label="Managers">
                  {users
                    .filter(u => u.role !== 'CLIENT')
                    .filter(u => u.role === 'MANAGER' || u.allowedRoles?.includes('MANAGER'))
                    .map(u => (
                      <option key={`manager-${u.uid}`} value={u.uid}>
                        {u.displayName || u.email}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="Team Members">
                  {users
                    .filter(u => u.role !== 'CLIENT')
                    .filter(u => u.role === 'TEAM_MEMBER' || u.allowedRoles?.includes('TEAM_MEMBER'))
                    .map(u => (
                      <option key={`team-${u.uid}`} value={u.uid}>
                        {u.displayName || u.email}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>
          </div>

          <div className="card-actions justify-end mt-6">
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
              className="btn btn-primary gap-2"
              disabled={loading}
            >
              {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Plus className="w-4 h-4" />}
              Create Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
