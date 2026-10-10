import type {DesktopLayout} from '@/lib/desktop-web';

/**
 * Native: never the desktop layout. The web build resolves
 * `use-is-desktop-web.web.ts` instead, so no desktop code ships to the apps.
 */
export function useDesktopWebLayout(): DesktopLayout {
  return 'none';
}

export function useIsDesktopWeb() {
  return false;
}
