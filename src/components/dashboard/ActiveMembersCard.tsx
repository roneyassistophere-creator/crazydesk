'use client';

import { useState, useEffect } from 'react';
import { Users, Clock } from 'lucide-react';
import Link from 'next/link';
import { useTeamData } from '@/hooks/team/useTeamData';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export default function ActiveMembersCard() {
  const { members, loading } = useTeamData();
  const [checkedInCount, setCheckedInCount] = useState(0);

  // Listen for actually checked-in users (active work_logs)
  useEffect(() => {
    const q = query(collection(db, 'work_logs'), where('status', 'in', ['active', 'break']));
    const unsub = onSnapshot(q, (snap) => {
      // Count unique userIds
      const uniqueUsers = new Set(snap.docs.map(d => d.data().userId));
      setCheckedInCount(uniqueUsers.size);
    }, (err) => {
      console.error('ActiveMembersCard work_logs error:', err);
    });
    return () => unsub();
  }, []);
  
  if (loading) {
    return (
      <div className="card bg-base-100 shadow-sm animate-pulse h-full">
        <div className="card-body p-4">
             <div className="h-6 w-24 bg-base-200 rounded mb-2"></div>
             <div className="h-10 w-16 bg-base-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <Link href="/team-availability" className="block h-full transition-transform hover:scale-[1.02]">
        <div className="stats shadow bg-base-200 w-full h-full">
          <div className="stat">
            <div className={`stat-figure ${checkedInCount > 0 ? 'text-success animate-pulse' : 'text-secondary'}`}>
              <Users size={24} />
            </div>
            <div className="stat-title">Team Availability</div>
            <div className={`stat-value ${checkedInCount > 0 ? 'text-success' : 'text-secondary'}`}>
                {checkedInCount}
                <span className="text-2xl opacity-40 text-base-content ml-1">/ {members.length}</span>
            </div>
            <div className="stat-desc">
                 {checkedInCount > 0 ? `${checkedInCount} checked in now` : 'No one checked in'}
            </div>
          </div>
        </div>
    </Link>
  );
}