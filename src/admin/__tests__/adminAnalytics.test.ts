import {
  buildUserSeries,
  dayKeyFromMillis,
  filterUsers,
  groupEventsByDay,
  monthKeyFromMillis,
  monthRange,
  shiftMonth,
  sortUsers,
  summarizeActivities,
  summarizeFinance,
  summarizeNotes,
} from '../analytics.ts';
import type {AdminEventInput, AdminNoteInput, AdminTransactionInput, AdminUserInput} from '../analytics.ts';

/** Stable JSON so object key insertion order never decides a test result. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([first], [second]) => first.localeCompare(second))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

const assert = {
  deepEqual(actual: unknown, expected: unknown, message = '') {
    if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
      throw new Error(`${message} Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
    }
  },
  equal(actual: unknown, expected: unknown, message = '') {
    if (actual !== expected) throw new Error(`${message} Expected ${String(actual)} to equal ${String(expected)}`);
  },
  ok(value: unknown, message = 'Expected value to be truthy') {
    if (!value) throw new Error(message);
  },
  throws(run: () => unknown, message = 'Expected the call to throw') {
    let threw = false;
    try { run(); } catch { threw = true; }
    if (!threw) throw new Error(message);
  },
};

function note(overrides: Partial<AdminNoteInput> = {}): AdminNoteInput {
  return {id: 'note', category: 'study', content: '', priority: 'normal', status: 'pending', ...overrides};
}

function transaction(overrides: Partial<AdminTransactionInput> = {}): AdminTransactionInput {
  return {id: 'tx', amount: 0, category: 'Food', type: 'expense', ...overrides};
}

function event(overrides: Partial<AdminEventInput> = {}): AdminEventInput {
  return {entity: 'activity', id: 'event', startAtMs: 0, status: 'planned', type: 'task', ...overrides};
}

export async function runAdminAnalyticsTests() {
  testUserSearchMatchesNameEmailAndUid();
  testUserSearchIsCaseInsensitiveAndEmptyReturnsAll();
  testDisabledUsersSortLast();
  testEmptyNoteProfile();
  testNoteBreakdownSharesSumToOne();
  testUnknownNoteCategoryFoldsIntoUncategorized();
  testNoteSummaryDistinguishesDominantFromMixed();
  testFinanceSummaryDerivesSavings();
  testFinanceIgnoresNonNumericAmounts();
  testFinanceCountsOcrAndReviewFlags();
  testFinanceZeroIncomeDoesNotDivideByZero();
  testTopExpenseCategoriesRankedAndCapped();
  testBangkokDayKeyCrossesMidnightCorrectly();
  testMonthRangeCoversBangkokMonth();
  testShiftMonthWrapsYear();
  testInvalidMonthKeyThrows();
  testGroupEventsByDaySortsAndDropsUndated();
  testActivitySummarySeparatesSchedules();
  testUserSeriesRanksAndNormalises();
  testUserSeriesFoldsOverflowInsteadOfDropping();
  testUserSeriesHandlesAllZeroAndEmpty();
}

/* ------------------------------------------------------------------ users */

const USERS: AdminUserInput[] = [
  {uid: 'u1', displayName: 'Nong Ploy', email: 'ploy@example.com', lastSignInAt: '2026-08-18T10:00:00Z'},
  {uid: 'u2', displayName: 'Somchai', email: 'somchai@smartlife.dev', lastSignInAt: '2026-08-19T10:00:00Z'},
  {uid: 'zz9', displayName: '', email: '', disabled: true, lastSignInAt: '2026-08-19T23:00:00Z'},
];

function testUserSearchMatchesNameEmailAndUid() {
  assert.deepEqual(filterUsers(USERS, 'ploy').map((user) => user.uid), ['u1'], 'name match:');
  assert.deepEqual(filterUsers(USERS, 'smartlife.dev').map((user) => user.uid), ['u2'], 'email match:');
  assert.deepEqual(filterUsers(USERS, 'zz9').map((user) => user.uid), ['zz9'], 'uid match:');
}

function testUserSearchIsCaseInsensitiveAndEmptyReturnsAll() {
  assert.deepEqual(filterUsers(USERS, '  PLOY ').map((user) => user.uid), ['u1']);
  assert.equal(filterUsers(USERS, '   ').length, 3);
  assert.equal(filterUsers(USERS, '').length, 3);
}

function testDisabledUsersSortLast() {
  // zz9 signed in most recently but is disabled, so it must still sort last.
  assert.deepEqual(sortUsers(USERS).map((user) => user.uid), ['u2', 'u1', 'zz9']);
}

/* ------------------------------------------------------------------ notes */

function testEmptyNoteProfile() {
  const profile = summarizeNotes([]);
  assert.equal(profile.total, 0);
  assert.equal(profile.dominant, null);
  assert.equal(profile.averageLength, 0);
  assert.equal(profile.summary, 'ยังไม่มีโน้ต');
  assert.deepEqual(profile.breakdown, []);
}

function testNoteBreakdownSharesSumToOne() {
  const profile = summarizeNotes([
    note({id: '1', category: 'study'}),
    note({id: '2', category: 'study'}),
    note({id: '3', category: 'work'}),
    note({id: '4', category: 'idea'}),
  ]);
  assert.equal(profile.total, 4);
  assert.equal(profile.dominant?.key, 'study');
  assert.equal(profile.dominant?.count, 2);
  const shareTotal = profile.breakdown.reduce((sum, item) => sum + item.share, 0);
  assert.equal(Math.round(shareTotal * 1000) / 1000, 1, 'shares must sum to 1:');
}

function testUnknownNoteCategoryFoldsIntoUncategorized() {
  const profile = summarizeNotes([
    note({id: '1', category: 'nonsense'}),
    note({id: '2', category: ''}),
    note({id: '3', category: null}),
  ]);
  assert.equal(profile.breakdown.length, 1);
  assert.equal(profile.breakdown[0].key, 'uncategorized');
  assert.equal(profile.breakdown[0].count, 3);
  assert.equal(profile.breakdown[0].label, 'ไม่ระบุหมวด');
}

function testNoteSummaryDistinguishesDominantFromMixed() {
  const dominant = summarizeNotes([
    note({id: '1', category: 'study', content: 'abcde'}),
    note({id: '2', category: 'study', content: 'abcde'}),
    note({id: '3', category: 'work', content: 'abcde'}),
  ]);
  assert.ok(dominant.summary.startsWith('ส่วนใหญ่'), `expected dominant phrasing, got ${dominant.summary}`);
  assert.equal(dominant.averageLength, 5);

  const mixed = summarizeNotes([
    note({id: '1', category: 'study'}),
    note({id: '2', category: 'work'}),
    note({id: '3', category: 'idea'}),
  ]);
  assert.ok(mixed.summary.startsWith('เขียนหลากหลาย'), `expected mixed phrasing, got ${mixed.summary}`);

  const status = summarizeNotes([
    note({id: '1', status: 'completed', priority: 'urgent'}),
    note({id: '2', status: 'pending', priority: 'important'}),
    note({id: '3', status: 'pending'}),
  ]);
  assert.equal(status.completed, 1);
  assert.equal(status.open, 2);
  assert.deepEqual(status.priority, {important: 1, normal: 1, urgent: 1});
}

/* ---------------------------------------------------------------- finance */

function testFinanceSummaryDerivesSavings() {
  const summary = summarizeFinance([
    transaction({id: '1', type: 'income', amount: 1500, category: 'รายรับ'}),
    transaction({id: '2', type: 'expense', amount: 189}),
    transaction({id: '3', type: 'expense', amount: 40, category: 'Transport'}),
  ]);
  assert.equal(summary.income, 1500);
  assert.equal(summary.expense, 229);
  assert.equal(summary.net, 1271);
  assert.equal(summary.savingsRate, 0.847);
  assert.equal(summary.transactionCount, 3);
}

function testFinanceIgnoresNonNumericAmounts() {
  const summary = summarizeFinance([
    transaction({id: '1', type: 'income', amount: Number.NaN}),
    transaction({id: '2', type: 'income', amount: null}),
    transaction({id: '3', type: 'expense', amount: -50}),
    transaction({id: '4', type: 'transfer', amount: 999}),
  ]);
  assert.equal(summary.income, 0, 'unusable income amounts count as zero:');
  assert.equal(summary.expense, 50, 'negative expense is read as magnitude:');
  assert.equal(summary.net, -50);
}

function testFinanceCountsOcrAndReviewFlags() {
  const summary = summarizeFinance([
    transaction({id: '1', source: 'receipt_scan', amount: 10}),
    transaction({id: '2', scanId: 'scan-abc', amount: 10}),
    transaction({id: '3', source: 'manual_entry', status: 'needs_review', amount: 10}),
    transaction({id: '4', source: 'manual_entry', amount: 10}),
  ]);
  assert.equal(summary.fromOcr, 2);
  assert.equal(summary.needsReview, 1);
}

function testFinanceZeroIncomeDoesNotDivideByZero() {
  const summary = summarizeFinance([transaction({id: '1', type: 'expense', amount: 100})]);
  assert.equal(summary.savingsRate, 0);
  assert.equal(summary.net, -100);
  assert.deepEqual(summarizeFinance([]), {
    expense: 0, fromOcr: 0, income: 0, needsReview: 0, net: 0,
    savingsRate: 0, topExpenseCategories: [], transactionCount: 0,
  });
}

function testTopExpenseCategoriesRankedAndCapped() {
  const summary = summarizeFinance([
    transaction({id: '1', category: 'Food', amount: 300}),
    transaction({id: '2', category: 'Food', amount: 100}),
    transaction({id: '3', category: 'Transport', amount: 200}),
    transaction({id: '4', category: 'Drink', amount: 150}),
    transaction({id: '5', category: '', amount: 50}),
  ], 2);
  assert.equal(summary.topExpenseCategories.length, 2, 'limit is respected:');
  assert.equal(summary.topExpenseCategories[0].category, 'Food');
  assert.equal(summary.topExpenseCategories[0].amount, 400);
  assert.equal(summary.topExpenseCategories[0].count, 2);
  assert.equal(summary.topExpenseCategories[0].share, 0.5);
  assert.equal(summary.topExpenseCategories[1].category, 'Transport');

  const uncategorized = summarizeFinance([transaction({id: '1', category: '  ', amount: 10})]);
  assert.equal(uncategorized.topExpenseCategories[0].category, 'ไม่ระบุหมวด');
}

/* ----------------------------------------------------------- calendar time */

function testBangkokDayKeyCrossesMidnightCorrectly() {
  // 2026-08-19T17:30:00Z is 2026-08-20 00:30 in Bangkok.
  assert.equal(dayKeyFromMillis(Date.parse('2026-08-19T17:30:00Z')), '2026-08-20');
  // 2026-08-19T16:59:00Z is still 2026-08-19 23:59 in Bangkok.
  assert.equal(dayKeyFromMillis(Date.parse('2026-08-19T16:59:00Z')), '2026-08-19');
  assert.equal(monthKeyFromMillis(Date.parse('2026-08-31T17:30:00Z')), '2026-09');
}

function testMonthRangeCoversBangkokMonth() {
  const {from, to} = monthRange('2026-08');
  assert.equal(from.toISOString(), '2026-07-31T17:00:00.000Z', 'month starts at Bangkok midnight:');
  assert.equal(to.toISOString(), '2026-08-31T17:00:00.000Z', 'month ends at next Bangkok midnight:');
  assert.equal(dayKeyFromMillis(from.getTime()), '2026-08-01');
}

function testShiftMonthWrapsYear() {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-08', 0), '2026-08');
  assert.equal(shiftMonth('2026-08', -14), '2025-06');
}

function testInvalidMonthKeyThrows() {
  assert.throws(() => monthRange('not-a-month'), 'an invalid month key must throw rather than query the epoch');
}

function testGroupEventsByDaySortsAndDropsUndated() {
  const morning = Date.parse('2026-08-19T02:00:00Z');
  const evening = Date.parse('2026-08-19T09:00:00Z');
  const grouped = groupEventsByDay([
    event({id: 'late', startAtMs: evening}),
    event({id: 'early', startAtMs: morning}),
    event({id: 'undated', startAtMs: null}),
    event({id: 'broken', startAtMs: Number.NaN}),
    event({id: 'next-day', startAtMs: Date.parse('2026-08-19T17:30:00Z')}),
  ]);
  assert.deepEqual(Object.keys(grouped).sort(), ['2026-08-19', '2026-08-20']);
  assert.deepEqual(grouped['2026-08-19'].map((item) => item.id), ['early', 'late'], 'earliest first:');
  assert.deepEqual(grouped['2026-08-20'].map((item) => item.id), ['next-day']);
}

function testActivitySummarySeparatesSchedules() {
  const summary = summarizeActivities([
    event({id: '1', status: 'completed', type: 'task'}),
    event({id: '2', status: 'planned', type: 'task'}),
    event({id: '3', status: 'cancelled', type: 'appointment'}),
    event({id: '4', entity: 'schedule', status: undefined, type: undefined}),
  ]);
  assert.equal(summary.total, 4);
  assert.equal(summary.scheduleCount, 1);
  assert.equal(summary.completionRate, 0.333, 'schedules are excluded from the completion denominator:');
  assert.deepEqual(summary.byStatus, {cancelled: 1, completed: 1, planned: 1});
  assert.deepEqual(summary.byType, {appointment: 1, schedule: 1, task: 2});
  assert.equal(summarizeActivities([]).completionRate, 0);
}

/* ------------------------------------------------------------ user series */

function testUserSeriesRanksAndNormalises() {
  const series = buildUserSeries([
    {count: 5, label: 'B', uid: 'u2'},
    {count: 20, label: 'A', uid: 'u1'},
    {count: 10, label: 'C', uid: 'u3'},
  ]);
  assert.deepEqual(series.points.map((p) => p.uid), ['u1', 'u3', 'u2'], 'sorted by count desc:');
  assert.equal(series.max, 20);
  assert.equal(series.total, 35);
  assert.equal(series.points[0].ratio, 1, 'largest bar is full width:');
  assert.equal(series.points[1].ratio, 0.5);
  assert.equal(series.points[2].ratio, 0.25);
  assert.equal(series.hiddenUsers, 0);
}

function testUserSeriesFoldsOverflowInsteadOfDropping() {
  const entries = Array.from({length: 10}, (_, index) => ({
    count: 10 - index, label: `U${index}`, uid: `u${index}`,
  }));
  const series = buildUserSeries(entries, 3);
  assert.equal(series.points.length, 3);
  assert.equal(series.hiddenUsers, 7, 'overflow users are counted, not dropped:');
  assert.equal(series.hiddenCount, 7 + 6 + 5 + 4 + 3 + 2 + 1);
  assert.equal(series.total, 55, 'total still covers every user:');
}

function testUserSeriesHandlesAllZeroAndEmpty() {
  const zero = buildUserSeries([
    {count: 0, label: 'A', uid: 'u1'},
    {count: 0, label: 'B', uid: 'u2'},
  ]);
  assert.equal(zero.max, 0);
  assert.equal(zero.points[0].ratio, 0, 'no division by zero when nobody has data:');

  const empty = buildUserSeries([]);
  assert.deepEqual(empty.points, []);
  assert.equal(empty.max, 0);
  assert.equal(empty.total, 0);

  const negative = buildUserSeries([{count: -5, label: 'A', uid: 'u1'}]);
  assert.equal(negative.points[0].count, 0, 'negative counts clamp to zero:');
}
