'use client';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { User, Mail, Shield, Calendar, Phone, Check, X, Edit2 } from 'lucide-react';
import UserAvatar from '@/components/common/UserAvatar';
import ErrorBoundary from '@/components/common/ErrorBoundary';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

function MyAccountContent() {
  const { user, profile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    whatsapp: ''
  });

  // Initialize form data when entering edit mode
  const startEditing = () => {
    setFormData({
      displayName: profile?.displayName || '',
      whatsapp: profile?.whatsapp || ''
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!user || !profile) return;
    setLoading(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        displayName: formData.displayName,
        whatsapp: formData.whatsapp
      });
      setIsEditing(false);
    } catch (error) {
      console.error('Error updating profile:', error);
      alert('Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
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
            <UserAvatar 
              photoURL={profile.photoURL} 
              displayName={profile.displayName} 
              size="xl" 
            />
            <div className="flex-1">
              <h2 className="card-title text-2xl">{profile.displayName || 'User'}</h2>
              <p className="text-base-content/70">{user.email}</p>
              <p className="text-xs text-base-content/50 mt-1">
                Profile photo synced from your Google account
              </p>
            </div>
            {!isEditing && (
              <button 
                onClick={startEditing}
                className="btn btn-ghost btn-circle"
                title="Edit Profile"
              >
                <Edit2 size={20} />
              </button>
            )}
          </div>

          <div className="divider"></div>

          <div className="space-y-4">
            {/* Display Name Field */}
            <div className="flex items-center gap-3">
              <User className="text-primary mt-1 self-start" />
              <div className="flex-1">
                <p className="text-sm text-base-content/70">Display Name</p>
                {isEditing ? (
                  <input 
                    type="text" 
                    className="input input-bordered input-sm w-full max-w-xs mt-1" 
                    value={formData.displayName}
                    onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                    placeholder="Enter display name"
                  />
                ) : (
                  <p className="font-semibold">{profile.displayName || 'Not set'}</p>
                )}
              </div>
            </div>

            {/* WhatsApp Field */}
            <div className="flex items-center gap-3">
              <Phone className="text-primary mt-1 self-start" />
              <div className="flex-1">
                <p className="text-sm text-base-content/70">WhatsApp</p>
                {isEditing ? (
                  <input 
                    type="tel" 
                    className="input input-bordered input-sm w-full max-w-xs mt-1" 
                    value={formData.whatsapp}
                    onChange={(e) => setFormData({...formData, whatsapp: e.target.value})}
                    placeholder="+1234567890"
                  />
                ) : (
                  <p className="font-semibold">{profile.whatsapp || 'Not set'}</p>
                )}
              </div>
            </div>

            {/* Read-only Fields */}
            <div className="flex items-center gap-3">
              <Mail className="text-primary" />
              <div>
                <p className="text-sm text-base-content/70">Email (Read-only)</p>
                <p className="font-semibold">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Shield className="text-primary" />
              <div>
                <p className="text-sm text-base-content/70">Role</p>
                <p className="font-semibold badge badge-primary">{profile.role}</p>
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
          
          {isEditing && (
            <div className="card-actions justify-end mt-6 gap-2">
              <button 
                className="btn btn-ghost" 
                onClick={() => setIsEditing(false)}
                disabled={loading}
              >
                <X size={18} />
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? <span className="loading loading-spinner loading-xs"></span> : <Check size={18} />}
                Save Changes
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MyAccount() {
  return (
    <ErrorBoundary>
      <MyAccountContent />
    </ErrorBoundary>
  );
}
