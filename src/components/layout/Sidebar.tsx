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
    <div className="flex flex-col h-screen w-64 bg-gray-900 text-white shadow-xl">
      <div className="p-6 border-b border-gray-800">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          Crazy Desk
        </h1>
        <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">Assistophere Team</p>
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
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <item.icon size={20} className={isActive ? 'text-white' : 'text-gray-400 group-hover:text-white transition-colors'} />
                  <span className="font-medium">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-800">
        <button className="flex items-center gap-3 w-full px-4 py-3 text-gray-400 hover:text-red-400 hover:bg-gray-800/50 rounded-lg transition-all duration-200 group">
          <LogOut size={20} className="group-hover:text-red-400 transition-colors" />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
}
