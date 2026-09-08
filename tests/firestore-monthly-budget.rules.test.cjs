const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc} = require('firebase/firestore');

const MONTH = '2026-08';

function budget(overrides = {}) {
  return {
    amount: 4500,
    createdAt: serverTimestamp(),
    monthKey: MONTH,
    ownerId: 'alice',
    source: 'manual',
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

async function main() {
  const testEnv = await initializeTestEnvironment({
    firestore: {rules: fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8')},
    projectId: 'smartlife-monthly-budget-rules-test',
  });

  try {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', 'alice'), {uid: 'alice'});
      await setDoc(doc(adminDb, 'users', 'bob'), {uid: 'bob'});
    });

    const alice = testEnv.authenticatedContext('alice', {email: 'alice@example.com'}).firestore();
    const bob = testEnv.authenticatedContext('bob', {email: 'bob@example.com'}).firestore();
    const admin = testEnv.authenticatedContext('root', {admin: true, email: 'root@example.com'}).firestore();
    const anonymous = testEnv.unauthenticatedContext().firestore();

    const alicePath = ['users', 'alice', 'monthlyBudgets', MONTH];

    // --- The owner can write and read back their own limit.
    await assertSucceeds(setDoc(doc(alice, ...alicePath), budget()));
    await assertSucceeds(getDoc(doc(alice, ...alicePath)));

    // --- Nobody else can reach it. This is the property that matters most:
    // a budget is private to the user it belongs to.
    await assertFails(getDoc(doc(bob, ...alicePath)));
    await assertFails(getDoc(doc(anonymous, ...alicePath)));
    await assertFails(setDoc(doc(bob, ...alicePath), budget()));
    await assertFails(setDoc(doc(anonymous, ...alicePath), budget()));
    await assertFails(deleteDoc(doc(bob, ...alicePath)));

    // --- Bob cannot create a budget under his own path claiming Alice owns it,
    // nor write into Alice's collection at another month.
    await assertFails(setDoc(doc(bob, 'users', 'bob', 'monthlyBudgets', MONTH), budget({ownerId: 'alice'})));
    await assertFails(setDoc(doc(bob, 'users', 'alice', 'monthlyBudgets', '2026-09'), budget({monthKey: '2026-09'})));

    // --- Admin keeps read-only visibility, matching every sibling collection.
    await assertSucceeds(getDoc(doc(admin, ...alicePath)));
    await assertFails(setDoc(doc(admin, ...alicePath), budget({amount: 999})));
    await assertFails(deleteDoc(doc(admin, ...alicePath)));

    // --- Amounts that cannot describe a spending limit are refused server-side,
    // so a tampered client cannot store one.
    for (const amount of [0, -100, 10000001]) {
      await assertFails(setDoc(doc(alice, 'users', 'alice', 'monthlyBudgets', '2026-09'), budget({amount, monthKey: '2026-09'})));
    }
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'monthlyBudgets', '2026-09'), budget({amount: '4500', monthKey: '2026-09'})));

    // --- The document id must be a real Bangkok month key, and the stored
    // monthKey must agree with it, so a budget cannot be filed under a month
    // it does not belong to.
    for (const badId of ['2026-13', '2026-00', '2026-1', 'August', '2026-08-01']) {
      await assertFails(setDoc(doc(alice, 'users', 'alice', 'monthlyBudgets', badId), budget({monthKey: badId})));
    }
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'monthlyBudgets', '2026-09'), budget({monthKey: MONTH})));

    // --- Only the known shape is accepted.
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'monthlyBudgets', '2026-09'), budget({monthKey: '2026-09', smuggled: 'x'})));
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'monthlyBudgets', '2026-09'), budget({monthKey: '2026-09', source: 'imported'})));

    // --- Updating the amount is allowed; rewriting ownership or the creation
    // time is not.
    await assertSucceeds(updateDoc(doc(alice, ...alicePath), {amount: 5200, updatedAt: serverTimestamp()}));
    await assertFails(updateDoc(doc(alice, ...alicePath), {ownerId: 'bob', updatedAt: serverTimestamp()}));
    await assertFails(updateDoc(doc(alice, ...alicePath), {amount: 5300, createdAt: serverTimestamp(), updatedAt: serverTimestamp()}));
    await assertFails(updateDoc(doc(alice, ...alicePath), {amount: 5400}));

    // --- The owner may clear their own budget.
    await assertSucceeds(deleteDoc(doc(alice, ...alicePath)));

    console.log('SmartLife monthly budget Firestore rules tests passed');
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
