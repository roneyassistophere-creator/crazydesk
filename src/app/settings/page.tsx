'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { UserProfile, UserRole, UserStatus } from '@/types/auth';
import { CheckCircle, XCircle, Clock, Users, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Settings() {
  const { profile } = useAuth();
  const router = useRouter();
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'MANAGER' | 'TEAM_MEMBER'>('ALL');

  // Redirect non-admin/manager users
  useEffect(() => {
    if (profile && profile.role !== 'ADMIN' && profile.role !== 'MANAGER') {
      router.push('/dashboard');
    }
  }, [profile, router]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      // Fetch all users (simplest approach to handle mixed states correctly)
      const usersQuery = query(collection(db, 'users'));
      const snapshot = await getDocs(usersQuery);
      
      const allUsers = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          createdAt: data.createdAt?.toDate?.() || new Date(),
        } as UserProfile;
      });

      // Filter for Pending Requests section: anyone with items in requestedRoles
      // AND status isn't rejected (unless they re-requested, which sets status to pending)
      const pendingList = allUsers.filter(u => 
        u.requestedRoles && 
        u.requestedRoles.length > 0 &&
        u.status !== 'rejected' // Optional: if rejected users can't have pending requests
      );
      
      // Filter for Approved Users section: anyone with status 'approved'
      // Exclude admin from the list
      const approvedList = allUsers.filter(u => 
        u.status === 'approved' && 
        u.role !== 'ADMIN'
      );

      setPendingUsers(pendingList);
      setApprovedUsers(approvedList);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.role === 'ADMIN' || profile?.role === 'MANAGER') {
      fetchUsers();
    }
  }, [profile]);

  const handleApproveRoleRequest = async (user: UserProfile, roleToApprove: UserRole) => {
    setActionLoading(`${user.uid}-${roleToApprove}`);
    try {
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
      await fetchUsers();
    } catch (error) {
      console.error('Error approving role request:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectRoleRequest = async (userId: string, roleToReject: UserRole) => {
    setActionLoading(`${userId}-${roleToReject}`);
    try {
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
      await fetchUsers();
    } catch (error) {
       console.error('Error rejecting role request:', error);
    } finally {
       setActionLoading(null);
    }
  };

  const handleToggleRole = async (user: UserProfile, roleToToggle: UserRole) => {
    // Prevent removing the last role or current active role
    if (user.allowedRoles.includes(roleToToggle) && user.allowedRoles.length <= 1) return;
    if (roleToToggle === user.role) return;

    setActionLoading(user.uid);
    try {
      let newAllowedRoles = [...(user.allowedRoles || [])];
      
      if (newAllowedRoles.includes(roleToToggle)) {
        newAllowedRoles = newAllowedRoles.filter(r => r !== roleToToggle);
      } else {
        newAllowedRoles.push(roleToToggle);
      }
      
      await updateDoc(doc(db, 'users', user.uid), {
        allowedRoles: newAllowedRoles
      });
      await fetchUsers();
    } catch (error) {
      console.error('Error toggling role:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) return;
    
    setActionLoading(userId);
    try {
      await deleteDoc(doc(db, 'users', userId));
      // Refresh list
      setPendingUsers(prev => prev.filter(u => u.uid !== userId));
      setApprovedUsers(prev => prev.filter(u => u.uid !== userId));
    } catch (error) {
      console.error('Error deleting user:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleApproveRole = async (user: UserProfile, roleToApprove: UserRole) => {
    setActionLoading(user.uid);
    try {
      const currentAllowed = user.allowedRoles || [];
      if (!currentAllowed.includes(roleToApprove)) {
        const newAllowed = [...currentAllowed, roleToApprove];
        await updateDoc(doc(db, 'users', user.uid), {
           allowedRoles: newAllowed,
           status: 'approved',
           role: user.role === roleToApprove ? user.role : (user.role || roleToApprove)
        });
        await fetchUsers();
      }
    } catch (error) {
      console.error('Error approving role:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeRole = async (user: UserProfile, roleToRevoke: UserRole) => {
    if (!window.confirm(`Are you sure you want to revoke ${roleToRevoke} access for ${user.displayName}?`)) return;

    setActionLoading(user.uid);
    try {
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
      await fetchUsers();
    } catch (error) {
       console.error('Error revoking role:', error);
    } finally {
       setActionLoading(null);
    }
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
                          {/* Only show email for the first row of this user to reduce clutter, or keep it */}
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
                              onClick={() => handleApproveRoleRequest(user, requestedRole)}
                              disabled={actionLoading === `${user.uid}-${requestedRole}`}
                              className="btn btn-success btn-sm"
                            >
                              {actionLoading === `${user.uid}-${requestedRole}` ? (
                                <span className="loading loading-spinner loading-xs"></span>
                              ) : (
                                <CheckCircle size={16} />
                              )}
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectRoleRequest(user.uid, requestedRole)}
                              disabled={actionLoading === `${user.uid}-${requestedRole}`}
                              className="btn btn-error btn-sm"
                            >
                              {actionLoading === `${user.uid}-${requestedRole}` ? (
                                <span className="loading loading-spinner loading-xs"></span>
                              ) : (
                                <XCircle size={16} />
                              )}
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
                              onClick={() => handleRevokeRole(user, 'MANAGER')}
                              className="btn btn-xs btn-ghost text-error hover:bg-error/10"
                              disabled={!!actionLoading}
                            >
                              Revoke
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => handleApproveRole(user, 'MANAGER')}
                            className="btn btn-xs btn-outline btn-success"
                            disabled={!!actionLoading}
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
                              onClick={() => handleRevokeRole(user, 'TEAM_MEMBER')}
                              className="btn btn-xs btn-ghost text-error hover:bg-error/10"
                              disabled={!!actionLoading}
                            >
                              Revoke
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => handleApproveRole(user, 'TEAM_MEMBER')}
                            className="btn btn-xs btn-outline btn-accent"
                            disabled={!!actionLoading}
                          >
                            Grant Access
                          </button>
                        )}
                      </td>

                      {/* Delete Action - Only for ADMIN */}
                      <td>
                        {profile?.role === 'ADMIN' && (
                          <button 
                            onClick={() => handleDeleteUser(user.uid)}
                            className="btn btn-ghost btn-xs text-error tooltip"
                            data-tip="Delete User"
                            disabled={!!actionLoading}
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
    </div>
  );
}
