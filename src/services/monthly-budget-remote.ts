import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import {db} from '@/lib/firebase';
import {isDemoMode} from '@/lib/demo-mode';

/**
 * The shape stored at `users/{uid}/monthlyBudgets/{monthKey}`. The document id
 * is the Bangkok month key, so a month can only ever hold one limit and the
 * ids sort chronologically, which is what the carry-forward query relies on.
 */
export type RemoteBudget = {
  amount: number;
  monthKey: string;
  source: 'ai' | 'manual';
  updatedAt: string;
};

function budgets(uid: string) {
  return collection(db, 'users', uid, 'monthlyBudgets');
}

function toRemote(monthKey: string, data: Record<string, unknown> | undefined): RemoteBudget | null {
  if (!data) return null;
  const amount = Number(data.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const updatedAt = data.updatedAt as {toDate?: () => Date} | undefined;
  return {
    amount,
    monthKey,
    source: data.source === 'ai' ? 'ai' : 'manual',
    updatedAt: typeof updatedAt?.toDate === 'function' ? updatedAt.toDate().toISOString() : new Date().toISOString(),
  };
}

export async function readRemoteBudget(uid: string, monthKey: string): Promise<RemoteBudget | null> {
  if (isDemoMode) return null;
  const snapshot = await getDoc(doc(db, 'users', uid, 'monthlyBudgets', monthKey));
  return snapshot.exists() ? toRemote(monthKey, snapshot.data()) : null;
}

/**
 * Most recent limit strictly before `monthKey` and not older than `earliestKey`.
 * The rules pin `monthKey` to the document id, so ordering by that one field
 * is chronological and needs no composite index.
 */
export async function readLatestRemoteBudgetBefore(
  uid: string,
  monthKey: string,
  earliestKey: string,
): Promise<RemoteBudget | null> {
  if (isDemoMode) return null;
  const snapshot = await getDocs(query(
    budgets(uid),
    where('monthKey', '>=', earliestKey),
    where('monthKey', '<', monthKey),
    orderBy('monthKey', 'desc'),
    limit(1),
  ));
  const first = snapshot.docs[0];
  return first ? toRemote(first.id, first.data()) : null;
}

export async function writeRemoteBudget(uid: string, budget: Omit<RemoteBudget, 'updatedAt'>) {
  if (isDemoMode) return;
  const reference = doc(db, 'users', uid, 'monthlyBudgets', budget.monthKey);
  const existing = await getDoc(reference);
  // `createdAt` must stay fixed across updates; the rules reject a write that
  // moves it, so it is only sent when the document is new.
  await setDoc(reference, {
    amount: budget.amount,
    monthKey: budget.monthKey,
    ownerId: uid,
    source: budget.source,
    updatedAt: serverTimestamp(),
    ...(existing.exists() ? {createdAt: existing.data().createdAt} : {createdAt: serverTimestamp()}),
  });
}
