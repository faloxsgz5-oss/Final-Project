import AsyncStorage from '@react-native-async-storage/async-storage';
import {useCallback, useEffect, useSyncExternalStore} from 'react';

import {monthKeyFromMillis} from '@/admin/analytics';
import {demoUid, isDemoMode} from '@/lib/demo-mode';
import {adminCloud, type AdminAuthUser} from '@/services/admin-cloud';

/**
 * Shared state for the admin dashboard's separated views.
 *
 * Each admin page is its own expo-router entry, so navigating between the
 * Calendar, Notes, and Finance views unmounts and remounts `AdminPortal`.
 * Component state would be lost on every switch, which is exactly the
 * "keep the selected month when switching users" requirement. Holding it in a
 * module-level store instead keeps the selection stable across remounts, and
 * mirroring it to AsyncStorage keeps it stable across a full reload too.
 */

const STORAGE_KEY = 'smartlife:admin-workspace';
const USERS_TTL_MS = 60_000;

export type AdminWorkspaceState = {
  monthKey: string;
  search: string;
  selectedUid: string | null;
};

export type AdminUsersState = {
  error: string | null;
  fetchedAtMs: number;
  loading: boolean;
  users: AdminAuthUser[];
};

let workspace: AdminWorkspaceState = {
  monthKey: monthKeyFromMillis(Date.now()),
  search: '',
  selectedUid: null,
};

let usersState: AdminUsersState = {error: null, fetchedAtMs: 0, loading: false, users: []};

const workspaceListeners = new Set<() => void>();
const usersListeners = new Set<() => void>();

function emit(listeners: Set<() => void>) {
  listeners.forEach((listener) => listener());
}

function setWorkspace(patch: Partial<AdminWorkspaceState>) {
  workspace = {...workspace, ...patch};
  emit(workspaceListeners);
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(workspace)).catch(() => undefined);
}

function setUsersState(patch: Partial<AdminUsersState>) {
  usersState = {...usersState, ...patch};
  emit(usersListeners);
}

let hydrated = false;

/** Restores the last selection once per app session. Failures are non-fatal. */
async function hydrateOnce() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw) as Partial<AdminWorkspaceState>;
    const monthKey = typeof stored.monthKey === 'string' && /^\d{4}-\d{2}$/.test(stored.monthKey)
      ? stored.monthKey
      : workspace.monthKey;
    workspace = {
      monthKey,
      search: typeof stored.search === 'string' ? stored.search : '',
      selectedUid: typeof stored.selectedUid === 'string' && stored.selectedUid ? stored.selectedUid : null,
    };
    emit(workspaceListeners);
  } catch {
    // A corrupt cache must never block the dashboard; fall back to defaults.
  }
}

function subscribeWorkspace(listener: () => void) {
  workspaceListeners.add(listener);
  return () => { workspaceListeners.delete(listener); };
}

function subscribeUsers(listener: () => void) {
  usersListeners.add(listener);
  return () => { usersListeners.delete(listener); };
}

const getWorkspace = () => workspace;
const getUsers = () => usersState;

export function useAdminWorkspace() {
  const state = useSyncExternalStore(subscribeWorkspace, getWorkspace, getWorkspace);

  useEffect(() => { hydrateOnce().catch(() => undefined); }, []);

  const selectUser = useCallback((uid: string | null) => setWorkspace({selectedUid: uid}), []);
  const setSearch = useCallback((search: string) => setWorkspace({search}), []);
  const setMonthKey = useCallback((monthKey: string) => setWorkspace({monthKey}), []);

  return {...state, selectUser, setMonthKey, setSearch};
}

/**
 * The Auth user list, fetched through the existing `adminListUsers` callable
 * and cached briefly so switching views does not re-hit Cloud Functions.
 */
const DEMO_USERS: AdminAuthUser[] = [{
  createdAt: new Date(0).toISOString(),
  disabled: false,
  displayName: 'Demo User',
  email: 'demo@smartlife.local',
  emailVerified: true,
  lastSignInAt: new Date(0).toISOString(),
  uid: demoUid,
}];

export async function loadAdminUsers(force = false) {
  // Demo mode has no Cloud Functions to call, so serve the same fixture user
  // the rest of the demo data hangs off.
  if (isDemoMode) {
    if (!usersState.users.length) {
      setUsersState({error: null, fetchedAtMs: Date.now(), loading: false, users: DEMO_USERS});
    }
    return DEMO_USERS;
  }

  const fresh = Date.now() - usersState.fetchedAtMs < USERS_TTL_MS;
  if (!force && fresh && usersState.users.length) return usersState.users;
  if (usersState.loading) return usersState.users;

  setUsersState({error: null, loading: true});
  try {
    const users = await adminCloud.listUsers();
    setUsersState({error: null, fetchedAtMs: Date.now(), loading: false, users});
    return users;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ไม่สามารถโหลดรายชื่อผู้ใช้ได้';
    setUsersState({error: message, loading: false});
    return usersState.users;
  }
}

export function useAdminUsers() {
  const state = useSyncExternalStore(subscribeUsers, getUsers, getUsers);

  useEffect(() => { loadAdminUsers().catch(() => undefined); }, []);

  const reload = useCallback(() => loadAdminUsers(true), []);
  return {...state, reload};
}

/** Test seam: drops cached users so a signed-out admin leaves nothing behind. */
export function resetAdminWorkspace() {
  workspace = {monthKey: monthKeyFromMillis(Date.now()), search: '', selectedUid: null};
  usersState = {error: null, fetchedAtMs: 0, loading: false, users: []};
  emit(workspaceListeners);
  emit(usersListeners);
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
}
