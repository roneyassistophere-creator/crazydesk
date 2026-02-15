'use client';

import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { FixRequest } from '@/types/fixRequest';
import FixRequestCard from '@/components/request-fix/FixRequestCard';
import CreateRequestModal from '@/components/request-fix/CreateRequestModal';
import { Plus, Clock, Loader2, PlayCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function RequestFixPage() {
  const { user, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<FixRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Real-time listener
    const q = query(
      collection(db, 'fix_requests'), 
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requestsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as FixRequest));
      setRequests(requestsData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching requests:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin text-primary w-10 h-10" />
      </div>
    );
  }

  // Group by status
  const openRequests = requests.filter(r => r.status === 'open');
  const inProgressRequests = requests.filter(r => r.status === 'in_progress');
  const completedRequests = requests.filter(r => r.status === 'completed');

  return (
    <div className="p-4 h-[calc(100vh-4rem)] flex flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center bg-base-100 p-3 rounded-xl shadow-sm border border-base-200 shrink-0">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            Request a Fix
            <span className="badge badge-primary badge-outline text-xs">Beta</span>
          </h1>
          <p className="text-xs text-base-content/60 mt-0.5">Track and resolve issues collaboratively.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="btn btn-sm btn-primary gap-2 transition-transform hover:scale-105"
        >
          <Plus size={16} />
          New Request
        </button>
      </div>

      {/* Kanban Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
        
        {/* Open Column */}
        <div className="flex flex-col gap-3 bg-base-200/50 p-3 rounded-xl border border-base-200 h-full min-h-0">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-bold text-sm uppercase tracking-wide flex items-center gap-2 text-warning">
              <Clock className="w-4 h-4" />
              Open Requests
            </h2>
            <span className="badge badge-warning badge-xs">{openRequests.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-base-300">
            {openRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-base-content/40 border-2 border-dashed border-base-300 rounded-lg">
                <Clock size={32} className="mb-2 opacity-50" />
                <span className="text-sm italic">No open requests</span>
              </div>
            ) : (
              openRequests.map(req => (
                <FixRequestCard key={req.id} request={req} />
              ))
            )}
          </div>
        </div>

        {/* In Progress Column */}
        <div className="flex flex-col gap-3 bg-base-200/50 p-3 rounded-xl border border-base-200 h-full min-h-0">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-bold text-sm uppercase tracking-wide flex items-center gap-2 text-info">
              <PlayCircle className="w-4 h-4" />
              In Progress
            </h2>
            <span className="badge badge-info badge-xs">{inProgressRequests.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-base-300">
            {inProgressRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-base-content/40 border-2 border-dashed border-base-300 rounded-lg">
                <PlayCircle size={24} className="mb-2 opacity-50" />
                <span className="text-xs italic">No active tasks</span>
              </div>
            ) : (
              inProgressRequests.map(req => (
                <FixRequestCard key={req.id} request={req} />
              ))
            )}
          </div>
        </div>

        {/* Completed Column */}
        <div className="flex flex-col gap-3 bg-base-200/50 p-3 rounded-xl border border-base-200 h-full min-h-0">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-bold text-sm uppercase tracking-wide flex items-center gap-2 text-success">
              <CheckCircle className="w-4 h-4" />
              Completed
            </h2>
            <span className="badge badge-success badge-xs">{completedRequests.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-base-300">
            {completedRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-base-content/40 border-2 border-dashed border-base-300 rounded-lg">
                <CheckCircle size={24} className="mb-2 opacity-50" />
                <span className="text-xs italic">No completed tasks yet</span>
              </div>
            ) : (
              completedRequests.map(req => (
                <FixRequestCard key={req.id} request={req} />
              ))
            )}
          </div>
        </div>
      </div>

      <CreateRequestModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </div>
  );
}
