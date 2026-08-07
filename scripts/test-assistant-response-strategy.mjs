import {
  chooseAssistantExecutionRoute,
  chooseAssistantResponseMode,
  isSavingsPlanningRequest,
} from '../src/services/assistant-response-strategy.ts';

const responseModeCases = [
  ['ช่วยแนะนำวิธีออมเงินหลายแบบ', 'brainstorm'],
  ['อ่านหนังสือยังไงให้จำได้นาน', 'explain'],
  ['ช่วยวางแผนอ่านก่อนสอบให้หน่อย', 'plan'],
  ['เปรียบเทียบกฎ 50/30/20 กับวิธีแบ่งซอง', 'compare'],
  ['จัดเวลาไม่เป็นและชอบผัดวันประกันพรุ่ง', 'coach'],
  ['การเงิน', 'brainstorm'],
  ['การเรียน', 'brainstorm'],
  ['การนอน', 'brainstorm'],
  ['มีเงิน 10000 ลงทุนกี่บาทดี', 'plan'],
  ['แบ่งได้มั้ยครับ สมมุติผมมี 10000 อยากเก็บไว้กิน ลงทุน และซื้อของด้วย', 'plan'],
  ['มี 1000 แบ่งซื้อข้าว 5 วัน และออมเงินกี่บาท', 'plan'],
  ['มี 1000 บาท ต้องกินข้าว 5 วันและอยากออมด้วย', 'plan'],
  ['ได้เงินเดือนละ 1000 อยากเก็บให้ถึง 3000', 'plan'],
  ['ควรทำอะไรก่อน', 'plan'],
];

const executionRouteCases = [
  [{hasMutation: false, isDemoMode: false}, 'gemini'],
  [{hasMutation: true, isDemoMode: false}, 'deterministic'],
  [{hasMutation: false, isDemoMode: true}, 'deterministic'],
];

const savingsCases = [
  'ผมได้เงินจากรัฐเดือนละ 1000 เก็บต่อให้ได้ 3000',
  'มี 500 อยากออมให้ถึง 2000',
  'เงินเก็บควรเริ่มยังไง',
];

const failures = [];
for (const [message, expectedMode] of responseModeCases) {
  const actualMode = chooseAssistantResponseMode(message);
  if (actualMode !== expectedMode) {
    failures.push({actualMode, expectedMode, message});
  }
}
for (const [options, expectedRoute] of executionRouteCases) {
  const actualRoute = chooseAssistantExecutionRoute(options);
  if (actualRoute !== expectedRoute) failures.push({actualRoute, expectedRoute, options});
}
for (const message of savingsCases) {
  if (!isSavingsPlanningRequest(message)) failures.push({expectedSavingsPlanning: true, message});
}

const total = responseModeCases.length + executionRouteCases.length + savingsCases.length;
console.log(`SmartLife adaptive response tests: ${total - failures.length}/${total}`);
if (failures.length) {
  failures.forEach((failure) => console.error(failure));
  process.exitCode = 1;
}
