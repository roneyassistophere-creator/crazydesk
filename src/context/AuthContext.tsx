'use client';

import { 
  createContext, 
  useContext, 
  useEffect, 
  useState 
} from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { UserProfile, UserRole } from '@/types/auth'; // updated path

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  createProfile: (uid: string, data: Omit<UserProfile, 'createdAt' | 'uid'>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  logout: async () => {},
  createProfile: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Fetch user profile from Firestore
        try {
          const docRef = doc(db, 'users', currentUser.uid);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            setProfile({
              uid: currentUser.uid,
              ...data,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
            } as UserProfile);
          } else {
            console.log("No profile found for user!");
            // Handle profile missing case if needed
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        }
      } else {
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setProfile(null);
  };

  const createProfile = async (uid: string, data: Omit<UserProfile, 'createdAt' | 'uid'>) => {
    try {
      const userRef = doc(db, 'users', uid);
      const newProfile = {
        uid,
        ...data,
        createdAt: serverTimestamp(),
      };
      // @ts-ignore
      await setDoc(userRef, newProfile);
      // @ts-ignore
      setProfile({
          uid,
          ...data,
          // Use current date strictly for local state update to avoid waiting for server timestamp
          createdAt: new Date(),
      } as UserProfile);
    } catch (error) {
      console.error("Error creating user profile:", error);
      throw error;
    }
  };


  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, createProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
