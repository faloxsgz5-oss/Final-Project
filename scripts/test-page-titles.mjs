// Run via `npm run test:page-titles`. Every screen the route dispatches gets a
// named tab title, page families resolve to their screen, and an unknown page
// falls back to the app's name instead of nothing.
import assert from 'node:assert/strict';

import {APP_NAME, pageTitle, screenName} from '../src/lib/page-titles.ts';

const cases = [
  ['login', 'login', 'เข้าสู่ระบบ · SmartLife'],
  ['login', 'register', 'สร้างบัญชีใหม่ · SmartLife'],
  ['user', 'index', 'หน้าหลัก · SmartLife'],
  ['user', 'smartlife_planner', 'แพลนเนอร์ · SmartLife'],
  ['user', 'smartlife_planner_notes', 'โน้ต · SmartLife'],
  ['user', 'smartlife_calendar_month', 'ปฏิทิน · SmartLife'],
  ['user', 'smartlife_notes_study', 'โน้ต · SmartLife'],
  ['user', 'smartlife_finance_day', 'การเงิน · SmartLife'],
  ['user', 'smartlife_finance_income', 'การเงิน · SmartLife'],
  ['user', 'smartlife_monthly_budget', 'กำหนดงบรายเดือน · SmartLife'],
  ['user', 'smartlife_ai_assistant', 'ผู้ช่วย AI · SmartLife'],
  ['user', 'smartlife_notifications', 'การแจ้งเตือน · SmartLife'],
  // Contains "_ai" but is a notifications page, as the route treats it.
  ['user', 'smartlife_notifications_ai', 'การแจ้งเตือน · SmartLife'],
  ['user', 'smartlife_profile', 'โปรไฟล์ · SmartLife'],
  ['user', 'smartlife_help', 'คู่มือการใช้งาน · SmartLife'],
  ['user', 'smartlife_scan_schedule', 'Smart Scan · SmartLife'],
  ['user', 'smartlife_scan_finance', 'สแกนใบเสร็จ · SmartLife'],
  ['user', 'smartlife_add_note', 'โน้ต · SmartLife'],
  ['user', 'smartlife_add_income', 'เพิ่มรายรับ · SmartLife'],
  ['admin', 'admin_dashboard', 'ผู้ดูแลระบบ · SmartLife'],
  ['admin', 'admin_finance', 'ผู้ดูแลระบบ · SmartLife'],
  // What the route passes when static export has collapsed /admin/index to /admin.
  ['admin', 'index', 'ผู้ดูแลระบบ · SmartLife'],
];
for (const [section, page, expected] of cases) assert.equal(pageTitle(section, page), expected, `${section}/${page}`);

assert.equal(pageTitle('user', 'smartlife_unknown_page'), APP_NAME);
assert.equal(pageTitle(undefined, undefined), APP_NAME);
assert.equal(screenName('user', 'smartlife_unknown_page'), null);

console.log(`page titles passed: ${cases.length} screens named, unknown pages fall back to "${APP_NAME}"`);
