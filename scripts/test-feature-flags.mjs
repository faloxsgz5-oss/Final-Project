// Run via `npm run test:feature-flags`. A build flag turns on only for the word
// "true"; anything else -- unset, empty, "1", "yes", "false" -- leaves it off,
// so the Facebook button stays hidden unless a build asks for it explicitly.
import assert from 'node:assert/strict';

import {flagEnabled} from '../src/lib/feature-flags.ts';

const cases = [
  [undefined, false],
  ['', false],
  ['false', false],
  ['0', false],
  ['1', false],
  ['yes', false],
  ['on', false],
  ['true', true],
  ['TRUE', true],
  [' true ', true],
];
for (const [value, expected] of cases) assert.equal(flagEnabled(value), expected, JSON.stringify(value));

// The module's own value follows the same rule for whatever this process has.
const {facebookLoginEnabled} = await import('../src/lib/feature-flags.ts');
assert.equal(facebookLoginEnabled, flagEnabled(process.env.EXPO_PUBLIC_FACEBOOK_LOGIN_ENABLED));

console.log(`feature flags passed: ${cases.length} values, only "true" turns a flag on`);
