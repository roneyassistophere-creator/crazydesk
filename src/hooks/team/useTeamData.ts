import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { MemberProfile } from '@/types/team';
import { useUsers } from '@/hooks/useUsers';

export function useTeamData() {
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const { users, loading: isUsersLoading } = useUsers();

  useEffect(() => {
    if (isUsersLoading || !users.length) return; // Wait for users

    const unsubscribe = onSnapshot(collection(db, 'member_profiles'), (snapshot) => {
       const profilesMap: Record<string, Partial<MemberProfile>> = {};
       snapshot.forEach(doc => {
           profilesMap[doc.id] = doc.data() as Partial<MemberProfile>;
       });

       // ... compute logic
       const now = new Date();
       const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
       const currentMin = now.getHours() * 60 + now.getMinutes();

       const computedMembers = users.map(u => {
           const profile = profilesMap[u.uid] || {};
           const slots = profile.availableSlots || [];
           
           let isActive = false;
           // Simple check for "Active Now"
           if (slots.length > 0) {
               isActive = slots.some((slot: any) => {
                   if (slot.day !== currentDay) return false;
                   const [sh, sm] = slot.startTime.split(':').map(Number);
                   const [eh, em] = slot.endTime.split(':').map(Number);
                   const start = sh * 60 + sm;
                   const end = eh * 60 + em;
                   return currentMin >= start && currentMin < end;
               });
           }

           const finalPhotoURL = u.photoURL || profile.photoURL;
           
           return {
               id: u.uid,
               uid: u.uid,
               isOnline: isActive,
               ...profile,
               // Ensure core user data from users collection takes priority over member_profiles
               displayName: u.displayName || u.email || 'Unknown User',
               email: u.email || '',
               role: u.role,
               photoURL: finalPhotoURL,
               whatsapp: u.whatsapp,
           } as MemberProfile;
       });

       // Sort: Active first, then by next available slot (simplified sort for now)
       computedMembers.sort((a, b) => {
           if (a.isOnline && !b.isOnline) return -1;
           if (!a.isOnline && b.isOnline) return 1;
           return 0; // Keep original order or sort by name
       });
       
       setMembers(computedMembers);
    }, (error) => {
      console.error('useTeamData onSnapshot error:', error);
    });

    return () => unsubscribe();
  }, [users, isUsersLoading]);

  return { members, loading: isUsersLoading };
}