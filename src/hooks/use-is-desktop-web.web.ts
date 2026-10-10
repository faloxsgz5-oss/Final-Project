import {useSyncExternalStore} from 'react';

import {DESKTOP_QUERY, isDesktopEnvironment} from '@/lib/desktop-web';

function snapshot() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return isDesktopEnvironment({
    matches: window.matchMedia(DESKTOP_QUERY).matches,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    userAgent: navigator.userAgent ?? '',
  });
}

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia(DESKTOP_QUERY);
  // `change` covers resizing across the width and plugging or unplugging a
  // mouse; orientation changes resize the window, so they arrive here too.
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * True only on a desktop-sized web window driven by a mouse or trackpad (see
 * `@/lib/desktop-web` for the rule and why). Reactive to resizing.
 *
 * The static export renders on the server, where there is no window, so the
 * server snapshot is false and hydration matches. Signed-in pages render a
 * loading state in that HTML (auth resolves only in the browser), so the
 * switch to the desktop shell lands before any page content is shown and
 * there is no flash of the phone layout.
 */
export function useIsDesktopWeb() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
