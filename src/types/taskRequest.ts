import { Timestamp } from 'firebase/firestore';

export type TaskRequestStatus = 'pending' | 'accepted' | 'rejected';
export type TaskRequestType = 'simple' | 'list' | 'recurring';

export interface TaskRequest {
  id: string;
  // Who sent the request
  fromUserId: string;
  fromUserName: string;
  // Who it's for
  toUserId: string;
  toUserName: string;
  // Task details
  taskType: TaskRequestType;
  title: string;
  description?: string;
  priority?: string;
  deadline?: string;
  recurrence?: 'daily' | 'weekly' | 'monthly';
  // Status
  status: TaskRequestStatus;
  // Timestamps
  createdAt: Timestamp | null;
  respondedAt?: Timestamp | null;
  // Optional response note
  responseNote?: string;
}
