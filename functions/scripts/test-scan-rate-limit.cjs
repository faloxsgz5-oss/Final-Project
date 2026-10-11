/* SEC-001 regression test: the paid scan function must cap each user.
 *
 * Runs the real analyzeScan callable (`.run`) against the Firestore emulator:
 *   npx firebase-tools emulators:exec --only firestore "npm --prefix functions run test:scan-rate-limit:local"
 *
 * Nothing here may reach a paid or production service: Storage points at a
 * closed local port and Google credentials at a file that does not exist, so a
 * scan that gets past the limit fails immediately at reading its file. What is
 * measured is whether the limit refuses the call first (resource-exhausted).
 */
const assert = require('node:assert/strict');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is required.');
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'C:/no-such-dir/no-credentials.json';
process.env.STORAGE_EMULATOR_HOST = 'http://127.0.0.1:9';
process.env.FIREBASE_CONFIG ||= JSON.stringify({projectId: process.env.GCLOUD_PROJECT || 'smartlife-budget', storageBucket: 'smartlife-budget.firebasestorage.app'});
process.env.IAPP_API_KEY = '';
process.env.GEMINI_OCR_API_KEY = '';

// The old code went on to the paid Vision fallback, where the missing
// credentials surface as an uncaught error; record it and keep going so each
// check still reports.
let escapedErrors = 0;
process.on('uncaughtException', () => { escapedErrors += 1; });
process.on('unhandledRejection', () => { escapedErrors += 1; });

const functionsUnderTest = require('../lib/index');
const {getFirestore, Timestamp} = require('firebase-admin/firestore');
const db = getFirestore();
const {analyzeScan} = functionsUnderTest;

const PER_HOUR = functionsUnderTest.SCANS_PER_HOUR ?? 20;
const PER_DAY = functionsUnderTest.SCANS_PER_DAY ?? 100;

async function scan(uid, {app, path, scanType = 'receipt'} = {}) {
  try {
    await analyzeScan.run({app, auth: uid ? {token: {}, uid} : undefined, data: {scanType, storagePath: path ?? `users/${uid}/receipts/r.jpg`}, instanceIdToken: undefined, rawRequest: {}});
    return 'ok';
  } catch (error) {
    return error.code || String(error.message);
  }
}

const results = [];
async function check(name, body) {
  try {
    await body();
    results.push(`PASS  ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name}\n      ${String(error && error.message).split('\n')[0]}`);
  }
}

async function main() {
  const stamp = Date.now();
  const alice = `scan-alice-${stamp}`;
  const bob = `scan-bob-${stamp}`;

  await check('named limits exist: 20 per hour and 100 per day by default', async () => {
    assert.equal(functionsUnderTest.SCANS_PER_HOUR, 20);
    assert.equal(functionsUnderTest.SCANS_PER_DAY, 100);
    assert.ok(functionsUnderTest.SCAN_MAX_INSTANCES > 0, 'a maxInstances cap is set');
    assert.equal(functionsUnderTest.MAX_SCAN_BYTES, 10 * 1024 * 1024);
  });

  await check(`the ${PER_HOUR + 1}st scan inside an hour is refused`, async () => {
    const outcomes = [];
    for (let index = 0; index <= PER_HOUR; index += 1) outcomes.push(await scan(alice));
    const refused = outcomes.filter((code) => code === 'resource-exhausted').length;
    assert.equal(refused, 1, `expected exactly the last call refused, got ${JSON.stringify(outcomes)}`);
    assert.equal(outcomes[PER_HOUR], 'resource-exhausted');
  });

  await check('the refusal is in Thai and says how long to wait', async () => {
    try {
      await analyzeScan.run({auth: {token: {}, uid: alice}, data: {scanType: 'receipt', storagePath: `users/${alice}/receipts/r.jpg`}, rawRequest: {}});
      assert.fail('should have been refused');
    } catch (error) {
      assert.equal(error.code, 'resource-exhausted');
      assert.match(error.message, /สแกน.*ชั่วโมง/);
      assert.ok(error.details && error.details.retryAfterSeconds > 0);
    }
  });

  await check('counters are per user: another user is unaffected', async () => {
    assert.notEqual(await scan(bob), 'resource-exhausted');
  });

  await check('the hourly window resets', async () => {
    await db.doc(`scanRateLimits/${alice}`).update({hourStartedAt: Timestamp.fromMillis(Date.now() - 61 * 60 * 1000)});
    assert.notEqual(await scan(alice), 'resource-exhausted');
  });

  await check(`the daily cap of ${PER_DAY} applies even across hours`, async () => {
    const reference = db.doc(`scanRateLimits/${alice}`);
    const counter = (await reference.get()).data();
    await reference.update({dayCount: PER_DAY, hourCount: 0, hourStartedAt: Timestamp.fromMillis(Date.now() - 61 * 60 * 1000)});
    assert.equal(await scan(alice), 'resource-exhausted');
    await reference.update({dayKey: '2000-01-01'});
    assert.notEqual(await scan(alice), 'resource-exhausted', 'a new day starts a new count');
    void counter;
  });

  await check('requests refused for bad input do not use up the allowance', async () => {
    const carol = `scan-carol-${stamp}`;
    for (let index = 0; index < 30; index += 1) await scan(carol, {path: `users/someone-else/receipts/r.jpg`});
    const counter = (await db.doc(`scanRateLimits/${carol}`).get()).data();
    assert.ok(!counter || !counter.hourCount, `bad requests were counted: ${JSON.stringify(counter)}`);
  });

  await check('an oversized or malformed storage path is refused', async () => {
    const dave = `scan-dave-${stamp}`;
    assert.equal(await scan(dave, {path: `users/${dave}/receipts/${'x'.repeat(600)}.jpg`}), 'invalid-argument');
    assert.equal(await scan(dave, {path: `users/${dave}/receipts/../../other/r.jpg`}), 'invalid-argument');
  });

  await check('unauthenticated calls are refused', async () => {
    assert.equal(await scan(null, {path: 'users/x/receipts/r.jpg'}), 'unauthenticated');
  });

  await check('the scan log records whether an App Check token was present (not enforced)', async () => {
    const erin = `scan-erin-${stamp}`;
    await db.doc(`scanRateLimits/${erin}`).delete().catch(() => undefined);
    // Point the size check at a file that "exists" is not possible without
    // Storage, so the record is written before the file is read.
    await scan(erin, {app: {appId: 'test-app', token: {}}});
    await scan(erin);
    const logs = await db.collection(`users/${erin}/scanLogs`).get();
    const values = logs.docs.map((item) => item.get('appCheck')).sort();
    assert.deepEqual(values, ['missing', 'verified']);
  });

  console.log(results.join('\n'));
  console.log(`errors that escaped analyzeScan (scans that reached the paid OCR fallback): ${escapedErrors}`);
  if (escapedErrors && functionsUnderTest.SCANS_PER_HOUR) results.push('FAIL  no scan may reach the OCR fallback in this test');
  const failed = results.filter((line) => line.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} scan rate-limit checks passed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => setTimeout(() => process.exit(), 200));
