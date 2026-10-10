import type {DesktopNavKey} from '@/lib/desktop-web';
import {screenName} from '@/lib/page-titles';
import {PLANNER_TABS, USER_LEFT_TABS, USER_RIGHT_TABS} from '@/screens/native/user/user-ui';

export type DesktopNavItem = {icon: string; key: DesktopNavKey; label: string; page: string};

const tab = (list: readonly (readonly string[])[], page: string) => list.find((entry) => entry[2] === page);
const fromTab = (key: DesktopNavKey, list: readonly (readonly string[])[], page: string): DesktopNavItem => {
  const [icon, label] = tab(list, page) ?? ['circle', page];
  return {icon, key, label, page};
};

/**
 * The sidebar's items: the same screens and the same Thai labels the phone
 * layout already uses -- the tab bar's lists, the planner's switcher, and the
 * screen names the browser tab titles use -- so nothing is renamed and no
 * screen is invented.
 */
export const DESKTOP_MAIN_NAV: DesktopNavItem[] = [
  fromTab('index', USER_LEFT_TABS, 'index'),
  fromTab('planner', USER_LEFT_TABS, 'smartlife_planner'),
  {icon: 'note_alt', key: 'notes', label: PLANNER_TABS.find(([key]) => key === 'notes')?.[1] ?? 'โน้ต', page: 'smartlife_planner_notes'},
  fromTab('finance', USER_RIGHT_TABS, 'smartlife_finance_day'),
  {icon: 'smart_toy', key: 'assistant', label: screenName('user', 'smartlife_ai_assistant') ?? 'ผู้ช่วย AI', page: 'smartlife_ai_assistant'},
];

export const DESKTOP_ACCOUNT_NAV: DesktopNavItem[] = [
  {icon: 'notifications', key: 'notifications', label: screenName('user', 'smartlife_notifications') ?? 'การแจ้งเตือน', page: 'smartlife_notifications'},
  {icon: 'help', key: 'help', label: screenName('user', 'smartlife_help') ?? 'คู่มือการใช้งาน', page: 'smartlife_help'},
  fromTab('profile', USER_RIGHT_TABS, 'smartlife_profile'),
];

export const DESKTOP_ALL_NAV = [...DESKTOP_MAIN_NAV, ...DESKTOP_ACCOUNT_NAV];
