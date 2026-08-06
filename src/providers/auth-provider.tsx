import { onIdTokenChanged, User } from 'firebase/auth';
import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import {AppState} from 'react-native';

import {demoUid, hasFirebaseConfig, isDemoMode} from '@/lib/demo-mode';
import { auth } from '@/lib/firebase';
import { AppRole, ensureUserProfile, getUserRole, signOutCurrentUser } from '@/services/auth';
import {syncDeadlineNotifications} from '@/services/deadline-notifications';
import {
  disableNativeLineListener,
  subscribeToNativeLineNotifications,
  syncLineAutoImport,
} from '@/services/line-import-service';

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
  const [initializing, setInitializing] = useState(!isDemoMode && hasFirebaseConfig);

  useEffect(() => {
    if (isDemoMode || !hasFirebaseConfig) return undefined;
    return onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);
      try {
        if (nextUser) {
          await ensureUserProfile(nextUser);
          setRole(await getUserRole(nextUser));
        } else {
          setRole(null);
        }
      } catch (error) {
        console.warn('[Auth] Unable to resolve the current user role', error);
        setRole(nextUser ? 'user' : null);
      } finally {
        setInitializing(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!user || isDemoMode || !hasFirebaseConfig) return;
    syncDeadlineNotifications(user.uid).catch((error) => {
      console.warn('[Notifications] Unable to sync deadline reminders', error);
    });
  }, [user]);

  useEffect(() => {
    if (!user || isDemoMode || !hasFirebaseConfig) return undefined;
    let mounted = true;
    let nativeSubscription: {remove(): void} | null = null;
    const sync = () => {
      if (!mounted) return;
      syncLineAutoImport(user.uid).catch((error) => {
        console.warn('[LINE Import] Unable to sync pending notifications', error);
      });
    };
    sync();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    subscribeToNativeLineNotifications(sync).then((subscription) => {
      if (mounted) nativeSubscription = subscription;
      else subscription?.remove();
    }).catch(() => undefined);
    return () => {
      mounted = false;
      appStateSubscription.remove();
      nativeSubscription?.remove();
    };
  }, [user]);

  const value = useMemo(() => ({
    user,
    role,
    initializing,
    signOut: async () => {
      await disableNativeLineListener().catch(() => undefined);
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
