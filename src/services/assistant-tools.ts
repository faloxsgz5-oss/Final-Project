import {Timestamp} from 'firebase/firestore';

import {loadAssistantPreferences, saveAssistantPreference, type AssistantPreferences} from '@/services/assistant-memory';
import {activities, notes, schedules, transactions} from '@/services/firestore';
import type {AssistantMemoryPayload, AssistantProposedAction, AssistantToolSchema, ChecklistPayload, FinancePayload, NotePayload, SchedulePayload} from '@/types/assistant';
import type {Activity, Note, Schedule, Transaction, WithId} from '@/types/smartlife';

export const assistantToolSchemas: AssistantToolSchema[] = [
  {description: 'อ่านตารางตามช่วงเวลา', mutates: false, name: 'get_schedule', parameters: {date: 'ISO date', range: ['day', 'week', 'month']}},
  {description: 'เสนอสร้างรายการตาราง/งาน/นัดหมาย ต้อง confirm ก่อนเขียน', mutates: true, name: 'create_schedule_item', parameters: {payload: 'SchedulePayload'}},
  {description: 'เสนอแก้ไขรายการตาราง ต้อง confirm ก่อนเขียน', mutates: true, name: 'update_schedule_item', parameters: {id: 'string', payload: 'partial SchedulePayload'}},
  {description: 'เสนอ delete รายการตาราง ต้อง confirm ก่อนเขียน', mutates: true, name: 'delete_schedule_item', parameters: {id: 'string'}},
  {description: 'อ่านสรุปการเงินตามช่วงเวลา', mutates: false, name: 'get_finance_summary', parameters: {period: ['day', 'week', 'month']}},
  {description: 'เสนอเพิ่มรายจ่าย ต้อง confirm ก่อนเขียน', mutates: true, name: 'log_expense', parameters: {payload: 'FinancePayload'}},
  {description: 'เสนอเพิ่มรายรับ ต้อง confirm ก่อนเขียน', mutates: true, name: 'log_income', parameters: {payload: 'FinancePayload'}},
  {description: 'อ่านโน้ตล่าสุด', mutates: false, name: 'get_notes', parameters: {tag: ['all', 'class', 'idea', 'task']}},
  {description: 'เสนอสร้างโน้ต ต้อง confirm ก่อนเขียน', mutates: true, name: 'create_note', parameters: {payload: 'NotePayload'}},
  {description: 'เสนอแก้ไขโน้ต ต้อง confirm ก่อนเขียน', mutates: true, name: 'update_note', parameters: {id: 'string', payload: 'partial NotePayload'}},
  {description: 'เสนอจดจำงบหรือช่วงโฟกัสส่วนตัวในเครื่อง ต้อง confirm ก่อนบันทึก', mutates: true, name: 'save_preference', parameters: {key: ['dailyBudget', 'studyMinutes'], value: 'number'}},
];

export type AssistantContext = {
  balance: number;
  monthExpense: number;
  monthIncome: number;
  monthTransactions: WithId<Transaction>[];
  notes: WithId<Note>[];
  todayActivities: WithId<Activity>[];
  todaySchedules: WithId<Schedule>[];
  weekActivities: WithId<Activity>[];
  weekSchedules: WithId<Schedule>[];
};

const THAI_TIME_ZONE = 'Asia/Bangkok';

function rangeFor(period: 'day' | 'month' | 'week', base = new Date()) {
  const local = new Date(new Intl.DateTimeFormat('en-CA', {day: '2-digit', month: '2-digit', timeZone: THAI_TIME_ZONE, year: 'numeric'}).format(base));
  const start = new Date(local);
  if (period === 'week') start.setDate(start.getDate() - start.getDay());
  if (period === 'month') start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  if (period === 'day') end.setDate(start.getDate() + 1);
  if (period === 'week') end.setDate(start.getDate() + 7);
  if (period === 'month') end.setMonth(start.getMonth() + 1);
  return {end, start};
}

function parseAmount(message: string) {
  const match = message.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*(?:บาท|฿|thb)?/i);
  const amount = match ? Number(match[1]) : 0;
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function todayAt(hour: number, minute = 0, dayOffset = 0) {
  const now = new Date();
  const date = new Date(now);
  date.setDate(now.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function parseStartAt(message: string) {
  const dayOffset = /พรุ่งนี้|tomorrow/i.test(message) ? 1 : 0;
  const explicit = message.match(/([01]?\d|2[0-3])[:.](\d{2})/);
  if (explicit) return todayAt(Number(explicit[1]), Number(explicit[2]), dayOffset);
  if (/เที่ยง/.test(message)) return todayAt(12, 0, dayOffset);
  if (/บ่าย/.test(message)) {
    const hour = Number(message.match(/บ่าย\s*(\d)/)?.[1] ?? 1);
    return todayAt(Math.min(23, hour + 12), 0, dayOffset);
  }
  if (/เย็น/.test(message)) {
    const hour = Number(message.match(/(\d{1,2})\s*(?:โมง)?\s*เย็น/)?.[1] ?? 5);
    return todayAt(hour >= 12 ? hour : hour + 12, 0, dayOffset);
  }
  const hour = Number(message.match(/(\d{1,2})\s*โมง/)?.[1] ?? 9);
  return todayAt(Math.min(23, hour), 0, dayOffset);
}

function hasExplicitTime(message: string) {
  return /([01]?\d|2[0-3])[:.](\d{2})(?:\s*(?:-|–|ถึง)\s*([01]?\d|2[0-3])[:.](\d{2}))?|(?:ตอน|เวลา)\s*\d{1,2}/i.test(message);
}

function parseEndAt(message: string, start: Date) {
  const range = message.match(/([01]?\d|2[0-3])[:.](\d{2})\s*(?:-|–|ถึง)\s*([01]?\d|2[0-3])[:.](\d{2})/);
  if (!range) return new Date(start.getTime() + 60 * 60 * 1000);
  const end = new Date(start);
  end.setHours(Number(range[3]), Number(range[4]), 0, 0);
  if (end <= start) end.setDate(end.getDate() + 1);
  return end;
}

function isScheduleIntent(message: string) {
  return /(นัด|ตาราง|เวลา|ตอน|เรียน|lab|แล็บ|quiz|ควิซ|สอบ|schedule|task)/i.test(message) || hasExplicitTime(message);
}

function scheduleTitleFromMessage(message: string, fallback: string) {
  return message
    .replace(/^(ช่วย)?\s*(เพิ่ม|บันทึก|สร้าง)\s*/i, '')
    .replace(/^(ให้)?\s*(มี)?\s*(นัด|ตาราง|เวลา)?\s*/i, '')
    .replace(/(วันนี้|พรุ่งนี้|ตอน|เวลา|ที่|ห้อง)\s*.*/i, '')
    .replace(/([01]?\d|2[0-3])[:.]\d{2}.*$/i, '')
    .trim()
    .slice(0, 80) || fallback;
}

function actionId() {
  return `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function textDate(date: Date) {
  return new Intl.DateTimeFormat('th-TH', {dateStyle: 'medium', timeStyle: 'short', timeZone: THAI_TIME_ZONE}).format(date);
}

function titleFromMessage(message: string, fallback: string) {
  return message
    .replace(/^(ช่วย)?(เพิ่ม|บันทึก|จด|สร้าง)\s*/i, '')
    .replace(/(พรุ่งนี้|วันนี้|ตอน|เวลา|ที่|จำนวน|ราคา|บาท|฿).*/i, '')
    .trim()
    .slice(0, 80) || fallback;
}

export async function loadAssistantContext(uid: string): Promise<AssistantContext> {
  const today = rangeFor('day');
  const week = rangeFor('week');
  const month = rangeFor('month');
  const [todaySchedules, todayActivities, weekSchedules, weekActivities, monthTransactions, noteList] = await Promise.all([
    schedules.between(uid, today.start, today.end),
    activities.between(uid, today.start, today.end),
    schedules.between(uid, week.start, week.end),
    activities.between(uid, week.start, week.end),
    transactions.between(uid, month.start, month.end),
    notes.list(uid),
  ]);
  const monthIncome = monthTransactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
  const monthExpense = monthTransactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
  return {balance: monthIncome - monthExpense, monthExpense, monthIncome, monthTransactions, notes: noteList, todayActivities, todaySchedules, weekActivities, weekSchedules};
}

function checklistItems(message: string) {
  if (/(รายงาน|report)/i.test(message)) return ['รวบรวมข้อมูลและแหล่งอ้างอิง', 'วางโครงร่างหัวข้อ', 'เขียนฉบับร่าง', 'ตรวจคำและจัดรูปแบบ', 'ส่งงาน'];
  if (/(สอบ|quiz|ควิซ)/i.test(message)) return ['เลือกหัวข้อที่จะอ่านก่อน', 'สรุปเนื้อหาสำคัญ', 'ทำแบบฝึกหัดหรือโจทย์เก่า', 'ทบทวนจุดที่ยังไม่มั่นใจ'];
  if (/(โปรเจกต์|project)/i.test(message)) return ['กำหนดสิ่งที่ต้องส่ง', 'แตกงานและจัดลำดับความสำคัญ', 'ทำชิ้นงานหลักรอบแรก', 'ทดสอบและเก็บรายละเอียด', 'ทบทวนก่อนส่ง'];
  return ['กำหนดผลลัพธ์ที่ต้องการ', 'เริ่มงานชิ้นเล็กที่สำคัญที่สุด', 'ทำส่วนหลักให้เสร็จ', 'ตรวจทานและปิดงาน'];
}

function proposeChecklistFromMessage(message: string): AssistantProposedAction | null {
  if (!/(แตกงาน|แบ่งงาน|เช็กลิสต์|checklist|จัดงานเป็นข้อ)/i.test(message)) return null;
  const title = message
    .replace(/^(ช่วย)?\s*(แตกงาน|แบ่งงาน|ทำเช็กลิสต์|เช็กลิสต์|checklist|จัดงานเป็นข้อ)\s*/i, '')
    .replace(/(ให้หน่อย|หน่อย|ที)$/i, '')
    .trim()
    .slice(0, 80) || 'งานที่ต้องทำ';
  const payload: ChecklistPayload = {items: checklistItems(message), startAt: parseStartAt(message).toISOString(), title};
  return {entity: 'checklist', id: actionId(), payload, status: 'pending', summary: `สร้างเช็กลิสต์ "${payload.title}" จำนวน ${payload.items.length} ข้อ`, type: 'create'};
}

function proposePreferenceFromMessage(message: string): AssistantProposedAction | null {
  const amount = parseAmount(message);
  if (!amount) return null;
  const dailyBudget = /(ตั้งงบ|งบวันละ|จำไว้ว่างบ|budget).*?(วัน|daily)|(?:วัน|daily).*?(งบ|budget)/i.test(message);
  if (dailyBudget) {
    const payload: AssistantMemoryPayload = {key: 'dailyBudget', value: amount};
    return {entity: 'memory', id: actionId(), payload, status: 'pending', summary: `ตั้งงบส่วนตัววันละ ${amount.toLocaleString('th-TH')} บาท`, type: 'create'};
  }
  const studyMinutes = /(จำไว้ว่า|ตั้ง).*?(อ่านหนังสือ|โฟกัส|study).*?(นาที|minute)|(?:อ่านหนังสือ|โฟกัส|study).*?(นาที|minute)/i.test(message);
  if (studyMinutes) {
    const payload: AssistantMemoryPayload = {key: 'studyMinutes', value: amount};
    return {entity: 'memory', id: actionId(), payload, status: 'pending', summary: `จำช่วงโฟกัสการเรียน ${amount.toLocaleString('th-TH')} นาที`, type: 'create'};
  }
  return null;
}

export function proposeActionFromMessage(message: string): AssistantProposedAction | null {
  const normalized = message.trim();
  if (!normalized) return null;

  const checklist = proposeChecklistFromMessage(normalized);
  if (checklist) return checklist;

  const preference = proposePreferenceFromMessage(normalized);
  if (preference) return preference;

  if (isScheduleIntent(normalized)) {
    const start = parseStartAt(normalized);
    const end = parseEndAt(normalized, start);
    const location = normalized.match(/(?:ที่|ห้อง)\s*([A-Za-z0-9ก-๙._-]+)/)?.[1] ?? '';
    const type: SchedulePayload['type'] = /(งาน|task|quiz|ควิซ|สอบ)/i.test(normalized) ? 'task' : /(เรียน|lab|แล็บ|class)/i.test(normalized) ? 'class' : 'appointment';
    const payload: SchedulePayload = {endAt: end.toISOString(), location, startAt: start.toISOString(), title: scheduleTitleFromMessage(normalized, type === 'task' ? 'งานจากแชท' : 'นัดหมายจากแชท'), type};
    return {entity: 'schedule', id: actionId(), payload, status: 'pending', summary: `เพิ่ม${type === 'class' ? 'คลาส' : type === 'task' ? 'งาน' : 'นัดหมาย'} "${payload.title}" เวลา ${textDate(start)}`, type: 'create'};
  }

  const amount = parseAmount(normalized);
  if (amount && /(รายรับ|ได้เงิน|income)/i.test(normalized)) {
    const payload: FinancePayload = {amount, category: 'รายรับ', date: new Date().toISOString(), note: titleFromMessage(normalized, 'รายรับจากแชท'), type: 'income'};
    return {entity: 'finance', id: actionId(), payload, status: 'pending', summary: `บันทึกรายรับ ${amount.toLocaleString('th-TH')} บาท`, type: 'create'};
  }
  if (amount && /(จ่าย|ซื้อ|กิน|กาแฟ|ข้าว|expense|บาท|฿)/i.test(normalized)) {
    const category = /(ข้าว|กิน|อาหาร|กาแฟ)/.test(normalized) ? 'อาหาร' : 'อื่น ๆ';
    const payload: FinancePayload = {amount, category, date: new Date().toISOString(), note: titleFromMessage(normalized, 'รายจ่ายจากแชท'), type: 'expense'};
    return {entity: 'finance', id: actionId(), payload, status: 'pending', summary: `บันทึกรายจ่าย ${amount.toLocaleString('th-TH')} บาท หมวด ${category}`, type: 'create'};
  }

  if (/(โน้ต|note|จด)/i.test(normalized)) {
    const payload: NotePayload = {body: normalized, tag: /ไอเดีย|idea/i.test(normalized) ? 'idea' : 'all', title: titleFromMessage(normalized, 'โน้ตจากแชท')};
    return {entity: 'note', id: actionId(), payload, status: 'pending', summary: `สร้างโน้ต "${payload.title}"`, type: 'create'};
  }

  if (/(เพิ่ม|มี|นัด|เรียน|lab|แลบ|งาน|quiz|ควิซ|สอบ|schedule|task)/i.test(normalized)) {
    const start = parseStartAt(normalized);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const location = normalized.match(/(?:ที่|ห้อง)\s*([A-Za-z0-9ก-๙._-]+)/)?.[1] ?? '';
    const type: SchedulePayload['type'] = /(งาน|task|quiz|ควิซ|สอบ)/i.test(normalized) ? 'task' : /(เรียน|lab|แลบ|class)/i.test(normalized) ? 'class' : 'appointment';
    const payload: SchedulePayload = {endAt: end.toISOString(), location, startAt: start.toISOString(), title: titleFromMessage(normalized, type === 'task' ? 'งานจากแชท' : 'นัดหมายจากแชท'), type};
    return {entity: 'schedule', id: actionId(), payload, status: 'pending', summary: `เพิ่ม${type === 'class' ? 'คลาส' : type === 'task' ? 'งาน' : 'นัดหมาย'} "${payload.title}" เวลา ${textDate(start)}`, type: 'create'};
  }

  return null;
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat('th-TH', {weekday: 'long', day: 'numeric', month: 'short', timeZone: THAI_TIME_ZONE}).format(date);
}

function buildDailyBriefing(context: AssistantContext, preferences: AssistantPreferences) {
  const now = new Date();
  const all = [
    ...context.todaySchedules,
    ...context.todayActivities.filter((item) => item.type !== 'task' || item.status !== 'completed'),
  ].sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
  const next = all.find((item) => item.endAt.toDate() >= now) ?? all[0];
  const pendingTasks = context.weekActivities.filter((item) => item.type === 'task' && item.status !== 'completed');
  const lines = [`สรุป ${dayLabel(now)} นะ`];
  if (next) lines.push(`รายการถัดไปคือ ${next.title} เวลา ${textDate(next.startAt.toDate())}`);
  else lines.push('วันนี้ยังไม่มีนัดหรือคลาสที่บันทึกไว้');
  if (pendingTasks.length) lines.push(`ยังมีงานที่วางแผนไว้ ${pendingTasks.length} งาน ลองเริ่มจาก "${pendingTasks[0].title}" ก่อนก็ได้`);
  else lines.push('ยังไม่มีงานค้างในสัปดาห์นี้');
  if (preferences.dailyBudget) lines.push(`งบที่ตั้งไว้วันนี้คือ ${preferences.dailyBudget.toLocaleString('th-TH')} บาท`);
  return lines.join('\n');
}

function sameThailandDay(left: Date, right: Date) {
  const format = new Intl.DateTimeFormat('en-CA', {day: '2-digit', month: '2-digit', timeZone: THAI_TIME_ZONE, year: 'numeric'});
  return format.format(left) === format.format(right);
}

function buildBudgetGuard(context: AssistantContext, preferences: AssistantPreferences) {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = Math.max(1, lastDay - now.getDate() + 1);
  const dailyAllowance = Math.max(0, context.balance) / daysLeft;
  const categoryTotals = new Map<string, number>();
  context.monthTransactions.filter((item) => item.type === 'expense').forEach((item) => {
    categoryTotals.set(item.category, (categoryTotals.get(item.category) ?? 0) + item.amount);
  });
  const highestCategory = [...categoryTotals.entries()].sort((a, b) => b[1] - a[1])[0];
  if (context.monthIncome <= 0 && context.monthExpense <= 0) return 'ตอนนี้ยังไม่มีรายการรายรับหรือรายจ่ายของเดือนนี้ให้วิเคราะห์ ลองบันทึกรายการแรกก่อน แล้วฉันจะช่วยดูแนวโน้มให้';
  if (preferences.dailyBudget) {
    const todaySpent = context.monthTransactions
      .filter((item) => item.type === 'expense' && sameThailandDay(item.occurredAt.toDate(), now))
      .reduce((sum, item) => sum + item.amount, 0);
    const remaining = preferences.dailyBudget - todaySpent;
    if (remaining < 0) return `วันนี้ใช้ไป ${todaySpent.toLocaleString('th-TH')} บาท เกินงบที่ตั้งไว้ ${Math.abs(remaining).toLocaleString('th-TH')} บาทแล้ว ลองพักรายจ่ายที่ไม่จำเป็นก่อนนะ`;
    return `วันนี้ใช้ไป ${todaySpent.toLocaleString('th-TH')} บาท จากงบ ${preferences.dailyBudget.toLocaleString('th-TH')} บาท ยังใช้ได้อีก ${remaining.toLocaleString('th-TH')} บาท`;
  }
  if (context.balance < 0) return `งบเดือนนี้ติดลบ ${Math.abs(context.balance).toLocaleString('th-TH')} บาทแล้ว ลองชะลอรายจ่ายที่ไม่จำเป็นก่อน และเช็กยอดคงเหลือจริงในบัญชีด้วยนะ`;
  const headline = `ตอนนี้เหลือ ${context.balance.toLocaleString('th-TH')} บาท สำหรับอีก ${daysLeft} วัน เฉลี่ยใช้ได้ประมาณ ${Math.floor(dailyAllowance).toLocaleString('th-TH')} บาทต่อวัน`;
  if (context.monthIncome > 0 && context.monthExpense / context.monthIncome >= 0.85) return `${headline}\nใช้รายรับไปแล้วเกิน 85% ของเดือนนี้ ช่วงที่เหลือคุมรายจ่ายเพิ่มอีกนิดจะปลอดภัยกว่า`;
  if (highestCategory) return `${headline}\nหมวดที่ใช้มากสุดคือ ${highestCategory[0]} ${highestCategory[1].toLocaleString('th-TH')} บาท`; 
  return headline;
}

function formatTime(date: Date) {
  return new Intl.DateTimeFormat('th-TH', {hour: '2-digit', hour12: false, minute: '2-digit', timeZone: THAI_TIME_ZONE}).format(date);
}

function buildPriorityPlan(context: AssistantContext, preferences: AssistantPreferences) {
  const now = new Date();
  const tasks = context.weekActivities
    .filter((item) => item.type === 'task' && item.status !== 'completed' && item.status !== 'cancelled')
    .sort((left, right) => left.startAt.toMillis() - right.startAt.toMillis());
  if (!tasks.length) return 'สัปดาห์นี้ยังไม่มีงานค้างที่บันทึกไว้ ลองเพิ่มงานหรือแตกงานจากโปรเจกต์ที่กำลังทำ แล้วฉันจะช่วยจัดลำดับให้';
  const lines = tasks.slice(0, 3).map((item, index) => {
    const hours = Math.max(0, Math.round((item.startAt.toDate().getTime() - now.getTime()) / 3_600_000));
    const urgency = hours <= 24 ? 'ด่วน' : hours <= 72 ? 'สำคัญ' : 'วางแผนไว้';
    return `${index + 1}. ${item.title} - ${urgency} (${textDate(item.startAt.toDate())})`;
  });
  const focus = preferences.studyMinutes ?? 45;
  return `งานที่ควรโฟกัสก่อน\n${lines.join('\n')}\nเริ่มรอบแรกแค่ ${focus} นาที แล้วค่อยพักก็พอ`;
}

function buildWorkloadSummary(context: AssistantContext) {
  const scheduledHours = [...context.weekSchedules, ...context.weekActivities]
    .filter((item) => !('status' in item) || item.status !== 'cancelled')
    .reduce((sum, item) => sum + Math.max(0, item.endAt.toDate().getTime() - item.startAt.toDate().getTime()) / 3_600_000, 0);
  const pendingTasks = context.weekActivities.filter((item) => item.type === 'task' && item.status !== 'completed' && item.status !== 'cancelled').length;
  const roundedHours = Math.round(scheduledHours * 10) / 10;
  if (scheduledHours >= 35 || pendingTasks >= 8) return `สัปดาห์นี้มีตารางและกิจกรรมประมาณ ${roundedHours} ชั่วโมง และมีงานค้าง ${pendingTasks} งาน ถือว่าค่อนข้างแน่น ลองเลือก 3 งานสำคัญที่สุดก่อนนะ`;
  if (scheduledHours >= 20 || pendingTasks >= 4) return `สัปดาห์นี้มีตารางและกิจกรรมประมาณ ${roundedHours} ชั่วโมง กับงานค้าง ${pendingTasks} งาน ยังจัดการได้ ถ้าแบ่งทำวันละนิดจะไม่หนักเกินไป`;
  return `สัปดาห์นี้มีตารางและกิจกรรมประมาณ ${roundedHours} ชั่วโมง กับงานค้าง ${pendingTasks} งาน จังหวะยังพอดี ลองกันเวลาโฟกัสไว้ล่วงหน้าสักช่วงหนึ่ง`;
}

function buildFreeTime(context: AssistantContext, preferences: AssistantPreferences) {
  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(9, 0, 0, 0);
  const dayEnd = new Date(now);
  dayEnd.setHours(21, 0, 0, 0);
  let cursor = Math.max(dayStart.getTime(), now.getTime());
  const gaps: Array<{end: Date; start: Date}> = [];
  const events = [...context.todaySchedules, ...context.todayActivities.filter((item) => item.status !== 'cancelled')]
    .sort((left, right) => left.startAt.toMillis() - right.startAt.toMillis());
  events.forEach((item) => {
    const start = item.startAt.toDate();
    const end = item.endAt.toDate();
    if (start.getTime() - cursor >= 45 * 60 * 1000) gaps.push({end: start, start: new Date(cursor)});
    cursor = Math.max(cursor, end.getTime());
  });
  if (dayEnd.getTime() - cursor >= 45 * 60 * 1000) gaps.push({end: dayEnd, start: new Date(cursor)});
  if (!gaps.length) return 'วันนี้ยังไม่เจอช่วงว่างอย่างน้อย 45 นาทีแล้ว ลองพักสั้น ๆ ระหว่างกิจกรรม หรือเลื่อนงานที่ไม่ด่วนไปพรุ่งนี้นะ';
  const focus = preferences.studyMinutes ?? 45;
  const choices = gaps.slice(0, 3).map((gap) => `${formatTime(gap.start)}-${formatTime(gap.end)}`).join(', ');
  return `ช่วงว่างที่เจอวันนี้: ${choices}\nถ้าจะอ่านหนังสือ ลองเลือกช่วงแรกและโฟกัส ${focus} นาที`;
}

function contextAnswer(message: string, context: AssistantContext, preferences: AssistantPreferences) {
  if (/(สรุปวันนี้|briefing|วันนี้ต้องทำอะไร|วันนี้มีอะไรบ้าง)/i.test(message)) return buildDailyBriefing(context, preferences);
  if (/(จัดลำดับงาน|งานสำคัญ|งานไหนก่อน|ควรทำอะไรก่อน|priority)/i.test(message)) return buildPriorityPlan(context, preferences);
  if (/(ว่างเมื่อไร|เวลาว่าง|มีเวลาว่าง|free time)/i.test(message)) return buildFreeTime(context, preferences);
  if (/(เรียนหนักไหม|งานเยอะไหม|ภาระงาน|เหนื่อยเกินไปไหม|workload)/i.test(message)) return buildWorkloadSummary(context);
  if (/(งบตึง|budget guard|เงินพอไหม|ควรใช้วันละ|เช็กงบ|วิเคราะห์งบ)/i.test(message)) return buildBudgetGuard(context, preferences);
  if (/(วันนี้|today).*(เรียน|ตาราง|กี่โมง)|เรียน.*(วันนี้|กี่โมง)/i.test(message)) {
    const all = [...context.todaySchedules, ...context.todayActivities].sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
    if (!all.length) return 'วันนี้ยังไม่มีตารางเรียนหรืองานที่บันทึกไว้เลยนะ เหมาะกับการเคลียร์โน้ตหรือพักสักหน่อย';
    const lines = all.slice(0, 5).map((item) => `• ${item.title} (${textDate(item.startAt.toDate())})`);
    return `วันนี้มี ${all.length} รายการนะ\n${lines.join('\n')}`;
  }
  if (/(เงิน|งบ|ใช้ไป|เหลือ|budget|finance)/i.test(message)) {
    return `เดือนนี้มีรายรับ ${context.monthIncome.toLocaleString('th-TH')} บาท รายจ่าย ${context.monthExpense.toLocaleString('th-TH')} บาท ตอนนี้คงเหลือประมาณ ${context.balance.toLocaleString('th-TH')} บาทนะ`;
  }
  if (/(เครียด|เหนื่อย|หมดไฟ|ไม่ไหว|ท้อ)/i.test(message)) {
    return 'ฟังดูหนักมากเลยนะ ขอบคุณที่บอกกันก่อน อย่างแรกขอให้หายใจช้าลงนิดหนึ่ง แล้วเลือกแค่งานเล็กที่สุด 1 อย่างพอ เดี๋ยวฉันช่วยดูตารางวันนี้ให้ได้ว่าอะไรควรเริ่มก่อน';
  }
  return '';
}

export async function buildAssistantReply(uid: string, message: string) {
  const [context, preferences] = await Promise.all([loadAssistantContext(uid), loadAssistantPreferences(uid)]);
  const proposedAction = proposeActionFromMessage(message);
  if (proposedAction) {
    return {
      content: `ได้เลย ฉันแปลงจากข้อความเป็นรายการให้แล้ว ตรวจดูอีกทีนะ ถ้าถูกก็กดยืนยันได้เลย`,
      proposedAction,
    };
  }
  const answer = contextAnswer(message, context, preferences);
  if (answer) return {content: answer};
  return {
    content: 'ถามได้เลยนะ จะดูตาราง เงิน หรือให้ช่วยจด/เพิ่มรายการก็ได้ ถ้าจะให้ฉันเพิ่มข้อมูล ฉันจะทำเป็นการ์ดให้ยืนยันก่อนเสมอ',
  };
}

export async function confirmAssistantAction(uid: string, action: AssistantProposedAction) {
  if (action.entity === 'memory') {
    await saveAssistantPreference(uid, action.payload.key, action.payload.value);
    return {id: action.payload.key, page: 'smartlife_ai_assistant'};
  }
  if (action.entity === 'checklist') {
    const startAt = new Date(action.payload.startAt);
    const ids = await Promise.all(action.payload.items.map((title, index) => {
      const taskStart = new Date(startAt);
      taskStart.setDate(taskStart.getDate() + index);
      taskStart.setHours(9, 0, 0, 0);
      const taskEnd = new Date(taskStart.getTime() + 60 * 60 * 1000);
      return activities.create(uid, {
        color: '#BB9293',
        endAt: Timestamp.fromDate(taskEnd),
        location: '',
        source: 'ai',
        startAt: Timestamp.fromDate(taskStart),
        status: 'planned',
        title: `${action.payload.title}: ${title}`,
        type: 'task',
      });
    }));
    return {id: ids[0] ?? '', page: 'smartlife_calendar_day'};
  }
  if (action.entity === 'finance') {
    const payload = action.payload;
    const id = await transactions.create(uid, {
      amount: payload.amount,
      category: payload.category,
      merchant: '',
      note: payload.note ?? 'บันทึกผ่าน SmartLife AI',
      occurredAt: Timestamp.fromDate(new Date(payload.date)),
      receiptPath: '',
      type: payload.type,
    });
    return {id, page: 'smartlife_finance_month'};
  }
  if (action.entity === 'note') {
    const payload = action.payload;
    const id = await notes.create(uid, {
      category: payload.tag === 'idea' ? 'idea' : payload.tag === 'task' ? 'work' : 'study',
      color: '#BB9293',
      content: payload.body,
      relatedScheduleId: payload.linkedScheduleId ?? '',
      title: payload.title,
    });
    return {id, page: 'smartlife_notes'};
  }
  const payload = action.payload;
  const startAt = new Date(payload.startAt);
  const endAt = payload.endAt ? new Date(payload.endAt) : new Date(startAt.getTime() + 60 * 60 * 1000);
  if (payload.type === 'class') {
    const id = await schedules.create(uid, {
      color: '#6F8F6D',
      courseCode: '',
      courseName: '',
      endAt: Timestamp.fromDate(endAt),
      location: payload.location ?? '',
      source: 'manual',
      startAt: Timestamp.fromDate(startAt),
      title: payload.title,
    });
    return {id, page: 'smartlife_calendar_day'};
  }
  const id = await activities.create(uid, {
    color: payload.type === 'task' ? '#BB9293' : '#9297BB',
    endAt: Timestamp.fromDate(endAt),
    location: payload.location ?? '',
    source: 'ai',
    startAt: Timestamp.fromDate(startAt),
    status: 'planned',
    title: payload.title,
    type: payload.type === 'task' ? 'task' : 'appointment',
  });
  return {id, page: 'smartlife_calendar_day'};
}
