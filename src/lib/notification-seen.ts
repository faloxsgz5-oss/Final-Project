import type {FeedItem} from '@/services/notification-feed';

/**
 * Which notifications the user has already seen, and the badge number that
 * follows from it.
 *
 * Stored notices carry a real `read` flag in Firestore. Derived alerts (budget,
 * funds, calendar, notes) are recomputed on every load and have no flag, so the
 * bell used to count them for as long as their condition held -- forever, for a
 * month that stays over budget. Here a derived alert counts until the user has
 * opened the list while it was showing; after that it stays quiet unless its
 * `signature` (the state it describes) changes.
 *
 * The record is per user and kept on the device only: a Firestore field would
 * need a rules change. The cost is that "seen" does not follow the user to a
 * second device.
 *
 * Nothing here touches React Native, so the logic runs under plain Node in the
 * tests; the storage is handed in.
 */

/** alert id -> the signature it had when last seen. */
export type SeenRecord = Record<string, string>;

/** Unread stored notices plus derived alerts not seen in their current state. */
export function isUnseen(item: FeedItem, seen: SeenRecord) {
  if (item.source === 'stored') return item.unread;
  return seen[item.id] !== (item.signature ?? '');
}

/**
 * The bell's number. `storedUnread`, when known, replaces the feed's own stored
 * count -- it comes from a live listener, so a notice that arrives after the
 * feed was built still counts.
 */
export function badgeCount(feed: FeedItem[], seen: SeenRecord, storedUnread?: number | null) {
  const derived = feed.filter((item) => item.source !== 'stored' && isUnseen(item, seen)).length;
  const stored = storedUnread ?? feed.filter((item) => item.source === 'stored' && item.unread).length;
  return derived + stored;
}

/** The feed as the list shows it on arrival: `unread` means "new to this user". */
export function withSeenFlags(feed: FeedItem[], seen: SeenRecord): FeedItem[] {
  return feed.map((item) => (item.source === 'stored' ? item : {...item, unread: isUnseen(item, seen)}));
}

/**
 * The record after the user has looked at `viewed`. Entries for alerts no
 * longer in `current` are dropped, so the record cannot grow without bound; an
 * alert that goes away and comes back in the same state stays seen only while
 * it is still being tracked.
 */
export function markSeen(seen: SeenRecord, viewed: FeedItem[], current: FeedItem[]): SeenRecord {
  const live = new Set(current.filter((item) => item.source !== 'stored').map((item) => item.id));
  const next: SeenRecord = {};
  for (const [id, signature] of Object.entries(seen)) if (live.has(id)) next[id] = signature;
  for (const item of viewed) if (item.source !== 'stored') next[item.id] = item.signature ?? '';
  return next;
}

/** The subset of AsyncStorage / localStorage the store needs. */
export type SeenStorage = {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
};

const storageKey = (uid: string) => `@smartlife/notification-seen/${uid}`;

function parse(raw: string | null): SeenRecord {
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

/**
 * A per-user seen record over the given storage. Every storage call is guarded:
 * blocked or broken storage (a private window, a full quota, corrupt JSON)
 * falls back to an in-memory copy for the session instead of throwing, so the
 * bell can never take a screen down. Listeners hear every save, so each place
 * that shows the badge updates together.
 */
export function createSeenStore(storage: SeenStorage) {
  const memory = new Map<string, SeenRecord>();
  const listeners = new Set<(uid: string, record: SeenRecord) => void>();

  return {
    async load(uid: string): Promise<SeenRecord> {
      try {
        const record = parse(await storage.getItem(storageKey(uid)));
        memory.set(uid, record);
        return record;
      } catch {
        return memory.get(uid) ?? {};
      }
    },
    async save(uid: string, record: SeenRecord) {
      memory.set(uid, record);
      listeners.forEach((listener) => listener(uid, record));
      try {
        await storage.setItem(storageKey(uid), JSON.stringify(record));
      } catch {
        // Kept in memory for this session; the next load retries the storage.
      }
    },
    subscribe(listener: (uid: string, record: SeenRecord) => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
