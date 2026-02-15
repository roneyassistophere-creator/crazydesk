'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Loader2, Clock, ArrowRight, LogOut, ChevronDown, UserCircle } from 'lucide-react';
import ThemeController from '@/components/layout/ThemeController';

export default function Home() {
  const { user, profile, loading, logout } = useAuth();

  const isPending = user && profile && (
    profile.status === 'pending' || 
    ((profile.requestedRoles?.length || 0) > 0 && !(profile.allowedRoles?.length))
  );

  const isApproved = user && profile && profile.status === 'approved' && (profile.allowedRoles?.length || 0) > 0;

  // Roles that are requested but not yet approved
  const pendingRoleRequests = profile?.requestedRoles?.filter(
    r => !profile.allowedRoles?.includes(r)
  ) || [];

  const formatRole = (role: string) => {
    switch (role) {
      case 'MANAGER': return 'Manager';
      case 'TEAM_MEMBER': return 'Team Member';
      case 'ADMIN': return 'Admin';
      default: return role;
    }
  };

  return (
    <div className="min-h-screen bg-base-200 flex flex-col">
      {/* Navbar */}
      <div className="navbar bg-base-100/80 backdrop-blur-sm border-b border-base-300 px-6 sticky top-0 z-10">
        <div className="flex-1 flex items-center gap-4">
          <span className="text-xl font-bold text-primary whitespace-nowrap">Crazy Desk</span>
          <ThemeController />
        </div>
        <div className="flex-none flex gap-2">
          {loading ? null : user ? (
            <>
              {isApproved && (
                <Link href="/dashboard" className="btn btn-primary btn-sm">
                  Dashboard
                </Link>
              )}
              {/* My Account Dropdown */}
              <div className="dropdown dropdown-end">
                <div tabIndex={0} role="button" className="btn btn-ghost btn-sm gap-2">
                  <div className="avatar placeholder">
                    <div className="bg-neutral text-neutral-content rounded-full w-6">
                      <span className="text-xs">{profile?.displayName?.charAt(0) || user.email?.charAt(0).toUpperCase()}</span>
                    </div>
                  </div>
                  <span className="hidden sm:inline">My Account</span>
                  <ChevronDown size={14} />
                </div>
                <ul tabIndex={0} className="dropdown-content z-1 menu p-2 shadow bg-base-100 rounded-box w-52 mt-4 border border-base-300">
                  <li>
                    <Link href="/my-account" className="flex items-center gap-2">
                      <UserCircle size={16} />
                      My Account
                    </Link>
                  </li>
                  <div className="divider my-1"></div>
                  <li>
                    <button onClick={() => logout()} className="flex items-center gap-2 text-error hover:text-error">
                      <LogOut size={16} />
                      Sign Out
                    </button>
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">Sign In</Link>
              <Link href="/signup" className="btn btn-primary btn-sm">Get Started</Link>
            </>
          )}
        </div>
      </div>

      {/* Hero */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-lg w-full text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent leading-tight">
              Crazy Desk
            </h1>
            <p className="text-xl text-base-content/70 max-w-md mx-auto">
              Streamline your team's workflow with the ultimate task management solution.
            </p>
          </div>

          {/* Pending Banner - user has NO approved roles at all */}
          {!loading && isPending && (
            <div className="card bg-warning/10 border border-warning/30 shadow-sm">
              <div className="card-body py-5 px-6 items-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <h3 className="font-semibold text-base">Access Request Pending</h3>
                  <p className="text-sm text-base-content/60 mt-1">
                    Your account is waiting for admin approval. You'll get access once it's approved.
                  </p>
                </div>
                {pendingRoleRequests.length > 0 && (
                  <div className="flex flex-col gap-1 mt-1">
                    {pendingRoleRequests.map(role => (
                      <div key={role} className="flex items-center justify-center gap-2 text-sm text-warning">
                        <Clock size={14} />
                        <span>{formatRole(role)} access request pending</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-xs text-base-content/40 mt-1">
                  Signed in as <span className="font-medium text-base-content/60">{profile?.email}</span>
                </div>
              </div>
            </div>
          )}

          {/* CTA Buttons */}
          {loading ? (
            <div className="flex justify-center">
              <Loader2 className="animate-spin text-primary w-8 h-8" />
            </div>
          ) : !user ? (
            <div className="flex gap-4 justify-center">
              <Link href="/login" className="btn btn-primary btn-lg gap-2">
                Sign In
                <ArrowRight size={18} />
              </Link>
              <Link href="/signup" className="btn btn-outline btn-secondary btn-lg">
                Get Started
              </Link>
            </div>
          ) : isApproved ? (
            <div className="space-y-4">
              <Link href="/dashboard" className="btn btn-primary btn-lg gap-2">
                Go to Dashboard
                <ArrowRight size={18} />
              </Link>
              
              {pendingRoleRequests.length > 0 && (
                <div className="flex flex-col gap-1">
                  {pendingRoleRequests.map(role => (
                    <div key={role} className="flex items-center justify-center gap-2 text-sm text-warning">
                      <Clock size={14} />
                      <span>{formatRole(role)} access request pending</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
