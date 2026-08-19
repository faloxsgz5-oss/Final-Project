import assert from 'node:assert/strict';

import {activityForFreeSlot, WELLBEING_AI_DISCLAIMER} from '../src/config/trusted-coaching-knowledge.ts';
import {calculateBurnoutDynamicInsight, calculateFinanceBudgetInsight} from '../src/services/dynamic-insights.ts';

const ts = (value) => ({toDate: () => new Date(value), toMillis: () => new Date(value).getTime()});
const base = new Date('2026-08-19T12:00:00+07:00');
const activity = (title, start, end, extra = {}) => ({
  color: '#fff', createdAt: ts(start), endAt: ts(end), id: `${title}-${start}`,
  location: '', ownerId: 'u1', source: 'manual', startAt: ts(start), status: 'planned',
  title, type: 'activity', updatedAt: ts(start), ...extra,
});
const schedule = (title, start, end) => ({
  color: '#fff', courseCode: '', createdAt: ts(start), endAt: ts(end), id: `${title}-${start}`,
  location: '', ownerId: 'u1', source: 'manual', startAt: ts(start), title, updatedAt: ts(start),
});

const weekSchedules = [
  schedule('เรียนวันจันทร์', '2026-08-17T08:00:00+07:00', '2026-08-17T15:00:00+07:00'),
  schedule('เรียนวันอังคาร', '2026-08-18T08:00:00+07:00', '2026-08-18T15:00:00+07:00'),
  schedule('เรียนวันพุธ', '2026-08-19T08:00:00+07:00', '2026-08-19T15:00:00+07:00'),
];
const sleep = [
  activity('นอน', '2026-08-18T01:30:00+07:00', '2026-08-18T06:30:00+07:00'),
  activity('นอน', '2026-08-19T02:00:00+07:00', '2026-08-19T07:00:00+07:00'),
];
const tasks = Array.from({length: 4}, (_, index) => activity(
  `งาน ${index + 1}`,
  `2026-08-${20 + index}T09:00:00+07:00`,
  `2026-08-${20 + index}T10:00:00+07:00`,
  {deadline: ts(`2026-08-${20 + index}T09:00:00+07:00`), type: 'task'},
));
const burnout = calculateBurnoutDynamicInsight({
  activities: [], now: base, pendingTasks: tasks, schedules: [weekSchedules[2]],
  weekActivities: sleep, weekSchedules,
});
assert.equal(burnout.sleepDataDays, 2);
assert.equal(burnout.averageSleepHours, 5);
assert.equal(burnout.lateSleepStreak, 2);
assert.equal(burnout.highLoadDays, 3);
assert.ok(burnout.reasons.every((reason) => !reason.includes('เดา')));
assert.notEqual(burnout.riskLevel, 'low');

const noSleep = calculateBurnoutDynamicInsight({activities: [], now: base, schedules: [], weekActivities: [], weekSchedules: []});
assert.equal(noSleep.sleepDataDays, 0);
assert.equal(noSleep.averageSleepHours, null);
assert.equal(noSleep.evidenceCoverage, 'limited');

assert.match(activityForFreeSlot(25), /พัก/);
assert.match(activityForFreeSlot(30), /งานเล็ก/);
assert.match(activityForFreeSlot(180), /โปรเจกต์ใหญ่/);
assert.match(WELLBEING_AI_DISCLAIMER, /ผู้เชี่ยวชาญ/);

const finance = calculateFinanceBudgetInsight({
  monthlyBudget: 3100,
  now: base,
  transactions: [{amount: 560, occurredAt: ts('2026-08-18T12:00:00+07:00'), type: 'expense'}],
});
assert.ok(finance);
assert.equal(finance.weeklyBudget, 700);
assert.equal(finance.weeklyUsagePercent, 80);
assert.equal(finance.weeklyStatus, 'warning');
assert.equal(finance.weeklyRemainingBudget, 140);

console.log('Wellbeing and weekly-budget tests passed.');
