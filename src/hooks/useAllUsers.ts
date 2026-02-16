import { useState, useEffect } from 'react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { UserProfile } from '@/types/auth';

/**
 * Hook for admin/settings pages that need ALL users (including pending/rejected)
 * ONLY use this in admin-protected pages
 */
export function useAllUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch ALL users for admin management
    const q = query(collection(db, 'users'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      } as UserProfile));
      
      // Sort client-side
      usersList.sort((a, b) => {
        const nameA = a.displayName || a.email || '';
        const nameB = b.displayName || b.email || '';
        return nameA.localeCompare(nameB);
      });
      
      setUsers(usersList);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching users:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { users, loading };
}
