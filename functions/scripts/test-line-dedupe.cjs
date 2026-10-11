/* FN-001 regression test: LINE / bank notification import must not swallow a
 * second, different purchase, while still ignoring true repeats.
 *
 * Runs the real callables (`.run`) against the Firestore emulator:
 *   npx firebase-tools emulators:exec --only firestore "npm --prefix functions run test:line-dedupe:local"
 *
 * Where the duplicates really come from (there is no LINE webhook here: an
 * Android notification listener reads LINE and bank-app notifications):
 *   - the same notification posted again, or a queue item re-sent after a
 *     failed sync  -> identical text (and, from new clients, the same capture id)
 *   - one transfer reported by both LINE and the bank's own app -> different
 *     text from two sources, same amount, minutes apart.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {getApps, initializeApp} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('FIRESTORE_EMULATOR_HOST is required.');
if (!getApps().length) initializeApp({projectId: process.env.GCLOUD_PROJECT || 'smartlife-budget'});
const {confirmLineTransaction, enqueueLinePendingReview} = require('../lib/line-import');

const db = getFirestore();
const MINUTE = 60 * 1000;
const BASE = Date.parse('2026-10-11T03:00:00.000Z'); // 10:00 Bangkok

const sha = (text) => crypto.createHash('sha256').update(text.trim().replace(/\s+/g, ' ')).digest('hex');

function notice({amount = 60, at, balance = null, bank = 'kbank', merchant, captureId, source = 'line_auto_listener', account = null, textOverride}) {
  const time = new Date(at);
  const hhmm = new Intl.DateTimeFormat('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok'}).format(time);
  const text = textOverride ?? `K PLUS: จ่าย ${amount.toFixed(2)} บาท ${merchant} 11/10/69 ${hhmm}${balance === null ? '' : ` คงเหลือ ${balance.toFixed(2)} บาท`}`;
  return {
    capturedAt: new Date(at + 5000).toISOString(),
    ...(captureId ? {captureId} : {}),
    fingerprint: sha(text),
    parsedDraft: {accountLast4: account, amount, balanceAfterReported: balance, bank, category: 'อาหาร', confidence: 0.95, merchant, needsReview: false, note: '', occurredAt: time.toISOString(), parserMode: 'regex', type: 'expense', warnings: []},
    rawText: text,
    source,
  };
}

let userCount = 0;
async function freshUser() {
  userCount += 1;
  const uid = `line-dedupe-${Date.now()}-${userCount}`;
  await db.doc(`users/${uid}`).set({consentTier: 'line_auto_sync', uid});
  const call = (fn, data) => fn.run({app: undefined, auth: {token: {}, uid}, data, instanceIdToken: undefined, rawRequest: {}});
  const counts = async () => {
    const [transactions, pending] = await Promise.all([
      db.collection(`users/${uid}/transactions`).get(),
      db.collection(`users/${uid}/pendingReview`).get(),
    ]);
    return {pending: pending.docs, transactions: transactions.docs};
  };
  return {call, counts, uid};
}

const results = [];
async function check(name, body) {
  try {
    await body();
    results.push(`PASS  ${name}`);
  } catch (error) {
    results.push(`FAIL  ${name}\n      ${String(error.message).split('\n')[0]}`);
  }
}

async function main() {
  await check('same amount at +5, +10 and +15 minutes, no balance/account: every purchase is imported', async () => {
    const {call, counts} = await freshUser();
    const shops = ['ร้านกาแฟ A', 'ร้านข้าว B', 'ร้านน้ำ C', 'ร้านขนม D'];
    for (const [index, merchant] of shops.entries()) {
      await call(enqueueLinePendingReview, notice({at: BASE + index * 5 * MINUTE, merchant}));
    }
    const {pending, transactions} = await counts();
    assert.equal(transactions.length + pending.length, 4, `expected 4 records, got ${transactions.length} transactions + ${pending.length} pending`);
    assert.equal(transactions.length, 4, 'four different purchases from one source are four transactions');
  });

  await check('a true retry (same capture id, same text) is imported once', async () => {
    const {call, counts} = await freshUser();
    const first = notice({at: BASE, captureId: 'queue-item-1', merchant: 'ร้านกาแฟ A'});
    await call(enqueueLinePendingReview, first);
    const again = await call(enqueueLinePendingReview, first);
    assert.equal(again.created, false, 'the retry must report nothing new');
    const {pending, transactions} = await counts();
    assert.equal(transactions.length + pending.length, 1);
  });

  await check('identical text re-posted within minutes under a new capture id is imported once', async () => {
    const {call, counts} = await freshUser();
    const first = notice({at: BASE, captureId: 'queue-item-1', merchant: 'ร้านกาแฟ A'});
    await call(enqueueLinePendingReview, first);
    await call(enqueueLinePendingReview, {...first, capturedAt: new Date(BASE + 2 * MINUTE).toISOString(), captureId: 'queue-item-2'});
    const {pending, transactions} = await counts();
    assert.equal(transactions.length + pending.length, 1);
  });

  await check('identical text with no time in it, 30 minutes apart: second is kept and flagged, not dropped', async () => {
    const {call, counts} = await freshUser();
    const text = 'K PLUS: จ่าย 60.00 บาท ร้านกาแฟ A';
    await call(enqueueLinePendingReview, notice({at: BASE, captureId: 'a', merchant: 'ร้านกาแฟ A', textOverride: text}));
    const second = await call(enqueueLinePendingReview, notice({at: BASE + 30 * MINUTE, captureId: 'b', merchant: 'ร้านกาแฟ A', textOverride: text}));
    const {pending, transactions} = await counts();
    assert.equal(transactions.length, 1);
    assert.equal(pending.length, 1, 'the possible duplicate waits for the user instead of vanishing');
    assert.equal(second.possibleDuplicate, true);
    assert.match(pending[0].get('parsedDraft').warnings.join(' '), /อาจซ้ำ/);
  });

  await check('with a balance: same amount but different balances are two purchases', async () => {
    const {call, counts} = await freshUser();
    await call(enqueueLinePendingReview, notice({at: BASE, balance: 940, merchant: 'ร้านกาแฟ A'}));
    await call(enqueueLinePendingReview, notice({at: BASE + 5 * MINUTE, balance: 880, merchant: 'ร้านข้าว B'}));
    const {transactions} = await counts();
    assert.equal(transactions.length, 2);
  });

  await check('with a balance: one transfer reported by LINE and by the bank app is imported once', async () => {
    const {call, counts} = await freshUser();
    await call(enqueueLinePendingReview, notice({at: BASE, balance: 940, merchant: 'ร้านกาแฟ A'}));
    await call(enqueueLinePendingReview, notice({at: BASE + MINUTE, balance: 940, merchant: 'จ่ายบิล ร้านกาแฟ A', source: 'bank_auto_listener', textOverride: 'แจ้งเตือน KBank: ชำระเงิน 60.00 บาท ร้านกาแฟ A ยอดคงเหลือ 940.00 บาท'}));
    const {pending, transactions} = await counts();
    assert.equal(transactions.length + pending.length, 1);
  });

  await check('without a balance: LINE and bank app reporting the same amount is kept and flagged as a possible duplicate', async () => {
    const {call, counts} = await freshUser();
    await call(enqueueLinePendingReview, notice({at: BASE, merchant: 'ร้านกาแฟ A'}));
    await call(enqueueLinePendingReview, notice({at: BASE + 2 * MINUTE, merchant: 'ร้านกาแฟ A', source: 'bank_auto_listener', textOverride: 'แจ้งเตือน KBank: ชำระเงิน 60.00 บาท ร้านกาแฟ A'}));
    const {pending, transactions} = await counts();
    assert.equal(transactions.length, 1);
    assert.equal(pending.length, 1);
  });

  await check('confirming a flagged possible duplicate saves it', async () => {
    const {call, counts} = await freshUser();
    const text = 'K PLUS: จ่าย 60.00 บาท ร้านกาแฟ A';
    await call(enqueueLinePendingReview, notice({at: BASE, captureId: 'a', merchant: 'ร้านกาแฟ A', textOverride: text}));
    const second = notice({at: BASE + 30 * MINUTE, captureId: 'b', merchant: 'ร้านกาแฟ A', textOverride: text});
    const queued = await call(enqueueLinePendingReview, second);
    assert.ok(queued.draftId, 'the flagged draft must be in pending review');
    const draft = second.parsedDraft;
    const saved = await call(confirmLineTransaction, {...draft, draftId: queued.draftId, fingerprint: second.fingerprint, source: 'line_auto_listener'});
    assert.equal(saved.saved, true, `confirm must save, got ${JSON.stringify(saved)}`);
    const {pending, transactions} = await counts();
    assert.equal(transactions.length, 2);
    assert.equal(pending.length, 0);
  });

  await check('text without an amount is refused', async () => {
    const {call} = await freshUser();
    const bad = notice({at: BASE, merchant: 'ร้านกาแฟ A', textOverride: 'K PLUS: มีการเข้าสู่ระบบใหม่'});
    await assert.rejects(call(enqueueLinePendingReview, bad), /No financial amount/);
  });

  await check('a pasted message identical to a saved one still asks the user (unchanged behaviour)', async () => {
    const {call} = await freshUser();
    const first = notice({at: BASE, merchant: 'ร้านกาแฟ A'});
    await call(enqueueLinePendingReview, first);
    const pasted = await call(confirmLineTransaction, {...first.parsedDraft, fingerprint: first.fingerprint, source: 'line_paste'});
    assert.equal(pasted.duplicate, true);
  });

  await check('old-client request (no capture id) keeps the same response shape', async () => {
    const {call} = await freshUser();
    const response = await call(enqueueLinePendingReview, notice({at: BASE, merchant: 'ร้านกาแฟ A'}));
    for (const key of ['autoSaved', 'created', 'draftId']) assert.ok(key in response, `response lacks ${key}`);
  });

  console.log(results.join('\n'));
  const failed = results.filter((line) => line.startsWith('FAIL')).length;
  console.log(`\n${results.length - failed}/${results.length} LINE dedupe checks passed`);
  if (failed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
