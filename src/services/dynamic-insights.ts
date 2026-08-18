import {Timestamp} from 'firebase/firestore';

import type {Activity, Schedule, Transaction, WithId} from '@/types/smartlife';

type TimeValue = Date | string | number | Timestamp | {seconds?: number; toDate?: () => Date; toMillis?: () => number} | null | undefined;

export type FinanceBudgetInsight = {
  averageDailyBudget: number;
  daysInMonth: number;
  daysRemainingIncludingToday: number;
  expectedSpentByToday: number;
  financePressureLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  monthKey: string;
  monthlyBudget: number;
  overspendAmount: number;
  remainingBudget: number;
  remainingDailyBudget: number;
  runwayDays: number | null;
  spentSoFar: number;
};

export type BurnoutDynamicInsight = {
  busyHoursToday: number;
  longestFreeSlotMinutes: number;
  overdueTaskCount: number;
  pendingTaskCount: number;
  reasons: string[];
  riskLevel: 'low' | 'medium' | 'high';
  score: number;
  totalFreeMinutes: number;
  urgentTaskCount: number;
};

export type SmartLifeDynamicInsight = {
  burnout: BurnoutDynamicInsight;
  finance?: FinanceBudgetInsight;
};

function toDate(value: TimeValue) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.toMillis === 'function') return new Date(value.toMillis());
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

function startOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date) {
  const result = startOfDay(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function roundMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const step = value >= 500 ? 50 : value >= 100 ? 10 : 5;
  return Math.max(step, Math.floor(value / step) * step);
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function calculateFinanceBudgetInsight({
  monthlyBudget,
  now = new Date(),
  transactions,
}: {
  monthlyBudget: number;
  now?: Date;
  transactions: Pick<Transaction, 'amount' | 'occurredAt' | 'type'>[];
}): FinanceBudgetInsight | null {
  if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) return null;

  const totalDays = daysInMonth(now);
  const currentDay = now.getDate();
  const daysRemainingIncludingToday = Math.max(1, totalDays - currentDay + 1);
  const spentSoFar = transactions
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const remainingBudget = monthlyBudget - spentSoFar;
  const averageDailyBudget = roundMoney(monthlyBudget / totalDays);
  const remainingDailyBudget = remainingBudget > 0
    ? roundMoney(remainingBudget / daysRemainingIncludingToday)
    : 0;
  const expectedSpentByToday = monthlyBudget / totalDays * currentDay;
  const overspendAmount = Math.max(0, spentSoFar - expectedSpentByToday);
  const dailyExpenses = transactions
    .filter((item) => item.type === 'expense')
    .reduce((map, item) => {
      const occurredAt = toDate(item.occurredAt);
      if (!occurredAt) return map;
      const key = startOfDay(occurredAt).toISOString();
      map.set(key, (map.get(key) ?? 0) + Number(item.amount ?? 0));
      return map;
    }, new Map<string, number>());
  const averageActualDailyExpense = dailyExpenses.size
    ? Array.from(dailyExpenses.values()).reduce((sum, value) => sum + value, 0) / dailyExpenses.size
    : 0;
  const runwayDays = averageActualDailyExpense > 0 && remainingBudget > 0
    ? Math.floor(remainingBudget / averageActualDailyExpense)
    : null;

  let financePressureLevel: FinanceBudgetInsight['financePressureLevel'] = 'none';
  if (remainingBudget < 0) financePressureLevel = 'critical';
  else if (remainingDailyBudget > 0 && remainingDailyBudget < 60) financePressureLevel = 'high';
  else if (remainingDailyBudget > 0 && remainingDailyBudget < 90) financePressureLevel = 'medium';
  else if (overspendAmount > monthlyBudget * 0.1) financePressureLevel = 'medium';
  else if (overspendAmount > 0 || remainingDailyBudget < averageDailyBudget) financePressureLevel = 'low';

  return {
    averageDailyBudget,
    daysInMonth: totalDays,
    daysRemainingIncludingToday,
    expectedSpentByToday: Math.round(expectedSpentByToday),
    financePressureLevel,
    monthKey: monthKey(now),
    monthlyBudget,
    overspendAmount: Math.round(overspendAmount),
    remainingBudget: Math.round(remainingBudget),
    remainingDailyBudget,
    runwayDays,
    spentSoFar,
  };
}

function itemRange(item: {endAt?: TimeValue; startAt?: TimeValue}) {
  const start = toDate(item.startAt);
  const end = toDate(item.endAt);
  if (!start) return null;
  return {
    end: end && end > start ? end : new Date(start.getTime() + 60 * 60 * 1000),
    start,
  };
}

function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return Math.max(0, Math.min(aEnd.getTime(), bEnd.getTime()) - Math.max(aStart.getTime(), bStart.getTime())) / 60000;
}

export function calculateBurnoutDynamicInsight({
  activities,
  finance,
  now = new Date(),
  schedules,
}: {
  activities: WithId<Activity>[];
  finance?: FinanceBudgetInsight | null;
  now?: Date;
  schedules: WithId<Schedule>[];
}): BurnoutDynamicInsight {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const busyBlocks = [
    ...schedules.flatMap((item) => {
      const range = itemRange(item);
      return range ? [range] : [];
    }),
    ...activities.flatMap((item) => {
      if (item.status === 'cancelled') return [];
      const range = itemRange(item);
      return range ? [range] : [];
    }),
  ]
    .filter((range) => range.end >= todayStart && range.start <= todayEnd)
    .sort((first, second) => first.start.getTime() - second.start.getTime());

  const busyMinutes = busyBlocks.reduce((sum, block) => sum + overlapMinutes(block.start, block.end, todayStart, todayEnd), 0);
  const taskItems = activities.filter((item) => item.type === 'task' && item.status !== 'completed' && item.status !== 'cancelled');
  const overdueTaskCount = taskItems.filter((item) => {
    const range = itemRange(item);
    return range ? range.start < now : false;
  }).length;
  const urgentTaskCount = taskItems.filter((item) => {
    const range = itemRange(item);
    if (!range) return item.priority === 'urgent' || item.priority === 'high' || item.priority === 'important';
    const hours = (range.start.getTime() - now.getTime()) / 36e5;
    return item.priority === 'urgent' || hours <= 24;
  }).length;

  const activeStart = new Date(todayStart);
  activeStart.setHours(8, 0, 0, 0);
  const activeEnd = new Date(todayStart);
  activeEnd.setHours(22, 0, 0, 0);
  let cursor = activeStart;
  let longestFreeSlotMinutes = 0;
  let totalFreeMinutes = 0;
  busyBlocks.forEach((block) => {
    const blockStart = new Date(Math.max(block.start.getTime(), activeStart.getTime()));
    const blockEnd = new Date(Math.min(block.end.getTime(), activeEnd.getTime()));
    if (blockEnd <= activeStart || blockStart >= activeEnd) return;
    const gap = Math.max(0, (blockStart.getTime() - cursor.getTime()) / 60000);
    longestFreeSlotMinutes = Math.max(longestFreeSlotMinutes, gap);
    totalFreeMinutes += gap;
    if (blockEnd > cursor) cursor = blockEnd;
  });
  const tailGap = Math.max(0, (activeEnd.getTime() - cursor.getTime()) / 60000);
  longestFreeSlotMinutes = Math.max(longestFreeSlotMinutes, tailGap);
  totalFreeMinutes += tailGap;

  let score = 0;
  const reasons: string[] = [];
  if (busyMinutes >= 6 * 60) { score += 25; reasons.push('วันนี้มีตารางเรียนหรือกิจกรรมเกิน 6 ชั่วโมง'); }
  if (taskItems.length >= 3) { score += 20; reasons.push(`มีงานค้าง ${taskItems.length} รายการ`); }
  if (urgentTaskCount > 0) { score += Math.min(30, urgentTaskCount * 15); reasons.push(`มีงานด่วน ${urgentTaskCount} รายการ`); }
  if (overdueTaskCount > 0) { score += Math.min(30, overdueTaskCount * 20); reasons.push(`มีงานเลยกำหนด ${overdueTaskCount} รายการ`); }
  if (longestFreeSlotMinutes < 45) { score += 20; reasons.push('ไม่มีช่วงว่างต่อเนื่องเกิน 45 นาที'); }
  if (finance?.financePressureLevel === 'high' || finance?.financePressureLevel === 'critical') {
    score += 10;
    reasons.push('งบที่เหลือต่อวันค่อนข้างตึง');
  }

  const finalScore = clamp(Math.round(score), 0, 100);
  const riskLevel: BurnoutDynamicInsight['riskLevel'] = finalScore >= 70 ? 'high' : finalScore >= 40 ? 'medium' : 'low';

  return {
    busyHoursToday: Math.round((busyMinutes / 60) * 10) / 10,
    longestFreeSlotMinutes: Math.round(longestFreeSlotMinutes),
    overdueTaskCount,
    pendingTaskCount: taskItems.length,
    reasons,
    riskLevel,
    score: finalScore,
    totalFreeMinutes: Math.round(totalFreeMinutes),
    urgentTaskCount,
  };
}
