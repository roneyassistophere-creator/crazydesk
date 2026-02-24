'use client';

import { useState } from 'react';
import TaskManager from '@/components/tasks/TaskManager';
import { useAuth } from '@/context/AuthContext';
import { useUsers } from '@/hooks/useUsers';
import UserAvatar from '@/components/common/UserAvatar';
import { Users, ChevronRight } from 'lucide-react';

export default function Tasks() {
  const { user, profile } = useAuth();
  const { users, loading: usersLoading } = useUsers();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const isAdminOrManager = profile?.role === 'ADMIN' || profile?.role === 'MANAGER';
  const viewingUserId = selectedUserId || user?.uid;
  const viewingUser = selectedUserId ? users.find(u => u.uid === selectedUserId) : null;

  // Filter out current user from team list (they always see own tasks by default)
  const teamMembers = users.filter(u => u.uid !== user?.uid && u.status === 'approved');

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      {/* Main Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <TaskManager 
          targetUserId={viewingUserId} 
          targetUserName={viewingUser?.displayName || undefined}
        />
      </div>

      {/* Team Sidebar - Admin/Manager only */}
      {isAdminOrManager && (
        <>
          {/* Collapsed toggle */}
          {!sidebarOpen && (
            <button 
              onClick={() => setSidebarOpen(true)}
              className="shrink-0 flex flex-col items-center gap-2 bg-base-100 border border-base-200 rounded-xl p-2 shadow-sm hover:shadow-md transition-shadow self-start"
              title="Show team"
            >
              <Users className="w-5 h-5 text-primary" />
              <ChevronRight className="w-4 h-4 text-base-content/40 rotate-180" />
            </button>
          )}

          {/* Expanded sidebar */}
          {sidebarOpen && (
            <aside className="w-56 shrink-0 bg-base-100 border border-base-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
              {/* Sidebar Header */}
              <div className="p-3 border-b border-base-200 flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  Team
                </h3>
                <button 
                  onClick={() => setSidebarOpen(false)}
                  className="btn btn-ghost btn-xs btn-circle"
                  title="Collapse"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* My Tasks Button */}
              <div className="p-2 border-b border-base-200">
                <button
                  onClick={() => setSelectedUserId(null)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                    !selectedUserId 
                      ? 'bg-primary/10 text-primary font-medium' 
                      : 'hover:bg-base-200 text-base-content'
                  }`}
                >
                  <UserAvatar 
                    photoURL={profile?.photoURL} 
                    displayName={profile?.displayName}
                    size="xs"
                    showRing={false}
                  />
                  <span className="truncate">My Tasks</span>
                </button>
              </div>

              {/* Team Members List */}
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {usersLoading ? (
                  <div className="flex justify-center py-4">
                    <span className="loading loading-spinner loading-sm text-primary"></span>
                  </div>
                ) : teamMembers.length === 0 ? (
                  <p className="text-xs text-base-content/40 text-center py-4">No team members</p>
                ) : (
                  teamMembers.map(member => (
                    <button
                      key={member.uid}
                      onClick={() => setSelectedUserId(member.uid)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm ${
                        selectedUserId === member.uid 
                          ? 'bg-primary/10 text-primary font-medium' 
                          : 'hover:bg-base-200 text-base-content'
                      }`}
                      title={member.displayName || member.email || ''}
                    >
                      <UserAvatar 
                        photoURL={member.photoURL} 
                        displayName={member.displayName}
                        size="xs"
                        showRing={false}
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="truncate text-sm">{member.displayName || 'Unknown'}</p>
                        <p className="truncate text-[10px] text-base-content/40">{member.role}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </aside>
          )}
        </>
      )}
    </div>
  );
}
