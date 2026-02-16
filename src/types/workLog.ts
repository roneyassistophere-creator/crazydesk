export interface BreakSession {
  startTime: any; // Firestore Timestamp
  endTime?: any; // Firestore Timestamp | null
  durationMinutes?: number;
}

export interface WorkLog {
  id: string;
  userId: string;
  userDisplayName: string;
  checkInTime: any; // Firestore Timestamp
  checkOutTime?: any; // Firestore Timestamp | null
  durationMinutes?: number;
  breakDurationMinutes?: number; // Total break time
  breaks?: BreakSession[];
  report?: string;
  attachments?: string[];
  status: 'active' | 'break' | 'completed';
}
