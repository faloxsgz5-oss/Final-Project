import {useEffect, useMemo, useState} from 'react';

import {badgeCount, type SeenRecord} from '@/lib/notification-seen';
import type {FeedItem} from '@/services/notification-feed';
import {notifications} from '@/services/firestore';
import {seenStore} from '@/services/notification-seen-store';

/**
 * The number on the bell, shared by every place that shows it so they can never
 * disagree: unread stored notices (live, from Firestore) plus derived alerts the
 * user has not yet seen in their current state.
 *
 * Returns null until the seen record has loaded, so a badge never flashes a
 * number for alerts that are about to turn out already seen. Callers render no
 * badge at all for null or 0.
 *
 * State is keyed by uid rather than reset when it changes, so one user's seen
 * record or count can never show while another's is loading.
 */
export function useNotificationBadge(uid: string | undefined, feed: FeedItem[] | null): number | null {
  const [seen, setSeen] = useState<{record: SeenRecord; uid: string} | null>(null);
  const [stored, setStored] = useState<{count: number; uid: string} | null>(null);

  useEffect(() => {
    if (!uid) return undefined;
    let active = true;
    void seenStore.load(uid).then((record) => { if (active) setSeen({record, uid}); });
    const unsubscribe = seenStore.subscribe((who, record) => { if (active && who === uid) setSeen({record, uid}); });
    return () => { active = false; unsubscribe(); };
  }, [uid]);

  // Live unread stored notices. If the listener fails, the feed's own stored
  // flags (as of its last load) are used instead.
  useEffect(() => {
    if (!uid) return undefined;
    let active = true;
    const unsubscribe = notifications.watchUnreadCount(
      uid,
      (count) => { if (active) setStored({count, uid}); },
      (error) => { console.warn('[Notifications] Live unread count unavailable', error); if (active) setStored(null); },
    );
    return () => { active = false; unsubscribe(); };
  }, [uid]);

  return useMemo(() => {
    if (!uid || !feed || seen?.uid !== uid) return null;
    return badgeCount(feed, seen.record, stored?.uid === uid ? stored.count : null);
  }, [feed, seen, stored, uid]);
}
