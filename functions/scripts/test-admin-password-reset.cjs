/* ADMIN-002 regression test: an admin "reset password" must send Firebase's own
 * reset email to the user and never hand a usable reset link to anyone.
 *
 * Runs the real callables (`.run`) against the Auth and Firestore emulators:
 *   npx firebase-tools emulators:exec --only firestore,auth "npm --prefix functions run test:admin-password-reset:local"
 * The email itself is sent by the client SDK (sendPasswordResetEmail) and is
 * checked in the browser run; this covers the server side: authorisation, the
 * audit entry, and that no link exists anywhere in a response or a record.
 */
const assert = require('node:assert/strict');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST are required.');
}
// Nothing in this test may reach a real Google service.
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'C:/no-such-dir/no-credentials.json';
process.env.STORAGE_EMULATOR_HOST = 'http://127.0.0.1:9';
process.env.FIREBASE_CONFIG ||= JSON.stringify({projectId: process.env.GCLOUD_PROJECT || 'smartlife-budget', storageBucket: 'smartlife-budget.firebasestorage.app'});

const functionsUnderTest = require('../lib/index');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore} = require('firebase-admin/firestore');

const auth = getAuth();
const db = getFirestore();
const LINK_PATTERN = /oobCode|https?:\/\/|mode=resetPassword|__\/auth\/action/i;

async function account(email, admin = false) {
  let user;
  try { user = await auth.getUserByEmail(email); } catch { user = await auth.createUser({email, password: 'reset-test-password'}); }
  await auth.setCustomUserClaims(user.uid, admin ? {admin: true} : {});
  return user.uid;
}

const call = (fn, uid, data, token = {}) => fn.run({app: undefined, auth: {token, uid}, data, instanceIdToken: undefined, rawRequest: {}});

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
  const adminUid = await account(`reset-admin-${stamp}@smartlife.test`, true);
  const otherAdminUid = await account(`reset-other-admin-${stamp}@smartlife.test`, true);
  const userEmail = `reset-user-${stamp}@smartlife.test`;
  const userUid = await account(userEmail);
  const reset = functionsUnderTest.adminPasswordReset;

  await check('the old link endpoint no longer returns a reset link', async () => {
    let response = null;
    let refused = null;
    try { response = await call(functionsUnderTest.adminCreatePasswordResetLink, adminUid, {email: userEmail}, {admin: true}); } catch (error) { refused = error; }
    assert.ok(!response || !LINK_PATTERN.test(JSON.stringify(response)), `a link came back: ${JSON.stringify(response)}`);
    assert.ok(refused, 'the old endpoint must refuse rather than pretend');
    assert.match(String(refused.message), /รีเฟรช/, 'the refusal tells an old admin page to refresh');
  });

  await check('an admin can authorise a reset for a user; the response carries no link', async () => {
    assert.equal(typeof reset, 'function', 'adminPasswordReset is not exported');
    const response = await call(reset, adminUid, {action: 'authorize', uid: userUid}, {admin: true});
    assert.equal(response.email, userEmail, 'the client needs the address to ask Firebase to send the email');
    assert.match(response.maskedEmail, /^r\*+@smartlife\.test$/);
    assert.ok(response.auditId);
    assert.doesNotMatch(JSON.stringify(response), LINK_PATTERN);
    const audit = (await db.doc(`adminAuditLog/${response.auditId}`).get()).data();
    assert.equal(audit.action, 'password_reset');
    assert.equal(audit.actorUid, adminUid);
    assert.equal(audit.targetUid, userUid);
    assert.equal(audit.result, 'authorized');
    assert.doesNotMatch(JSON.stringify(audit), LINK_PATTERN);
  });

  await check('the outcome is recorded on the audit entry (sent / failed), still without a link', async () => {
    const sent = await call(reset, adminUid, {action: 'authorize', uid: userUid}, {admin: true});
    await call(reset, adminUid, {action: 'record', auditId: sent.auditId, ok: true}, {admin: true});
    assert.equal((await db.doc(`adminAuditLog/${sent.auditId}`).get()).get('result'), 'sent');
    const failed = await call(reset, adminUid, {action: 'authorize', uid: userUid}, {admin: true});
    await call(reset, adminUid, {action: 'record', auditId: failed.auditId, errorCode: 'auth/too-many-requests', ok: false}, {admin: true});
    const record = (await db.doc(`adminAuditLog/${failed.auditId}`).get()).data();
    assert.equal(record.result, 'failed');
    assert.equal(record.errorCode, 'auth/too-many-requests');
    assert.ok(record.completedAt);
  });

  await check('a non-admin is refused', async () => {
    await assert.rejects(call(reset, userUid, {action: 'authorize', uid: userUid}, {}), (error) => error.code === 'permission-denied');
  });

  await check('an admin cannot reset another admin (refused in Thai)', async () => {
    await assert.rejects(call(reset, adminUid, {action: 'authorize', uid: otherAdminUid}, {admin: true}), (error) => error.code === 'permission-denied' && /ผู้ดูแล/.test(error.message));
    const audits = await db.collection('adminAuditLog').where('targetUid', '==', otherAdminUid).get();
    assert.equal(audits.size, 1, 'the refusal is audited too');
    assert.equal(audits.docs[0].get('result'), 'refused_admin_target');
  });

  await check('another admin cannot complete someone else\'s audit entry', async () => {
    const response = await call(reset, adminUid, {action: 'authorize', uid: userUid}, {admin: true});
    await assert.rejects(call(reset, otherAdminUid, {action: 'record', auditId: response.auditId, ok: true}, {admin: true}), (error) => error.code === 'permission-denied');
  });

  await check('an unknown account is refused with a Thai reason', async () => {
    await assert.rejects(call(reset, adminUid, {action: 'authorize', uid: 'no-such-user'}, {admin: true}), (error) => error.code === 'not-found' && /ไม่พบ/.test(error.message));
  });

  console.log(results.join('\n'));
  const failedCount = results.filter((line) => line.startsWith('FAIL')).length;
  console.log(`\n${results.length - failedCount}/${results.length} admin password-reset checks passed`);
  if (failedCount) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => setTimeout(() => process.exit(), 200));
