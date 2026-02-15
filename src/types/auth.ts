export type UserRole = 'ADMIN' | 'MANAGER' | 'EMPLOYEE' | 'CLIENT';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  createdAt: Date;
}
