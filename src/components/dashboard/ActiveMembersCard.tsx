'use client';

import { Users, Clock } from 'lucide-react';
import Link from 'next/link';
import { useTeamData } from '@/hooks/team/useTeamData';

export default function ActiveMembersCard() {
  const { members, loading } = useTeamData();
  
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

  const activeCount = members.filter(m => m.isOnline).length;
  // Find who is next soonest? (To be implemented fully, for now just show active count)

  return (
    <Link href="/team-availability" className="block h-full transition-transform hover:scale-[1.02]">
        <div className="stats shadow bg-base-200 w-full h-full">
          <div className="stat">
            <div className={`stat-figure ${activeCount > 0 ? 'text-success animate-pulse' : 'text-secondary'}`}>
              <Users size={24} />
            </div>
            <div className="stat-title">Active Members</div>
            <div className={`stat-value ${activeCount > 0 ? 'text-success' : 'text-secondary'}`}>
                {activeCount}
                <span className="text-2xl opacity-40 text-base-content ml-1">/ {members.length}</span>
            </div>
            <div className="stat-desc">
                 Members Currently Online
            </div>
          </div>
        </div>
    </Link>
  );
}