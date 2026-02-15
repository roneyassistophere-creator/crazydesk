'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { UserProfile, UserRole, UserStatus } from '@/types/auth';
import { CheckCircle, XCircle, Clock, Users, Trash2, AlertTriangle, UserPlus, UserMinus } from 'lucide-react';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { useRouter } from 'next/navigation';

interface ModalConfig {
  isOpen: boolean;
  title: string;
  message: string;
  type: 'danger' | 'success' | 'warning';
  confirmText: string;
  onConfirm: () => Promise<void>;
}

export default function Settings() {
  const { profile } = useAuth();
  const router = useRouter();
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'MANAGER' | 'TEAM_MEMBER'>('ALL');
  
  const [modalConfig, setModalConfig] = useState<ModalConfig>({
    isOpen: false,
    title: '',
    message: '',
    type: 'warning',
    confirmText: 'Confirm',
    onConfirm: async () => {},
  });

  // Redirect non-admin/manager users
  useEffect(() => {
    if (profile && profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
      router.push('/dashboard');
    }
  }, [profile, router]);

  useEffect(() => {
    if (!profile || (profile.role !== 'ADMIN' && profile.role !== 'MANAGER')) return;

    setLoading(true);
    // Realtime listener for users collection
    const usersQuery = query(collection(db, 'users'));
    
    const unsubscribe = onSnapshot(usersQuery, (snapshot) => {
      const allUsers = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as UserProfile;
      });

      // Filter for Pending Requests section
      const pendingList = allUsers.filter(u => 
        u.requestedRoles && 
        u.requestedRoles.length > 0 &&
        u.status !== 'rejected'
      );
      
      // Filter for Approved Users section
      const approvedList = allUsers.filter(u => 
        u.status === 'approved' && 
        u.role !== 'ADMIN'
      );

      setPendingUsers(pendingList);
      setApprovedUsers(approvedList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching users:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const closeModal = () => {
    setModalConfig(prev => ({ ...prev, isOpen: false }));
  };

  const executeAction = async (action: () => Promise<void>) => {
    // Determine user ID from context or pass it? For simplistic handling, we set a global loading state if needed
    // or rely on optimistic updates. Since onSnapshot handles UI, we just await the action.
    try {
      await action();
      closeModal();
    } catch (error) {
      console.error('Action failed:', error);
      // Maybe show toast error here?
    }
  };

  const confirmApproveRoleRequest = (user: UserProfile, roleToApprove: UserRole) => {
    setModalConfig({
      isOpen: true,
      title: 'Approve Request',
      message: `Are you sure you want to approve ${user.displayName}'s request for ${roleToApprove === 'TEAM_MEMBER' ? 'Team Member' : 'Manager'} access?`,
      type: 'success',
      confirmText: 'Approve Access',
      onConfirm: async () => {
        const currentAllowed = user.allowedRoles || [];
        const newAllowed = Array.from(new Set([...currentAllowed, roleToApprove]));
        
        const currentRequested = user.requestedRoles || [];
        const newRequested = currentRequested.filter(r => r !== roleToApprove);
        
        const updates: any = {
          allowedRoles: newAllowed,
          requestedRoles: newRequested,
          status: 'approved',
        };
  
        // Set role if it is currently not set to anything valid
        if (!user.role || !newAllowed.includes(user.role)) {
            updates.role = roleToApprove;
        }
  
        await updateDoc(doc(db, 'users', user.uid), updates);
      }
    });
  };

  const confirmRejectRoleRequest = (userId: string, roleToReject: UserRole, displayName: string | null) => {
    setModalConfig({
      isOpen: true,
      title: 'Reject Request',
      message: `Are you sure you want to reject the ${roleToReject === 'TEAM_MEMBER' ? 'Team Member' : 'Manager'} request from ${displayName || 'this user'}?`,
      type: 'danger',
      confirmText: 'Reject Request',
      onConfirm: async () => {
        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists()) return;
        
        const userData = userDoc.data() as UserProfile;
        const currentRequested = userData.requestedRoles || [];
        const newRequested = currentRequested.filter(r => r !== roleToReject);
        
        const updates: any = {
          requestedRoles: newRequested
        };
  
        const currentAllowedLength = (userData.allowedRoles || []).length;
        if (newRequested.length === 0 && currentAllowedLength === 0) {
            updates.status = 'rejected';
        }
  
        await updateDoc(userRef, updates);
      }
    });
  };

  const confirmRevokeRole = (user: UserProfile, roleToRevoke: UserRole) => {
    setModalConfig({
      isOpen: true,
      title: 'Revoke Access',
      message: `Are you sure you want to revoke ${roleToRevoke === 'TEAM_MEMBER' ? 'Team Member' : 'Manager'} access from ${user.displayName}? This will remove their ability to access ${roleToRevoke === 'TEAM_MEMBER' ? 'team' : 'management'} features.`,
      type: 'danger',
      confirmText: 'Revoke Access',
      onConfirm: async () => {
        const currentAllowed = user.allowedRoles || [];
        const newAllowed = currentAllowed.filter(r => r !== roleToRevoke);
        
        const updates: any = { allowedRoles: newAllowed };
        
        if (newAllowed.length === 0) {
           updates.status = 'rejected'; 
        }
        
        if (user.role === roleToRevoke) {
            if (newAllowed.length > 0) {
                updates.role = newAllowed[0];
            }
        }
  
        await updateDoc(doc(db, 'users', user.uid), updates);
      }
    });
  };

  const confirmDeleteUser = (user: UserProfile) => {
    setModalConfig({
      isOpen: true,
      title: 'Delete User',
      message: `Are you sure you want to permanently delete ${user.displayName}? This action cannot be undone and will remove all their data.`,
      type: 'danger',
      confirmText: 'Delete Permanently',
      onConfirm: async () => {
        await deleteDoc(doc(db, 'users', user.uid));
      }
    });
  };

  const confirmGrantRole = (user: UserProfile, roleToGrant: UserRole) => {
    setModalConfig({
      isOpen: true,
      title: 'Grant Access',
      message: `Do you want to grant ${roleToGrant === 'TEAM_MEMBER' ? 'Team Member' : 'Manager'} access to ${user.displayName}?`,
      type: 'success',
      confirmText: 'Grant Access',
      onConfirm: async () => {
        const currentAllowed = user.allowedRoles || [];
        if (!currentAllowed.includes(roleToGrant)) {
          const newAllowed = [...currentAllowed, roleToGrant];
          await updateDoc(doc(db, 'users', user.uid), {
             allowedRoles: newAllowed,
             status: 'approved',
             role: user.role === roleToGrant ? user.role : (user.role || roleToGrant)
          });
        }
      }
    });
  };

  const hasRole = (user: UserProfile, role: UserRole) => user.allowedRoles?.includes(role);

  if (!profile || (profile.role !== 'ADMIN' && profile.role !== 'MANAGER')) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-base-content">Settings</h1>
        <p className="text-base-content/60">Manage user access and roles</p>
      </div>

      {/* Pending Requests Section */}
      <div className="card bg-base-200 shadow-xl">
        <div className="card-body">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="text-warning" size={24} />
            <h2 className="card-title">Pending Requests</h2>
            {pendingUsers.length > 0 && (
              <span className="badge badge-warning">{pendingUsers.length}</span>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <span className="loading loading-spinner loading-lg"></span>
            </div>
          ) : pendingUsers.length === 0 ? (
            <div className="text-center py-8 text-base-content/50">
              <p>No pending requests</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Requested Role</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingUsers.flatMap(user => {
                    // Normalize requested roles
                    const requests = (user.requestedRoles && user.requestedRoles.length > 0)
                      ? user.requestedRoles
                      : (user.role ? [user.role] : []);
                      
                    // If no requests found (shouldn't happen for pending), show fallback
                    if (requests.length === 0) return [];

                    return requests.map((requestedRole, index) => (
                      <tr key={`${user.uid}-${requestedRole}`}>
                        <td className="font-medium">
                          {user.displayName || 'N/A'}
                        </td>
                        <td>{user.email}</td>
                        <td>
                          <span className="badge badge-outline">
                            {requestedRole === 'TEAM_MEMBER' ? 'Team Member' : requestedRole}
                          </span>
                        </td>
                        <td className="text-sm text-base-content/70">
                          {user.createdAt?.toLocaleDateString?.() || 'N/A'}
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <button
                              onClick={() => confirmApproveRoleRequest(user, requestedRole)}
                              className="btn btn-success btn-sm"
                            >
                              <CheckCircle size={16} />
                              Approve
                            </button>
                            <button
                              onClick={() => confirmRejectRoleRequest(user.uid, requestedRole, user.displayName)}
                              className="btn btn-error btn-sm"
                            >
                              <XCircle size={16} />
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Approved Users List with Granular Controls */}
      <div className="card bg-base-200 shadow-xl overflow-visible">
        <div className="card-body">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
            <h2 className="card-title">
              All Users ({approvedUsers.length})
            </h2>
            
            <div className="join">
              <button 
                className={`join-item btn btn-sm ${roleFilter === 'ALL' ? 'btn-active btn-primary' : ''}`}
                onClick={() => setRoleFilter('ALL')}
              >All</button>
              <button 
                className={`join-item btn btn-sm ${roleFilter === 'MANAGER' ? 'btn-active btn-primary' : ''}`}
                onClick={() => setRoleFilter('MANAGER')}
              >Managers</button>
              <button 
                className={`join-item btn btn-sm ${roleFilter === 'TEAM_MEMBER' ? 'btn-active btn-primary' : ''}`}
                onClick={() => setRoleFilter('TEAM_MEMBER')}
              >Members</button>
            </div>
          </div>
            
            <div className="overflow-x-auto">
              <table className="table table-zebra w-full">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Manager Access</th>
                    <th>Team Member Access</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvedUsers
                    .filter(u => roleFilter === 'ALL' || hasRole(u, roleFilter))
                    .map(user => (
                    <tr key={user.uid}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar placeholder">
                            <div className="bg-neutral text-neutral-content rounded-full w-8">
                              <span className="text-xs">{user.displayName?.[0] || 'U'}</span>
                            </div>
                          </div>
                          <div>
                            <div className="font-bold">{user.displayName}</div>
                            <div className="text-xs opacity-50">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      
                      {/* Manager Role Column */}
                      <td>
                        {hasRole(user, 'MANAGER') ? (
                          <div className="flex items-center gap-2">
                            <span className="badge badge-success badge-sm gap-1">
                              Active
                            </span>
                            <button 
                              onClick={() => confirmRevokeRole(user, 'MANAGER')}
                              className="btn btn-xs btn-ghost text-error hover:bg-error/10"
                            >
                              Revoke
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => confirmGrantRole(user, 'MANAGER')}
                            className="btn btn-xs btn-outline btn-success"
                          >
                            Grant Access
                          </button>
                        )}
                      </td>

                      {/* Team Member Role Column */}
                      <td>
                        {hasRole(user, 'TEAM_MEMBER') ? (
                          <div className="flex items-center gap-2">
                             <span className="badge badge-accent badge-sm gap-1">
                              Active
                            </span>
                            <button 
                              onClick={() => confirmRevokeRole(user, 'TEAM_MEMBER')}
                              className="btn btn-xs btn-ghost text-error hover:bg-error/10"
                            >
                              Revoke
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => confirmGrantRole(user, 'TEAM_MEMBER')}
                            className="btn btn-xs btn-outline btn-accent"
                          >
                            Grant Access
                          </button>
                        )}
                      </td>

                      {/* Delete Action - Only for ADMIN */}
                      <td>
                        {profile?.role === 'ADMIN' && (
                          <button 
                            onClick={() => confirmDeleteUser(user)}
                            className="btn btn-ghost btn-xs text-error tooltip"
                            data-tip="Delete User"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
        </div>
      </div>

      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        confirmText={modalConfig.confirmText}
        onClose={closeModal}
        onConfirm={() => executeAction(modalConfig.onConfirm)}
      />
    </div>
  );
}
