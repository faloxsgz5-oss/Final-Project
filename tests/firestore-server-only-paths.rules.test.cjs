// The admin password-reset audit log (ADMIN-002) and the per-user scan rate
// limit counters (SEC-001) are written only by Cloud Functions through the
// Admin SDK. Nothing in firestore.rules names these paths, so the catch-all
// `match /{document=**} { allow read, write: if false; }` must deny every
// client -- the owner, another user, an admin, and a signed-out caller. This
// test proves that with the production rules file, unchanged.
const fs = require('node:fs');
const path = require('node:path');
const {assertFails, assertSucceeds, initializeTestEnvironment} = require('@firebase/rules-unit-testing');
const {doc, getDoc, setDoc, updateDoc, deleteDoc} = require('firebase/firestore');

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'smartlife-server-only-paths-rules-test',
    firestore: {rules: fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8')},
  });
  try {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'adminAuditLog/entry-1'), {action: 'password_reset', actorUid: 'admin', result: 'authorized', targetUid: 'alice'});
      await setDoc(doc(db, 'scanRateLimits/alice'), {dayCount: 3, dayKey: '2026-10-11', hourCount: 3});
    });

    const clients = {
      admin: testEnv.authenticatedContext('admin', {admin: true, email: 'admin@example.com'}).firestore(),
      alice: testEnv.authenticatedContext('alice', {email: 'alice@example.com'}).firestore(),
      bob: testEnv.authenticatedContext('bob', {email: 'bob@example.com'}).firestore(),
      signedOut: testEnv.unauthenticatedContext().firestore(),
    };
    let checks = 0;
    for (const [who, db] of Object.entries(clients)) {
      for (const target of ['adminAuditLog/entry-1', 'scanRateLimits/alice']) {
        await assertFails(getDoc(doc(db, target)));
        await assertFails(setDoc(doc(db, target), {forged: true}));
        await assertFails(updateDoc(doc(db, target), {dayCount: 0, hourCount: 0, result: 'sent'}));
        await assertFails(deleteDoc(doc(db, target)));
        checks += 4;
      }
      void who;
    }
    // The owner's own counter is just as closed: a user cannot reset their limit.
    await assertFails(setDoc(doc(clients.alice, 'scanRateLimits/alice'), {dayCount: 0, hourCount: 0}));
    // Sanity: the same clients can still read what the rules do allow.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/alice'), {uid: 'alice'});
    });
    await assertSucceeds(getDoc(doc(clients.alice, 'users/alice')));
    console.log(`server-only paths: ${checks + 1} client reads/writes denied (owner, other user, admin, signed out)`);
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
