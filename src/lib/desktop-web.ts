/**
 * When the web app uses the desktop layout (a persistent sidebar instead of
 * the phone tab bar), and which sidebar item a route belongs to. Pure, so the
 * rule and the mapping are unit-tested; the hook in
 * `@/hooks/use-is-desktop-web` applies them to the live window.
 *
 * The rule, from measuring each device class in browser emulation (see the
 * JOB 2 report): every phone and tablet profile -- iPad Pro 12.9 landscape at
 * 1366x1024 included, in Chromium and WebKit -- reported `hover: none` and
 * `pointer: coarse`, and every laptop/desktop `hover: hover` and
 * `pointer: fine`. So the input type is what keeps tablets on the phone
 * layout, and the width only decides when a narrow desktop window does too.
 * 1024px is the narrowest common desktop viewport we want to treat as desktop
 * (a 1280-wide laptop at 125% scaling); below it the sidebar would squeeze the
 * content under the phone layout's own width.
 *
 * iPadOS Safari in "desktop website" mode reports itself as a Mac; with a
 * trackpad attached it may also report a fine pointer. A real Mac reports no
 * touch points, so a "Mac" with several is treated as an iPad.
 */
export const DESKTOP_MIN_WIDTH = 1024;
export const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px) and (hover: hover) and (pointer: fine)`;

export function isDesktopEnvironment({matches, maxTouchPoints = 0, userAgent = ''}: {matches: boolean; maxTouchPoints?: number; userAgent?: string}) {
  if (!matches) return false;
  const iPadAsMac = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  return !iPadAsMac;
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
