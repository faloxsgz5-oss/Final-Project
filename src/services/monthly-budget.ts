import AsyncStorage from '@react-native-async-storage/async-storage';

export type MonthlyBudget = {
  amount: number;
  monthKey: string;
  source: 'ai' | 'manual';
  updatedAt: string;
};

function storageKey(uid: string, monthKey: string) {
  return `smartlife:monthly-budget:${uid}:${monthKey}`;
}

export function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export async function loadMonthlyBudget(uid: string, monthKey = currentMonthKey()): Promise<MonthlyBudget | null> {
  const raw = await AsyncStorage.getItem(storageKey(uid, monthKey));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<MonthlyBudget>;
    if (typeof value.amount !== 'number' || value.amount <= 0) return null;
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

export async function saveMonthlyBudget(uid: string, budget: Omit<MonthlyBudget, 'updatedAt'>) {
  const next: MonthlyBudget = {...budget, updatedAt: new Date().toISOString()};
  await AsyncStorage.setItem(storageKey(uid, budget.monthKey), JSON.stringify(next));
  return next;
}
