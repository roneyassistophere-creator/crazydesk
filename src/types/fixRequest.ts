import { Timestamp } from 'firebase/firestore';

export type FixRequestStatus = 'open' | 'in_progress' | 'completed';
export type FixRequestPriority = 'low' | 'medium' | 'high' | 'critical';

export interface FixRequest {
  id: string;
  ticketNumber: number;
  title: string;
  description: string;
  link?: string | null;
  priority: FixRequestPriority;
  status: FixRequestStatus;
  
  // Who created the request
  requesterId: string;
  requesterName: string;
  requesterEmail: string;
  requesterAvatar?: string;
  
  // Who is supposed to fix it (optional, if assigned specifically)
  assignedToId?: string | null;
  assignedToName?: string | null;
  assignedToEmail?: string | null;
  
  // Who is actually working on it (claimed by)
  claimedById?: string | null;
  claimedByName?: string | null;
  claimedByAvatar?: string | null;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
