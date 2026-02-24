'use client';
import { useState, useEffect } from 'react';
import { useAuth } from "@/context/AuthContext";
import { CheckCircle, Clock, Users, AlertCircle, Wrench, Calendar, FileText, CheckSquare, Flag, Send, AlertTriangle } from "lucide-react";
import Link from 'next/link';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Meeting } from '@/types/meeting';
import MeetingListCard from '@/components/meetings/MeetingListCard';
import ActiveMembersCard from '@/components/dashboard/ActiveMembersCard';
import CheckInOutWidget from '@/components/team/CheckInOutWidget';
import RequestTaskModal from '@/components/tasks/RequestTaskModal';

interface DashboardTask {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  deadline: string;
  recurrence?: string;
}

export default function Dashboard() {
  const { profile, user } = useAuth();
  const [openRequestsCount, setOpenRequestsCount] = useState(0);
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [pendingTasks, setPendingTasks] = useState<DashboardTask[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [overdueTasks, setOverdueTasks] = useState<DashboardTask[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [showOverdue, setShowOverdue] = useState(false);

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

    // Fetch pending tasks for current user
    const tasksQuery = query(
      collection(db, 'tasks'),
      where('createdBy', '==', user.uid),
      where('status', 'in', ['todo', 'in_progress', 'review']),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      const tasksList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as DashboardTask));
      setPendingTasks(tasksList.slice(0, 5));
      setPendingCount(tasksList.length);

      // Compute overdue tasks from the same set
      const now = new Date();
      const overdue = tasksList.filter(t => {
        if (!t.deadline) return false;
        const dl = new Date(t.deadline);
        return dl < now;
      });
      overdue.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
      setOverdueTasks(overdue.slice(0, 5));
      setOverdueCount(overdue.length);
    }, (error) => {
      console.error('Dashboard tasks onSnapshot error:', error);
    });

    return () => {
      unsubscribeRequests();
      unsubscribeMeetings();
      unsubscribeTasks();
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
          <button onClick={() => setRequestModalOpen(true)} className="btn btn-success text-white gap-2">
            <Send size={18} />
            Request Task
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Check In / Check Out Card */}
        <div className="h-full">
          <CheckInOutWidget />
        </div>

        <div className="block h-full transition-transform hover:scale-[1.02]">
          <div className="stats shadow bg-base-200 w-full h-full cursor-pointer" onClick={() => setShowOverdue(!showOverdue)}>
            <div className="stat">
              <div className={`stat-figure ${
                showOverdue
                  ? (overdueCount > 0 ? 'text-error animate-pulse' : 'text-base-content/30')
                  : (pendingCount > 0 ? 'text-secondary' : 'text-base-content/30')
              }`}>
                {showOverdue ? <AlertTriangle size={24} /> : <Clock size={24} />}
              </div>
              <div className="stat-title flex items-center gap-2">
                {showOverdue ? 'Overdue Tasks' : 'Pending Tasks'}
              </div>
              <div className={`stat-value ${
                showOverdue
                  ? (overdueCount > 0 ? 'text-error' : '')
                  : (pendingCount > 0 ? 'text-secondary' : '')
              }`}>
                {showOverdue ? overdueCount : pendingCount}
              </div>
              <div className="stat-desc flex items-center justify-between">
                <span>{showOverdue ? 'Past their deadline' : 'Tasks awaiting completion'}</span>
                <button
                  className={`badge badge-xs cursor-pointer ${
                    showOverdue ? 'badge-secondary' : (overdueCount > 0 ? 'badge-error' : 'badge-ghost')
                  }`}
                  onClick={(e) => { e.stopPropagation(); setShowOverdue(!showOverdue); }}
                >
                  {showOverdue ? `${pendingCount} pending` : overdueCount > 0 ? `${overdueCount} overdue` : 'no overdue'}
                </button>
              </div>
            </div>
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
              <div className="flex items-center gap-2">
                {showOverdue ? <AlertTriangle className="w-5 h-5 text-error" /> : <CheckSquare className="w-5 h-5" />}
                {showOverdue ? 'Overdue Tasks' : 'My Tasks'}
              </div>
              <div className="flex items-center gap-1">
                {overdueCount > 0 && (
                  <button
                    className={`btn btn-xs ${showOverdue ? 'btn-ghost' : 'btn-error btn-outline'} gap-1`}
                    onClick={() => setShowOverdue(!showOverdue)}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {showOverdue ? 'Show Pending' : `${overdueCount} Overdue`}
                  </button>
                )}
                <Link href="/tasks" className="btn btn-xs btn-ghost">View All</Link>
              </div>
            </h2>
            <div className="divider my-0"></div>
            {(() => {
              const displayTasks = showOverdue ? overdueTasks : pendingTasks;
              const displayCount = showOverdue ? overdueCount : pendingCount;
              if (displayTasks.length === 0) {
                return (
                  <div className="text-center py-8 text-base-content/40 italic">
                    {showOverdue ? 'No overdue tasks!' : "You're all caught up!"}
                  </div>
                );
              }
              const priorityColors: Record<string, string> = {
                urgent: 'text-error',
                high: 'text-warning',
                normal: 'text-info',
                low: 'text-success',
              };
              const statusLabels: Record<string, string> = {
                todo: 'To Do',
                in_progress: 'In Progress',
                review: 'Review',
              };
              const statusColors: Record<string, string> = {
                todo: 'badge-ghost',
                in_progress: 'badge-warning',
                review: 'badge-info',
              };
              return (
                <div className="space-y-2">
                  {displayTasks.map(task => {
                    const isOverdue = task.deadline && new Date(task.deadline) < new Date();
                    return (
                      <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-base-300/50 transition-colors">
                        <Flag className={`w-3 h-3 shrink-0 ${priorityColors[task.priority] || 'text-info'}`} />
                        <span className="flex-1 text-sm truncate">{task.title || 'Untitled Task'}</span>
                        {task.recurrence && (
                          <span className="badge badge-xs badge-accent badge-outline">{task.recurrence}</span>
                        )}
                        <span className={`badge badge-xs ${statusColors[task.status] || 'badge-ghost'}`}>
                          {statusLabels[task.status] || task.status}
                        </span>
                        {task.deadline && (
                          <span className={`text-xs ${isOverdue ? 'text-error font-semibold' : 'text-base-content/50'}`}>
                            {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {displayCount > 5 && (
                    <Link href="/tasks" className="text-xs text-primary hover:underline text-center block pt-1">
                      + {displayCount - 5} more {showOverdue ? 'overdue tasks' : 'tasks'}
                    </Link>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <RequestTaskModal isOpen={requestModalOpen} onClose={() => setRequestModalOpen(false)} />
    </div>
  );
}
