'use client';
import { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile, signInWithPopup } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase/config';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle } from 'lucide-react';

const ROLES = [
  { value: 'MANAGER', label: 'Manager', description: 'Manage teams and assign tasks' },
  { value: 'TEAM_MEMBER', label: 'Team Member', description: 'Collaborate and complete tasks' },
];

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('TEAM_MEMBER');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [existingAccount, setExistingAccount] = useState(false);
  const router = useRouter();

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError('');
    setExistingAccount(false);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const currentData = userSnap.data();
        const currentAllowed = currentData.allowedRoles || [];
        const currentRequested = currentData.requestedRoles || [];

        // If user already has this role approved, redirect them to dashboard
        if (currentAllowed.includes(role)) {
          await setDoc(userRef, { role }, { merge: true });
          router.push('/dashboard');
          return;
        }

        // Add to requestedRoles if not already there
        const newRequested = Array.from(new Set([...currentRequested, role]));
        
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
      } else {
        // Brand new user
        await setDoc(userRef, {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          role: role,
          requestedRoles: [role],
          allowedRoles: [],
          status: 'pending',
          createdAt: serverTimestamp(),
        });
      }
      
      setSignupComplete(true);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign up was cancelled.');
      } else {
        setError(err.message || 'Google sign up failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setExistingAccount(false);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName });

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName,
        role,
        requestedRoles: [role],
        allowedRoles: [],
        status: 'pending',
        createdAt: serverTimestamp(),
      });

      setSignupComplete(true);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setExistingAccount(true);
        setError('An account with this email already exists.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Use at least 6 characters.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
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
      <div className="flex min-h-screen items-center justify-center bg-base-200 p-4">
        <div className="card w-full max-w-sm bg-base-100 shadow-xl">
          <div className="card-body text-center">
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center">
                <CheckCircle className="w-10 h-10 text-success" />
              </div>
            </div>
            <h2 className="card-title justify-center text-2xl font-bold mb-2">Request Submitted!</h2>
            <p className="text-base-content/70 mb-6">
              Your request has been sent to the admin for approval. You'll receive access once it's approved.
            </p>
            <Link href="/" className="btn btn-primary w-full">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 p-4 relative">
      <Link href="/" className="btn btn-ghost btn-sm absolute top-4 left-4 gap-2">
        <ArrowLeft size={18} />
        Home
      </Link>
      <div className="card w-full max-w-sm bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title justify-center text-3xl font-bold mb-2">Create Account</h2>
          <p className="text-center text-base-content/60 text-sm mb-4">Join your team on Crazy Desk</p>
          
          <form onSubmit={handleSignup} className="space-y-3">
            <div className="form-control">
              <label className="label pb-1">
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
                placeholder="Min. 6 characters" 
                className="input input-bordered w-full" 
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="form-control">
              <label className="label pb-1">
                <span className="label-text">I want to join as</span>
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-base-200 rounded-lg">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={`btn btn-sm border-0 ${role === r.value ? 'btn-primary shadow-md' : 'btn-ghost text-base-content/70 hover:bg-base-300'}`}
                    onClick={() => setRole(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className={`alert ${existingAccount ? 'alert-info' : 'alert-error'} text-sm py-3`}>
                <span>{error}</span>
              </div>
            )}

            {existingAccount && (
              <Link href="/login" className="btn btn-primary btn-outline w-full btn-sm">
                Sign In Instead
              </Link>
            )}

            <div className="form-control pt-2 space-y-2">
              <button 
                type="submit" 
                className="btn btn-primary w-full"
                disabled={loading}
              >
                {loading ? <span className="loading loading-spinner loading-sm"></span> : 'Create Account'}
              </button>
              
              <div className="divider text-xs my-1">OR</div>
              
              <button
                type="button"
                className="btn btn-outline w-full"
                onClick={handleGoogleSignup}
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
            <span className="text-sm text-base-content/60">Already have an account? </span>
            <Link href="/login" className="link link-primary text-sm font-medium">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
