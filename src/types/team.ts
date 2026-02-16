import { Timestamp } from 'firebase/firestore';

export interface TimeSlot {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  startTime: string; // "HH:mm" format (24h)
  endTime: string;   // "HH:mm" format (24h)
  timezone: string;  // e.g., "America/New_York"
}

export interface MemberProfile {
  id: string; // Document ID (usually same as user uid)
  uid: string;
  displayName: string;
  email: string;
  role: string;
  photoURL?: string;
  
  // Team Availability specific fields
  jobTitle?: string;
  scopeOfWork?: string; // Markdown supported description
  availableSlots?: TimeSlot[];
  isOnline?: boolean; // Real-time status if we implement presence, or computed from slots
  
  updatedAt?: Timestamp;
}

export const DAYS_OF_WEEK = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
] as const;
