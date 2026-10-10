import type {ReactNode} from 'react';

/**
 * Native: the screens render as they always have. The web build resolves
 * `desktop-shell.web.tsx`, so the desktop sidebar never ships to the apps.
 */
export function DesktopShell({children}: {children: ReactNode}) {
  return children;
}
