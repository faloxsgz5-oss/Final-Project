import {Timestamp} from 'firebase/firestore';

import {schedules, transactions} from '@/services/firestore';
import type {OcrResult} from '@/services/ocr';

type ScheduleEntry = {
  courseCode?: string;
  courseName?: string;
  day?: string;
  endTime?: string;
  room?: string;
  section?: string;
  startTime?: string;
};

export type SavedScan = {
  destination: 'smartlife_calendar_month' | 'smartlife_finance_month';
  documentIds: string[];
};

const THAI_WEEKDAYS: [number, string[]][] = [
  [0, ['\u0e2d\u0e32\u0e17\u0e34\u0e15\u0e22\u0e4c', 'sunday', 'sun']],
  [1, ['\u0e08\u0e31\u0e19\u0e17\u0e23\u0e4c', 'monday', 'mon']],
  [2, ['\u0e2d\u0e31\u0e07\u0e04\u0e32\u0e23', 'tuesday', 'tue']],
  [3, ['\u0e1e\u0e38\u0e18', 'wednesday', 'wed']],
  [4, ['\u0e1e\u0e24\u0e2b\u0e31\u0e2a\u0e1a\u0e14\u0e35', 'thursday', 'thu']],
  [5, ['\u0e28\u0e38\u0e01\u0e23\u0e4c', 'friday', 'fri']],
  [6, ['\u0e40\u0e2a\u0e32\u0e23\u0e4c', 'saturday', 'sat']],
];

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

const THAI_DIGITS: Record<string, string> = {
  '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
  '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9',
};

export function parseCurrencyAmount(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let normalized = String(value ?? '')
    .replace(/[๐-๙]/g, (digit) => THAI_DIGITS[digit] ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/(?:THB|บาท|฿)/gi, '')
    .replace(/\s+/g, '')
    .replace(/[^\d.,-]/g, '');
  if (!normalized) return null;

  const commaCount = (normalized.match(/,/g) ?? []).length;
  const dotCount = (normalized.match(/\./g) ?? []).length;
  if (commaCount && dotCount) {
    normalized = normalized.replace(/,/g, '');
  } else if (commaCount === 1 && !dotCount) {
    const [, decimals = ''] = normalized.split(',');
    normalized = decimals.length === 1 || decimals.length === 2
      ? normalized.replace(',', '.')
      : normalized.replace(',', '');
  } else if (commaCount > 1) {
    normalized = normalized.replace(/,/g, '');
  }

  if ((normalized.match(/\./g) ?? []).length > 1) {
    const decimalIndex = normalized.lastIndexOf('.');
    normalized = `${normalized.slice(0, decimalIndex).replace(/\./g, '')}${normalized.slice(decimalIndex)}`;
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function firstAmountValue(draft: Record<string, unknown>) {
  if ('total' in draft) return draft.total;
  return [draft.amount, draft.totalAmount].find((value) => String(value ?? '').trim().length > 0);
}

function bangkokDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(value);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {day: get('day'), month: get('month'), year: get('year')};
}

function parseTime(value: unknown, fallbackHour: number) {
  const match = text(value).match(/(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (!match) return {hour: fallbackHour, minute: 0};
  return {
    hour: Math.min(23, Math.max(0, Number(match[1]))),
    minute: Math.min(59, Math.max(0, Number(match[2]))),
  };
}

function bangkokDate(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute));
}

function receiptOccurredAt(dateValue: unknown, timeValue: unknown) {
  const fallback = bangkokDateParts();
  let {day, month, year} = fallback;
  const date = text(dateValue);
  const yearFirst = date.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  const dayFirst = date.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);

  if (yearFirst) {
    year = Number(yearFirst[1]);
    month = Number(yearFirst[2]);
    day = Number(yearFirst[3]);
  } else if (dayFirst) {
    day = Number(dayFirst[1]);
    month = Number(dayFirst[2]);
    year = Number(dayFirst[3]);
  }

  if (year > 2400) year -= 543;
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) ({day, month, year} = fallback);
  const {hour, minute} = parseTime(timeValue, 12);
  const parsed = bangkokDate(year, month, day, hour, minute);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function weekdayNumber(value: unknown, fallback: number) {
  const normalized = text(value).toLowerCase();
  return THAI_WEEKDAYS.find(([, labels]) => labels.some((label) => normalized.includes(label)))?.[0] ?? fallback;
}

function semesterDateParts(value: unknown, label: string) {
  const raw = text(value);
  const yearFirst = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const dayFirst = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (!yearFirst && !dayFirst) throw new Error(`${label} \u0e15\u0e49\u0e2d\u0e07\u0e40\u0e1b\u0e47\u0e19\u0e23\u0e39\u0e1b\u0e41\u0e1a\u0e1a YYYY-MM-DD`);
  let year = Number(yearFirst?.[1] ?? dayFirst?.[3]);
  const month = Number(yearFirst?.[2] ?? dayFirst?.[2]);
  const day = Number(yearFirst?.[3] ?? dayFirst?.[1]);
  if (year > 2400) year -= 543;
  const parsed = bangkokDate(year, month, day, 12, 0);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) throw new Error(`${label} \u0e44\u0e21\u0e48\u0e16\u0e39\u0e01\u0e15\u0e49\u0e2d\u0e07`);
  return {day, month, year};
}

function weeklyScheduleTimes(entry: ScheduleEntry, index: number, semesterStart: {day: number; month: number; year: number}, semesterEnd: {day: number; month: number; year: number}) {
  const firstSemesterDay = bangkokDate(semesterStart.year, semesterStart.month, semesterStart.day, 12, 0);
  const finalSemesterDay = bangkokDate(semesterEnd.year, semesterEnd.month, semesterEnd.day, 23, 59);
  const targetWeekday = weekdayNumber(entry.day, -1);
  if (targetWeekday < 0) throw new Error(`\u0e23\u0e32\u0e22\u0e27\u0e34\u0e0a\u0e32\u0e17\u0e35\u0e48 ${index + 1} \u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e23\u0e30\u0e1a\u0e38\u0e27\u0e31\u0e19\u0e40\u0e23\u0e35\u0e22\u0e19`);
  const startTime = parseTime(entry.startTime, Math.min(20, 9 + index));
  const endTime = parseTime(entry.endTime, Math.min(22, startTime.hour + 1));
  const dayOffset = (targetWeekday - firstSemesterDay.getUTCDay() + 7) % 7;
  let cursor = bangkokDate(semesterStart.year, semesterStart.month, semesterStart.day + dayOffset, 12, 0);
  const occurrences: {endAt: Date; startAt: Date}[] = [];

  while (cursor.getTime() <= finalSemesterDay.getTime()) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    const startAt = bangkokDate(year, month, day, startTime.hour, startTime.minute);
    let endAt = bangkokDate(year, month, day, endTime.hour, endTime.minute);
    if (endAt.getTime() <= startAt.getTime()) endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    occurrences.push({endAt, startAt});
    cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return occurrences;
}

function scheduleEntries(draft: Record<string, unknown>) {
  return Array.isArray(draft.entries) ? draft.entries as ScheduleEntry[] : [];
}

export async function saveOcrResult({
  draft,
  result,
  uid,
}: {
  draft: Record<string, unknown>;
  result: OcrResult;
  uid: string;
}): Promise<SavedScan> {
  if (result.scanType === 'receipt') {
    const amount = parseCurrencyAmount(firstAmountValue(draft));
    if (amount === null) throw new Error('\u0e01\u0e23\u0e38\u0e13\u0e32\u0e01\u0e23\u0e2d\u0e01\u0e22\u0e2d\u0e14\u0e40\u0e07\u0e34\u0e19\u0e40\u0e1b\u0e47\u0e19\u0e15\u0e31\u0e27\u0e40\u0e25\u0e02 \u0e40\u0e0a\u0e48\u0e19 90 \u0e2b\u0e23\u0e37\u0e2d 1,250.00');

    const id = await transactions.create(uid, {
      amount,
      category: '\u0e2d\u0e37\u0e48\u0e19 \u0e46',
      merchant: text(draft.merchant),
      note: '\u0e19\u0e33\u0e40\u0e02\u0e49\u0e32\u0e08\u0e32\u0e01 Smart Scan OCR',
      occurredAt: Timestamp.fromDate(receiptOccurredAt(draft.date, draft.time)),
      receiptPath: '',
      type: 'expense',
    });
    return {destination: 'smartlife_finance_month', documentIds: [id]};
  }

  const entries = scheduleEntries(draft);
  if (!entries.length) throw new Error('\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e23\u0e32\u0e22\u0e27\u0e34\u0e0a\u0e32\u0e17\u0e35\u0e48\u0e1e\u0e23\u0e49\u0e2d\u0e21\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01');
  const semesterStart = semesterDateParts(draft.semesterStart, '\u0e27\u0e31\u0e19\u0e40\u0e1b\u0e34\u0e14\u0e20\u0e32\u0e04\u0e40\u0e23\u0e35\u0e22\u0e19');
  const semesterEnd = semesterDateParts(draft.semesterEnd, '\u0e27\u0e31\u0e19\u0e1b\u0e34\u0e14\u0e20\u0e32\u0e04\u0e40\u0e23\u0e35\u0e22\u0e19');
  const startBoundary = bangkokDate(semesterStart.year, semesterStart.month, semesterStart.day, 0, 0);
  const endBoundary = bangkokDate(semesterEnd.year, semesterEnd.month, semesterEnd.day, 23, 59);
  const durationDays = Math.ceil((endBoundary.getTime() - startBoundary.getTime()) / (24 * 60 * 60 * 1000));
  if (durationDays < 0) throw new Error('\u0e27\u0e31\u0e19\u0e1b\u0e34\u0e14\u0e20\u0e32\u0e04\u0e40\u0e23\u0e35\u0e22\u0e19\u0e15\u0e49\u0e2d\u0e07\u0e2d\u0e22\u0e39\u0e48\u0e2b\u0e25\u0e31\u0e07\u0e27\u0e31\u0e19\u0e40\u0e1b\u0e34\u0e14\u0e20\u0e32\u0e04\u0e40\u0e23\u0e35\u0e22\u0e19');
  if (durationDays > 224) throw new Error('\u0e0a\u0e48\u0e27\u0e07\u0e20\u0e32\u0e04\u0e40\u0e23\u0e35\u0e22\u0e19\u0e15\u0e49\u0e2d\u0e07\u0e44\u0e21\u0e48\u0e40\u0e01\u0e34\u0e19 32 \u0e2a\u0e31\u0e1b\u0e14\u0e32\u0e2b\u0e4c');

  const importBatchId = `ocr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const scheduleItems = entries.flatMap((entry, index) => {
    const courseCode = text(entry.courseCode).replace(/\s+/g, '').toUpperCase();
    const courseName = text(entry.courseName).slice(0, 120);
    const location = [text(entry.room), text(entry.section) ? `Section ${text(entry.section)}` : ''].filter(Boolean).join(' - ');
    const seriesId = `${importBatchId}-${index}-${courseCode || 'course'}`.slice(0, 128);
    return weeklyScheduleTimes(entry, index, semesterStart, semesterEnd).map(({endAt, startAt}) => ({
      color: '#6F8F6D',
      courseCode,
      courseName,
      endAt: Timestamp.fromDate(endAt),
      location,
      seriesId,
      source: 'ocr' as const,
      startAt: Timestamp.fromDate(startAt),
      title: ([courseCode, courseName].filter(Boolean).join(' ') || `\u0e23\u0e32\u0e22\u0e27\u0e34\u0e0a\u0e32\u0e08\u0e32\u0e01 OCR ${index + 1}`).slice(0, 120),
    }));
  });
  if (!scheduleItems.length) throw new Error('\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e27\u0e31\u0e19\u0e40\u0e23\u0e35\u0e22\u0e19\u0e43\u0e19\u0e0a\u0e48\u0e27\u0e07\u0e20\u0e32\u0e04\u0e40\u0e23\u0e35\u0e22\u0e19\u0e17\u0e35\u0e48\u0e40\u0e25\u0e37\u0e2d\u0e01');
  if (scheduleItems.length > 500) throw new Error('\u0e08\u0e33\u0e19\u0e27\u0e19\u0e04\u0e25\u0e32\u0e2a\u0e40\u0e01\u0e34\u0e19 500 \u0e23\u0e32\u0e22\u0e01\u0e32\u0e23 \u0e01\u0e23\u0e38\u0e13\u0e32\u0e25\u0e14\u0e0a\u0e48\u0e27\u0e07\u0e20\u0e32\u0e04\u0e40\u0e23\u0e35\u0e22\u0e19');
  const documentIds = await schedules.createMany(uid, scheduleItems);
  return {destination: 'smartlife_calendar_month', documentIds};
}
