import {getFunctions, httpsCallable} from 'firebase/functions';
import {Platform} from 'react-native';

import {appCheckErrorMessage, ensureAppCheckReady} from '@/lib/app-check';
import {isDemoMode} from '@/lib/demo-mode';
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
export type AppCheckClientReport = {
  applicable: boolean;
  ok: boolean;
  platform: string;
  reason: string;
};

const refreshHealthCall = httpsCallable<
  {appCheck: AppCheckClientReport},
  {statuses: unknown[]}
>(functions, 'adminRefreshSystemStatus');

/**
 * Mints an App Check token before the health refresh and reports the outcome.
 *
 * Every other callable in the app calls `ensureAppCheckReady()` first; this
 * module used not to, which is why the admin request always arrived without a
 * token and App Check reported a permanent fault. Running it here both fixes
 * that and turns the attestation result into a real observation: the Functions
 * SDK attaches the minted token to the call that follows, so the server can
 * verify the signature and the status moves when attestation actually breaks.
 *
 * A failure here is reported, never thrown — App Check being unhappy must not
 * take down the rest of the health page.
 */
async function buildAppCheckReport(): Promise<AppCheckClientReport> {
  const platform = Platform.OS;
  if (isDemoMode || (platform !== 'web' && platform !== 'android')) {
    return {applicable: false, ok: false, platform, reason: ''};
  }
  try {
    await ensureAppCheckReady();
    return {applicable: true, ok: true, platform, reason: ''};
  } catch (error) {
    return {applicable: true, ok: false, platform, reason: attestationFailureReason(error)};
  }
}

/**
 * Turns an attestation failure into something an operator can act on.
 *
 * `appCheckErrorMessage` is end-user copy ("close and reopen the app"), which
 * tells an admin nothing about which of Play Integrity, the debug token, or
 * the reCAPTCHA origin allowlist actually rejected the request. The Firebase
 * error code is the diagnostic, so it leads.
 */
function attestationFailureReason(error: unknown) {
  const code = error && typeof error === 'object'
    ? String((error as {code?: unknown}).code ?? '').trim()
    : '';
  const message = appCheckErrorMessage(error);
  return code ? `${code} — ${message}` : message;
}
const dashboardCountsCall = httpsCallable<Record<string, never>, {counts: Record<string, number>}>(functions, 'adminDashboardCounts');
const seedDemoDataCall = httpsCallable<Record<string, never>, {seeded: boolean}>(functions, 'adminSeedDemoData');
const monitoringDataCall = httpsCallable<
  {view: 'feedback' | 'recommendations' | 'scanLogs' | 'systemStatus'},
  {items: Record<string, unknown>[]}
>(functions, 'adminMonitoringData');

/** One group of real documents behind a recommendation's `contextSources` tag. */
export type RecommendationContextGroup = {
  collection: string;
  error?: string;
  items: Record<string, unknown>[];
  label: string;
  tag: string;
  timeField: string;
};

export type RecommendationAudit = {
  contextGroups: RecommendationContextGroup[];
  /**
   * False today: `aiRecommendations` documents never persist the context that
   * produced them, so `contextGroups` is rebuilt from the owner's live
   * collections and the UI has to say so.
   */
  contextStoredOnDocument: boolean;
  owner: {displayName: string; email: string; uid: string};
  reconstructed: boolean;
  recommendation: Record<string, unknown>;
  window: {fromMillis: number; toMillis: number};
};

const recommendationAuditCall = httpsCallable<{path: string}, RecommendationAudit>(
  functions, 'adminRecommendationAudit',
);

export const adminCloud = {
  listUsers: async () => (await listUsersCall({})).data.users,
  setUserDisabled: async (uid: string, disabled: boolean) => (await setDisabledCall({uid, disabled})).data,
  createPasswordResetLink: async (email: string) => (await resetLinkCall({email})).data,
  refreshSystemStatus: async () => {
    // Order matters: the token has to exist before the callable is invoked,
    // otherwise the SDK sends the request without an App Check header.
    const appCheck = await buildAppCheckReport();
    return (await refreshHealthCall({appCheck})).data;
  },
  dashboardCounts: async () => (await dashboardCountsCall({})).data.counts,
  seedDemoData: async () => (await seedDemoDataCall({})).data,
  monitoringData: async (view: 'feedback' | 'recommendations' | 'scanLogs' | 'systemStatus') =>
    (await monitoringDataCall({view})).data.items,
  recommendationAudit: async (path: string) => (await recommendationAuditCall({path})).data,
};
