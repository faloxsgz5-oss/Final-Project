// Run via `npm run test:notification-seen`, which forces TZ=UTC so the
// Bangkok-anchored day keys are exercised rather than the machine clock.
//
// The badge must stop counting a derived alert once it has been seen, count it
// again when the state it describes changes, never count a seen alert twice, and
// survive storage that throws.
import assert from 'node:assert/strict';

import {buildNotificationFeed} from '../src/services/notification-feed.ts';
import {badgeCount, createSeenStore, isUnseen, markSeen, withSeenFlags} from '../src/lib/notification-seen.ts';

const now = new Date('2026-08-19T05:00:00Z'); // Wed 19 Aug, 12:00 Bangkok
const tx = (amount, occurredAt, type = 'expense') => ({amount, occurredAt: new Date(occurredAt), type});
const stored = (id, read) => ({createdAt: now, id, kind: 'system', message: 'm', ownerId: 'u', read, title: id, updatedAt: now});

// Funds alert (expense > income), an overdue calendar item, an important note, three unread stored notices.
const base = {
  activities: [{id: 'a1', startAt: '2026-08-18T02:00:00Z', status: 'pending', title: 'ส่งรายงาน'}],
  monthTransactions: [tx(1000, '2026-08-02T03:00:00Z', 'income'), tx(1500, '2026-08-10T03:00:00Z')],
  notes: [{id: 'n1', priority: 'urgent', status: 'pending', title: 'อ่านสอบ'}],
  now,
  stored: [stored('s1', false), stored('s2', false), stored('s3', false)],
};
const feed = buildNotificationFeed(base);
const derived = feed.filter((item) => item.source !== 'stored');
assert.ok(derived.length >= 3, 'funds, calendar and note alerts are derived');
assert.ok(derived.every((item) => typeof item.signature === 'string' && item.signature.length > 0), 'every derived alert has a signature');
assert.equal(badgeCount(feed, {}), derived.length + 3, 'nothing seen: every alert and every unread stored notice counts');

// Seeing the list clears the derived part; stored notices clear through their read flag.
const seen = markSeen({}, feed, feed);
assert.equal(badgeCount(feed, seen), 3, 'derived alerts stop counting once seen');
assert.equal(badgeCount(feed, seen, 0), 0, 'with the stored notices read too, the badge is empty');
assert.equal(badgeCount(buildNotificationFeed(base), seen, 0), 0, 'a rebuilt feed in the same state stays quiet');

// A changed situation is news again: the overdue item moved, the note's priority raised.
const moved = buildNotificationFeed({...base, activities: [{...base.activities[0], startAt: '2026-08-19T03:00:00Z'}]});
assert.equal(badgeCount(moved, seen, 0), 1, 'moving the calendar item makes it unseen again');
const raised = buildNotificationFeed({...base, notes: [{...base.notes[0], priority: 'important'}]});
assert.equal(badgeCount(raised, seen, 0), 1, 'a changed priority makes the note unseen again');
// A new month restarts the funds alert.
const nextMonth = new Date('2026-09-02T05:00:00Z');
const september = buildNotificationFeed({...base, activities: [], monthTransactions: [tx(1000, '2026-09-01T03:00:00Z', 'income'), tx(1500, '2026-09-01T04:00:00Z')], notes: [], now: nextMonth, stored: []});
assert.equal(badgeCount(september, markSeen({}, feed.filter((item) => item.id === 'finance:funds'), feed), 0), 1, 'the funds alert is new again in a new month');

// A brand-new alert counts; a stored notice arriving counts through the live count.
const extra = buildNotificationFeed({...base, notes: [...base.notes, {id: 'n2', priority: 'urgent', status: 'pending', title: 'ใหม่'}]});
assert.equal(badgeCount(extra, seen, 0), 1, 'a new derived alert counts');
assert.equal(badgeCount(feed, seen, 1), 1, 'one new stored notice shows as 1');

// isUnseen / withSeenFlags: chips on arrival reflect what was new before this visit.
const flagged = withSeenFlags(feed, seen);
assert.ok(flagged.filter((item) => item.source !== 'stored').every((item) => !item.unread), 'seen derived alerts carry no "new" flag');
assert.ok(flagged.filter((item) => item.source === 'stored').every((item) => item.unread), 'stored flags are left as stored');
assert.equal(isUnseen(derived[0], {}), true);

// markSeen prunes alerts that are gone, so the record stays bounded.
const pruned = markSeen({...seen, 'calendar:gone': 'x'}, [], feed);
assert.equal('calendar:gone' in pruned, false, 'records for alerts no longer present are dropped');

// The store: per user, persistent, and storage failures never throw.
const backing = new Map();
const store = createSeenStore({getItem: (key) => backing.get(key) ?? null, setItem: (key, value) => { backing.set(key, value); }});
await store.save('alice', seen);
assert.deepEqual(await store.load('alice'), seen, 'a saved record loads back');
assert.deepEqual(await store.load('bob'), {}, "another user does not inherit alice's record");
const fresh = createSeenStore({getItem: (key) => backing.get(key) ?? null, setItem: (key, value) => { backing.set(key, value); }});
assert.deepEqual(await fresh.load('alice'), seen, 'the record survives a new store (a reload)');

const broken = createSeenStore({getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('quota'); }});
await broken.save('alice', seen);
assert.deepEqual(await broken.load('alice'), seen, 'blocked storage falls back to memory instead of throwing');
const corrupt = createSeenStore({getItem: () => '{not json', setItem: () => undefined});
assert.deepEqual(await corrupt.load('alice'), {}, 'corrupt JSON loads as an empty record');

let heard = 0;
const unsubscribe = store.subscribe(() => { heard += 1; });
await store.save('alice', {});
unsubscribe();
await store.save('alice', {});
assert.equal(heard, 1, 'listeners hear saves until they unsubscribe');

console.log(`notification seen passed: ${derived.length} derived alert kinds signed, seen/unseen/storage cases`);
