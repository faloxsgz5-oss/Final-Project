// USER-001 / USER-002 regression test, against the Auth and Firestore emulators
// with the production security rules loaded.
//
// Sign-up used to write the profile from two places at once: the token
// listener in `AuthProvider` ("ensure a profile") and `registerWithEmail`.
// Whichever landed second became an update the rules refuse, and the
// registration then deleted the brand-new Auth account. This drives the real
// `registerWithEmail` while the same listener the provider installs is running,
// many times over, and requires every account and profile to survive. It also
// requires an invalid display name to be refused before any account exists.
import assert from 'node:assert/strict';

import {onIdTokenChanged, signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword} from 'firebase/auth';
import {doc, getDoc} from 'firebase/firestore';

import {auth, db} from '@/lib/firebase';
import {ensureUserProfile, registerWithEmail} from '@/services/auth';

const RUNS = Number(process.env.SIGNUP_RUNS ?? 20);
const PASSWORD = 'signup-test-password';
const stamp = Date.now();

// The same work `AuthProvider` does on every token change.
const stopListening = onIdTokenChanged(auth, (user) => {
  if (user) ensureUserProfile(user).catch(() => undefined);
});

async function accountExists(email) {
  try {
    await signInWithEmailAndPassword(auth, email, PASSWORD);
    return true;
  } catch {
    return false;
  }
}

async function profileOf(uid) {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? snapshot.data() : null;
}

const failures = [];

async function registerAndCheck(label, displayName) {
  const email = `signup-${stamp}-${label}@smartlife.test`;
  let uid = null;
  let error = null;
  try {
    uid = (await registerWithEmail({displayName, email, password: PASSWORD})).uid;
  } catch (caught) {
    error = caught;
  }
  // Let the listener's own attempt settle before looking.
  await new Promise((resolve) => setTimeout(resolve, 400));
  await signOut(auth).catch(() => undefined);
  const exists = await accountExists(email);
  const signedInUid = auth.currentUser?.uid ?? null;
  const profile = signedInUid ? await profileOf(signedInUid) : null;
  await signOut(auth).catch(() => undefined);
  return {email, error, exists, profile, uid: uid ?? signedInUid};
}

// === 1. The race: every registration must keep its account and profile =====
// Half the runs at local speed, half with the Auth profile update taking as
// long as a real round-trip does -- the order in which the listener's write
// lands first, which is the one that used to delete the account.
for (let index = 0; index < RUNS; index += 1) {
  const name = `ผู้ทดสอบ สมัคร ${index}`;
  process.env.SIGNUP_PROFILE_DELAY_MS = index % 2 ? '350' : '0';
  const result = await registerAndCheck(`race-${index}`, name);
  if (!result.exists) failures.push(`run ${index}: the account was deleted (${result.error?.message ?? 'no error surfaced'})`);
  else if (!result.profile) failures.push(`run ${index}: account kept but no profile document`);
  else if (result.profile.displayName !== name) failures.push(`run ${index}: profile name "${result.profile.displayName}" is not the typed "${name}"`);
}
console.log(`sign-up race: ${RUNS - failures.length}/${RUNS} registrations kept their account and profile`);

// === 2. Names: emoji and Thai combining marks are kept exactly ===============
process.env.SIGNUP_PROFILE_DELAY_MS = "0";
for (const [label, name] of [
  ['emoji', 'น้องเมย์ 😀🎉👩‍💻 ทดสอบ'],
  ['combining', 'กิ่งก้านสาขา ผู้ใหญ่ใจดี ก็ ก่ ก้ ก๊ ก๋'],
  ['thai-80', 'ก'.repeat(80)],
]) {
  const result = await registerAndCheck(label, name);
  assert.ok(result.exists, `${label}: account must exist (${result.error?.message ?? ''})`);
  assert.equal(result.profile?.displayName, name, `${label}: profile must keep the name exactly`);
}
console.log('names with emoji, combining marks and exactly 80 characters: kept');

// === 3. USER-002: an over-long name is refused BEFORE any account exists ====
{
  const email = `signup-${stamp}-long@smartlife.test`;
  await assert.rejects(
    registerWithEmail({displayName: 'ก'.repeat(81), email, password: PASSWORD}),
    /80/,
    'an 81-character name must be refused with a message naming the limit',
  );
  await signOut(auth).catch(() => undefined);
  assert.equal(await accountExists(email), false, 'no account may be created for a name the rules would refuse');
  await signOut(auth).catch(() => undefined);
  await assert.rejects(registerWithEmail({displayName: '   ', email, password: PASSWORD}), /ชื่อ/);
  assert.equal(await accountExists(email), false, 'a blank name must not create an account either');
  await signOut(auth).catch(() => undefined);
}
console.log('over-long and blank names: refused before an account is created');

// === 4. An Auth account with no profile (an orphan) is healed on sign-in ======
{
  const email = `signup-${stamp}-orphan@smartlife.test`;
  const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  // The listener may already be creating it; wait for whatever it does.
  await ensureUserProfile(credential.user);
  await signOut(auth);
  const again = await signInWithEmailAndPassword(auth, email, PASSWORD);
  await ensureUserProfile(again.user);
  assert.ok(await profileOf(again.user.uid), 'signing in must leave a profile document behind');
  await signOut(auth);
}
console.log('account without a profile: profile created on sign-in');

// === 5. Retry policy: transient failures retried, never a rollback ==========
{
  const {readFileSync} = await import('node:fs');
  const {ProfileSetupError, withProfileRetry} = await import('@/services/auth');
  const waits = [];
  let calls = 0;
  await withProfileRetry(async () => { calls += 1; if (calls < 3) throw new Error('offline'); }, {sleep: async (ms) => { waits.push(ms); }});
  assert.equal(calls, 3, 'a write that fails twice and then works succeeds on the third try');
  assert.deepEqual(waits, [400, 800], 'the wait doubles between attempts');
  await assert.rejects(withProfileRetry(async () => { throw new Error('still offline'); }, {sleep: async () => undefined}), (error) => error instanceof ProfileSetupError && /บัญชีของคุณยังอยู่ครบ/.test(error.message));
  const source = readFileSync(new URL('../src/services/auth.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /deleteUser\s*\(/, 'sign-up must never delete the account it just created');
}
console.log('profile write retry: backs off, then reports ProfileSetupError without deleting anything');

stopListening();
if (failures.length) {
  console.error(failures.join('\n'));
  assert.fail(`${failures.length} of ${RUNS} sign-ups lost their account or profile`);
}
console.log('signup-profile tests passed');
process.exit(0);
