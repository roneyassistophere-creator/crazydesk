'use client';
import { useState, useEffect } from 'react';
import { useAuth } from "@/context/AuthContext";
import { CheckCircle, Clock, Users, AlertCircle, Wrench, Calendar, FileText } from "lucide-react";
import Link from 'next/link';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Meeting } from '@/types/meeting';
import MeetingListCard from '@/components/meetings/MeetingListCard';
import ActiveMembersCard from '@/components/dashboard/ActiveMembersCard';
import CheckInOutWidget from '@/components/team/CheckInOutWidget';

export default function Dashboard() {
  const { profile, user } = useAuth();
  const [openRequestsCount, setOpenRequestsCount] = useState(0);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    if (!profile || !user) return;

    // Fetch fix requests (existing logic)
    let q;
    if (profile.role === 'ADMIN' || profile.role === 'MANAGER') {
      q = query(collection(db, 'fix_requests'), where('status', '==', 'open'));
    } else {
      q = query(collection(db, 'fix_requests'), where('status', '==', 'open'), where('assignedToId', '==', user.uid));
    }
    const unsubscribeRequests = onSnapshot(q, (snapshot) => {
      setOpenRequestsCount(snapshot.size);
    }, (error) => {
      console.error('Dashboard fix_requests onSnapshot error:', error);
    });

    // Fetch Upcoming Meetings
    // Avoiding composite index for now by removing orderBy from query
    const meetingsQuery = query(
      collection(db, 'meetings'),
      where('participants', 'array-contains', user.uid)
    );

    const unsubscribeMeetings = onSnapshot(meetingsQuery, (snapshot) => {
      const allMeetings = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Meeting));
      
      const now = new Date();
      
      // Filter valid meetings
      const futureMeetings = allMeetings.filter(m => {
          if (!m.scheduledAt?.toDate) return false;
          return m.scheduledAt.toDate() >= now;
      });

      // Client-side sort: Soonest first
      futureMeetings.sort((a, b) => {
        const dateA = a.scheduledAt?.toDate ? a.scheduledAt.toDate().getTime() : 0;
        const dateB = b.scheduledAt?.toDate ? b.scheduledAt.toDate().getTime() : 0;
        return dateA - dateB;
      });

      setUpcomingMeetings(futureMeetings.slice(0, 5));
    }, (error) => {
      console.error('Dashboard meetings onSnapshot error:', error);
    });

    return () => {
      unsubscribeRequests();
      unsubscribeMeetings();
    };
  }, [profile, user]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-base-content">Dashboard</h1>
          <p className="text-base-content/60">Welcome back, {profile?.displayName || 'User'} ({profile?.role})</p>
        </div>
        <div className="flex gap-2">
          <Link href="/request-fix" className="btn btn-error text-white gap-2">
            <Wrench size={18} />
            Request Fix
          </Link>
          <button className="btn btn-success text-white">
            New Task
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Check In / Check Out Card */}
        <div className="card bg-base-200 shadow pb-2">
            <div className="card-body p-4 items-center justify-center">
                <div className="text-sm font-bold opacity-70 mb-2 uppercase tracking-wide">Start Working</div>
                <CheckInOutWidget />
            </div>
        </div>

        <div className="stats shadow bg-base-200">
          <div className="stat">
            <div className="stat-figure text-secondary">
              <Clock size={24} />
            </div>
            <div className="stat-title">Pending</div>
            <div className="stat-value text-secondary">0</div>
            <div className="stat-desc">Tasks awaiting review</div>
          </div>
        </div>

        {/* Fix Request Card */}
        <Link href="/request-fix" className="block h-full transition-transform hover:scale-[1.02]">
            <div className="stats shadow bg-base-200 w-full h-full">
                <div className="stat">
                    <div className={`stat-figure ${openRequestsCount > 0 ? 'text-error animate-pulse' : 'text-base-content/30'}`}>
                        <Wrench size={24} />
                    </div>
                    <div className="stat-title">Fix Requests</div>
                    <div className={`stat-value ${openRequestsCount > 0 ? 'text-error' : ''}`}>{openRequestsCount}</div>
                    <div className="stat-desc">
                    {(profile?.role === 'ADMIN' || profile?.role === 'MANAGER') 
                        ? 'Total open issues' 
                        : 'Issues assigned to you'}
                    </div>
                </div>
            </div>
        </Link>
        
        {/* Active Members Card */}
        <div className="h-full">
            <ActiveMembersCard />
        </div>

        {/* Meeting Cards directly in grid */}
        {upcomingMeetings.map(meeting => (
             <div key={meeting.id} className="h-full">
                <MeetingListCard meeting={meeting} compact />
             </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Recent Activity</h2>
            <div className="divider my-0"></div>
            <div className="text-center py-8 text-base-content/40 italic">
              No recent activity to show.
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h2 className="card-title justify-between">
              My Tasks
              <Link href="/tasks" className="btn btn-xs btn-ghost">View All</Link>
            </h2>
            <div className="divider my-0"></div>
            <div className="text-center py-8 text-base-content/40 italic">
              You're all caught up!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
