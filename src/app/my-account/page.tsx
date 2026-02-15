'use client';
import { useAuth } from '@/context/AuthContext';
import { User, Mail, Shield, Calendar } from 'lucide-react';

export default function MyAccount() {
  const { user, profile } = useAuth();

  if (!user || !profile) {
    return (
      <div className="flex justify-center p-12">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-base-content">My Account</h1>

      <div className="card bg-base-100 shadow-xl max-w-2xl">
        <div className="card-body">
          <div className="flex items-center gap-4 mb-6">
            <div className="avatar placeholder">
              <div className="bg-neutral text-neutral-content rounded-full w-24">
                <span className="text-3xl">{profile.displayName?.charAt(0) || user.email?.charAt(0)}</span>
              </div>
            </div>
            <div>
              <h2 className="card-title text-2xl">{profile.displayName || 'User'}</h2>
              <p className="text-base-content/70">{user.email}</p>
            </div>
          </div>

          <div className="divider"></div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Shield className="text-primary" />
              <div>
                <p className="text-sm text-base-content/70">Role</p>
                <p className="font-semibold badge badge-primary">{profile.role}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Mail className="text-primary" />
              <div>
                <p className="text-sm text-base-content/70">Email</p>
                <p className="font-semibold">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Calendar className="text-primary" />
              <div>
                <p className="text-sm text-base-content/70">Member Since</p>
                <p className="font-semibold">
                  {profile.createdAt?.toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
          
          <div className="card-actions justify-end mt-6">
            <button className="btn btn-outline">Edit Profile</button>
          </div>
        </div>
      </div>
    </div>
  );
}
