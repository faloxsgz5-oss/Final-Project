import { onIdTokenChanged, User } from 'firebase/auth';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import {demoUid, isDemoMode} from '@/lib/demo-mode';
import { auth } from '@/lib/firebase';
import { AppRole, ensureUserProfile, getUserRole, signOutCurrentUser } from '@/services/auth';

type AuthContextValue = {
  initializing: boolean;
  role: AppRole | null;
  user: User | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const demoUser = {
  displayName: 'SmartLife Demo',
  email: 'demo@smartlife.local',
  uid: demoUid,
} as User;

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(isDemoMode ? demoUser : null);
  const [role, setRole] = useState<AppRole | null>(isDemoMode ? 'user' : null);
  const [initializing, setInitializing] = useState(!isDemoMode);

  useEffect(() => {
    if (isDemoMode) return undefined;
    return onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);
      try {
        if (nextUser) await ensureUserProfile(nextUser);
        setRole(nextUser ? await getUserRole(nextUser) : null);
      } catch (error) {
        console.warn('[Auth] Unable to resolve the current user role', error);
        setRole(nextUser ? 'user' : null);
      } finally {
        setInitializing(false);
      }
    });
  }, []);

  const value = useMemo(() => ({
    user,
    role,
    initializing,
    signOut: async () => {
      await signOutCurrentUser();
      // Demo mode has no Firebase auth event to clear this state, so clear it explicitly as well.
      setUser(null);
      setRole(null);
    },
  }), [initializing, role, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return value;
}
