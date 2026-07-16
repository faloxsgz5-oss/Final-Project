import {getFunctions, httpsCallable} from 'firebase/functions';

import {firebaseApp} from '@/lib/firebase';

export type AdminAuthUser = {
  createdAt: string;
  disabled: boolean;
  displayName: string;
  email: string;
  emailVerified: boolean;
  lastSignInAt: string;
  uid: string;
};

const functions = getFunctions(firebaseApp, 'asia-southeast1');

const listUsersCall = httpsCallable<Record<string, never>, {users: AdminAuthUser[]}>(functions, 'adminListUsers');
const setDisabledCall = httpsCallable<{disabled: boolean; uid: string}, {disabled: boolean; uid: string}>(functions, 'adminSetUserDisabled');
const resetLinkCall = httpsCallable<{email: string}, {link: string}>(functions, 'adminCreatePasswordResetLink');
const refreshHealthCall = httpsCallable<Record<string, never>, {statuses: unknown[]}>(functions, 'adminRefreshSystemStatus');
const dashboardCountsCall = httpsCallable<Record<string, never>, {counts: Record<string, number>}>(functions, 'adminDashboardCounts');
const seedDemoDataCall = httpsCallable<Record<string, never>, {seeded: boolean}>(functions, 'adminSeedDemoData');
const monitoringDataCall = httpsCallable<
  {view: 'feedback' | 'recommendations' | 'scanLogs' | 'systemStatus'},
  {items: Record<string, unknown>[]}
>(functions, 'adminMonitoringData');

export const adminCloud = {
  listUsers: async () => (await listUsersCall({})).data.users,
  setUserDisabled: async (uid: string, disabled: boolean) => (await setDisabledCall({uid, disabled})).data,
  createPasswordResetLink: async (email: string) => (await resetLinkCall({email})).data,
  refreshSystemStatus: async () => (await refreshHealthCall({})).data,
  dashboardCounts: async () => (await dashboardCountsCall({})).data.counts,
  seedDemoData: async () => (await seedDemoDataCall({})).data,
  monitoringData: async (view: 'feedback' | 'recommendations' | 'scanLogs' | 'systemStatus') =>
    (await monitoringDataCall({view})).data.items,
};
