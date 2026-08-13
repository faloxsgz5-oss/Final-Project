import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import {
  maskAccountNumbers,
  normalizeLineText,
  parseLineMessageLocally,
  splitLineMessageBatch,
} from '../src/services/line-transaction-parser-core.ts';

const capturedAt = new Date('2026-07-31T12:00:00+07:00');
const cases = [
  {
    bank: 'scb',
    message: 'SCB Connect เงินเข้า 1,500.00 บาท จาก นาย ก วันที่ 31/07/2026 เวลา 10:05 บัญชี 123-456789-0',
    type: 'income',
  },
  {
    bank: 'kbank',
    message: 'KBank ใช้จ่าย 89.00 บาท ร้านค้า Cafe Test วันที่ 31/07/2026 เวลา 10:30 บัญชี 987-654321-0',
    type: 'expense',
  },
  {
    bank: 'kbank',
    expectedAmount: 10,
    expectedBalance: 1116.56,
    expectedDay: 7,
    expectedMonth: 7,
    message: 'K PLUS\nรายการเงินเข้า\nบัญชี xxx-x-x1494-x จำนวนเงิน 10.00 บาท วันที่ 7 ส.ค. 69 10:49 น. ยอดเงินคงเหลือ 1,116.56 บาท',
    type: 'income',
  },
  {
    bank: 'bbl',
    message: 'Bangkok Bank เงินเข้าบัญชี 2,000.00 บาท จาก บริษัท ตัวอย่าง วันที่ 31/07/2026 เวลา 11:00',
    type: 'income',
  },
  {
    bank: 'krungsri',
    message: 'Krungsri โอนออก 500.00 บาท ผู้รับ นาย ข วันที่ 31/07/2026 เวลา 11:10',
    type: 'expense',
  },
  {
    bank: 'gsb',
    message: 'GSB เงินฝากเข้า 700.00 บาท จาก ผู้ปกครอง วันที่ 31/07/2026 เวลา 11:20',
    type: 'income',
  },
  {
    bank: 'ktb',
    message: 'Krungthai Connext เงินออก: -1.00 บาท จากบัญชี XX5948 เมื่อ 02/08/69 18:01 ยอดเงินที่ใช้ได้ 5,466.93 บาท',
    expectedDay: 2,
    expectedMonth: 7,
    type: 'expense',
  },
  {
    bank: 'ttb',
    message: 'ttb เงินออก 45.00 บาท ร้านค้า รถโดยสาร วันที่ 31/07/2026 เวลา 11:30',
    type: 'expense',
  },
];

for (const item of cases) {
  const parsed = parseLineMessageLocally(item.message, capturedAt);
  assert.ok(parsed, `${item.bank}: parser returned null`);
  assert.equal(parsed.bank, item.bank, `${item.bank}: bank detection`);
  assert.equal(parsed.type, item.type, `${item.bank}: transaction type`);
  assert.ok(parsed.amount > 0, `${item.bank}: amount`);
  if (typeof item.expectedAmount === 'number') {
    assert.equal(parsed.amount, item.expectedAmount, `${item.bank}: exact amount`);
  }
  if (typeof item.expectedBalance === 'number') {
    assert.equal(parsed.balanceAfterReported, item.expectedBalance, `${item.bank}: balance`);
  }
  const parsedDate = new Date(parsed.occurredAt);
  assert.equal(parsedDate.getFullYear(), 2026, `${item.bank}: year`);
  assert.equal(parsedDate.getMonth(), item.expectedMonth ?? 6, `${item.bank}: month`);
  assert.equal(parsedDate.getDate(), item.expectedDay ?? 31, `${item.bank}: day`);
}

function bangkokTimeParts(value) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value));
  return {
    hour: Number(parts.find((part) => part.type === 'hour')?.value),
    minute: Number(parts.find((part) => part.type === 'minute')?.value),
  };
}

const preciseKplus = parseLineMessageLocally(
  'K PLUS\nรายการเงินเข้า\nบัญชี xxx-x-x1494-x จำนวนเงิน 10.00 บาท วันที่ 7 ส.ค. 69 10:47 น. ยอดเงินคงเหลือ 1,116.56 บาท',
  new Date('2026-08-07T13:00:00+07:00'),
);
assert.ok(preciseKplus, 'K PLUS Thai month date must parse');
assert.deepEqual(bangkokTimeParts(preciseKplus.occurredAt), {hour: 10, minute: 47}, 'K PLUS exact notification time');

const preciseKrungthai = parseLineMessageLocally(
  'Krungthai Connext เงินออก: -10.00 บาท จากบัญชี XX5948 เมื่อ 07/08/69 10:49 ยอดเงินที่ใช้ได้ 5,401.93 บาท',
  new Date('2026-08-07T13:00:00+07:00'),
);
assert.ok(preciseKrungthai, 'Krungthai numeric date must parse');
assert.deepEqual(bangkokTimeParts(preciseKrungthai.occurredAt), {hour: 10, minute: 49}, 'Krungthai exact notification time');

const expensePhrase = parseLineMessageLocally(
  'SCB หักบัญชีจาก 123-456789-0 จำนวนเงิน 250.00 บาท ชำระให้ ร้านทดสอบ',
  capturedAt,
);
assert.equal(expensePhrase?.type, 'expense', 'expense phrase must win over recipient wording');

const kbankLinePreviewWithoutAmount = parseLineMessageLocally(
  'KBank Live แจ้งเตือนรายการเงินเข้า',
  capturedAt,
);
assert.equal(kbankLinePreviewWithoutAmount, null, 'KBank LINE preview without amount must not create a transaction');

const firstSender = normalizeLineText('KBank รับเงิน 500.00 บาท จาก นาย ก');
const secondSender = normalizeLineText('KBank รับเงิน 500.00 บาท จาก นาย ข');
assert.notEqual(
  createHash('sha256').update(firstSender).digest('hex'),
  createHash('sha256').update(secondSender).digest('hex'),
  'same amount from different senders must not be treated as duplicates',
);

const masked = maskAccountNumbers('บัญชี 123-456789-0 รับเงิน 500.00 บาท');
assert.doesNotMatch(masked, /123-456789-0/, 'full account number must be masked');
assert.match(masked, /7890/, 'last four account digits should remain visible');

const batch = splitLineMessageBatch(`${cases[0].message}\n\n---\n\n${cases[1].message}`);
assert.equal(batch.length, 2, 'explicit batch separator');

console.log(`LINE bank parser: ${cases.length + 6} checks passed`);
