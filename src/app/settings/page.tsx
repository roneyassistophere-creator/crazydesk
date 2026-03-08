'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, getDoc, doc, updateDoc, deleteDoc, onSnapshot, writeBatch, Timestamp } from 'firebase/firestore';
import { UserProfile, UserRole, UserStatus } from '@/types/auth';
import { CheckCircle, XCircle, Clock, Users, Trash2, AlertTriangle, UserPlus, UserMinus, Database } from 'lucide-react';
import { supabase } from '@/lib/supabase/config';
import toast from 'react-hot-toast';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { useRouter } from 'next/navigation';
import UserAvatar from '@/components/common/UserAvatar';

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

  // Database management state
  const [clearTarget, setClearTarget] = useState<'work_logs' | 'tracker_logs' | 'both'>('work_logs');
  const [clearUser, setClearUser] = useState<string>('all');
  const [clearDateFrom, setClearDateFrom] = useState('');
  const [clearDateTo, setClearDateTo] = useState('');
  const [clearLoading, setClearLoading] = useState(false);
  
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
    try {
      setActionLoading('modal');
      await action();
      closeModal();
    } catch (error) {
      console.error('Action failed:', error);
      // Modal stays open so user can see something went wrong
    } finally {
      setActionLoading(null);
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
      message: `Are you sure you want to permanently delete ${user.displayName}? This action cannot be undone and will remove their profile and related data.`,
      type: 'danger',
      confirmText: 'Delete Permanently',
      onConfirm: async () => {
        try {
          // Delete user profile
          await deleteDoc(doc(db, 'users', user.uid));
          // Also delete member_profile if it exists
          try { await deleteDoc(doc(db, 'member_profiles', user.uid)); } catch (_) {}
          console.log(`[Settings] User ${user.displayName} (${user.uid}) deleted successfully`);
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          console.error('[Settings] Failed to delete user:', err);
          alert(`Failed to delete user: ${errorMessage}`);
          throw err; // Re-throw so executeAction doesn't close modal
        }
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

  const handleDatabaseClear = async () => {
    if (!clearDateFrom || !clearDateTo) {
      toast.error('Please select a date range.');
      return;
    }
    const ymdFrom = clearDateFrom.split('-').map(Number);
    const ymdTo = clearDateTo.split('-').map(Number);
    const fromDate = new Date(ymdFrom[0], ymdFrom[1] - 1, ymdFrom[2], 0, 0, 0, 0);
    const toDate = new Date(ymdTo[0], ymdTo[1] - 1, ymdTo[2], 23, 59, 59, 999);
    const fromTs = Timestamp.fromDate(fromDate);
    const toTs = Timestamp.fromDate(toDate);
    const targetLabel = clearTarget === 'work_logs' ? 'Work Logs' : clearTarget === 'tracker_logs' ? 'Tracker Logs' : 'Work Logs + Tracker Logs';
    const userLabel = clearUser === 'all' ? 'all users' : (approvedUsers.find(u => u.uid === clearUser)?.displayName || clearUser);
    if (!confirm(`⚠️ Permanently delete ${targetLabel} for ${userLabel} from ${clearDateFrom} to ${clearDateTo}?\n\nThis cannot be undone.`)) return;
    setClearLoading(true);
    let totalDeleted = 0;
    try {
      const batchDelete = async (docs: any[]) => {
        const CHUNK = 450;
        for (let i = 0; i < docs.length; i += CHUNK) {
          const b = writeBatch(db);
          docs.slice(i, i + CHUNK).forEach(d => b.delete(d.ref));
          await b.commit();
        }
      };
      const clearCollection = async (colName: string, tsField: string) => {
        const constraints: any[] = [where(tsField, '>=', fromTs), where(tsField, '<=', toTs)];
        if (clearUser !== 'all') constraints.push(where('userId', '==', clearUser));
        const snap = await getDocs(query(collection(db, colName), ...constraints));
        if (snap.empty) return 0;
        if (colName === 'tracker_logs') {
          const files: string[] = [];
          snap.docs.forEach(d => {
            const data = d.data();
            const urls = [...(data.screenshotUrls || [data.screenshotUrl].filter(Boolean)), data.cameraImageUrl].filter(Boolean);
            urls.forEach((url: string) => { const f = url.split('/tracker-evidence/')[1]; if (f) files.push(f); });
          });
          if (files.length) await supabase.storage.from('tracker-evidence').remove(files);
        }
        await batchDelete(snap.docs);
        return snap.size;
      };
      if (clearTarget === 'work_logs' || clearTarget === 'both') totalDeleted += await clearCollection('work_logs', 'checkInTime');
      if (clearTarget === 'tracker_logs' || clearTarget === 'both') totalDeleted += await clearCollection('tracker_logs', 'timestamp');
      toast.success(`${totalDeleted} record(s) deleted successfully.`);
    } catch (e) {
      console.error('Database clear error:', e);
      toast.error('Failed to clear data. Check console for details.');
    } finally {
      setClearLoading(false);
    }
  };

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
                          <div className="flex items-center gap-2">
                             <UserAvatar 
                                photoURL={user.photoURL} 
                                displayName={user.displayName} 
                                size="xs" 
                                showRing={false}
                              />
                            {user.displayName || 'N/A'}
                          </div>
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
                          <UserAvatar 
                            photoURL={user.photoURL} 
                            displayName={user.displayName} 
                            size="sm" 
                            showRing={false}
                          />
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

      {/* Database Management Section */}
      <div className="card bg-base-200 shadow-xl border border-error/30">
        <div className="card-body">
          <div className="flex items-center gap-2 mb-1">
            <Database className="text-error" size={22} />
            <h2 className="card-title text-error">Database Management</h2>
          </div>
          <p className="text-sm text-base-content/60 mb-5">Permanently delete reporting or tracker log data within a date range. This cannot be undone.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="form-control">
              <label className="label pb-1"><span className="label-text font-semibold">Data Type</span></label>
              <select className="select select-bordered select-sm" value={clearTarget} onChange={e => setClearTarget(e.target.value as any)}>
                <option value="work_logs">Work Logs (Reporting)</option>
                <option value="tracker_logs">Tracker Logs (Web Tracker)</option>
                <option value="both">Both</option>
              </select>
            </div>
            <div className="form-control">
              <label className="label pb-1"><span className="label-text font-semibold">User</span></label>
              <select className="select select-bordered select-sm" value={clearUser} onChange={e => setClearUser(e.target.value)}>
                <option value="all">All Users</option>
                {approvedUsers.map(u => (
                  <option key={u.uid} value={u.uid}>{u.displayName || u.email}</option>
                ))}
              </select>
            </div>
            <div className="form-control">
              <label className="label pb-1"><span className="label-text font-semibold">From</span></label>
              <input type="date" className="input input-bordered input-sm" value={clearDateFrom} onChange={e => setClearDateFrom(e.target.value)} />
            </div>
            <div className="form-control">
              <label className="label pb-1"><span className="label-text font-semibold">To</span></label>
              <input type="date" className="input input-bordered input-sm" value={clearDateTo} onChange={e => setClearDateTo(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end mt-5">
            <button
              className="btn btn-error gap-2"
              onClick={handleDatabaseClear}
              disabled={clearLoading || !clearDateFrom || !clearDateTo}
            >
              {clearLoading ? <span className="loading loading-spinner loading-sm" /> : <Trash2 size={16} />}
              Clear Selected Data
            </button>
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
