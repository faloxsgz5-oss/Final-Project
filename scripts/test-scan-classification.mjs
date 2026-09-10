/**
 * Guards the scan classifier's three-way decision.
 *
 * The bug this pins down: `ScanClassification.type` used to be a two-way
 * union, and `schedule > receipt` is false when both scores are zero, so a
 * document with no financial evidence whatsoever fell through to "receipt" and
 * was force-fitted into receipt fields -- a merchant name of "กิจกรรม", line
 * items priced at zero. Confidence made it worse by measuring only the margin
 * between the two categories, so 4 points against 0 reported 0.99.
 *
 * Most of these cases therefore assert the negative direction: ordinary
 * documents must classify as `document`, and must not borrow confidence they
 * have not earned.
 */
import assert from 'node:assert/strict';

import {classifyScanText} from '../functions/src/receipt-parsers/deterministic-receipt.ts';

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` -> ${detail}` : ''}`);
};

const join = (...lines) => lines.join('\n');

// --- must be `document`: readable text that is neither receipt nor schedule --
const documents = {
  'civil-service exam announcement (the reported bug)': join(
    'ประกาศสำนักงาน ก.พ.',
    'เรื่อง รับสมัครสอบเพื่อวัดความรู้ความสามารถทั่วไปด้วยระบบอิเล็กทรอนิกส์',
    'ระดับ ปวช. ปวท. อนุปริญญา และปวส.',
    'สอบภาคเช้า เวลา 09.00-12.00 น.',
    'สอบภาคบ่าย เวลา 14.30-17.30 น.',
    'กิจกรรม',
  ),
  'meeting minutes': join(
    'บันทึกการประชุม',
    'วันที่ 8 กันยายน 2569',
    'ผู้เข้าร่วมประชุม 12 คน',
    'วาระที่ 1 เรื่องแจ้งเพื่อทราบ',
  ),
  'lecture notes': join(
    'บทที่ 4 Linked List',
    'โครงสร้างข้อมูลแบบเชื่อมโยง',
    'การแทรกและการลบมีความซับซ้อน O(1)',
  ),
  'english notice mentioning weekdays': join(
    'NOTICE TO ALL STUDENTS',
    'The library will be closed for maintenance',
    'from Monday to Friday next week.',
  ),
  'near-empty page': 'หน้าเปล่า',
  'a letter with a single baht amount': join(
    'เรียน ผู้ปกครอง',
    'ขอแจ้งค่าใช้จ่ายกิจกรรมจำนวน 500 บาท',
    'จึงเรียนมาเพื่อทราบ',
  ),
};
for (const [name, text] of Object.entries(documents)) {
  const result = classifyScanText(text);
  check(`${name} -> document`, result.type === 'document',
    `got ${result.type} (receipt:${result.scores.receipt} schedule:${result.scores.schedule})`);
}

// --- must still be `receipt` -----------------------------------------------
const receipts = {
  'shop receipt with tax invoice header': join(
    'ใบเสร็จรับเงิน / TAX INVOICE',
    "McDonald's สาขาเซ็นทรัล",
    'TAX ID 0105536000123',
    'Big Mac x1  129.00',
    'ยอดรวม 129.00',
    'ยอดชำระ 129.00 บาท',
    'VAT 7% INCLUDED',
  ),
  'wallet payment slip': join(
    'ทำรายการสำเร็จ',
    'เป๋าตัง',
    'จำนวนเงินที่ชำระ 250.00 บาท',
    'รหัสอ้างอิง 123456789',
  ),
  'promptpay transfer slip': join(
    'โอนเงินสำเร็จ',
    'พร้อมเพย์ PROMPTPAY',
    'จำนวนเงินที่โอน 1,200.00 บาท',
    'ผู้รับเงิน นายสมชาย',
    'ยอดชำระ 1,200.00',
  ),
};
for (const [name, text] of Object.entries(receipts)) {
  const result = classifyScanText(text);
  check(`${name} -> receipt`, result.type === 'receipt',
    `got ${result.type} (receipt:${result.scores.receipt} schedule:${result.scores.schedule})`);
}

// --- must still be `schedule` ----------------------------------------------
const schedules = {
  'university timetable': join(
    'ตารางเรียน ปีการศึกษา 2569',
    'รหัสวิชา 110191 ชื่อรายวิชา Project in Digital Tech',
    'จันทร์ 09:00-12:00 ห้องเรียน 401',
    'อังคาร 13:00-16:00 SECTION 1',
  ),
  'exam timetable': join(
    'ตารางสอบ ภาคการศึกษาที่ 1',
    'รหัสวิชา 110191',
    'พุธ 09:00-12:00',
    'ศุกร์ 13:00-16:00',
  ),
  'weekday-dense timetable without a header': join(
    'จันทร์ 09:00-12:00 คณิตศาสตร์',
    'อังคาร 13:00-16:00 ฟิสิกส์',
    'พุธ 09:00-12:00 เคมี',
    'พฤหัสบดี 13:00-16:00 ชีววิทยา',
  ),
};
for (const [name, text] of Object.entries(schedules)) {
  const result = classifyScanText(text);
  check(`${name} -> schedule`, result.type === 'schedule',
    `got ${result.type} (receipt:${result.scores.receipt} schedule:${result.scores.schedule})`);
}

// --- confidence must track evidence, not just the margin --------------------
const weak = classifyScanText(join('NOTICE', 'Monday to Friday', 'library closed'));
check('a weak document does not claim near-certainty as receipt/schedule',
  weak.type === 'document', `got ${weak.type}`);

const strongReceipt = classifyScanText(receipts['shop receipt with tax invoice header']);
check('a real receipt still reports high confidence', strongReceipt.confidence >= 0.9,
  String(strongReceipt.confidence));

const blank = classifyScanText('หน้าเปล่า');
check('a blank page is confidently "not structured"', blank.confidence >= 0.9,
  String(blank.confidence));

// Every type must be one of the three, and confidence a sane probability.
for (const text of [...Object.values(documents), ...Object.values(receipts), ...Object.values(schedules)]) {
  const result = classifyScanText(text);
  if (!['document', 'receipt', 'schedule'].includes(result.type)) { failures += 1; console.log('FAIL unknown type', result.type); }
  if (!(result.confidence > 0 && result.confidence <= 1)) { failures += 1; console.log('FAIL confidence out of range', result.confidence); }
}

if (failures) {
  console.error(`\n${failures} case(s) failed`);
  process.exit(1);
}
console.log('\nscan classification passed: general documents are no longer forced into a receipt');
assert.equal(failures, 0);
