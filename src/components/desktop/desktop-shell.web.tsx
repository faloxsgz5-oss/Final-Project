import {usePathname, useRouter, type Href} from 'expo-router';
import {useCallback, useEffect, useMemo, useState, type ReactNode} from 'react';
import {StyleSheet, View} from 'react-native';

import {AddItemSheet} from '@/components/add-item-sheet';
import {useIsDesktopWeb} from '@/hooks/use-is-desktop-web';
import {useNotificationBadge} from '@/hooks/use-notification-badge';
import {navKeyForPage} from '@/lib/desktop-web';
import {useAuth} from '@/providers/auth-provider';
import type {FeedItem} from '@/services/notification-feed';
import {loadNotificationFeed} from '@/services/notification-feed-loader';

import {DESKTOP_C} from './desktop-theme';
import {DesktopSidebar} from './desktop-sidebar';
import {DesktopTopBar} from './desktop-top-bar';
import {QuickJump} from './quick-jump';

const COLLAPSE_KEY = '@smartlife/desktop-sidebar-collapsed';
let collapsedInMemory = false;

function readCollapsed() {
  try { return window.localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return collapsedInMemory; }
}
function writeCollapsed(value: boolean) {
  collapsedInMemory = value;
  try { window.localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0'); } catch { /* memory only this session */ }
}

/** Re-reads the feed on navigation, but not more often than this. */
const FEED_REFRESH_MS = 30_000;

/**
 * The desktop web layout: a persistent sidebar and a slim top bar around the
 * same screens the phone layout shows. It takes over only on a desktop-sized
 * web window (see `useIsDesktopWeb`), only for the signed-in user section --
 * sign-in pages and the admin portal keep their own layouts -- and otherwise
 * renders the screens exactly as before.
 *
 * Screens are not forked: the router outlet is rendered unchanged inside the
 * content column, and the phone tab bar hides itself when this is showing.
 */
export function DesktopShell({children}: {children: ReactNode}) {
  const desktop = useIsDesktopWeb();
  const pathname = usePathname();
  const {role, user} = useAuth();
  const [section, page] = pathname.split('/').filter(Boolean);
  const active = desktop && section === 'user' && Boolean(user) && role !== 'admin';
  return active ? <ShellFrame page={page ?? 'index'} uid={user!.uid}>{children}</ShellFrame> : children;
}

function ShellFrame({children, page, uid}: {children: ReactNode; page: string; uid: string}) {
  const router = useRouter();
  const {user} = useAuth();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [addOpen, setAddOpen] = useState(false);
  const [jumpOpen, setJumpOpen] = useState(false);
  const navigate = useCallback((target: string) => router.push(`/user/${target}` as Href), [router]);
  const toggleCollapsed = useCallback(() => setCollapsed((current) => { writeCollapsed(!current); return !current; }), []);

  // The feed the bells count, read on arrival and again as the user moves
  // around (throttled). Stored notices are live through the badge hook, and
  // seeing the list updates the count at once through the seen store.
  const [feedState, setFeedState] = useState<{at: number; feed: FeedItem[]; uid: string} | null>(null);
  useEffect(() => {
    if (feedState?.uid === uid && Date.now() - feedState.at < FEED_REFRESH_MS) return undefined;
    let cancelled = false;
    loadNotificationFeed(uid, '[DesktopShell]')
      .then((feed) => { if (!cancelled) setFeedState({at: Date.now(), feed, uid}); })
      .catch((error) => console.warn('[DesktopShell] Notification feed unavailable', error));
    return () => { cancelled = true; };
    // `feedState` is read only to throttle; re-running on its change would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, uid]);
  const badge = useNotificationBadge(uid, feedState?.uid === uid ? feedState.feed : null) ?? 0;

  // Ctrl/Cmd+K opens the quick jump, Ctrl/Cmd+\ collapses the sidebar.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'k') { event.preventDefault(); setJumpOpen(true); }
      else if (event.key === '\\') { event.preventDefault(); toggleCollapsed(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  const activeKey = useMemo(() => navKeyForPage(page), [page]);
  const name = user?.displayName || user?.email?.split('@')[0] || 'SmartLife';

  return (
    <View style={styles.frame}>
      <DesktopSidebar
        activeKey={activeKey}
        badge={badge}
        collapsed={collapsed}
        name={name}
        onAdd={() => setAddOpen(true)}
        onNavigate={navigate}
        onSearch={() => setJumpOpen(true)}
        onToggleCollapsed={toggleCollapsed}
      />
      <View style={styles.main}>
        <DesktopTopBar badge={badge} name={name} onAdd={() => setAddOpen(true)} onNavigate={navigate} page={page} />
        <View style={styles.content}>{children}</View>
      </View>
      <AddItemSheet onClose={() => setAddOpen(false)} onNavigate={navigate} visible={addOpen} />
      <QuickJump onClose={() => setJumpOpen(false)} onNavigate={navigate} visible={jumpOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {flex: 1, minHeight: 0},
  frame: {backgroundColor: DESKTOP_C.page, flex: 1, flexDirection: 'row'},
  main: {flex: 1, minWidth: 0},
});
