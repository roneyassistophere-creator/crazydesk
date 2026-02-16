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
import { UserProfile, UserRole, UserStatus } from '@/types/auth';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  logout: () => Promise<void>;
  createProfile: (uid: string, data: Omit<UserProfile, 'createdAt' | 'uid'>) => Promise<void>;
  refreshProfile: () => Promise<void>;
  switchRole: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  logout: async () => {},
  createProfile: async () => {},
  refreshProfile: async () => {},
  switchRole: async () => {},
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
            
            // Backwards compatibility: ensure allowedRoles exists
            const currentRole = data.role as UserRole;
            let allowedRoles = (data.allowedRoles || [currentRole]) as UserRole[];
            
            // Check for intended role from login page
            const intendedRole = typeof window !== 'undefined' ? sessionStorage.getItem('intendedRole') as UserRole : null;
            let activeRole = currentRole;

            if (intendedRole && allowedRoles.includes(intendedRole) && intendedRole !== currentRole) {
               activeRole = intendedRole;
               // Update Firestore immediately if switching role on login
               await setDoc(docRef, { role: activeRole }, { merge: true });
               if (typeof window !== 'undefined') sessionStorage.removeItem('intendedRole');
            }

            // Ensure admin is always approved and has admin role
            if (currentUser.email === 'roney.assistophere@gmail.com') {
               const adminRole = 'ADMIN';
               const currentAllowedRoles = Array.isArray(data.allowedRoles) ? data.allowedRoles : [];
               
               if (data.role !== adminRole || data.status !== 'approved' || !currentAllowedRoles.includes(adminRole)) {
                  const updatedAllowedRoles = Array.from(new Set([...currentAllowedRoles, adminRole]));
                  
                  await setDoc(docRef, { 
                    ...data, 
                    role: adminRole, 
                    allowedRoles: updatedAllowedRoles,
                    status: 'approved',
                    photoURL: currentUser.photoURL || data.photoURL, // Sync photo
                  }, { merge: true });

                  setProfile({
                    uid: currentUser.uid,
                    ...data,
                    role: adminRole,
                    allowedRoles: updatedAllowedRoles,
                    status: 'approved',
                    photoURL: currentUser.photoURL || data.photoURL,
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                  } as UserProfile);
                  setLoading(false);
                  return;
               }
            }

            // Regular user profile setup
            const profileData = {
              uid: currentUser.uid,
              ...data,
              // Ensure allowedRoles is always an array
              allowedRoles: Array.isArray(data.allowedRoles) ? data.allowedRoles : [data.role],
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
            } as UserProfile;

            // Sync Photo URL from Firebase Auth (Google) to Firestore if different
            if (currentUser.photoURL && profileData.photoURL !== currentUser.photoURL) {
              profileData.photoURL = currentUser.photoURL;
              await setDoc(docRef, { photoURL: currentUser.photoURL }, { merge: true });
            }

            setProfile(profileData);
          } else {
             // If user exists in Auth but not in Firestore, we should NOT recreate them automatically.
             // This handles the "deleted user" scenario.
             // However, we must ensure the Super Admin always has a profile.
             if (currentUser.email === 'roney.assistophere@gmail.com') {
                const adminRole = 'ADMIN';
                const newProfile = {
                  uid: currentUser.uid,
                  email: currentUser.email,
                  displayName: currentUser.displayName,
                  photoURL: currentUser.photoURL, // Include photo from Google
                  role: adminRole,
                  allowedRoles: [adminRole],
                  status: 'approved' as UserStatus,
                  createdAt: serverTimestamp(),
                };
                
                await setDoc(docRef, newProfile);
                
                setProfile({
                  uid: currentUser.uid,
                  email: currentUser.email,
                  displayName: currentUser.displayName,
                  photoURL: currentUser.photoURL,
                  role: adminRole,
                  allowedRoles: [adminRole],
                  status: 'approved',
                  createdAt: new Date(),
                } as UserProfile);
             } else {
                // For normal users, if doc doesn't exist, profile is null.
                setProfile(null);
             }
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

  const refreshProfile = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setProfile({
          uid: user.uid,
          ...data,
          allowedRoles: data.allowedRoles || [data.role],
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        } as UserProfile);
      }
    } catch (error) {
      console.error("Error refreshing user profile:", error);
    }
  };

  const createProfile = async (uid: string, data: Omit<UserProfile, 'createdAt' | 'uid' | 'allowedRoles'>) => {
    try {
      const userRef = doc(db, 'users', uid);
      const allowedRoles = [data.role];
      
      const newProfile = {
        uid,
        ...data,
        allowedRoles,
        createdAt: serverTimestamp(),
      };
      
      // @ts-ignore
      await setDoc(userRef, newProfile);
      
      // @ts-ignore
      setProfile({
          uid,
          ...data,
          allowedRoles,
          // Use current date strictly for local state update to avoid waiting for server timestamp
          createdAt: new Date(),
      } as UserProfile);
    } catch (error) {
      console.error("Error creating user profile:", error);
      throw error;
    }
  };

  const switchRole = async (newRole: UserRole) => {
    if (!user || !profile) return;
    
    if (!profile.allowedRoles.includes(newRole)) {
      console.error("User does not have permission to switch to this role");
      return;
    }

    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { role: newRole }, { merge: true });
      
      setProfile(prev => prev ? ({
        ...prev,
        role: newRole
      }) : null);
    } catch (error) {
      console.error("Error switching role:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, createProfile, refreshProfile, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}
