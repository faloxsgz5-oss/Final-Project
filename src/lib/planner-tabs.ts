/**
 * The planner screen's tabs (ตาราง | โน้ต | Adaptive) and the address that
 * says which one is open, so the screen and everything around it -- the
 * desktop sidebar's highlight, the top bar's title, the browser title -- read
 * the same answer. Pure, so the mapping is unit-tested.
 *
 * The open tab lives in the URL as `?tab=schedule|notes|adaptive`. Without it
 * (every older link, the tab bar, the sidebar) each route keeps the tab it
 * always opened: /user/smartlife_planner the schedule, and
 * /user/smartlife_planner_notes the notes.
 */
export type PlannerTab = 'adaptive' | 'calendar' | 'notes';

export const PLANNER_PAGES = ['smartlife_planner', 'smartlife_planner_notes'] as const;

/** The `?tab=` value for each tab. */
export const PLANNER_TAB_PARAM: Record<PlannerTab, string> = {adaptive: 'adaptive', calendar: 'schedule', notes: 'notes'};

/** The tab a route opens without a `?tab=`. */
export function plannerDefaultTab(page: string | undefined): PlannerTab {
  return page === 'smartlife_planner_notes' ? 'notes' : 'calendar';
}

/** The open tab: the `?tab=` value when it names one, else the route's own. */
export function plannerTab(page: string | undefined, param: string | string[] | undefined): PlannerTab {
  const value = Array.isArray(param) ? param[0] : param;
  const named = (Object.keys(PLANNER_TAB_PARAM) as PlannerTab[]).find((tab) => PLANNER_TAB_PARAM[tab] === value);
  return named ?? plannerDefaultTab(page);
}

/**
 * The page a tab stands for -- the one whose name is the title and whose
 * sidebar item is highlighted. Adaptive is the planner's own scheduling view
 * (it plans the timetable), so it stands for แพลนเนอร์, not a page of its own.
 */
export const PLANNER_TAB_PAGE: Record<PlannerTab, string> = {adaptive: 'smartlife_planner', calendar: 'smartlife_planner', notes: 'smartlife_planner_notes'};

/**
 * The page the shell names and highlights for a `/user/<page>` route: on the
 * planner, the page its open tab stands for; anywhere else, the route itself.
 */
export function shellPage(page: string | undefined, param: string | string[] | undefined): string | undefined {
  if (!page || !(PLANNER_PAGES as readonly string[]).includes(page)) return page;
  return PLANNER_TAB_PAGE[plannerTab(page, param)];
}
