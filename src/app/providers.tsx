// Move Sidebar logic to a separate client wrapper or handled by route groups.
// But first, let's create the Auth Context Provider in a separate file to use in layout.
// Then I will fix the layout structure.

'use client';
import { AuthProvider } from '@/context/AuthContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
