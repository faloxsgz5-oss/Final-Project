import AsyncStorage from '@react-native-async-storage/async-storage';

import {shiftMonthKey, thailandMonthKey} from '@/lib/thailand-time';

export type MonthlyBudget = {
  amount: number;
  monthKey: string;
  /** Month the amount was originally saved for, when it was carried forward. */
  rolledOverFrom?: string;
  source: 'ai' | 'manual';
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
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Reads the limit for `monthKey`. When that month has none, the most recent
 * earlier limit is carried forward and flagged with `rolledOverFrom` so callers
 * can say the number came from a previous month. Without this the budget, the
 * daily tension read-out and the assistant's finance context all disappear
 * without explanation at midnight on the first of the month.
 */
export async function loadMonthlyBudget(uid: string, monthKey = currentMonthKey()): Promise<MonthlyBudget | null> {
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

export async function saveMonthlyBudget(uid: string, budget: Omit<MonthlyBudget, 'rolledOverFrom' | 'updatedAt'>) {
  if (!isValidBudgetAmount(budget.amount)) {
    throw new Error(`Monthly budget must be between 1 and ${MONTHLY_BUDGET_MAX}.`);
  }
  const next: MonthlyBudget = {
    amount: budget.amount,
    monthKey: budget.monthKey,
    source: budget.source,
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(storageKey(uid, budget.monthKey), JSON.stringify(next));
  return next;
}
