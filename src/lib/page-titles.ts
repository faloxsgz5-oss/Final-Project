/**
 * The browser-tab title for every screen: "<screen> · SmartLife", in the
 * words the screen itself uses.
 *
 * Every screen is served by the one dynamic route `[section]/[page]`, so this
 * is the single place that names them. Matching mirrors that route's own
 * dispatch: exact pages first, then the page families that share a screen
 * (`smartlife_finance_*`, `smartlife_notifications_*`, ...), then the
 * assistant's `ai_` pages, which the route also matches last. Anything else
 * falls back to the app's full name rather than a raw URL.
 */

export const APP_NAME = 'SmartLife & Budget Balance';
const SUFFIX = 'SmartLife';

const EXACT: Record<string, string> = {
  'login/login': 'เข้าสู่ระบบ',
  'login/register': 'สร้างบัญชีใหม่',
  'user/index': 'หน้าหลัก',
  'user/smartlife_planner': 'แพลนเนอร์',
  'user/smartlife_planner_notes': 'โน้ต',
  'user/smartlife_monthly_budget': 'กำหนดงบรายเดือน',
  'user/smartlife_profile': 'โปรไฟล์',
  'user/smartlife_help': 'คู่มือการใช้งาน',
  'user/smartlife_adaptive_scheduling': 'Adaptive AI',
  'user/smartlife_ocr_history': 'ประวัติการสแกน',
  // The add pages, named as the "+" menu names them.
  'user/smartlife_add_activity': 'กิจกรรม/ตารางใหม่',
  'user/smartlife_add_task': 'เพิ่มงาน',
  'user/smartlife_add_appointment': 'นัดหมาย',
  'user/smartlife_add_income': 'เพิ่มรายรับ',
  'user/smartlife_add_expense': 'เพิ่มรายจ่าย',
  'user/smartlife_add_note': 'โน้ต',
};

// Page families that one screen serves, in the route's own order.
const FAMILIES: [prefix: string, title: string][] = [
  ['user/smartlife_calendar', 'ปฏิทิน'],
  ['user/smartlife_finance', 'การเงิน'],
  ['user/smartlife_notes', 'โน้ต'],
  ['user/smartlife_notifications', 'การแจ้งเตือน'],
  ['user/smartlife_scan_finance', 'สแกนใบเสร็จ'],
  ['user/smartlife_receipt', 'สแกนใบเสร็จ'],
  ['user/smartlife_scan', 'Smart Scan'],
  ['user/smartlife_line', 'นำเข้าจาก LINE'],
  ['user/smartlife_save_', 'เพิ่มรายการ'],
  ['user/smartlife_schedule_finance_sync', 'ตารางและการเงิน'],
  ['user/smartlife_onboarding', 'เริ่มต้นใช้งาน'],
  ['admin/', 'ผู้ดูแลระบบ'],
];

/** The screen's own name, or null when the page is not one this app names. */
export function screenName(section?: string, page?: string): string | null {
  if (!section || !page) return null;
  const key = `${section}/${page}`;
  if (EXACT[key]) return EXACT[key];
  const family = FAMILIES.find(([prefix]) => key.startsWith(prefix));
  if (family) return family[1];
  if (section === 'user' && page.includes('ai_')) return 'ผู้ช่วย AI';
  return null;
}

/** "<screen> · SmartLife", or the full app name when the screen is unknown. */
export function pageTitle(section?: string, page?: string): string {
  const name = screenName(section, page);
  return name ? `${name} · ${SUFFIX}` : APP_NAME;
}
