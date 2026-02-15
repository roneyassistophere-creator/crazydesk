import { Timestamp } from 'firebase/firestore';

export interface MeetingParticipant {
  uid: string;
  displayName: string;
  email: string;
}

export interface Meeting {
  id: string;
  title: string;
  description?: string;
  meetingLink?: string;
  scheduledAt: Timestamp;
  createdBy: {
    uid: string;
    displayName: string;
    email: string;
  };
  participants: string[]; // List of UIDs for querying
  participantDetails: MeetingParticipant[]; // For display
  createdAt: Timestamp;
}
