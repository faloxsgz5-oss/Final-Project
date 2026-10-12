// `users/{uid}` profile create and update. A Facebook account without an email
// has no `email` claim in its token; it may create and keep its own profile
// with an empty email. Everyone else is held to exactly what they were before:
// a token with an email must store that email, nobody writes another person's
// profile, and an admin reads but never writes profiles.
const fs = require('node:fs');
const path = require('node:path');
const {assertFails, assertSucceeds, initializeTestEnvironment} = require('@firebase/rules-unit-testing');
const {doc, getDoc, serverTimestamp, setDoc, updateDoc} = require('firebase/firestore');

// Exactly what `ensureUserProfile` in src/services/auth.ts writes.
function profile(uid, email) {
  return {
    uid,
    email,
    displayName: 'ผู้ใช้ทดสอบ',
    avatarUrl: '',
    consentHistory: [{changedAt: new Date(), method: 'onboarding', tier: 'manual_only'}],
    consentTier: 'manual_only',
    lineConsentUpdatedAt: serverTimestamp(),
    lineConsentVersion: 1,
    lineListenerStatus: 'not_applicable',
    role: 'user',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'smartlife-user-profile-rules-test',
    firestore: {rules: fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8')},
  });
  let checks = 0;
  const allowed = async (promise) => { await assertSucceeds(promise); checks += 1; };
  const denied = async (promise) => { await assertFails(promise); checks += 1; };
  try {
    await testEnv.clearFirestore();
    const noMail = testEnv.authenticatedContext('nomail').firestore();
    const alice = testEnv.authenticatedContext('alice', {email: 'alice@example.com'}).firestore();
    const bob = testEnv.authenticatedContext('bob', {email: 'bob@example.com'}).firestore();
    const admin = testEnv.authenticatedContext('admin', {admin: true, email: 'admin@example.com'}).firestore();
    const signedOut = testEnv.unauthenticatedContext().firestore();

    // No-email account: may create its own profile, but only with an empty email.
    await denied(setDoc(doc(noMail, 'users/nomail'), profile('nomail', 'someone@example.com')));
    await allowed(setDoc(doc(noMail, 'users/nomail'), profile('nomail', '')));
    await allowed(updateDoc(doc(noMail, 'users/nomail'), {displayName: 'ชื่อใหม่', updatedAt: serverTimestamp()}));
    await denied(updateDoc(doc(noMail, 'users/nomail'), {email: 'someone@example.com', updatedAt: serverTimestamp()}));
    await allowed(getDoc(doc(noMail, 'users/nomail')));

    // Email account: unchanged -- the stored email must match the token exactly.
    await denied(setDoc(doc(alice, 'users/alice'), profile('alice', 'mallory@example.com')));
    await denied(setDoc(doc(alice, 'users/alice'), profile('alice', '')));
    await denied(setDoc(doc(alice, 'users/alice'), profile('alice', 'ALICE@example.com')));
    await allowed(setDoc(doc(alice, 'users/alice'), profile('alice', 'alice@example.com')));
    await allowed(updateDoc(doc(alice, 'users/alice'), {displayName: 'Alice', updatedAt: serverTimestamp()}));
    await denied(updateDoc(doc(alice, 'users/alice'), {email: '', updatedAt: serverTimestamp()}));

    // Another person's profile: never written, never read.
    await denied(setDoc(doc(noMail, 'users/bob'), profile('bob', '')));
    await denied(setDoc(doc(bob, 'users/nomail2'), profile('nomail2', '')));
    await denied(updateDoc(doc(bob, 'users/alice'), {displayName: 'Hacked', updatedAt: serverTimestamp()}));
    await denied(updateDoc(doc(noMail, 'users/alice'), {displayName: 'Hacked', updatedAt: serverTimestamp()}));
    await denied(getDoc(doc(bob, 'users/alice')));
    await denied(getDoc(doc(noMail, 'users/alice')));

    // Admin: reads any profile, writes none (unchanged).
    await allowed(getDoc(doc(admin, 'users/alice')));
    await allowed(getDoc(doc(admin, 'users/nomail')));
    await denied(setDoc(doc(admin, 'users/carol'), profile('carol', 'admin@example.com')));
    await denied(updateDoc(doc(admin, 'users/alice'), {displayName: 'Admin edit', updatedAt: serverTimestamp()}));

    // Signed out: nothing.
    await denied(setDoc(doc(signedOut, 'users/ghost'), profile('ghost', '')));
    await denied(getDoc(doc(signedOut, 'users/nomail')));

    console.log(`user profile rules: ${checks} checks passed (no-email create/update, email match unchanged, other users and admin writes denied)`);
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
