import { onIdTokenChanged, User } from 'firebase/auth';
import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * Whether the signed-in account's `users/{uid}` profile exists. `error` means
 * it could not be written even after retrying: the account is kept, and the
 * app shows a retry instead of quietly signing the person out (USER-001).
 */
export type ProfileStatus = 'none' | 'pending' | 'ready' | 'error';

type AuthContextValue = {
  initializing: boolean;
  profileStatus: ProfileStatus;
  retryProfile: () => Promise<void>;
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
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>(isDemoMode ? 'ready' : 'none');
  // The account the profile status describes. The token listener also fires on
  // the hourly refresh; only a different account goes back to `pending`, so a
  // refresh never flashes the loading screen.
  const profileUid = useRef<string | null>(null);

  useEffect(() => {
    if (isDemoMode || !hasFirebaseConfig) return undefined;
    return onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        profileUid.current = null;
        setProfileStatus('none');
        setRole(null);
        setInitializing(false);
        return;
      }
      if (profileUid.current !== nextUser.uid) {
        profileUid.current = nextUser.uid;
        setProfileStatus('pending');
      }
      // The profile and the role are resolved separately: a profile that could
      // not be written must not also turn an administrator into a user.
      const profile = ensureUserProfile(nextUser).then(
        () => { if (profileUid.current === nextUser.uid) setProfileStatus('ready'); },
        (error) => {
          console.warn('[Auth] Unable to create the user profile', error);
          if (profileUid.current === nextUser.uid) setProfileStatus('error');
        },
      );
      try {
        setRole(await getUserRole(nextUser));
      } catch (error) {
        console.warn('[Auth] Unable to resolve the current user role', error);
        setRole('user');
      } finally {
        await profile;
        setInitializing(false);
      }
    });
  }, []);

  const retryProfile = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return;
    setProfileStatus('pending');
    try {
      await ensureUserProfile(current);
      if (profileUid.current === current.uid) setProfileStatus('ready');
    } catch (error) {
      console.warn('[Auth] Retrying the user profile failed', error);
      if (profileUid.current === current.uid) setProfileStatus('error');
    }
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
    profileStatus,
    retryProfile,
    signOut: async () => {
      await disableNativeLineListener().catch(() => undefined);
      await signOutCurrentUser();
      // Demo mode has no Firebase auth event to clear this state, so clear it explicitly as well.
      setUser(null);
      setRole(null);
    },
  }), [initializing, profileStatus, retryProfile, role, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return value;
}
