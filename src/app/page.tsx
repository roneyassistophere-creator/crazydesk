'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function Home() {
  const { user, profile, loading } = useAuth();

  return (
    <div className="hero min-h-screen bg-base-200">
      <div className="hero-content text-center">
        <div className="max-w-md">
          <h1 className="text-5xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent mb-8">Crazy Desk</h1>
          <p className="py-6 text-xl">
            Streamline your team's workflow with the ultimate task management solution.
          </p>
          
          <div className="flex gap-4 justify-center items-center flex-col h-auto min-h-[3rem]">
            {loading ? (
              <Loader2 className="animate-spin text-primary" />
            ) : user ? (
              (profile?.status === 'pending' || ((profile?.requestedRoles?.length || 0) > 0 && !(profile?.allowedRoles?.length))) ? (
                 <div className="alert alert-warning shadow-lg max-w-xs">
                   <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                   <div>
                     <h3 className="font-bold">Access Pending</h3>
                     <div className="text-xs">Your account request is awaiting approval.</div>
                   </div>
                 </div>
              ) : (
                <Link href="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
              )
            ) : (
              <div className="flex gap-4">
                <Link href="/login" className="btn btn-primary">Sign In</Link>
                <Link href="/signup" className="btn btn-outline btn-secondary">Get Started</Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
