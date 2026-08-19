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
  weekEnd: string;
  weekSpent: number;
  weekStart: string;
  weeklyBudget: number;
  weeklyRemainingBudget: number;
  weeklyStatus: 'safe' | 'warning' | 'exceeded';
  weeklyUsagePercent: number;
};

export type BurnoutDynamicInsight = {
  assessmentWindowDays: number;
  averageSleepHours: number | null;
  busyHoursThisWeek: number;
  busyHoursToday: number;
  evidenceCoverage: 'limited' | 'partial' | 'strong';
  highLoadDays: number;
  lateSleepStreak: number;
  longestContinuousBusyMinutes: number;
  longestFreeSlotMinutes: number;
  overdueTaskCount: number;
  pendingTaskCount: number;
  protectiveFactors: string[];
  reasons: string[];
  riskLevel: 'low' | 'medium' | 'high';
  score: number;
  sleepDataDays: number;
  studyWorkToSleepRatio: number | null;
  totalFreeMinutes: number;
  urgentTaskCount: number;
};

export type SmartLifeDynamicInsight = {burnout: BurnoutDynamicInsight; finance?: FinanceBudgetInsight};

function toDate(value: TimeValue) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.toMillis === 'function') return new Date(value.toMillis());
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return null;
}

function startOfDay(date: Date) { const result = new Date(date); result.setHours(0, 0, 0, 0); return result; }
function endOfDay(date: Date) { const result = startOfDay(date); result.setHours(23, 59, 59, 999); return result; }
function startOfWeek(date: Date) { const result = startOfDay(date); const day = result.getDay(); result.setDate(result.getDate() - (day === 0 ? 6 : day - 1)); return result; }
function monthKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
function localDateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function daysInMonth(date: Date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(); }
function roundMoney(value: number) { return !Number.isFinite(value) || value <= 0 ? 0 : Math.round(value); }
function clamp(value: number, min: number, max: number) { return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min; }

export function calculateFinanceBudgetInsight({monthlyBudget, now = new Date(), transactions}: {
  monthlyBudget: number;
  now?: Date;
  transactions: Pick<Transaction, 'amount' | 'occurredAt' | 'type'>[];
}): FinanceBudgetInsight | null {
  if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) return null;
  const totalDays = daysInMonth(now);
  const currentDay = now.getDate();
  const daysRemainingIncludingToday = Math.max(1, totalDays - currentDay + 1);
  const expenses = transactions.filter((item) => item.type === 'expense');
  const spentSoFar = expenses.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const remainingBudget = monthlyBudget - spentSoFar;
  const averageDailyBudget = roundMoney(monthlyBudget / totalDays);
  const remainingDailyBudget = remainingBudget > 0 ? roundMoney(remainingBudget / daysRemainingIncludingToday) : 0;
  const expectedSpentByToday = monthlyBudget / totalDays * currentDay;
  const overspendAmount = Math.max(0, spentSoFar - expectedSpentByToday);
  const dailyExpenses = expenses.reduce((map, item) => {
    const occurredAt = toDate(item.occurredAt);
    if (occurredAt) map.set(localDateKey(occurredAt), (map.get(localDateKey(occurredAt)) ?? 0) + Number(item.amount ?? 0));
    return map;
  }, new Map<string, number>());
  const averageActualDailyExpense = dailyExpenses.size
    ? Array.from(dailyExpenses.values()).reduce((sum, value) => sum + value, 0) / dailyExpenses.size : 0;
  const runwayDays = averageActualDailyExpense > 0 && remainingBudget > 0 ? Math.floor(remainingBudget / averageActualDailyExpense) : null;

  // Keep the saved monthly ceiling, but coach against a Monday-Sunday share.
  const rawWeekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const weekStart = rawWeekStart < monthStart ? monthStart : rawWeekStart;
  const rawWeekEnd = new Date(rawWeekStart); rawWeekEnd.setDate(rawWeekEnd.getDate() + 6); rawWeekEnd.setHours(23, 59, 59, 999);
  const weekEnd = rawWeekEnd > monthEnd ? monthEnd : rawWeekEnd;
  const daysInBudgetWeek = Math.max(1, Math.round((startOfDay(weekEnd).getTime() - startOfDay(weekStart).getTime()) / 86_400_000) + 1);
  const weeklyBudget = roundMoney(monthlyBudget / totalDays * daysInBudgetWeek);
  const weekSpent = expenses.reduce((sum, item) => {
    const occurredAt = toDate(item.occurredAt);
    return occurredAt && occurredAt >= weekStart && occurredAt <= weekEnd ? sum + Number(item.amount ?? 0) : sum;
  }, 0);
  const weeklyRemainingBudget = Math.round(weeklyBudget - weekSpent);
  const weeklyUsagePercent = weeklyBudget > 0 ? Math.round((weekSpent / weeklyBudget) * 100) : 0;
  const weeklyStatus: FinanceBudgetInsight['weeklyStatus'] = weeklyUsagePercent >= 100 ? 'exceeded' : weeklyUsagePercent >= 80 ? 'warning' : 'safe';
  let financePressureLevel: FinanceBudgetInsight['financePressureLevel'] = 'none';
  if (remainingBudget < 0 || weeklyStatus === 'exceeded') financePressureLevel = 'critical';
  else if (weeklyStatus === 'warning') financePressureLevel = 'high';
  else if (weeklyUsagePercent >= 65) financePressureLevel = 'medium';
  else if (overspendAmount > 0) financePressureLevel = 'low';

  return {
    averageDailyBudget, daysInMonth: totalDays, daysRemainingIncludingToday,
    expectedSpentByToday: Math.round(expectedSpentByToday), financePressureLevel,
    monthKey: monthKey(now), monthlyBudget, overspendAmount: Math.round(overspendAmount),
    remainingBudget: Math.round(remainingBudget), remainingDailyBudget, runwayDays, spentSoFar,
    weekEnd: localDateKey(weekEnd), weekSpent: Math.round(weekSpent), weekStart: localDateKey(weekStart),
    weeklyBudget, weeklyRemainingBudget, weeklyStatus, weeklyUsagePercent,
  };
}

function itemRange(item: {actualEnd?: TimeValue; actualStart?: TimeValue; endAt?: TimeValue; startAt?: TimeValue}) {
  const actualStart = toDate(item.actualStart);
  const actualEnd = toDate(item.actualEnd);
  const start = actualStart ?? toDate(item.startAt);
  const end = actualStart && actualEnd ? actualEnd : toDate(item.endAt);
  return start ? {end: end && end > start ? end : new Date(start.getTime() + 3_600_000), start} : null;
}

function overlapMinutes(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return Math.max(0, Math.min(aEnd.getTime(), bEnd.getTime()) - Math.max(aStart.getTime(), bStart.getTime())) / 60_000;
}

type BusyBlock = {end: Date; start: Date};
function mergeBlocks(blocks: BusyBlock[], maximumGapMinutes = 0) {
  return [...blocks].sort((a, b) => a.start.getTime() - b.start.getTime()).reduce<BusyBlock[]>((merged, block) => {
    const last = merged[merged.length - 1];
    if (!last || block.start.getTime() > last.end.getTime() + maximumGapMinutes * 60_000) merged.push({...block});
    else if (block.end > last.end) last.end = block.end;
    return merged;
  }, []);
}

function activityLooksLikeSleep(item: Pick<Activity, 'category' | 'note' | 'title'>) {
  return /(นอน|เข้านอน|ตื่นนอน|พักผ่อนกลางคืน|sleep|bedtime)/i.test(`${item.title} ${item.category ?? ''} ${item.note ?? ''}`);
}

export function calculateBurnoutDynamicInsight({activities, finance: _finance, now = new Date(), pendingTasks, schedules, weekActivities, weekSchedules}: {
  activities: WithId<Activity>[];
  finance?: FinanceBudgetInsight | null;
  now?: Date;
  pendingTasks?: WithId<Activity>[];
  schedules: WithId<Schedule>[];
  weekActivities?: WithId<Activity>[];
  weekSchedules?: WithId<Schedule>[];
}): BurnoutDynamicInsight {
  const todayStart = startOfDay(now); const todayEnd = endOfDay(now);
  const assessmentStart = startOfDay(now); assessmentStart.setDate(assessmentStart.getDate() - 6);
  const allWeekActivities = weekActivities ?? activities;
  const allWeekSchedules = weekSchedules ?? schedules;
  const sleepActivities = allWeekActivities.filter(activityLooksLikeSleep);
  const nonSleepActivities = allWeekActivities.filter((item) => !activityLooksLikeSleep(item) && item.status !== 'cancelled');
  const taskSource = pendingTasks ?? allWeekActivities;
  const taskItems = taskSource.filter((item) => item.type === 'task' && item.status !== 'completed' && item.status !== 'cancelled');
  const todayBusyBlocks = mergeBlocks([
    ...schedules.flatMap((item) => { const range = itemRange(item); return range ? [range] : []; }),
    ...activities.flatMap((item) => { const range = item.status !== 'cancelled' && !activityLooksLikeSleep(item) ? itemRange(item) : null; return range ? [range] : []; }),
  ].filter((range) => range.end >= todayStart && range.start <= todayEnd));
  const busyMinutes = todayBusyBlocks.reduce((sum, block) => sum + overlapMinutes(block.start, block.end, todayStart, todayEnd), 0);
  const overdueTaskCount = taskItems.filter((item) => (toDate(item.deadline) ?? itemRange(item)?.start ?? now) < now).length;
  const urgentTaskCount = taskItems.filter((item) => {
    const due = toDate(item.deadline) ?? itemRange(item)?.start ?? null;
    return item.priority === 'urgent' || item.priority === 'high' || item.priority === 'important' || Boolean(due && (due.getTime() - now.getTime()) / 36e5 <= 24);
  }).length;

  const activeStart = new Date(todayStart); activeStart.setHours(8, 0, 0, 0);
  const activeEnd = new Date(todayStart); activeEnd.setHours(22, 0, 0, 0);
  let cursor = activeStart; let longestFreeSlotMinutes = 0; let totalFreeMinutes = 0;
  todayBusyBlocks.forEach((block) => {
    const blockStart = new Date(Math.max(block.start.getTime(), activeStart.getTime()));
    const blockEnd = new Date(Math.min(block.end.getTime(), activeEnd.getTime()));
    if (blockEnd <= activeStart || blockStart >= activeEnd) return;
    const gap = Math.max(0, (blockStart.getTime() - cursor.getTime()) / 60_000);
    longestFreeSlotMinutes = Math.max(longestFreeSlotMinutes, gap); totalFreeMinutes += gap;
    if (blockEnd > cursor) cursor = blockEnd;
  });
  const tailGap = Math.max(0, (activeEnd.getTime() - cursor.getTime()) / 60_000);
  longestFreeSlotMinutes = Math.max(longestFreeSlotMinutes, tailGap); totalFreeMinutes += tailGap;

  const weekBlocks = [
    ...allWeekSchedules.flatMap((item) => { const range = itemRange(item); return range ? [range] : []; }),
    ...nonSleepActivities.flatMap((item) => { const range = itemRange(item); return range ? [range] : []; }),
  ].filter((range) => range.end >= assessmentStart && range.start <= todayEnd);
  const blocksByDay = weekBlocks.reduce((map, block) => {
    const key = localDateKey(block.start); map.set(key, [...(map.get(key) ?? []), block]); return map;
  }, new Map<string, BusyBlock[]>());
  let busyMinutesThisWeek = 0; let highLoadDays = 0; let longestContinuousBusyMinutes = 0;
  blocksByDay.forEach((blocks) => {
    const day = startOfDay(blocks[0].start); const dayFinish = endOfDay(day);
    const dailyMinutes = mergeBlocks(blocks).reduce((sum, block) => sum + overlapMinutes(block.start, block.end, day, dayFinish), 0);
    busyMinutesThisWeek += dailyMinutes; if (dailyMinutes >= 360) highLoadDays += 1;
    longestContinuousBusyMinutes = Math.max(longestContinuousBusyMinutes, mergeBlocks(blocks, 15).reduce((max, block) => Math.max(max, (block.end.getTime() - block.start.getTime()) / 60_000), 0));
  });

  const sleepEvidence = sleepActivities.flatMap((item) => {
    const range = itemRange(item); if (!range) return [];
    const hours = (range.end.getTime() - range.start.getTime()) / 36e5;
    return hours >= 2 && hours <= 14 ? [{hours, start: range.start}] : [];
  }).sort((a, b) => a.start.getTime() - b.start.getTime());
  const averageSleepHours = sleepEvidence.length ? Math.round((sleepEvidence.reduce((sum, item) => sum + item.hours, 0) / sleepEvidence.length) * 10) / 10 : null;
  let lateSleepStreak = 0; let currentLateStreak = 0;
  sleepEvidence.forEach((entry) => { const hour = entry.start.getHours(); currentLateStreak = hour >= 0 && hour < 5 ? currentLateStreak + 1 : 0; lateSleepStreak = Math.max(lateSleepStreak, currentLateStreak); });

  let score = 0; const reasons: string[] = []; const protectiveFactors: string[] = [];
  if (busyMinutes >= 480) { score += 25; reasons.push(`วันนี้มีเรียนหรือทำงานรวม ${Math.round(busyMinutes / 60)} ชั่วโมง`); }
  else if (busyMinutes >= 360) { score += 15; reasons.push(`วันนี้มีเรียนหรือทำงานรวม ${Math.round((busyMinutes / 60) * 10) / 10} ชั่วโมง`); }
  if (longestContinuousBusyMinutes >= 240) { score += 25; reasons.push(`มีช่วงเรียนหรือทำงานต่อเนื่องยาวสุด ${Math.round(longestContinuousBusyMinutes / 60)} ชั่วโมง`); }
  else if (longestContinuousBusyMinutes >= 180) { score += 15; reasons.push(`มีช่วงเรียนหรือทำงานต่อเนื่องยาวสุด ${Math.round(longestContinuousBusyMinutes / 60)} ชั่วโมง`); }
  if (taskItems.length >= 6) { score += 20; reasons.push(`มีงานค้าง ${taskItems.length} รายการ`); }
  else if (taskItems.length >= 3) { score += 10; reasons.push(`มีงานค้าง ${taskItems.length} รายการ`); }
  if (overdueTaskCount > 0) { score += Math.min(20, overdueTaskCount * 10); reasons.push(`มีงานเลยกำหนด ${overdueTaskCount} รายการ`); }
  if (highLoadDays >= 5) { score += 25; reasons.push(`มีภาระอย่างน้อย 6 ชั่วโมง ${highLoadDays} วันในช่วงที่ตรวจ`); }
  else if (highLoadDays >= 3) { score += 15; reasons.push(`มีวันที่ภาระอย่างน้อย 6 ชั่วโมง ${highLoadDays} วันในช่วงที่ตรวจ`); }
  if (sleepEvidence.length >= 2 && averageSleepHours !== null && averageSleepHours < 6) { score += 20; reasons.push(`ข้อมูลการนอน ${sleepEvidence.length} คืนเฉลี่ย ${averageSleepHours} ชั่วโมง`); }
  else if (sleepEvidence.length >= 2 && averageSleepHours !== null && averageSleepHours < 7) { score += 10; reasons.push(`ข้อมูลการนอน ${sleepEvidence.length} คืนเฉลี่ย ${averageSleepHours} ชั่วโมง`); }
  if (lateSleepStreak >= 2) { score += 15; reasons.push(`มีบันทึกเข้านอนหลังเที่ยงคืนต่อเนื่อง ${lateSleepStreak} คืน`); }
  if (longestFreeSlotMinutes < 30) { score += 15; reasons.push('วันนี้ไม่มีช่วงว่างต่อเนื่องถึง 30 นาที'); }
  else if (longestFreeSlotMinutes < 45) { score += 8; reasons.push(`วันนี้ช่วงว่างยาวสุด ${Math.round(longestFreeSlotMinutes)} นาที`); }
  if (longestFreeSlotMinutes >= 60) protectiveFactors.push(`วันนี้ยังมีช่วงว่างต่อเนื่อง ${Math.round(longestFreeSlotMinutes)} นาที`);
  if (overdueTaskCount === 0) protectiveFactors.push('ยังไม่พบงานเลยกำหนด');
  if (sleepEvidence.length >= 2 && averageSleepHours !== null && averageSleepHours >= 7) protectiveFactors.push(`ข้อมูลการนอนเฉลี่ย ${averageSleepHours} ชั่วโมง`);

  const finalScore = clamp(Math.round(score), 0, 100);
  const evidenceSignals = blocksByDay.size + taskItems.length + sleepEvidence.length;
  const studyWorkToSleepRatio = averageSleepHours && sleepEvidence.length >= 2
    ? Math.round(((busyMinutesThisWeek / 60 / 7) / averageSleepHours) * 100) / 100
    : null;
  return {
    assessmentWindowDays: 7, averageSleepHours, busyHoursThisWeek: Math.round((busyMinutesThisWeek / 60) * 10) / 10,
    busyHoursToday: Math.round((busyMinutes / 60) * 10) / 10,
    evidenceCoverage: evidenceSignals >= 8 && sleepEvidence.length >= 2 ? 'strong' : evidenceSignals >= 3 ? 'partial' : 'limited',
    highLoadDays, lateSleepStreak, longestContinuousBusyMinutes: Math.round(longestContinuousBusyMinutes),
    longestFreeSlotMinutes: Math.round(longestFreeSlotMinutes), overdueTaskCount, pendingTaskCount: taskItems.length,
    protectiveFactors, reasons, riskLevel: finalScore >= 65 ? 'high' : finalScore >= 35 ? 'medium' : 'low',
    score: finalScore, sleepDataDays: sleepEvidence.length, studyWorkToSleepRatio,
    totalFreeMinutes: Math.round(totalFreeMinutes), urgentTaskCount,
  };
}
