export type FinanceMutationKind = 'expense' | 'income' | null;

function normalizeActionInput(value: string) {
  return value
    // NFKC decomposes Thai "ำ" into two code points, causing normal Thai
    // keywords such as "ทำ" to stop matching. NFC preserves Thai input.
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const READ_ONLY_OR_ADVICE_PATTERN =
  /(ควร|แนะนำ|วิเคราะห์|วางแผน|แบ่ง(?:เงิน|งบ|ใช้)?|จัดสรร|ยังไง|อย่างไร|ทำไง|ทำยังไง|เท่าไหร่|เท่าไร|กี่(?:บาท|โมง|งาน|รายการ|วิชา|วัน)?|พอไหม|ดีไหม|ไหม|มั้ย|หรือไม่|หรือเปล่า|ยังทัน|มีอะไร|อะไร|อันไหน|ไหน|เมื่อไหร่|ตอนไหน|ดู|เช็ก|ตรวจ|สรุป|ใกล้.*(?:กำหนดส่ง|เดดไลน์)|(?:กำหนดส่ง|เดดไลน์).*ใกล้|ออม|เก็บเงิน|เก็บตัง|เงินเก็บ|เป้าหมาย|ลงทุน|หุ้น|กองทุน|ผลตอบแทน|ดอกเบี้ย|ความเสี่ยง|เงินสำรอง|\?)/i;

const EXPLICIT_MUTATION_PATTERN =
  /(?:เพิ่ม|สร้าง|บันทึก|จด|ลงรายการ|ลงบัญชี|ลง(?:ใน)?ตาราง|จัดตาราง|ตั้งงบ|จำไว้ว่า|เตือน|นัดให้)/i;

export function splitAssistantMessageClauses(message: string) {
  return normalizeActionInput(message)
    .split(/\s*(?:และ|แล้วก็|แล้ว|พร้อม(?:กัน)?กับ|อีกอย่าง(?:คือ)?|ส่วนอีกเรื่อง)\s*/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

export function explicitMutationClause(message: string) {
  const clauses = splitAssistantMessageClauses(message);
  return clauses.find((clause) => EXPLICIT_MUTATION_PATTERN.test(clause)) ?? null;
}

export function readOnlyClausesFromMixedMessage(message: string) {
  const clauses = splitAssistantMessageClauses(message);
  if (clauses.length < 2 || !clauses.some((clause) => EXPLICIT_MUTATION_PATTERN.test(clause))) {
    return [];
  }
  return clauses.filter((clause) =>
    !EXPLICIT_MUTATION_PATTERN.test(clause) &&
    READ_ONLY_OR_ADVICE_PATTERN.test(clause),
  );
}

export function isReadOnlyOrAdviceRequest(message: string) {
  const text = normalizeActionInput(message);
  if (!text) return false;
  if (/^(?:สวัสดี|หวัดดี|ดีจ้า|hello|hi)(?:ครับ|ค่ะ|คับ|จ้า)?$/i.test(text)) return true;
  // Respect Thai negation before any mutation verb. Words such as "ไม่" and
  // "อย่า" must never be discarded as generic stop words.
  if (/(?:ไม่(?:ต้อง|เอา|ให้)|อย่า).*(?:เพิ่ม|สร้าง|บันทึก|จด|ลงรายการ|ลงบัญชี)/i.test(text)) {
    return true;
  }
  return READ_ONLY_OR_ADVICE_PATTERN.test(text);
}

export function financeMutationKind(message: string, amount: number): FinanceMutationKind {
  if (!amount) return null;
  const text = normalizeActionInput(message);
  if (isReadOnlyOrAdviceRequest(text)) return null;

  const explicitRecordVerb = /(เพิ่ม|บันทึก|จด|ลงรายการ|ลงบัญชี)/i.test(text);
  const incomeEvidence = /(รายรับ|ได้เงิน(?:มา)?|เงินเข้า|รับเงิน|income)/i.test(text);
  const expenseEvidence = /(รายจ่าย|จ่าย(?:ไป|ค่า)?|ซื้อ(?:ไป)?|โอน(?:ไป|ให้)|เสียค่า|ค่าข้าว|ค่าอาหาร|ค่ากาแฟ|ค่าเดินทาง|expense)/i.test(text);

  if (incomeEvidence && (explicitRecordVerb || /(?:ได้เงิน(?:มา)?|เงินเข้า|รับเงิน)\s*[\d,]+/i.test(text))) {
    return 'income';
  }
  if (expenseEvidence && (
    explicitRecordVerb ||
    /(?:จ่าย(?:ไป|ค่า)?|ซื้อ(?:ไป)?|โอน(?:ไป|ให้)|เสียค่า|ค่าข้าว|ค่าอาหาร|ค่ากาแฟ|ค่าเดินทาง).*?[\d,]+/i.test(text) ||
    /[\d,]+(?:\.\d+)?\s*(?:บาท|฿)?\s*(?:ค่าข้าว|ค่าอาหาร|ค่ากาแฟ|ค่าเดินทาง)/i.test(text)
  )) {
    return 'expense';
  }
  return null;
}

export function isExplicitNoteMutation(message: string) {
  const text = normalizeActionInput(message);
  if (!text || isReadOnlyOrAdviceRequest(text)) return false;
  if (/^(?:ฉัน)?\s*มี\s*(?:โน้ต|โน๊ต|บันทึก)|^(?:จาก|ดู|เช็ก|ตรวจ)\s*(?:โน้ต|โน๊ต|บันทึก)/i.test(text)) {
    return false;
  }
  return /^(?:ช่วย)?\s*(?:(?:เพิ่ม|สร้าง|บันทึก|จด)\s*(?:โน้ต|โน๊ต|note|บันทึก)?|(?:โน้ต|โน๊ต)\s*ไว้)(?:\s*(?:ให้|ว่า|เรื่อง|หน่อย|ที))*\s*.+/i
    .test(text);
}
