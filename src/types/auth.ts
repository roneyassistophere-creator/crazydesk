export type UserRole = 'ADMIN' | 'MANAGER' | 'TEAM_MEMBER' | 'CLIENT';
export type UserStatus = 'pending' | 'approved' | 'rejected';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;      // Current active role
  allowedRoles: UserRole[]; // List of all roles user has access to
  requestedRoles?: UserRole[]; // List of roles requested during signup
  status: UserStatus;
  photoURL?: string; // URL for user profile picture
  whatsapp?: string;
  createdAt: Date;
}
