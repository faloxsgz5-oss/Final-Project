import {useSyncExternalStore} from 'react';

import {DESKTOP_FULL_QUERY, DESKTOP_QUERY, desktopLayout, type DesktopLayout} from '@/lib/desktop-web';

function snapshot(): DesktopLayout {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'none';
  return desktopLayout({
    full: window.matchMedia(DESKTOP_FULL_QUERY).matches,
    matches: window.matchMedia(DESKTOP_QUERY).matches,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    userAgent: navigator.userAgent ?? '',
  });
}

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  // `change` covers resizing across either width and plugging or unplugging
  // a mouse; orientation changes resize the window, so they arrive here too.
  const queries = [window.matchMedia(DESKTOP_QUERY), window.matchMedia(DESKTOP_FULL_QUERY)];
  queries.forEach((query) => query.addEventListener('change', onChange));
  return () => queries.forEach((query) => query.removeEventListener('change', onChange));
}

/**
 * Which web layout this window gets (see `@/lib/desktop-web` for the rule and
 * the measurements behind it): 'none' is the phone layout with its bottom tab
 * bar, 'compact' the desktop shell with an icon rail and a one-column
 * dashboard, 'full' the full sidebar and two columns. Reactive to resizing.
 *
 * The static export renders on the server, where there is no window, so the
 * server snapshot is 'none' and hydration matches. Signed-in pages render a
 * loading state in that HTML (auth resolves only in the browser), so the
 * switch to the desktop shell lands before any page content is shown and
 * there is no flash of the phone layout.
 */
export function useDesktopWebLayout(): DesktopLayout {
  return useSyncExternalStore(subscribe, snapshot, () => 'none');
}

/** True for either desktop layout; the phone layout otherwise. */
export function useIsDesktopWeb() {
  return useDesktopWebLayout() !== 'none';
}
