'use client';
import { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const ROLES = [
  { value: 'MANAGER', label: 'Manager' },
  { value: 'TEAM_MEMBER', label: 'Team Member' },
];

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('TEAM_MEMBER');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const router = useRouter();

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      const userData: any = {
        displayName: user.displayName,
        email: user.email,
        role: role,
        status: 'pending',
      };

      if (userSnap.exists()) {
        const currentData = userSnap.data();
        const currentRequested = currentData.requestedRoles || (currentData.role ? [currentData.role] : []);
        const newRequested = Array.from(new Set([...currentRequested, role]));
        userData.requestedRoles = newRequested;
        // Don't overwrite createdAt for existing users
      } else {
        userData.uid = user.uid;
        userData.requestedRoles = [role];
        userData.createdAt = serverTimestamp();
      }

      await setDoc(userRef, userData, { merge: true });
      
      setSignupComplete(true);
    } catch (err: any) {
      setError(err.message || 'Google sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName });

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      
      const emailUserData = {
         uid: user.uid,
         email: user.email,
         displayName,
         role,
         requestedRoles: [role],
         status: 'pending',
         createdAt: serverTimestamp(),
      };

      if (userSnap.exists()) {
        const currentData = userSnap.data();
        const currentRequested = currentData.requestedRoles || (currentData.role ? [currentData.role] : []);
        // Only add if not already present
        const newRequested = Array.from(new Set([...currentRequested, role]));
        
        await setDoc(userRef, {
            requestedRoles: newRequested,
            // If user was previously rejected or approved, set back to pending to notify admin
            status: 'pending'
        }, { merge: true });
      } else {
        await setDoc(userRef, emailUserData);
      }

      setSignupComplete(true);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please sign in instead.');
      } else {
        setError(err.message || 'Failed to sign up');
      }
    } finally {
      setLoading(false);
    }
  };

  // Show pending approval screen after signup
  if (signupComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200">
        <div className="card w-96 bg-base-100 shadow-xl">
          <div className="card-body text-center">
            <div className="text-6xl mb-4">⏳</div>
            <h2 className="card-title justify-center text-2xl font-bold mb-2">Request Submitted!</h2>
            <p className="text-base-content/70 mb-4">
              Your signup request has been sent to the admin for approval. You'll be able to access the system once approved.
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/" className="btn btn-primary w-full">
                Back to Home
              </Link>
              <button 
                onClick={() => {
                  setSignupComplete(false);
                  setDisplayName('');
                  setEmail('');
                  setPassword('');
                  setRole('TEAM_MEMBER');
                }}
                className="btn btn-outline w-full"
              >
                Sign Up for Another Role
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 relative">
      <Link href="/" className="btn btn-ghost btn-sm absolute top-4 left-4 gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        Back to Home
      </Link>
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title justify-center text-3xl font-bold mb-4">Create Account</h2>
          
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text">Full Name</span>
              </label>
              <input 
                type="text" 
                placeholder="John Doe" 
                className="input input-bordered w-full" 
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="form-control">
              <label className="label">
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
              <label className="label">
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

            <div className="form-control">
              <label className="label">
                <span className="label-text">Role</span>
              </label>
              <select 
                className="select select-bordered w-full" 
                value={role} 
                onChange={(e) => setRole(e.target.value)}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>

            {error && (
              <div className="flex flex-col gap-2">
                <p className="text-error text-sm text-center">{error}</p>
                {error.includes('already exists') && (
                  <Link href="/login" className="btn btn-sm btn-primary btn-outline w-full">
                    Sign In
                  </Link>
                )}
              </div>
            )}

            <div className="form-control mt-6 space-y-2">
              <button 
                type="submit" 
                className="btn btn-primary w-full"
                disabled={loading}
              >
                {loading ? <span className="loading loading-spinner"></span> : 'Sign Up'}
              </button>
              
              <div className="divider">OR</div>
              
              <button
                type="button"
                className="btn btn-outline w-full"
                onClick={handleGoogleSignup}
                disabled={loading}
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign up with Google
              </button>
            </div>
          </form>

          <div className="text-center mt-4">
            <span className="text-sm">Already have an account? </span>
            <Link href="/login" className="link link-primary text-sm">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
