// Run via `npm run test:notification-feed`, which forces TZ=UTC so the
// Bangkok-anchored budget windows are exercised rather than the machine clock.
//
// The point of these cases is the property the stored notifications could not
// give us: an alert exists only while its condition holds. Every source is
// asserted twice -- once raising the alert, once with the cause resolved.
import assert from 'node:assert/strict';

import {buildNotificationFeed, unreadCount} from '../src/services/notification-feed.ts';

const now = new Date('2026-08-19T05:00:00Z'); // Wed 19 Aug, 12:00 Bangkok
const tx = (amount, occurredAt, type = 'expense') => ({amount, occurredAt: new Date(occurredAt), type});
const find = (feed, id) => feed.find((item) => item.id === id);
const sources = (feed) => feed.map((item) => item.source);

// --- Finance: over the monthly limit raises an alert that says by how much,
// and it disappears once spending is back under the limit.
{
  const over = buildNotificationFeed({
    monthlyBudget: 5000,
    monthTransactions: [tx(6200, '2026-08-10T06:00:00Z')],
    now,
  });
  const alert = find(over, 'finance:month');
  assert.ok(alert, 'spending past the monthly limit must raise an alert');
  assert.equal(alert.severity, 'urgent');
  assert.equal(alert.source, 'finance');
  assert.match(alert.message, /1,200/, 'the alert states the overspend, not just that there is one');

  const under = buildNotificationFeed({
    monthlyBudget: 5000,
    monthTransactions: [tx(400, '2026-08-10T06:00:00Z')],
    now,
  });
  assert.equal(find(under, 'finance:month'), undefined, 'the alert clears when spending is back under the limit');
}

// --- Finance: the weekly window is the one dynamic-insights already computes,
// warning at 80% and escalating once exceeded.
{
  // 3,100 over 31 days = 100/day, so a Mon-Sun week is a 700 budget.
  const exceeded = buildNotificationFeed({
    monthlyBudget: 3100,
    monthTransactions: [tx(900, '2026-08-18T06:00:00Z')],
    now,
  });
  const weekAlert = find(exceeded, 'finance:week');
  assert.ok(weekAlert, 'blowing the weekly window raises an alert');
  assert.equal(weekAlert.severity, 'urgent');

  const warning = buildNotificationFeed({
    monthlyBudget: 3100,
    monthTransactions: [tx(600, '2026-08-18T06:00:00Z')], // 86% of 700
    now,
  });
  assert.equal(find(warning, 'finance:week').severity, 'warning', '80% of the weekly budget warns rather than shouts');

  const safe = buildNotificationFeed({
    monthlyBudget: 3100,
    monthTransactions: [tx(100, '2026-08-18T06:00:00Z')],
    now,
  });
  assert.equal(find(safe, 'finance:week'), undefined, 'a week inside its budget says nothing');
}

// --- Finance: today's pressure comes from the shared tension calculation, and
// rolls off on its own when the day's spending is cleared.
{
  // 3,100 over 31 days rounds to a 100 daily limit.
  const spentToday = buildNotificationFeed({
    monthlyBudget: 3100,
    monthTransactions: [tx(150, '2026-08-19T05:00:00Z')],
    now,
    todayExpenses: [{amount: 150}],
  });
  const dayAlert = find(spentToday, 'finance:day');
  assert.ok(dayAlert, 'spending past the daily limit raises an alert');
  assert.equal(dayAlert.severity, 'urgent');
  assert.match(dayAlert.message, /เกินมา/, 'it says the day is over, not merely tight');

  const quietDay = buildNotificationFeed({
    monthlyBudget: 3100,
    monthTransactions: [tx(150, '2026-08-18T06:00:00Z')],
    now,
    todayExpenses: [],
  });
  assert.equal(find(quietDay, 'finance:day'), undefined, 'the next day starts clean');
}

// --- Finance: no limit set means no budget alerts at all, rather than alerts
// computed against a budget of zero.
assert.deepEqual(
  buildNotificationFeed({monthlyBudget: 0, monthTransactions: [tx(9999, '2026-08-10T06:00:00Z')], now, todayExpenses: [{amount: 9999}]}),
  [],
  'without a limit there is nothing to be over',
);

// --- Calendar: an item due today is flagged with the same reasons the AI card
// shows, and a completed one is not flagged at all.
{
  const dueToday = {id: 'a1', title: 'ส่งรายงาน Data Structures', type: 'task', startAt: '2026-08-19T09:00:00Z'};
  const raised = buildNotificationFeed({activities: [dueToday], now});
  const alert = find(raised, 'calendar:a1');
  assert.ok(alert, 'a task due today reaches the bell');
  assert.equal(alert.source, 'calendar');
  assert.ok(alert.reasons.includes('เป็นงานที่ต้องทำ'), 'it carries the card\'s own reasons');
  assert.match(alert.message, /คะแนนความเร่งด่วน/, 'and the score the card ranks by');

  assert.equal(
    find(buildNotificationFeed({activities: [{...dueToday, status: 'completed'}], now}), 'calendar:a1'), undefined,
    'marking it done removes the notification',
  );
  assert.equal(
    find(buildNotificationFeed({activities: [{...dueToday, completedAt: '2026-08-19T04:00:00Z'}], now}), 'calendar:a1'), undefined,
    'a completedAt stamp counts as done too',
  );
  assert.equal(
    find(buildNotificationFeed({activities: [{...dueToday, startAt: '2026-09-30T09:00:00Z'}], now}), 'calendar:a1'), undefined,
    'something six weeks out is not urgent',
  );
}

// --- Calendar: past due is more severe than merely due today.
{
  const overdue = buildNotificationFeed({activities: [{id: 'a2', title: 'ส่งงาน', type: 'task', startAt: '2026-08-18T09:00:00Z'}], now});
  assert.equal(find(overdue, 'calendar:a2').severity, 'urgent');
  const soon = buildNotificationFeed({activities: [{id: 'a3', title: 'ประชุมกลุ่ม', type: 'appointment', startAt: '2026-08-19T14:00:00Z'}], now});
  assert.equal(find(soon, 'calendar:a3').severity, 'warning');
}

// --- Notes: the existing `priority` field is the signal; nothing is invented.
{
  const important = {id: 'n1', title: 'สรุปบทที่ 4', category: 'study', priority: 'important'};
  const raised = buildNotificationFeed({notes: [important], now});
  assert.ok(find(raised, 'note:n1'), 'an important note reaches the bell');
  assert.equal(find(raised, 'note:n1').severity, 'warning');
  assert.equal(find(buildNotificationFeed({notes: [{...important, priority: 'urgent'}], now}), 'note:n1').severity, 'urgent');

  assert.equal(find(buildNotificationFeed({notes: [{...important, priority: 'normal'}], now}), 'note:n1'), undefined,
    'an ordinary note is not a notification');
  assert.equal(find(buildNotificationFeed({notes: [{...important, status: 'completed'}], now}), 'note:n1'), undefined,
    'closing the note clears it');
}

// --- Stored notifications keep their real read flag, and only they do.
{
  const stored = [
    {id: 's1', kind: 'system', message: 'ปิดปรับปรุงระบบคืนนี้', read: false, title: 'ประกาศจากผู้ดูแล'},
    {id: 's2', kind: 'schedule', message: 'ย้ายคาบเรียน', read: true, title: 'ปรับตารางอัตโนมัติ'},
  ];
  const feed = buildNotificationFeed({now, stored});
  assert.equal(find(feed, 'stored:s1').unread, true);
  assert.equal(find(feed, 'stored:s2').unread, false, 'a read announcement stops counting');
  assert.equal(unreadCount(feed), 1);
}

// --- The badge counts live alerts plus genuinely unread stored ones, and drops
// back as each cause is resolved.
{
  const busy = buildNotificationFeed({
    activities: [{id: 'a1', title: 'ส่งรายงาน', type: 'task', startAt: '2026-08-19T09:00:00Z'}],
    monthlyBudget: 5000,
    monthTransactions: [tx(6200, '2026-08-10T06:00:00Z')],
    notes: [{id: 'n1', title: 'อ่านสอบ', priority: 'urgent'}],
    now,
    stored: [{id: 's1', kind: 'system', message: 'ประกาศ', read: false, title: 'ประกาศ'}],
  });
  assert.deepEqual(new Set(sources(busy)), new Set(['finance', 'calendar', 'note', 'stored']), 'all four sources reach the bell');
  assert.equal(busy[0].severity, 'urgent', 'the most severe concern sorts first');
  const before = unreadCount(busy);
  assert.ok(before >= 4);

  const settled = buildNotificationFeed({
    activities: [{id: 'a1', title: 'ส่งรายงาน', type: 'task', startAt: '2026-08-19T09:00:00Z', status: 'completed'}],
    monthlyBudget: 5000,
    monthTransactions: [tx(400, '2026-08-10T06:00:00Z')],
    notes: [{id: 'n1', title: 'อ่านสอบ', priority: 'urgent', status: 'completed'}],
    now,
    stored: [{id: 's1', kind: 'system', message: 'ประกาศ', read: true, title: 'ประกาศ'}],
  });
  assert.equal(unreadCount(settled), 0, 'resolving every cause empties the badge');
}

// --- Nothing anywhere is an empty feed, not a row saying so.
assert.deepEqual(buildNotificationFeed({now}), []);

console.log('SmartLife notification feed tests passed');
