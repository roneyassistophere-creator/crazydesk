'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  BarChart,
  MessageSquare,
  FolderOpen,
  Calendar,
  Wrench,
  LogOut,
  UserCircle,
  Settings,
  Eye
} from 'lucide-react';
import ThemeController from './ThemeController';
import CheckInOutWidget from '@/components/team/CheckInOutWidget';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { UserRole } from '@/types/auth';
import UserAvatar from '@/components/common/UserAvatar';

const menuItems = [
  { name: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { name: 'Task Manager', icon: CheckSquare, href: '/tasks' },
  { name: 'Team Availability', icon: Users, href: '/team-availability' },
  { name: 'Reporting', icon: BarChart, href: '/reporting' },
  { name: 'Communication', icon: MessageSquare, href: '/communication' },
  { name: 'Resources', icon: FolderOpen, href: '/resources' },
  { name: 'Meetings', icon: Calendar, href: '/meetings' },
  { name: 'Web Tracker', icon: Eye, href: '/web-tracker' },
  { name: 'Request a Fix', icon: Wrench, href: '/request-fix' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, profile, switchRole } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  const handleRoleSwitch = async (role: UserRole) => {
    try {
      await switchRole(role);
      // Wait for update or redirect if needed
      if (pathname === '/dashboard') {
        router.push('/dashboard'); 
      }
    } catch (error) {
      console.error('Failed to switch role', error);
    }
  };

  // Add Settings to menu only for ADMIN
  const allMenuItems = profile?.role === 'ADMIN' 
    ? [
        ...menuItems.slice(0, 8), 
        { name: 'Settings', icon: Settings, href: '/settings' },
        ...menuItems.slice(8)
      ]
    : menuItems;

  const allowedRoles = profile?.allowedRoles || [];
  const hasMultipleRoles = allowedRoles.length > 1;

  return (
    <div className="flex flex-col h-screen w-64 bg-base-200 text-base-content shadow-xl">
      <div className="p-6 border-b border-base-300">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-primary truncate">
            Crazy Desk
          </h1>
          <ThemeController />
        </div>
        <div className="flex flex-col gap-2 mt-4 px-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase text-base-content/50">Role</span>
            {profile && (
              <div className={`badge badge-sm whitespace-nowrap overflow-hidden text-ellipsis max-w-30 ${
                profile.role === 'ADMIN' ? 'badge-error text-white' : 
                profile.role === 'MANAGER' ? 'badge-primary text-primary-content' : 
                'badge-accent text-accent-content'
              }`}>
                {profile.role === 'TEAM_MEMBER' ? 'Team Member' : profile.role}
              </div>
            )}
          </div>
        </div>
        
        {hasMultipleRoles && (
          <div className="px-2 mt-2">
            {allowedRoles.length === 2 ? (
              <button 
                onClick={() => {
                  const otherRole = allowedRoles.find(r => r !== profile?.role);
                  if (otherRole) handleRoleSwitch(otherRole);
                }}
                className="btn btn-sm btn-outline w-full gap-2 text-xs h-auto py-2"
              >
                <RefreshCw size={12} className="shrink-0" />
                <span className="truncate">
                  Switch to {(() => {
                    const r = allowedRoles.find(role => role !== profile?.role);
                    if (r === 'TEAM_MEMBER') return 'Team Member';
                    if (r === 'MANAGER') return 'Manager';
                    if (r === 'ADMIN') return 'Admin';
                    return r; // Fallback
                  })()}
                </span>
              </button>
            ) : (
              <div className="dropdown dropdown-bottom dropdown-end w-full">
                <div tabIndex={0} role="button" className="btn btn-sm btn-outline w-full gap-2 justify-between text-xs">
                  <span className="flex items-center gap-2 truncate">
                    <RefreshCw size={12} className="shrink-0" />
                    Switch Role
                  </span>
                  <ChevronDown size={14} className="shrink-0" />
                </div>
                <ul tabIndex={0} className="dropdown-content z-1 menu p-2 shadow bg-base-100 rounded-box w-52 mt-1 border border-base-300">
                  {allowedRoles.map((role) => (
                    role !== profile?.role && (
                      <li key={role}>
                        <button 
                          onClick={() => handleRoleSwitch(role)}
                          className="text-xs"
                        >
                          Switch to {role === 'TEAM_MEMBER' ? 'Team Member' : role}
                        </button>
                      </li>
                    )
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-6">
        <ul className="space-y-2 px-4">
          {allMenuItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                    isActive 
                      ? 'bg-primary text-primary-content shadow-lg' 
                      : 'text-base-content/70 hover:text-base-content hover:bg-base-300'
                  }`}
                >
                  <item.icon size={20} className={isActive ? 'text-primary-content' : 'text-base-content/70 group-hover:text-base-content transition-colors'} />
                  <span className="font-medium">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Persistent check-in widget — never unmounts during navigation */}
      <div className="px-4 pb-2">
        <CheckInOutWidget compact />
      </div>

      <div className="p-4 border-t border-base-300">
        <div className="dropdown dropdown-top w-full">
          <div tabIndex={0} role="button" className="flex items-center gap-3 w-full px-4 py-3 hover:bg-base-300 rounded-lg transition-all duration-200 group">
            <UserAvatar 
              photoURL={profile?.photoURL} 
              displayName={profile?.displayName} 
              size="sm" 
              showRing={false}
              className="shrink-0" 
            />
            <div className="flex-1 text-left overflow-hidden">
              <div className="font-bold truncate text-sm">{profile?.displayName || 'User'}</div>
              <div className="text-[10px] text-base-content/50 uppercase font-bold tracking-wider">My Account</div>
            </div>
            <ChevronDown size={14} className="text-base-content/50" />
          </div>
          <ul tabIndex={0} className="dropdown-content z-1 menu p-2 shadow bg-base-100 rounded-box w-56 mb-2 border border-base-300">
            <li>
              <Link href="/my-account" className="flex items-center gap-2">
                <UserCircle size={18} />
                <span>Profile Settings</span>
              </Link>
            </li>
            <div className="divider my-1"></div>
            <li>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 text-error hover:text-error hover:bg-error/10"
              >
                <LogOut size={18} />
                <span>Sign Out</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
