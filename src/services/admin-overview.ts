import {collection, getCountFromServer} from 'firebase/firestore';

import {db} from '@/lib/firebase';
import {isDemoMode} from '@/lib/demo-mode';

/**
 * Per-user document counts that power the overview charts.
 *
 * Uses aggregate `count()` queries rather than fetching documents: Firestore
 * bills one read per 1,000 counted documents, so charting ten users costs a
 * handful of reads instead of thousands. Counts are path-scoped per user, which
 * `firestore.rules` already grants admins, so no callable is involved.
 */

export type AdminUserCounts = {
  activities: number;
  notes: number;
  schedules: number;
  transactions: number;
  uid: string;
};

/** Bounds fan-out: 4 count queries per user, so 15 users is 60 requests. */
export const OVERVIEW_USER_LIMIT = 15;

const COLLECTIONS = ['activities', 'schedules', 'notes', 'transactions'] as const;

async function countFor(uid: string, name: (typeof COLLECTIONS)[number]) {
  try {
    const snapshot = await getCountFromServer(collection(db, 'users', uid, name));
    return snapshot.data().count;
  } catch {
    // One unreadable collection must not blank the whole chart.
    return 0;
  }
}

async function countsForUser(uid: string): Promise<AdminUserCounts> {
  const [activities, schedules, notes, transactions] = await Promise.all(
    COLLECTIONS.map((name) => countFor(uid, name)),
  );
  return {activities, notes, schedules, transactions, uid};
}

function demoCounts(uids: string[]): AdminUserCounts[] {
  return uids.map((uid, index) => ({
    activities: 4 - (index % 3),
    notes: 3 + (index % 4),
    schedules: 6 - (index % 2),
    transactions: 5 + (index % 3),
    uid,
  }));
}

/**
 * Counts for up to `OVERVIEW_USER_LIMIT` users. The caller is told how many
 * were skipped so the UI can say so instead of implying full coverage.
 */
export async function adminOverviewCounts(uids: string[]): Promise<{
  counts: AdminUserCounts[];
  skippedUsers: number;
}> {
  const considered = uids.slice(0, OVERVIEW_USER_LIMIT);
  const skippedUsers = Math.max(0, uids.length - considered.length);
  if (isDemoMode) return {counts: demoCounts(considered), skippedUsers};
  const counts = await Promise.all(considered.map(countsForUser));
  return {counts, skippedUsers};
}
