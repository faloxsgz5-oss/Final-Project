// Run via `npm run test:desktop-web`: the desktop rule and the sidebar's route mapping.
import assert from 'node:assert/strict';

import {DESKTOP_FULL_QUERY, DESKTOP_QUERY, desktopLayout, isDesktopEnvironment, navKeyForPage} from '../src/lib/desktop-web.ts';

assert.equal(DESKTOP_QUERY, '(min-width: 900px) and (hover: hover) and (pointer: fine)');
assert.equal(DESKTOP_FULL_QUERY, '(min-width: 1100px)');
const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
assert.equal(desktopLayout({full: true, matches: true, userAgent: win}), 'full', '>= 1100 with a mouse: the approved layout');
assert.equal(desktopLayout({full: false, matches: true, userAgent: win}), 'compact', '900-1099 with a mouse: rail + one column');
assert.equal(desktopLayout({full: true, matches: false, userAgent: win}), 'none', 'touch-primary at any width: phone layout');
assert.equal(desktopLayout({full: true, matches: true, maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}), 'none', 'iPad posing as a Mac');
assert.equal(isDesktopEnvironment({matches: true, maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}), true, 'a desktop browser');
assert.equal(isDesktopEnvironment({matches: true, maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}), true, 'a real Mac');
assert.equal(isDesktopEnvironment({matches: true, maxTouchPoints: 5, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'}), false, 'an iPad in desktop-site mode with a trackpad');
assert.equal(isDesktopEnvironment({matches: true, maxTouchPoints: 10, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}), true, 'a touchscreen laptop whose primary pointer is a mouse');
assert.equal(isDesktopEnvironment({matches: false}), false, 'narrow or touch-primary');

const cases = [
  ['index', 'index'], [undefined, 'index'],
  ['smartlife_planner', 'planner'], ['smartlife_calendar_month', 'planner'], ['smartlife_add_task', 'planner'], ['smartlife_adaptive_scheduling', 'planner'],
  ['smartlife_planner_notes', 'notes'], ['smartlife_notes_study', 'notes'], ['smartlife_add_note', 'notes'],
  ['smartlife_finance_day', 'finance'], ['smartlife_finance_income', 'finance'], ['smartlife_monthly_budget', 'finance'], ['smartlife_add_expense', 'finance'], ['smartlife_line_import', 'finance'],
  ['smartlife_ai_assistant', 'assistant'], ['smartlife_notifications', 'notifications'], ['smartlife_notifications_ai', 'notifications'],
  ['smartlife_help', 'help'], ['smartlife_profile', 'profile'], ['smartlife_scan_schedule', null],
];
for (const [page, key] of cases) assert.equal(navKeyForPage(page), key, String(page));
console.log(`desktop web passed: rule, layouts + ${cases.length} route mappings`);
