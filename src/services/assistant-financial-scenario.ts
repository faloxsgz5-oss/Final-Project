import type {AssistantFinancialScenario} from '../types/assistant';

const MONEY = '([\\d๐-๙][\\d๐-๙,]*(?:\\.\\d+)?)';
const ENGLISH_NUMBERS: Record<string, string> = {
  eight: '8', five: '5', four: '4', nine: '9', one: '1', seven: '7', six: '6', ten: '10', three: '3', two: '2',
};

function normalizeThaiDigits(value: string) {
  return value.replace(/[๐-๙]/g, (digit) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(digit)));
}

function normalizeNumberWords(value: string) {
  return normalizeThaiDigits(value).replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/gi,
    (word) => ENGLISH_NUMBERS[word.toLowerCase()] ?? word,
  );
}

function amount(value?: string) {
  if (!value) return undefined;
  const parsed = Number(normalizeThaiDigits(value).replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function firstAmount(message: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(message);
    const parsed = amount(match?.slice(1).find(Boolean));
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

function requestedMealCount(message: string) {
  const numeric = /(\d+)\s*(?:มื้อ|meals?)/i.exec(message);
  if (numeric) return Math.max(1, Math.min(6, Number(numeric[1])));
  if (/(?:สาม|๓)\s*มื้อ|แบ่งมื้อ|พร้อมแบ่งมื้อ|three\s+meals?/i.test(message)) return 3;
  if (/(?:สอง|๒)\s*มื้อ|two\s+meals?/i.test(message)) return 2;
  return undefined;
}

function requestedDays(message: string) {
  const match = /(?:\/\s*|เหลือ\s*|สำหรับ\s*|ใช้\s*|for\s*)?(\d+)\s*(?:วัน|days?)/i.exec(message);
  if (!match) return undefined;
  const days = Number(match[1]);
  return Number.isFinite(days) ? Math.max(1, Math.min(366, Math.floor(days))) : undefined;
}

function requestedMonths(message: string) {
  const match = /(?:ภายใน|ใน|within|over)?\s*(\d+)\s*(?:เดือน|months?)/i.exec(message);
  if (!match) return undefined;
  const months = Number(match[1]);
  return Number.isFinite(months) ? Math.max(1, Math.min(120, Math.floor(months))) : undefined;
}

function roundedMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function completeBudgetScenario(scenario: AssistantFinancialScenario) {
  const next = {...scenario};
  if (next.startingAmount !== undefined && next.savingsAmount !== undefined && next.foodBudget === undefined) {
    next.foodBudget = roundedMoney(Math.max(0, next.startingAmount - next.savingsAmount));
  }
  const spendable = next.foodBudget ?? next.startingAmount;
  if (spendable !== undefined && next.days) {
    next.dailyBudget = roundedMoney(spendable / next.days);
  }
  return next;
}

function isRevision(message: string) {
  return /(เปลี่ยนใจ|เปลี่ยนเป็น|แทน|ปรับ(?:ใหม่)?|คำนวณใหม่|instead|change|recalculate)/i.test(message);
}

function isDirectFinancialFollowUp(message: string) {
  return /(แบ่ง.*มื้อ|มื้อละ|เช้า.*กลางวัน.*เย็น|วันละ(?:เท่าไร)?|เหลือเท่าไร|คำนวณใหม่|เปลี่ยนใจ|แทน|ถึงเป้าหมายภายใน|within\s+\d+\s+months?)/i.test(message);
}

function hasOtherPrimaryDomain(message: string) {
  return /(ocr|ใบเสร็จ|สลิป|ตารางเรียน|งานที่ใกล้ส่ง|งานค้าง|ข้อสอบ|อ่านหนังสือ|สอบ|โน้ต|บันทึก|receipt|class schedule|exam|study plan)/i.test(message);
}

/**
 * Decides whether the local exact calculator may answer this turn. A stored
 * scenario alone is never enough; the latest message must introduce a numeric
 * finance scenario or clearly continue that exact scenario.
 */
export function shouldUseDeterministicFinancialScenario(
  message: string,
  scenario?: AssistantFinancialScenario,
) {
  if (!scenario || hasOtherPrimaryDomain(message)) return false;
  const normalized = normalizeNumberWords(message.normalize('NFC'));
  const hasAmount = new RegExp(`${MONEY}\\s*(?:บาท|baht|฿)`, 'i').test(normalized);
  const hasFinanceCue = /(เงิน|งบ|ออม|เก็บเงิน|ค่าอาหาร|ค่าเดินทาง|มื้อ|ประหยัด|budget|save|saving|baht)/i.test(normalized);
  return (hasAmount && hasFinanceCue) || isDirectFinancialFollowUp(normalized);
}

export function updateFinancialScenario(
  message: string,
  previous?: AssistantFinancialScenario,
): AssistantFinancialScenario | undefined {
  const normalized = normalizeNumberWords(message.normalize('NFC'));
  const statedStartingAmount = firstAmount(normalized, [
    new RegExp(`(?:งบ(?:ทั้งหมด|อาหาร)?|มีเงิน(?:เหลือ)?|เงินเหลือ|เงินตั้งต้น|ยอดจากคำถาม|ตอนนี้มี|ได้รับ(?:เงิน)?(?:เดือนละ)?|ได้เงิน(?:เดือนละ)?|i\\s+have|(?:my\\s+)?budget(?:\\s+is)?|currently\\s+have)\\s*${MONEY}`, 'i'),
  ]);
  const arrow = new RegExp(`${MONEY}\\s*(?:บาท|baht)?\\s*(?:→|->|ไป(?:เป็น)?|ให้ถึง|to)\\s*${MONEY}`, 'i').exec(normalized);
  const targetAmount = arrow
    ? amount(arrow[2])
    : firstAmount(normalized, [
      new RegExp(`(?:เป้าหมาย|ให้ถึง|อยาก(?:มี|เก็บให้ถึง)|ต้องการ(?:มี|เก็บให้ถึง)|target|goal|reach|save\\s+up\\s+to)\\s*(?:คือ|เป็น|of)?\\s*${MONEY}`, 'i'),
    ]);
  const arrowStartingAmount = arrow ? amount(arrow[1]) : undefined;
  const months = requestedMonths(normalized);

  if (targetAmount !== undefined && (arrowStartingAmount !== undefined || statedStartingAmount !== undefined || previous?.startingAmount !== undefined)) {
    return {
      months,
      startingAmount: arrowStartingAmount ?? statedStartingAmount ?? previous?.startingAmount,
      targetAmount,
      type: 'savings_goal',
    };
  }
  if (previous?.type === 'savings_goal' && months && /(เป้าหมาย|ให้ถึง|เดือน|target|goal|months?)/i.test(normalized)) {
    return {...previous, months};
  }

  const startingAmount = statedStartingAmount;
  const savingsAmount = firstAmount(normalized, [
    new RegExp(`(?:(?:อยาก|ขอ|จะ|แยก|กัน)?\\s*(?:ออม|เก็บเงิน|เงินออม)|(?:want\\s+to\\s+|would\\s+like\\s+to\\s+)?save)\\s*(?:อย่างน้อย|at\\s+least)?\\s*${MONEY}`, 'i'),
  ]);
  const foodBudget = firstAmount(normalized, [
    new RegExp(`(?:เหลือ(?:เป็น|ไว้)?\\s*)?(?:ค่า)?อาหาร\\s*${MONEY}`, 'i'),
    new RegExp(`food(?:\\s+budget)?\\s*(?:is|of)?\\s*${MONEY}`, 'i'),
  ]);
  const dailyBudget = firstAmount(normalized, [
    new RegExp(`(?:วันละ|ต่อวัน|daily(?:\\s+budget)?)\\s*${MONEY}`, 'i'),
  ]);
  const days = requestedDays(normalized);
  const mealCount = requestedMealCount(normalized);
  const hasBudgetSignal = /(งบ|เงิน|บาท|ออม|เก็บเงิน|อาหาร|มื้อ|วันละ|ต่อวัน|budget|baht|save|saving|meals?)/i.test(normalized);
  const directFollowUp = Boolean(previous && isDirectFinancialFollowUp(normalized));
  if (!hasBudgetSignal && !directFollowUp) return previous;
  if (
    startingAmount === undefined && savingsAmount === undefined && foodBudget === undefined &&
    dailyBudget === undefined && days === undefined && mealCount === undefined && !directFollowUp
  ) return previous;

  const revision = isRevision(normalized);
  const hasNewStartingAmount = startingAmount !== undefined;
  const base = previous?.type === 'budget' && (revision || (!hasNewStartingAmount && directFollowUp))
    ? previous
    : {type: 'budget' as const};
  const upstreamAmountChanged = startingAmount !== undefined || savingsAmount !== undefined;
  const nextFoodBudget = foodBudget !== undefined
    ? foodBudget
    : upstreamAmountChanged
      ? undefined
      : base.foodBudget;

  return completeBudgetScenario({
    ...base,
    dailyBudget: dailyBudget ?? (upstreamAmountChanged || days !== undefined ? undefined : base.dailyBudget),
    days: days ?? base.days,
    foodBudget: nextFoodBudget,
    mealCount: mealCount ?? base.mealCount,
    savingsAmount: savingsAmount ?? base.savingsAmount,
    startingAmount: startingAmount ?? base.startingAmount,
    type: 'budget',
  });
}

function money(value: number) {
  return value.toLocaleString('th-TH', {maximumFractionDigits: 2});
}

function threeMealSplit(dailyBudget: number) {
  const breakfast = Math.floor(dailyBudget * 0.25);
  const lunch = Math.floor((dailyBudget - breakfast) / 2);
  const dinner = roundedMoney(dailyBudget - breakfast - lunch);
  return {breakfast, dinner, lunch};
}

export function deterministicFinancialScenarioAnswer(
  scenario: AssistantFinancialScenario | undefined,
  message: string,
) {
  if (!scenario) return '';
  const answerInEnglish = /[A-Za-z]/.test(message) && !/[ก-๙]/.test(message);
  if (scenario.type === 'savings_goal' && scenario.startingAmount !== undefined && scenario.targetAmount !== undefined) {
    const gap = roundedMoney(Math.max(0, scenario.targetAmount - scenario.startingAmount));
    if (gap === 0) {
      if (answerInEnglish) return `You already have ${money(scenario.startingAmount)} baht, so you have reached your ${money(scenario.targetAmount)}-baht goal.`;
      return `ตามตัวเลขในคำถาม คุณมี ${money(scenario.startingAmount)} บาท ซึ่งถึงเป้าหมาย ${money(scenario.targetAmount)} บาทแล้วครับ`;
    }
    if (scenario.months) {
      const perMonth = roundedMoney(gap / scenario.months);
      if (answerInEnglish) return `You currently have ${money(scenario.startingAmount)} baht and need ${money(gap)} baht more to reach ${money(scenario.targetAmount)} baht. Over ${scenario.months} months, save ${money(perMonth)} baht per month.`;
      return `ตอนนี้มี ${money(scenario.startingAmount)} บาท ต้องเก็บเพิ่มอีก ${money(gap)} บาทเพื่อถึงเป้าหมาย ${money(scenario.targetAmount)} บาท ภายใน ${scenario.months} เดือนจึงควรเก็บเดือนละ ${money(perMonth)} บาทครับ`;
    }
    if (answerInEnglish) return `You currently have ${money(scenario.startingAmount)} baht and need ${money(gap)} baht more to reach your ${money(scenario.targetAmount)}-baht goal. Tell me your target date and I can calculate a daily or monthly saving amount.`;
    return `ตามตัวเลขในคำถาม ตอนนี้มี ${money(scenario.startingAmount)} บาท และต้องเพิ่มอีก ${money(gap)} บาทเพื่อถึงเป้าหมาย ${money(scenario.targetAmount)} บาทครับ ถ้าต้องการแบ่งเป็นยอดออมต่อวันหรือเดือน บอกระยะเวลาที่ต้องการได้เลย`;
  }

  if (scenario.type !== 'budget' || !scenario.days) return '';
  const spendable = scenario.foodBudget ?? (
    scenario.startingAmount !== undefined
      ? Math.max(0, scenario.startingAmount - (scenario.savingsAmount ?? 0))
      : undefined
  );
  if (spendable === undefined) return '';
  const daily = roundedMoney(spendable / scenario.days);
  const wantsMeals = Boolean(scenario.mealCount || /(มื้อ|แบ่ง.*(?:เช้า|กลางวัน|เย็น)|meals?)/i.test(message));

  if (answerInEnglish && !wantsMeals) {
    const saving = scenario.savingsAmount ? ` After setting aside ${money(scenario.savingsAmount)} baht,` : '';
    return `From ${money(scenario.startingAmount ?? spendable)} baht,${saving} you have ${money(spendable)} baht for ${scenario.days} days, or ${money(daily)} baht per day.`;
  }

  let opening = scenario.startingAmount !== undefined
    ? `จากงบ ${money(scenario.startingAmount)} บาท`
    : `จากงบที่ใช้ได้ ${money(spendable)} บาท`;
  if (scenario.savingsAmount !== undefined) opening += ` แยกออม ${money(scenario.savingsAmount)} บาท`;
  if (scenario.startingAmount !== undefined || scenario.savingsAmount !== undefined) {
    opening += ` จะเหลือ${scenario.foodBudget !== undefined ? 'ค่าอาหาร' : 'งบใช้จ่าย'} ${money(spendable)} บาท`;
  }
  opening += `สำหรับ ${scenario.days} วัน หรือวันละ ${money(daily)} บาท`;

  if (!wantsMeals) return `${opening}ครับ`;
  if (daily < 90) {
    return `${opening}ครับ งบค่อนข้างตึงสำหรับอาหารซื้อครบ 3 มื้อ แนะนำใช้โรงอาหารราคาประหยัด ทำอาหารง่าย ๆ พกน้ำ และกันเงินฉุกเฉินไว้ก่อน`;
  }
  const split = threeMealSplit(daily);
  if (answerInEnglish) return `${opening}. Split the daily amount into ${money(split.breakfast)} baht for breakfast, ${money(split.lunch)} baht for lunch, and ${money(split.dinner)} baht for dinner.`;
  return `${opening} แบ่งได้เป็นเช้า ${money(split.breakfast)} บาท กลางวัน ${money(split.lunch)} บาท และเย็น ${money(split.dinner)} บาทครับ`;
}
