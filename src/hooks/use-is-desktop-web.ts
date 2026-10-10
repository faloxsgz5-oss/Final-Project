/**
 * Native: never the desktop layout. The web build resolves
 * `use-is-desktop-web.web.ts` instead, so no desktop code ships to the apps.
 */
export function useIsDesktopWeb() {
  return false;
}
