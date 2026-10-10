/**
 * When the web app uses the desktop layout (a persistent sidebar instead of
 * the phone tab bar), and which sidebar item a route belongs to. Pure, so the
 * rule and the mapping are unit-tested; the hook in
 * `@/hooks/use-is-desktop-web` applies them to the live window.
 *
 * Measured in Chromium and WebKit emulation (the device table in the report):
 * every phone and tablet profile -- iPhones, Galaxy and Pixel phones and
 * foldables, Android's "desktop site" mode, every iPad including the 12.9 at
 * 1366x1024 and posing as a Mac, Android tablets up to 2560 wide, a Surface in
 * tablet mode, a Chromebook tablet -- reports `hover: none` and
 * `pointer: coarse`, and every laptop and desktop window `hover: hover` and
 * `pointer: fine`. So the input type is what keeps phones and tablets on the
 * phone layout at any width; the width only decides when a narrowed desktop
 * window falls back to it.
 *
 * 900px: a browser snapped to half of a 1920 screen is about 960 CSS px (less
 * its borders), and should stay a desktop layout; below 900 a mouse window
 * gets the phone layout, which still works. Between 900 and 1100 the layout
 * is "compact": the sidebar is an icon rail and the dashboard one column, so
 * nothing is cramped. From 1100 up it is the full layout -- full sidebar, two
 * columns, 1180px content.
 *
 * iPadOS Safari in "desktop website" mode reports itself as a Mac; with a
 * trackpad attached it may also report a fine pointer. A real Mac reports no
 * touch points, so a "Mac" with several is treated as an iPad.
 */
export const DESKTOP_MIN_WIDTH = 900;
export const DESKTOP_FULL_MIN_WIDTH = 1100;
export const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px) and (hover: hover) and (pointer: fine)`;
export const DESKTOP_FULL_QUERY = `(min-width: ${DESKTOP_FULL_MIN_WIDTH}px)`;

export type DesktopLayout = 'none' | 'compact' | 'full';

export function isDesktopEnvironment({matches, maxTouchPoints = 0, userAgent = ''}: {matches: boolean; maxTouchPoints?: number; userAgent?: string}) {
  if (!matches) return false;
  const iPadAsMac = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  return !iPadAsMac;
}

/** 'none' (phone layout), 'compact' (rail + one column) or 'full' (the approved desktop look). */
export function desktopLayout({full, ...environment}: {full: boolean; matches: boolean; maxTouchPoints?: number; userAgent?: string}): DesktopLayout {
  if (!isDesktopEnvironment(environment)) return 'none';
  return full ? 'full' : 'compact';
}

export type DesktopNavKey = 'index' | 'planner' | 'notes' | 'finance' | 'assistant' | 'notifications' | 'help' | 'profile';

/**
 * The sidebar item a `/user/<page>` route belongs to, so a nested page (a
 * finance sub-view, the add-note form, a notification category) keeps its
 * section highlighted. Null for pages that belong to no item.
 */
export function navKeyForPage(page: string | undefined): DesktopNavKey | null {
  if (!page || page === 'index') return 'index';
  if (page === 'smartlife_planner_notes' || page.startsWith('smartlife_notes') || page === 'smartlife_add_note') return 'notes';
  if (page === 'smartlife_planner' || page.startsWith('smartlife_calendar') || page === 'smartlife_adaptive_scheduling'
    || ['smartlife_add_activity', 'smartlife_add_task', 'smartlife_add_appointment', 'smartlife_save_activity', 'smartlife_save_task', 'smartlife_save_appointment'].includes(page)) return 'planner';
  if (page.startsWith('smartlife_notifications')) return 'notifications';
  if (page.startsWith('smartlife_finance') || page === 'smartlife_monthly_budget' || page.startsWith('smartlife_line')
    || page === 'smartlife_add_income' || page === 'smartlife_add_expense' || page.startsWith('smartlife_schedule_finance')) return 'finance';
  if (page === 'smartlife_help') return 'help';
  if (page === 'smartlife_profile') return 'profile';
  if (page.includes('ai_')) return 'assistant';
  return null;
}
