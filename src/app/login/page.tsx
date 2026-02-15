'use client';
import { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider, db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { UserRole } from '@/types/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<UserRole>('TEAM_MEMBER');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      sessionStorage.setItem('intendedRole', selectedRole);
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Invalid email or password. Please try again.');
      } else if (err.code === 'auth/wrong-password') {
        setError('Incorrect password. Please try again.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed attempts. Please try again later.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        // Brand new Google user signing in — create profile with pending status
        await setDoc(userRef, {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          role: selectedRole,
          requestedRoles: [selectedRole],
          allowedRoles: [],
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      } else {
        // Existing user
        const currentData = userSnap.data();
        const currentAllowed = currentData.allowedRoles || [];

        if (currentAllowed.includes(selectedRole)) {
          // Already has this role — just switch to it
          await setDoc(userRef, { role: selectedRole }, { merge: true });
        } else {
          // Request the new role without breaking existing access
          const currentRequested = currentData.requestedRoles || [];
          const newRequested = Array.from(new Set([...currentRequested, selectedRole]));
          
          const updates: any = {
            requestedRoles: newRequested,
            displayName: user.displayName,
            email: user.email,
          };

          // Only set status to pending if not already approved for another role
          if (currentData.status !== 'approved') {
            updates.status = 'pending';
          }

          await setDoc(userRef, updates, { merge: true });
        }
      }

      router.push('/dashboard');
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign in was cancelled.');
      } else {
        setError('Google sign in failed. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 p-4 relative">
      <Link href="/" className="btn btn-ghost btn-sm absolute top-4 left-4 gap-2">
        <ArrowLeft size={18} />
        Home
      </Link>
      <div className="card w-full max-w-sm bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title justify-center text-3xl font-bold mb-2">Welcome Back</h2>
          <p className="text-center text-base-content/60 text-sm mb-4">Sign in to your workspace</p>
          
          <div className="flex flex-col gap-2 mb-2">
            <span className="text-sm font-medium text-base-content/70">Sign in as:</span>
            <div className="grid grid-cols-2 gap-2 p-1 bg-base-200 rounded-lg">
              <button 
                type="button"
                className={`btn btn-sm border-0 ${selectedRole === 'MANAGER' ? 'btn-primary shadow-md' : 'btn-ghost text-base-content/70 hover:bg-base-300'}`}
                onClick={() => setSelectedRole('MANAGER')}
              >Manager</button>
              <button 
                type="button"
                className={`btn btn-sm border-0 ${selectedRole === 'TEAM_MEMBER' ? 'btn-primary shadow-md' : 'btn-ghost text-base-content/70 hover:bg-base-300'}`}
                onClick={() => setSelectedRole('TEAM_MEMBER')}
              >Team Member</button>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <div className="form-control">
              <label className="label pb-1">
                <span className="label-text">Email</span>
              </label>
              <input 
                type="email" 
                placeholder="email@example.com" 
                className="input input-bordered w-full" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div className="form-control">
              <label className="label pb-1">
                <span className="label-text">Password</span>
              </label>
              <input 
                type="password" 
                placeholder="••••••••" 
                className="input input-bordered w-full" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="alert alert-error text-sm py-3">
                <span>{error}</span>
              </div>
            )}

            <div className="form-control pt-2 space-y-2">
              <button 
                type="submit" 
                className="btn btn-primary w-full"
                disabled={loading}
              >
                {loading ? <span className="loading loading-spinner loading-sm"></span> : 'Sign In'}
              </button>
              
              <div className="divider text-xs my-1">OR</div>
              
              <button
                type="button"
                className="btn btn-outline w-full"
                onClick={signInWithGoogle}
                disabled={loading}
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continue with Google
              </button>
            </div>
          </form>

          <div className="text-center mt-4">
            <span className="text-sm text-base-content/60">Don't have an account? </span>
            <Link href="/signup" className="link link-primary text-sm font-medium">Sign up</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
