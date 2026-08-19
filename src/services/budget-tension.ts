import { loadMonthlyBudget, currentMonthKey } from '@/services/monthly-budget';
import { transactions } from '@/services/firestore';
import { thailandDaysInMonth, thailandRange } from '@/lib/thailand-time';

export type TensionLevel = 'safe' | 'caution' | 'tight' | 'very-tight' | 'over-budget';

export interface BudgetTension {
  monthlyBudget: number;
  dailyLimit: number;
  todaySpent: number;
  todayRemaining: number;
  level: TensionLevel;
  label: string;
  percentUsed: number;
}

export async function evaluateBudgetTension(uid: string): Promise<BudgetTension | null> {
  const monthKey = currentMonthKey();
  const monthlyData = await loadMonthlyBudget(uid, monthKey);

  if (!monthlyData || typeof monthlyData.amount !== 'number') {
    return null;
  }

  const monthlyBudget = monthlyData.amount;

  const now = new Date();
  // Bangkok month length, to match the Bangkok day window used for `todaySpent`.
  const daysInMonth = thailandDaysInMonth(now);

  const dailyLimit = Math.round(monthlyBudget / daysInMonth / 10) * 10;

  const { from, to } = thailandRange('day', now);

  const txList = await transactions.between(uid, from, to, 'expense');
  let todaySpent = 0;
  for (const tx of txList) {
    todaySpent += tx.amount || 0;
  }

  const todayRemaining = dailyLimit - todaySpent;
  const percentUsed = dailyLimit > 0 ? (todaySpent / dailyLimit) * 100 : (todaySpent > 0 ? 100 : 0);

  let level: TensionLevel = 'safe';
  let label = 'ปลอดภัย';

  if (percentUsed < 60) {
    level = 'safe';
    label = 'ปลอดภัย';
  } else if (percentUsed < 80) {
    level = 'caution';
    label = 'ควรระวัง';
  } else if (percentUsed < 95) {
    level = 'tight';
    label = 'เริ่มตึง';
  } else if (percentUsed <= 100) {
    level = 'very-tight';
    label = 'ตึงมาก';
  } else {
    level = 'over-budget';
    label = 'เกินงบแล้ว';
  }

  return {
    monthlyBudget,
    dailyLimit,
    todaySpent,
    todayRemaining,
    level,
    label,
    percentUsed
  };
}
