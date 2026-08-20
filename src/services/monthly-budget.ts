import AsyncStorage from '@react-native-async-storage/async-storage';

import {shiftMonthKey, thailandMonthKey} from '@/lib/thailand-time';
import {readLatestRemoteBudgetBefore, readRemoteBudget, writeRemoteBudget} from '@/services/monthly-budget-remote';

export type MonthlyBudget = {
  amount: number;
  monthKey: string;
  /** Month the amount was originally saved for, when it was carried forward. */
  rolledOverFrom?: string;
  source: 'ai' | 'manual';
  /** False when the limit is only on this device because the sync write failed. */
  synced?: boolean;
  updatedAt: string;
};

/** Upper bound for a single month's limit. Guards typos such as a stuck key. */
export const MONTHLY_BUDGET_MAX = 10_000_000;

/** How many past months are searched for a budget to carry forward. */
const ROLLOVER_LOOKBACK_MONTHS = 12;

function storageKey(uid: string, monthKey: string) {
  return `smartlife:monthly-budget:${uid}:${monthKey}`;
}

/**
 * `YYYY-MM` for the current month in Asia/Bangkok. Spending is queried with
 * `thailandRange`, so the budget must be keyed to the same clock or the two
 * disagree for the seven hours around every month boundary on a device that is
 * not set to Bangkok time.
 */
export function currentMonthKey(date = new Date()) {
  return thailandMonthKey(date);
}

/**
 * Turns typed or pasted text into a whole-baht limit. Thousands separators are
 * dropped, but a decimal separator truncates rather than disappearing: simply
 * deleting the dot turned a pasted "12.50" into 1250, a hundredfold
 * overstatement. The number pad cannot produce a dot, so this mainly guards
 * paste and hardware keyboards.
 */
export function parseBudgetAmount(value: string) {
  const [whole] = String(value).replace(/[^\d.]/g, '').split('.');
  return Math.min(MONTHLY_BUDGET_MAX, Number(whole) || 0);
}

/** Rejects amounts that cannot represent a usable spending limit. */
export function isValidBudgetAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MONTHLY_BUDGET_MAX;
}

function parseStored(raw: string | null, monthKey: string): MonthlyBudget | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<MonthlyBudget>;
    if (!isValidBudgetAmount(value.amount)) return null;
    return {
      amount: value.amount,
      monthKey,
      source: value.source === 'ai' ? 'ai' : 'manual',
      synced: value.synced !== false,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function earliestRolloverKey(monthKey: string) {
  return shiftMonthKey(monthKey, -ROLLOVER_LOOKBACK_MONTHS);
}

async function writeCache(uid: string, budget: MonthlyBudget) {
  await AsyncStorage.setItem(storageKey(uid, budget.monthKey), JSON.stringify({
    amount: budget.amount,
    monthKey: budget.monthKey,
    source: budget.source,
    synced: budget.synced !== false,
    updatedAt: budget.updatedAt,
  }));
}

/**
 * Reads the device cache for `monthKey`, falling back to the most recent
 * earlier month. Used offline, and as the source for the one-time migration
 * of budgets saved before this feature moved to Firestore.
 */
async function readCache(uid: string, monthKey: string): Promise<MonthlyBudget | null> {
  const exact = parseStored(await AsyncStorage.getItem(storageKey(uid, monthKey)), monthKey);
  if (exact) return exact;

  const previousKeys = Array.from(
    {length: ROLLOVER_LOOKBACK_MONTHS},
    (_, index) => shiftMonthKey(monthKey, -(index + 1)),
  );
  const entries = await AsyncStorage.multiGet(previousKeys.map((key) => storageKey(uid, key)));
  for (const [index, previousKey] of previousKeys.entries()) {
    const carried = parseStored(entries[index]?.[1] ?? null, previousKey);
    if (carried) return {...carried, monthKey, rolledOverFrom: previousKey};
  }
  return null;
}

/**
 * Reads the limit for `monthKey` from Firestore so it is the same on every
 * device the user signs in on, keeping a device copy for offline use.
 *
 * When that month has none, the most recent earlier limit is carried forward
 * and flagged with `rolledOverFrom`; without this the budget, the daily tension
 * read-out and the assistant's finance context all disappeared without
 * explanation at midnight on the first of the month.
 *
 * A budget saved before this moved to Firestore lives only on the device that
 * saved it, so the first read that finds nothing stored remotely uploads the
 * cached one rather than letting it silently disappear.
 */
export async function loadMonthlyBudget(uid: string, monthKey = currentMonthKey()): Promise<MonthlyBudget | null> {
  const cached = await readCache(uid, monthKey).catch(() => null);

  try {
    // A cached limit flagged unsynced is a save the user already confirmed on
    // this device that never reached the server. Push it before reading, or the
    // server's older amount is read back over it and a save that could not sync
    // is indistinguishable from a save that never happened: the screen returns
    // to the previous limit with nothing to explain why.
    if (cached && cached.synced === false) {
      const originMonth = cached.rolledOverFrom ?? cached.monthKey;
      await writeRemoteBudget(uid, {amount: cached.amount, monthKey: originMonth, source: cached.source});
      const restored: MonthlyBudget = {...cached, synced: true};
      await writeCache(uid, {...restored, monthKey: originMonth}).catch(() => undefined);
      return restored;
    }

    const exact = await readRemoteBudget(uid, monthKey);
    if (exact) {
      const budget: MonthlyBudget = {...exact, monthKey, synced: true};
      await writeCache(uid, budget).catch(() => undefined);
      return budget;
    }

    const carried = await readLatestRemoteBudgetBefore(uid, monthKey, earliestRolloverKey(monthKey));
    if (carried) {
      return {...carried, monthKey, rolledOverFrom: carried.monthKey, synced: true};
    }

    // Nothing stored remotely for this month or the year before it. Anything in
    // the device cache predates the move to Firestore, or failed to sync, so
    // push it up now instead of losing it.
    if (cached) {
      const originMonth = cached.rolledOverFrom ?? cached.monthKey;
      try {
        await writeRemoteBudget(uid, {amount: cached.amount, monthKey: originMonth, source: cached.source});
        const migrated = {...cached, synced: true};
        await writeCache(uid, {...migrated, monthKey: originMonth}).catch(() => undefined);
        return migrated;
      } catch (error) {
        console.error('[MonthlyBudget] Could not upload the device budget', error);
        return {...cached, synced: false};
      }
    }
    return null;
  } catch (error) {
    // Offline or rules failure: the cached limit is better than none, and is
    // marked unsynced so the screen can say so.
    console.error('[MonthlyBudget] Sync unavailable, using the device copy', error);
    return cached ? {...cached, synced: false} : null;
  }
}

/**
 * Stores the limit. The device copy is written first so an offline save is
 * never lost, then the same value is synced. `synced` reports whether the
 * other devices can see it yet.
 */
export async function saveMonthlyBudget(uid: string, budget: Omit<MonthlyBudget, 'rolledOverFrom' | 'synced' | 'updatedAt'>) {
  if (!isValidBudgetAmount(budget.amount)) {
    throw new Error(`Monthly budget must be between 1 and ${MONTHLY_BUDGET_MAX}.`);
  }
  const next: MonthlyBudget = {
    amount: budget.amount,
    monthKey: budget.monthKey,
    source: budget.source,
    synced: true,
    updatedAt: new Date().toISOString(),
  };

  try {
    await writeRemoteBudget(uid, {amount: next.amount, monthKey: next.monthKey, source: next.source});
  } catch (error) {
    console.error('[MonthlyBudget] Sync failed, keeping the budget on this device', error);
    next.synced = false;
  }
  await writeCache(uid, next);
  return next;
}
