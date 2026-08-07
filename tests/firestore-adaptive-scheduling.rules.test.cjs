const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');
const {doc, getDoc, serverTimestamp, setDoc, updateDoc} = require('firebase/firestore');

async function main() {
  const projectId = 'smartlife-adaptive-rules-test';
  const testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {rules: fs.readFileSync(path.resolve(__dirname, '..', 'firestore.rules'), 'utf8')},
  });
  try {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', 'alice'), {uid: 'alice'});
      await setDoc(doc(adminDb, 'users', 'bob'), {uid: 'bob'});
      await setDoc(doc(adminDb, 'users', 'alice', 'schedulingSuggestions', 'suggestion-1'), {ownerId: 'alice', status: 'pending'});
      await setDoc(doc(adminDb, 'users', 'alice', 'schedulingPatterns', 'study-3'), {ownerId: 'alice'});
      await setDoc(doc(adminDb, 'users', 'alice', 'settings', 'adaptiveScheduling'), {ownerId: 'alice', allowAutomaticRescheduling: false});
      await setDoc(doc(adminDb, 'users', 'alice', 'pushTokens', 'private-token'), {ownerId: 'alice', token: 'private'});
    });

    const alice = testEnv.authenticatedContext('alice', {email: 'alice@example.com'}).firestore();
    const bob = testEnv.authenticatedContext('bob', {email: 'bob@example.com'}).firestore();
    const anonymous = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(alice, 'users', 'alice', 'schedulingSuggestions', 'suggestion-1')));
    await assertFails(getDoc(doc(bob, 'users', 'alice', 'schedulingSuggestions', 'suggestion-1')));
    await assertFails(getDoc(doc(anonymous, 'users', 'alice', 'schedulingSuggestions', 'suggestion-1')));
    await assertSucceeds(getDoc(doc(alice, 'users', 'alice', 'schedulingPatterns', 'study-3')));
    await assertFails(getDoc(doc(bob, 'users', 'alice', 'settings', 'adaptiveScheduling')));
    await assertFails(getDoc(doc(alice, 'users', 'alice', 'pushTokens', 'private-token')));

    const validActivity = {
      actualDurationMinutes: null,
      actualEnd: null,
      actualStart: null,
      aiConfidence: null,
      aiReason: null,
      aiScheduled: false,
      allowAiReschedule: true,
      attendees: '',
      category: 'study',
      color: '#5F875F',
      createdAt: serverTimestamp(),
      deadline: null,
      endAt: new Date('2026-08-05T15:00:00+07:00'),
      estimatedDurationMinutes: 60,
      googleSyncStatus: 'not_required',
      isFlexible: true,
      isLocked: false,
      location: '',
      note: '',
      originalScheduledStart: new Date('2026-08-05T14:00:00+07:00'),
      ownerId: 'alice',
      priority: 'medium',
      reminder: '',
      scheduleVersion: 0,
      source: 'manual',
      startAt: new Date('2026-08-05T14:00:00+07:00'),
      status: 'planned',
      title: 'อ่านหนังสือ',
      type: 'task',
      updatedAt: serverTimestamp(),
    };
    const activityRef = doc(alice, 'users', 'alice', 'activities', 'activity-1');
    await assertSucceeds(setDoc(activityRef, validActivity));
    await assertFails(setDoc(doc(bob, 'users', 'alice', 'activities', 'hijack'), {...validActivity, ownerId: 'alice'}));
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'activities', 'forged-ai'), {...validActivity, aiConfidence: .99, aiReason: 'forged', aiScheduled: true}));
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'activities', 'movable-appointment'), {...validActivity, type: 'appointment'}));
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'activities', 'attendee-movable'), {...validActivity, attendees: 'friend@example.com'}));
    await assertSucceeds(updateDoc(activityRef, {title: 'อ่านหนังสือบทที่ 4', updatedAt: serverTimestamp()}));
    await assertFails(updateDoc(activityRef, {aiConfidence: 1, updatedAt: serverTimestamp()}));
    await assertFails(updateDoc(activityRef, {scheduleVersion: 10, updatedAt: serverTimestamp()}));

    await assertFails(setDoc(doc(alice, 'users', 'alice', 'schedulingBehaviorEvents', 'forged-event'), {ownerId: 'alice'}));
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'schedulingPatterns', 'forged-pattern'), {ownerId: 'alice'}));
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'schedulingSuggestions', 'forged-suggestion'), {ownerId: 'alice'}));
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'scheduleChangeHistory', 'forged-history'), {ownerId: 'alice'}));
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'productivityInsights', 'forged-insight'), {ownerId: 'alice'}));
    await assertFails(setDoc(doc(alice, 'users', 'alice', 'pushTokens', 'forged-token'), {ownerId: 'alice', token: 'stolen'}));
    await assertFails(updateDoc(doc(alice, 'users', 'alice', 'settings', 'adaptiveScheduling'), {allowAutomaticRescheduling: true}));

    console.log('Firestore Adaptive Scheduling security-rule tests passed.');
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
