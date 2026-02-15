'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Clock, XCircle, LogOut, RefreshCw } from 'lucide-react';

const PUBLIC_ROUTES = ['/', '/login', '/signup', '/auth/login', '/auth/signup'];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile, loading, logout, refreshProfile } = useAuth();
  
  const isPublic = PUBLIC_ROUTES.includes(pathname);
  const showSidebar = !isPublic; 

  useEffect(() => {
    if (!loading && !isPublic) {
      if (!user) {
        router.push('/login');
      } else if (!profile) {
        // User logged in but profile deleted/missing -> force logout
        logout().then(() => router.push('/signup'));
      }
    }
  }, [user, profile, loading, isPublic, router, logout]);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const handleRefresh = async () => {
    await refreshProfile();
  };

  if (loading) return <div className="flex h-screen items-center justify-center bg-base-100"><span className="loading loading-spinner loading-lg text-primary"></span></div>;

  // Show pending approval screen for non-approved users trying to access protected routes
  if (!isPublic && user && profile && profile.status !== 'approved') {
    return (
      <div className="flex h-screen items-center justify-center bg-base-100 p-4">
        <div className="card bg-base-200 shadow-xl max-w-md w-full">
          <div className="card-body items-center text-center">
            {profile.status === 'pending' ? (
              <>
                <div className="w-20 h-20 rounded-full bg-warning/20 flex items-center justify-center mb-4">
                  <Clock className="w-10 h-10 text-warning" />
                </div>
                <h2 className="card-title text-2xl">Request Pending</h2>
                <p className="text-base-content/70 mt-2">
                  Your account request is awaiting approval from the administrator.
                </p>
                <p className="text-base-content/60 text-sm mt-2">
                  You&apos;ll be able to access Crazy Desk once your request is approved.
                </p>
                <div className="divider"></div>
                <div className="text-sm text-base-content/60">
                  <p><strong>Name:</strong> {profile.displayName || 'N/A'}</p>
                  <p><strong>Email:</strong> {profile.email}</p>
                  <p><strong>Requested Role:</strong> {profile.role?.replace('_', ' ')}</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-full bg-error/20 flex items-center justify-center mb-4">
                  <XCircle className="w-10 h-10 text-error" />
                </div>
                <h2 className="card-title text-2xl text-error">Access Denied</h2>
                <p className="text-base-content/70 mt-2">
                  Your account request has been rejected by the administrator.
                </p>
                <p className="text-base-content/60 text-sm mt-2">
                  Please contact the administrator if you believe this was a mistake.
                </p>
              </>
            )}
            <div className="card-actions mt-6 flex gap-2">
              {profile.status === 'pending' && (
                <button onClick={handleRefresh} className="btn btn-ghost gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Check Status
                </button>
              )}
              <button onClick={handleLogout} className="btn btn-primary gap-2">
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-base-100 text-base-content antialiased">
      {showSidebar && <Sidebar />}
      <main className={`flex-1 overflow-y-auto ${showSidebar ? 'p-8' : ''} relative bg-base-100`}>
        {children}
      </main>
    </div>
  );
}
