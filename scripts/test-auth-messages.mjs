// Run via `npm run test:auth-messages`. A Facebook sign-in that hits an email
// already registered another way names that way in Thai, falls back to the old
// wording when Firebase hides the methods, and network failures are recognised.
import assert from 'node:assert/strict';

import {EXISTING_ACCOUNT_FALLBACK, existingAccountMessage, isNetworkFailure, SOCIAL_NETWORK_MESSAGE} from '../src/services/auth-messages.ts';

const cases = [
  [['google.com'], 'อีเมลนี้สมัครไว้ด้วย Google กรุณาเข้าสู่ระบบด้วย Google'],
  [['password'], 'อีเมลนี้สมัครไว้ด้วยอีเมลและรหัสผ่าน กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน'],
  // Google wins over a password on the same email.
  [['password', 'google.com'], 'อีเมลนี้สมัครไว้ด้วย Google กรุณาเข้าสู่ระบบด้วย Google'],
  // The provider that just failed is never suggested back.
  [['facebook.com'], EXISTING_ACCOUNT_FALLBACK],
  // Email enumeration protection returns no methods at all.
  [[], EXISTING_ACCOUNT_FALLBACK],
  [['apple.com'], EXISTING_ACCOUNT_FALLBACK],
];
for (const [methods, expected] of cases) assert.equal(existingAccountMessage(methods), expected, methods.join(',') || '(none)');
assert.equal(EXISTING_ACCOUNT_FALLBACK, 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบด้วยวิธีเดิมก่อน', 'fallback keeps the old wording');

const network = [
  [['auth/network-request-failed', ''], true],
  [[undefined, 'CONNECTION_FAILURE: Network is unreachable'], true],
  [[undefined, 'The request timed out.'], true],
  [[undefined, 'User cancelled the login process'], false],
  [['auth/invalid-credential', 'Firebase: Error (auth/invalid-credential).'], false],
];
for (const [[code, message], expected] of network) assert.equal(isNetworkFailure(code, message), expected, `${code} ${message}`);
assert.ok(SOCIAL_NETWORK_MESSAGE.length > 0);

console.log(`auth messages passed: ${cases.length} existing-account cases, ${network.length} network cases`);
