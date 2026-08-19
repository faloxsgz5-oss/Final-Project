// Run via `npm run test:monthly-budget`, which forces TZ=UTC so the
// Asia/Bangkok assertions below prove the budget uses Bangkok time rather
// than inheriting the machine's clock.
import assert from 'node:assert/strict';

import {calculateFinanceBudgetInsight} from '../src/services/dynamic-insights.ts';
import {
  currentMonthKey,
  isValidBudgetAmount,
  loadMonthlyBudget,
  MONTHLY_BUDGET_MAX,
  saveMonthlyBudget,
} from '../src/services/monthly-budget.ts';

assert.equal(
  new Date('2026-08-16T17:30:00Z').getDate(), 16,
  'this suite must run under TZ=UTC; run it with `npm run test:monthly-budget`',
);

const uid = 'student-1';
const tx = (amount, occurredAt, type = 'expense') => ({amount, occurredAt: new Date(occurredAt), type});

// --- The month a budget belongs to is the Bangkok month, not the device month.
// Spending is queried with `thailandRange`, so a device-local key would read a
// different month than the transactions it is compared against.
assert.equal(currentMonthKey(new Date('2026-08-31T16:00:00Z')), '2026-08', 'Aug 31 23:00 Bangkok is still August');
assert.equal(currentMonthKey(new Date('2026-08-31T17:30:00Z')), '2026-09', 'Sep 1 00:30 Bangkok is already September');
assert.equal(currentMonthKey(new Date('2026-09-30T17:00:00Z')), '2026-10', 'Oct 1 00:00 Bangkok is already October');

// --- Amounts that cannot describe a spending limit are rejected at the source
// instead of being stored and later rendered as a budget of zero.
for (const bad of [0, -100, Number.NaN, Number.POSITIVE_INFINITY, MONTHLY_BUDGET_MAX + 1]) {
  assert.equal(isValidBudgetAmount(bad), false, `${bad} must not be a valid budget`);
  await assert.rejects(
    () => saveMonthlyBudget(uid, {amount: bad, monthKey: '2026-08', source: 'manual'}),
    `saving ${bad} must reject`,
  );
}
assert.equal(isValidBudgetAmount(5000), true);

// --- Nothing saved anywhere means no budget.
assert.equal(await loadMonthlyBudget(uid, '2026-08'), null, 'no stored budget yields null');

// --- A budget set in July carries into August instead of vanishing at midnight
// on the first, and says where it came from.
await saveMonthlyBudget(uid, {amount: 5000, monthKey: '2026-07', source: 'manual'});
const carried = await loadMonthlyBudget(uid, '2026-08');
assert.ok(carried, 'July budget must carry into August');
assert.equal(carried.amount, 5000);
assert.equal(carried.monthKey, '2026-08', 'carried budget is reported for the month asked for');
assert.equal(carried.rolledOverFrom, '2026-07', 'the origin month is disclosed');
assert.equal(carried.source, 'manual');

// --- An explicit budget for the month always wins over the carried one.
await saveMonthlyBudget(uid, {amount: 4200, monthKey: '2026-08', source: 'ai'});
const exact = await loadMonthlyBudget(uid, '2026-08');
assert.equal(exact.amount, 4200);
assert.equal(exact.source, 'ai');
assert.equal(exact.rolledOverFrom, undefined, 'an explicit budget is not marked as carried');

// --- The carry-forward window is bounded, so a year-old budget is not revived.
const stale = 'student-stale';
await saveMonthlyBudget(stale, {amount: 3000, monthKey: '2025-07', source: 'manual'});
assert.equal(await loadMonthlyBudget(stale, '2026-08'), null, 'a 13-month-old budget is not carried forward');
const withinWindow = await loadMonthlyBudget(stale, '2026-06');
assert.equal(withinWindow.amount, 3000, 'an 11-month-old budget is still within the window');
assert.equal(withinWindow.rolledOverFrom, '2025-07');

// --- Overspend stays a real number all the way through the insight, so the UI
// can say how far over the user is instead of clamping it to zero.
const now = new Date('2026-08-19T05:00:00Z'); // Wed 19 Aug, 12:00 in Bangkok
const over = calculateFinanceBudgetInsight({
  monthlyBudget: 5000,
  now,
  transactions: [tx(6200, '2026-08-10T06:00:00Z')],
});
assert.equal(over.spentSoFar, 6200);
assert.equal(over.remainingBudget, -1200, 'being 1,200 over budget must survive as -1200');
assert.equal(over.financePressureLevel, 'critical');
assert.equal(over.monthKey, '2026-08');
assert.equal(over.daysInMonth, 31, 'August has 31 Bangkok days');

// --- A non-positive budget yields no insight at all rather than a divide-by-zero.
assert.equal(calculateFinanceBudgetInsight({monthlyBudget: 0, now, transactions: []}), null);
assert.equal(calculateFinanceBudgetInsight({monthlyBudget: -1, now, transactions: []}), null);

// --- The weekly window is Monday-Sunday in Bangkok. A purchase at 00:30 on
// Monday Bangkok time falls on Sunday under a UTC clock; it must still be
// counted in this week.
const weekly = calculateFinanceBudgetInsight({
  monthlyBudget: 3100, // 100/day across 31 days
  now,
  transactions: [
    tx(300, '2026-08-16T17:30:00Z'), // Mon 17 Aug 00:30 Bangkok - inside this week
    tx(500, '2026-08-16T16:30:00Z'), // Sun 16 Aug 23:30 Bangkok - previous week
  ],
});
assert.equal(weekly.weekStart, '2026-08-17', 'the week starts Monday in Bangkok');
assert.equal(weekly.weekEnd, '2026-08-23', 'the week ends Sunday in Bangkok');
assert.equal(weekly.weekSpent, 300, 'only the Bangkok-Monday purchase counts toward this week');
assert.equal(weekly.spentSoFar, 800, 'both purchases still count toward the month');
assert.equal(weekly.weeklyBudget, 700, '7 days at 100/day');

// --- A week clipped by the start of the month is budgeted for its real length.
const clipped = calculateFinanceBudgetInsight({
  monthlyBudget: 3100,
  now: new Date('2026-08-01T05:00:00Z'), // Sat 1 Aug in Bangkok
  transactions: [],
});
assert.equal(clipped.weekStart, '2026-08-01', 'the week is clipped to the first of the month');
assert.equal(clipped.weekEnd, '2026-08-02', 'the containing Mon-Sun week ends on Sunday 2 Aug');
assert.equal(clipped.weeklyBudget, 200, '2 remaining days at 100/day');

console.log('SmartLife monthly budget tests passed');
