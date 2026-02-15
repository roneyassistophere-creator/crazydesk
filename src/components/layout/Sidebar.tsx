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
  LogOut
} from 'lucide-react';
import ThemeController from './ThemeController';

const menuItems = [
  { name: 'Dashboard', icon: LayoutDashboard, href: '/dashboard' },
  { name: 'Task Manager', icon: CheckSquare, href: '/tasks' },
  { name: 'Team Availability', icon: Users, href: '/team-availability' },
  { name: 'Reporting', icon: BarChart, href: '/reporting' },
  { name: 'Communication', icon: MessageSquare, href: '/communication' },
  { name: 'Resources', icon: FolderOpen, href: '/resources' },
  { name: 'Meetings', icon: Calendar, href: '/meetings' },
  { name: 'Request a Fix', icon: Wrench, href: '/request-fix' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col h-screen w-64 bg-base-200 text-base-content shadow-xl">
      <div className="p-6 border-b border-base-300">
        <h1 className="text-2xl font-bold text-primary">
          Crazy Desk
        </h1>
        <p className="text-xs text-base-content/70 mt-1 uppercase tracking-wider">Assistophere Team</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-6">
        <ul className="space-y-2 px-4">
          {menuItems.map((item) => {
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

      <div className="p-4 border-t border-base-300 space-y-4">
        <div className="flex justify-center">
          <ThemeController />
        </div>
        
        <button className="flex items-center gap-3 w-full px-4 py-3 text-base-content/70 hover:text-error hover:bg-base-300 rounded-lg transition-all duration-200 group">
          <LogOut size={20} className="group-hover:text-error transition-colors" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
