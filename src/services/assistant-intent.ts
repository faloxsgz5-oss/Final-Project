export type AssistantIntent = 'finance' | 'schedule' | 'task_note' | 'unknown';

const SCHEDULE_PATTERN = /(เรียน|เรยน|คลาส|คาบ|ตาราง|เวลา|ว่าง|ชว่ง|นัด|ประชุม|ประชม|กิจกรรม|กิจกรม|สอบ|กลางพาค|มิดเทอม|มหาลัย|อจ\.?|จารย์|อาจารย์|พรีเซนต์|พฤหัส|พฤหัด|อังคาร|สุกร์|ศุกร์|วีคหน้า|สัปดาห|พน\.?|วน\.?|กี่โมง|กี่ฌมง|ชั่วโมง|ชั่วโฒง|เมื่อไหร่)/i;
const FINANCE_PATTERN = /(เงิน|เงืน|งบ(?:ประมาณ|เดือน|วันนี้|ค่า|ข้าว|อาหาร|เหลือ|\s*\d|$)|บาท|รายรับ|รายจ่าย|เงินเข้า|เงินออก|ค่า(?:ข้าว|ค่าว|กาแฟ|เดินทาง|เดืนทาง|น้ำ)|เหลือ|เหลทอ|ใช้ได้|แบ่ง(?:ใช้|ยังไง|ไง)|แบ้ง|ประหยัด|ออม|เก็บตัง|ตัง|ซื้อ|จ่าย|โอน|ชาบู|กินข้าว|มื้อ|wallet|budget|\d+\s*(?:บ\.|บาท))/i;
const TASK_NOTE_PATTERN = /(งานค้าง|งานค้่าง|งานที่ต้องทำ|งานอะไรต้องส่ง|ต้องส่ง|การบ้าน|งานส่ง|ส่งงาน|โน้ต|โน๊ต|โน็ต|บันทึก|จด|อ่าน|หน้งสือ|ทบทวน|ทวนบท|ทำโจทย์|เช็กลิส|สรุปบท|โปรเจกต์|โปรเจค|รายงาน|หัวข้อ|ไอเดีย|ไอเดืย|เดดไลน์|ไม่เสร็จ|ไม่เสด|task|note)/i;

export function normalizeAssistantInput(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}:./]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyAssistantIntent(
  input: string,
  previousIntent: AssistantIntent = 'unknown',
): AssistantIntent {
  const text = normalizeAssistantInput(input);
  if (!text) return previousIntent;
  if (/(เวลาว่าง|หาเวลา.*ว่าง|ชว่งบ่าย)/i.test(text)) return 'schedule';
  if (/(งานที่ต้องท|จดหัวข้อ|ทวนสอบ|ทวนบท)/i.test(text)) return 'task_note';
  if (/(ใช้ได้.*กี่บ\.?|กี่บ\.?$)/i.test(text)) return 'finance';

  const explicitDomain = /(เรียน|เรยน|คลาส|คาบ|ตาราง|นัด|ประชุม|กิจกรรม|สอบ|เงิน|เงืน|งบ|บาท|รายรับ|รายจ่าย|ค่าข้าว|การบ้าน|งานค้าง|โน้ต|โน๊ต|บันทึกไอเดีย|อ่านหนังสือ|โปรเจกต์|โปรเจค)/i;
  if (
    previousIntent !== 'unknown' &&
    text.length <= 64 &&
    !explicitDomain.test(text) &&
    /^(แล้ว|ของ|อัน|จดไว้|บันทึกไว้|จดรายการ|ต่อเลย|เมื่อกี้|พอไหม|เท่าไหร่|แบ่งเป็น|รวม|ถ้า|หัก|ขอ|เอาเป็น)/i.test(text)
  ) {
    return previousIntent;
  }

  const scores: Record<Exclude<AssistantIntent, 'unknown'>, number> = {
    finance: 0,
    schedule: 0,
    task_note: 0,
  };

  if (SCHEDULE_PATTERN.test(text)) scores.schedule += 2;
  if (FINANCE_PATTERN.test(text)) scores.finance += 2;
  if (TASK_NOTE_PATTERN.test(text)) scores.task_note += 2;

  if (/\d+(?:\.\d+)?\s*(?:บาท|บ)|งบ\s*\d+|เงิน\s*\d+/i.test(text)) scores.finance += 3;
  if (/(กี่โมง|วันไหน|พรุ่งนี้|วันนี้|สัปดาห์|เดือนนี้|ช่วงเช้า|ช่วงบ่าย|ช่วงเย็น)/i.test(text)) scores.schedule += 1;
  if (/(จด|บันทึก|โน้ต|การบ้าน|งานค้าง|อ่าน|ทบทวน)/i.test(text)) scores.task_note += 2;
  if (/(บันทึก|จด).*(?:จ่าย|ซื้อ|บาท|รายรับ|รายจ่าย)/i.test(text)) scores.finance += 4;
  if (/(บันทึก|จด).*(?:นัด|เรียน|สอบ|ประชุม|เวลา)/i.test(text)) scores.schedule += 4;

  if (/(เงิน|เงืน|งบ(?:ประมาณ|เดือน|วันนี้|ค่า|เหลือ|\s*\d|$)|บาท|รายรับ|รายจ่าย|เงินเข้า|เงินออก|ค่าข้าว|ค่าเดินทาง|กาแฟ|ชาบู|เก็บตัง|ออม|แบ่งใช้)/i.test(text)) {
    scores.finance += 3;
  }
  if (/(อ่าน|ทบทวน|ทวนบท|ทำโจทย์|การบ้าน|งานค้าง|งานที่ต้องทำ|ต้องส่ง|โน้ต|โน๊ต|โน็ต|ไอเดีย|เช็กลิส|โปรเจกต์|โปรเจค)/i.test(text)) {
    scores.task_note += 3;
  }

  const ranked = (Object.entries(scores) as [Exclude<AssistantIntent, 'unknown'>, number][])
    .sort((left, right) => right[1] - left[1]);
  if (ranked[0][1] > 0 && ranked[0][1] !== ranked[1][1]) return ranked[0][0];
  if (ranked[0][1] > 0 && previousIntent !== 'unknown' && scores[previousIntent] === ranked[0][1]) {
    return previousIntent;
  }

  const looksLikeFollowUp = text.length <= 48 || /^(แล้ว|ของ|อัน|จดไว้|บันทึกไว้|ต่อเลย|เมื่อกี้|พอไหม|เท่าไหร่)/i.test(text);
  return looksLikeFollowUp ? previousIntent : 'unknown';
}

export function latestConversationIntent(
  conversation: {content: string; role: string}[],
): AssistantIntent {
  for (const turn of [...conversation].reverse()) {
    if (turn.role !== 'user') continue;
    const intent = classifyAssistantIntent(turn.content);
    if (intent !== 'unknown') return intent;
  }
  return 'unknown';
}
