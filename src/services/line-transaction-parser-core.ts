export type SupportedBank = 'bbl' | 'gsb' | 'kbank' | 'krungsri' | 'ktb' | 'scb' | 'ttb' | 'unknown';
export type LineParserMode = 'generic' | 'llm' | 'regex';
export type LineTransactionType = 'expense' | 'income';

export type ParsedLineTransaction = {
  accountLast4: string | null;
  amount: number;
  balanceAfterReported: number | null;
  bank: SupportedBank;
  category: string;
  confidence: number;
  merchant: string;
  needsReview: boolean;
  note: string;
  occurredAt: string;
  parserMode: LineParserMode;
  type: LineTransactionType;
  warnings: string[];
};

type BankTemplate = {
  code: Exclude<SupportedBank, 'unknown'>;
  detect: RegExp;
  label: string;
  specificAmountPatterns: RegExp[];
};

const BANK_TEMPLATES: BankTemplate[] = [
  {
    code: 'scb',
    detect: /\bSCB\b|SCB\s*Connect|ไทยพาณิชย์|แม่มณี/i,
    label: 'SCB',
    specificAmountPatterns: [
      /(?:เงินเข้า|เงินออก|โอนเงิน|ชำระเงิน|หักบัญชี)[^\d๐-๙]{0,28}([๐-๙\d][๐-๙\d,]*(?:\.\d{1,2})?)/i,
    ],
  },
  {
    code: 'kbank',
    detect: /\bKBank\b|K\s*PLUS|K PLUS|กสิกร|MAKE by KBank/i,
    label: 'KBank',
    specificAmountPatterns: [
      /(?:รับเงิน|โอนเงิน|ใช้จ่าย|หักบัญชี)[^\d๐-๙]{0,28}([๐-๙\d][๐-๙\d,]*(?:\.\d{1,2})?)/i,
    ],
  },
  {
    code: 'bbl',
    detect: /\bBBL\b|Bangkok\s*Bank|บัวหลวง|ธนาคารกรุงเทพ/i,
    label: 'BBL',
    specificAmountPatterns: [
      /(?:เงินเข้าบัญชี|เงินออกจากบัญชี|ยอดรายการ)[^\d๐-๙]{0,28}([๐-๙\d][๐-๙\d,]*(?:\.\d{1,2})?)/i,
    ],
  },
  {
    code: 'krungsri',
    detect: /\bKrungsri\b|กรุงศรี|KMA/i,
    label: 'Krungsri',
    specificAmountPatterns: [
      /(?:รับโอน|โอนออก|ชำระ|หักจากบัญชี)[^\d๐-๙]{0,28}([๐-๙\d][๐-๙\d,]*(?:\.\d{1,2})?)/i,
    ],
  },
  {
    code: 'gsb',
    detect: /\bGSB\b|ออมสิน|MyMo/i,
    label: 'GSB',
    specificAmountPatterns: [
      /(?:เงินฝากเข้า|โอนเงินออก|ชำระค่าสินค้า)[^\d๐-๙]{0,28}([๐-๙\d][๐-๙\d,]*(?:\.\d{1,2})?)/i,
    ],
  },
  {
    code: 'ktb',
    detect: /\bKTB\b|Krungthai|Krungthai\s*Connext|กรุงไทย|เป๋าตัง/i,
    label: 'Krungthai',
    specificAmountPatterns: [
      /(?:เงินเข้า|เงินออก|โอนเงิน|ถอนเงิน|ชำระเงิน)[^\d๐-๙]{0,28}-?\s*([๐-๙\d][๐-๙\d,]*(?:\.[๐-๙\d]{1,2})?)/i,
    ],
  },
  {
    code: 'ttb',
    detect: /\bttb\b|ทีทีบี|ทหารไทยธนชาต|ttb touch/i,
    label: 'ttb',
    specificAmountPatterns: [
      /(?:เงินเข้า|เงินออก|โอนสำเร็จ|จ่ายสำเร็จ)[^\d๐-๙]{0,28}([๐-๙\d][๐-๙\d,]*(?:\.\d{1,2})?)/i,
    ],
  },
];

const EXPENSE_SIGNAL = /หักบัญชีจาก|หักจากบัญชี|เงินออก|โอนออก|ชำระ|จ่าย|ถอน|เดบิต|ซื้อ|ค่าบริการ|payment|purchase|withdraw|debited/i;
const INCOME_SIGNAL = /เงินเข้า|โอนเข้า|รับเงิน|ได้รับ|เครดิตเข้า|ฝากเข้า|received|credited|deposit/i;
const MONEY_SIGNAL = /(?:[๐-๙\d][๐-๙\d,]*(?:\.[๐-๙\d]{1,2})?\s*(?:บาท|THB)|฿\s*[๐-๙\d])/i;
const THAI_DIGITS: Record<string, string> = {
  '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
  '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9',
};
const THAI_MONTHS: Record<string, number> = {
  'ม.ค.': 0, 'มกราคม': 0,
  'ก.พ.': 1, 'กุมภาพันธ์': 1,
  'มี.ค.': 2, 'มีนาคม': 2,
  'เม.ย.': 3, 'เมษายน': 3,
  'พ.ค.': 4, 'พฤษภาคม': 4,
  'มิ.ย.': 5, 'มิถุนายน': 5,
  'ก.ค.': 6, 'กรกฎาคม': 6,
  'ส.ค.': 7, 'สิงหาคม': 7,
  'ก.ย.': 8, 'กันยายน': 8,
  'ต.ค.': 9, 'ตุลาคม': 9,
  'พ.ย.': 10, 'พฤศจิกายน': 10,
  'ธ.ค.': 11, 'ธันวาคม': 11,
};

export function toArabicDigits(value: string) {
  return value.replace(/[๐-๙]/g, (digit) => THAI_DIGITS[digit] ?? digit);
}

export function normalizeLineText(value: string) {
  return toArabicDigits(value)
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .toLocaleLowerCase('th-TH');
}

export function maskAccountNumbers(value: string) {
  return value.replace(
    /((?:เลข(?:ที่)?บัญชี|บัญชี|account|a\/c)\s*[:：]?\s*)([xX*๐-๙\d-]{6,})/gi,
    (_whole, prefix: string, account: string) => {
      const digits = toArabicDigits(account).replace(/\D/g, '');
      const suffix = digits.slice(-4);
      return `${prefix}••••${suffix}`;
    },
  );
}

export function isPotentialFinancialLineMessage(value: string) {
  return MONEY_SIGNAL.test(toArabicDigits(value));
}

export function splitLineMessageBatch(value: string) {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  const explicitParts = normalized
    .split(/\n\s*(?:-{3,}|={3,})\s*\n|\n{3,}/g)
    .map((part) => part.trim())
    .filter(Boolean);
  return explicitParts.length ? explicitParts.slice(0, 30) : [normalized];
}

function parseMoney(value: string | undefined) {
  if (!value) return null;
  const amount = Number(toArabicDigits(value).replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 && amount <= 1_000_000_000 ? amount : null;
}

function bankTemplateFor(text: string) {
  return BANK_TEMPLATES.find((template) => template.detect.test(text)) ?? null;
}

function amountFromPattern(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  return parseMoney(match?.[1]);
}

function extractAmount(text: string, template: BankTemplate | null) {
  for (const pattern of template?.specificAmountPatterns ?? []) {
    const amount = amountFromPattern(text, pattern);
    if (amount !== null) return amount;
  }

  const explicitAmount = amountFromPattern(
    text,
    /(?:จำนวนเงิน|ยอดรายการ|amount)\s*[:：]?\s*(?:฿|THB)?\s*([๐-๙\d][๐-๙\d,]*(?:\.[๐-๙\d]{1,2})?)/i,
  );
  if (explicitAmount !== null) return explicitAmount;

  const keywordPatterns = [
    /(?:ยอดเงิน(?:เข้า|ออก)?|เงิน(?:เข้า|ออก)|รับเงิน|โอน(?:เข้า|ออก)?|ชำระ(?:เงิน)?|หักบัญชี(?:จาก)?|หักจากบัญชี)[^\d๐-๙]{0,28}(?:฿|THB)?\s*([๐-๙\d][๐-๙\d,]*(?:\.[๐-๙\d]{1,2})?)/i,
    /(?:฿|THB)\s*([๐-๙\d][๐-๙\d,]*(?:\.[๐-๙\d]{1,2})?)/i,
  ];
  for (const pattern of keywordPatterns) {
    const amount = amountFromPattern(text, pattern);
    if (amount !== null) return amount;
  }

  const suffixPattern = /([๐-๙\d][๐-๙\d,]*(?:\.[๐-๙\d]{1,2})?)\s*(?:บาท|THB)/gi;
  const candidates: {amount: number; score: number}[] = [];
  for (const match of text.matchAll(suffixPattern)) {
    const amount = parseMoney(match[1]);
    if (amount === null) continue;
    const start = match.index ?? 0;
    const context = text.slice(Math.max(0, start - 35), start);
    const isBalance = /คงเหลือ|ยอดหลังรายการ|balance/i.test(context);
    const hasAction = EXPENSE_SIGNAL.test(context) || INCOME_SIGNAL.test(context);
    candidates.push({amount, score: (isBalance ? -2 : 0) + (hasAction ? 2 : 0)});
  }
  candidates.sort((first, second) => second.score - first.score);
  return candidates[0]?.amount ?? null;
}

function extractBalance(text: string) {
  const match = text.match(
    /(?:ยอด(?:เงิน)?คงเหลือ|ยอดหลังรายการ|คงเหลือ|available\s*balance|balance)\s*[:：]?\s*(?:฿|THB)?\s*([๐-๙\d][๐-๙\d,]*(?:\.[๐-๙\d]{1,2})?)/i,
  );
  return parseMoney(match?.[1]);
}

function detectType(text: string): {explicit: boolean; type: LineTransactionType} {
  // Expense is intentionally checked first. Messages such as "หักบัญชีจาก..."
  // may also contain a recipient phrase and must never be classified as income.
  if (EXPENSE_SIGNAL.test(text)) return {explicit: true, type: 'expense'};
  if (INCOME_SIGNAL.test(text)) return {explicit: true, type: 'income'};
  return {explicit: false, type: 'expense'};
}

function yearToGregorian(rawYear: number) {
  if (rawYear >= 2400) return rawYear - 543;
  if (rawYear >= 60 && rawYear <= 99) return 2500 + rawYear - 543;
  if (rawYear < 100) return 2000 + rawYear;
  return rawYear;
}

function validDate(year: number, month: number, day: number, hour: number, minute: number) {
  const date = new Date(year, month, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) return null;
  return date;
}

function extractOccurredAt(text: string, capturedAt: Date) {
  const arabic = toArabicDigits(text);
  const timeMatch = arabic.match(/(?:เวลา\s*)?([01]?\d|2[0-3])[:.](\d{2})(?:\s*น\.?)?/i);
  const hour = Number(timeMatch?.[1] ?? capturedAt.getHours());
  const minute = Number(timeMatch?.[2] ?? capturedAt.getMinutes());

  const numericDate = arabic.match(/(?:วันที่\s*)?(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/i);
  if (numericDate) {
    const parsed = validDate(
      yearToGregorian(Number(numericDate[3])),
      Number(numericDate[2]) - 1,
      Number(numericDate[1]),
      hour,
      minute,
    );
    if (parsed) return {date: parsed, explicitDate: true};
  }

  const isoDate = arabic.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoDate) {
    const parsed = validDate(
      yearToGregorian(Number(isoDate[1])),
      Number(isoDate[2]) - 1,
      Number(isoDate[3]),
      hour,
      minute,
    );
    if (parsed) return {date: parsed, explicitDate: true};
  }

  const thaiMonthNames = Object.keys(THAI_MONTHS)
    .sort((first, second) => second.length - first.length)
    .map((month) => month.replace('.', '\\.'))
    .join('|');
  const thaiDate = arabic.match(new RegExp(`(?:วันที่\\s*)?(\\d{1,2})\\s*(${thaiMonthNames})\\s*(\\d{2,4})`, 'i'));
  if (thaiDate) {
    const month = THAI_MONTHS[thaiDate[2].toLowerCase()];
    const parsed = validDate(yearToGregorian(Number(thaiDate[3])), month, Number(thaiDate[1]), hour, minute);
    if (parsed) return {date: parsed, explicitDate: true};
  }

  const fallback = new Date(capturedAt);
  fallback.setHours(hour, minute, 0, 0);
  return {date: fallback, explicitDate: false};
}

function cleanMerchant(value: string) {
  return value
    .replace(/\s+(?:จำนวน|ยอด|เวลา|วันที่|คงเหลือ|บัญชี).*$/i, '')
    .replace(/[|,;]+$/g, '')
    .trim()
    .slice(0, 160);
}

function extractMerchant(text: string, type: LineTransactionType, bankLabel: string) {
  const patterns = type === 'income'
    ? [
      /(?:จาก|ผู้โอน|sender)\s*[:：]?\s*([^\n]{2,100})/i,
      /(?:รับเงินจาก|โอนเข้าจาก)\s*[:：]?\s*([^\n]{2,100})/i,
    ]
    : [
      /(?:ชำระให้|จ่ายให้|โอนไปยัง|ผู้รับ|ร้านค้า|merchant)\s*[:：]?\s*([^\n]{2,100})/i,
      /(?:ที่ร้าน|ณ)\s*[:：]?\s*([^\n]{2,100})/i,
    ];
  for (const pattern of patterns) {
    const merchant = cleanMerchant(text.match(pattern)?.[1] ?? '');
    if (merchant) return merchant;
  }
  return type === 'income' ? `เงินเข้าผ่าน ${bankLabel}` : `รายการผ่าน ${bankLabel}`;
}

function extractAccountLast4(text: string) {
  const match = text.match(/(?:เลข(?:ที่)?บัญชี|บัญชี|account|a\/c)\s*[:：]?\s*([xX*๐-๙\d-]{4,30})/i);
  const digits = toArabicDigits(match?.[1] ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function categoryFor(text: string, type: LineTransactionType) {
  if (type === 'income') {
    if (/ทุน|scholarship/i.test(text)) return 'ทุนการศึกษา';
    if (/เงินเดือน|ค่าจ้าง|งานพิเศษ|salary|wage/i.test(text)) return 'รายได้';
    if (/คืนเงิน|refund/i.test(text)) return 'เงินคืน';
    if (/ครอบครัว|พ่อ|แม่|ผู้ปกครอง/i.test(text)) return 'ครอบครัว';
    return 'เงินโอนเข้า';
  }
  if (/อาหาร|ข้าว|กาแฟ|ร้านอาหาร|food|cafe/i.test(text)) return 'Food';
  if (/รถ|bts|mrt|เดินทาง|taxi|transport/i.test(text)) return 'Transport';
  if (/เรียน|หนังสือ|ค่าเทอม|education|course/i.test(text)) return 'Education';
  if (/ค่าไฟ|ค่าน้ำ|โทรศัพท์|อินเทอร์เน็ต|bill/i.test(text)) return 'Bills';
  if (/shopping|ซื้อสินค้า|ห้าง|market/i.test(text)) return 'Shopping';
  return 'Others';
}

export function parseLineMessageLocally(rawText: string, capturedAt = new Date()): ParsedLineTransaction | null {
  const text = rawText.trim();
  if (!text || !isPotentialFinancialLineMessage(text)) return null;

  const template = bankTemplateFor(text);
  const typeResult = detectType(text);
  const amount = extractAmount(text, template);
  if (amount === null) return null;
  const occurred = extractOccurredAt(text, capturedAt);
  const balanceAfterReported = extractBalance(text);
  const accountLast4 = extractAccountLast4(text);
  const bankLabel = template?.label ?? 'ธนาคาร';
  const merchant = extractMerchant(text, typeResult.type, bankLabel);
  const warnings: string[] = [];
  if (!template) warnings.push('ยังไม่รู้จักรูปแบบธนาคารนี้ กรุณาตรวจสอบข้อมูล');
  if (!typeResult.explicit) warnings.push('ไม่พบคำบอกเงินเข้าหรือเงินออกที่ชัดเจน');
  if (!occurred.explicitDate) warnings.push('ไม่พบวันที่ในข้อความ จึงใช้วันที่รับแจ้งเตือน');
  if (merchant.includes('ผ่าน ธนาคาร')) warnings.push('ไม่พบชื่อผู้โอนหรือผู้รับที่ชัดเจน');

  let confidence = 0.05;
  confidence += 0.35;
  if (template) confidence += 0.15;
  if (typeResult.explicit) confidence += 0.2;
  if (occurred.explicitDate) confidence += 0.1;
  if (!merchant.includes('ผ่าน ธนาคาร')) confidence += 0.08;
  if (balanceAfterReported !== null) confidence += 0.05;
  if (accountLast4) confidence += 0.02;
  confidence = Math.min(0.98, Number(confidence.toFixed(2)));

  return {
    accountLast4,
    amount,
    balanceAfterReported,
    bank: template?.code ?? 'unknown',
    category: categoryFor(text, typeResult.type),
    confidence,
    merchant,
    needsReview: confidence < 0.75 || warnings.length > 0,
    note: '',
    occurredAt: occurred.date.toISOString(),
    parserMode: template ? 'regex' : 'generic',
    type: typeResult.type,
    warnings,
  };
}
