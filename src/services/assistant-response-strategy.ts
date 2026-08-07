import type {AssistantResponseMode} from '../types/assistant';

export type AssistantExecutionRoute = 'deterministic' | 'gemini';

export function chooseAssistantExecutionRoute(options: {hasMutation: boolean; isDemoMode: boolean}): AssistantExecutionRoute {
  return options.hasMutation || options.isDemoMode ? 'deterministic' : 'gemini';
}

export function isSavingsPlanningRequest(message: string) {
  return /(?:ออม|เก็บ(?:เงิน|ตัง)?|เงินเก็บ|เป้าหมาย(?:การเงิน)?|เงินสำรอง|ฉุกเฉิน|saving)/i.test(message);
}

export function chooseAssistantResponseMode(message: string): AssistantResponseMode {
  const text = message.normalize('NFC').trim();
  if (/^(?:เรื่อง)?\s*(?:การเงิน|เงิน|การออม|ออมเงิน|การเรียน|เรียน|เวลา|การนอน|นอน|อ่านก่อนสอบ|อ่านหนังสือ|สอบ|งาน|ช่วยวางแผน)\s*(?:ครับ|ค่ะ|คับ)?$/i.test(text)) return 'brainstorm';
  if (/(เปรียบเทียบ|ต่างกัน|ข้อดีข้อเสีย|แบบไหนดีกว่า|เลือกแบบไหน|versus|\bvs\.?\b)/i.test(text)) return 'compare';
  if (/(สรุป|ย่อ|ใจความ|ประเด็นสำคัญ|ทวนให้)/i.test(text)) return 'summarize';
  if (/(ไอเดีย|หลายแบบ|หลายวิธี|มีวิธี.*บ้าง|ทางเลือก|brainstorm|คิด.*ให้หน่อย)/i.test(text)) return 'brainstorm';
  if (/(วางแผน|แผน|ตารางอ่าน|จัดลำดับ|จัดสรร|แบ่ง|ทีละขั้น|เริ่มจากไหน|ควร.*ก่อน|ทำอะไรก่อน|งานไหนก่อน|เตรียมสอบ|ลงทุน.*กี่บาท|กี่บาท.*ลงทุน|ออม|เก็บ(?:เงิน|ตัง)|เก็บ.*(?:ให้ถึง|ให้ได้)|เป้าหมาย)/i.test(text)) return 'plan';
  if (/(เครียด|เหนื่อย|หมดไฟ|ผัดวัน|ไม่มีวินัย|ทำไม่ได้|ไม่ไหว|ติดนิสัย)/i.test(text)) return 'coach';
  if (/(ทำไม|คืออะไร|อธิบาย|หลักการ|เข้าใจ|ยังไง|อย่างไร|วิธี)/i.test(text)) return 'explain';
  return 'direct';
}
