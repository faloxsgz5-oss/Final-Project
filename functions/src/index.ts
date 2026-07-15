import {ImageAnnotatorClient} from "@google-cloud/vision";
import {getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {FieldValue, getFirestore, Timestamp} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import {onDocumentCreated} from "firebase-functions/v2/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {UniversityRouter} from "./schedule-parsers/university-router";
import type {ScheduleParserStrategy, StandardScheduleEntry} from "./schedule-parsers/types";

if (!getApps().length) initializeApp();

const db = getFirestore();
const bucket = getStorage().bucket();
const vision = new ImageAnnotatorClient();
const region = "asia-southeast1";
const openAiApiKey = defineSecret("OPENAI_API_KEY");

function requireAdmin(request: {auth?: {token: Record<string, unknown>}}) {
  if (request.auth?.token.admin !== true) {
    throw new HttpsError("permission-denied", "Administrator access required.");
  }
}

type ScanType = "receipt" | "schedule";
type ScanRequestType = ScanType | "auto";

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  return value.trim();
}

function serializeFirestoreValue(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeFirestoreValue(item)]),
    );
  }
  return value;
}

function serializeDocuments(
  snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>,
) {
  return snapshot.docs.map((item) => ({
    id: item.id,
    path: item.ref.path,
    ...serializeFirestoreValue(item.data()) as Record<string, unknown>,
  }));
}

function sortByCreatedAt(items: Record<string, unknown>[]) {
  return items.sort((first, second) => String(second.createdAt ?? "").localeCompare(String(first.createdAt ?? "")));
}

function cleanOcrText(text: string) {
  return text.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\r/g, "").trim();
}

function parseMoney(text: string) {
  const patterns = [
    /(?:ยอด(?:เงิน)?รวม|ยอดชำระ|จำนวนเงิน|ยอดสุทธิ|grand\s*total|total\s*amount|total)[^\d]{0,24}(?:฿\s*)?([\d,]+(?:\.\d{1,2})?)/gi,
    /(?:฿|THB)\s*([\d,]+(?:\.\d{1,2})?)/gi,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:บาท|THB)\b/gi,
  ];
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    const value = matches.at(-1)?.[1];
    if (value) return Number(value.replace(/,/g, ""));
  }
  return null;
}

function parseDate(text: string) {
  const numeric = text.match(/\b(\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4}))\b/);
  if (numeric) return numeric[1];
  return text.match(/\b(\d{1,2}\s+(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.|มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+\d{2,4})\b/i)?.[1] ?? null;
}

function parseTime(text: string) {
  const match = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}

function parseTimeRange(text: string) {
  const match = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:-|–|—|ถึง)\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  return match ? {startTime: `${match[1].padStart(2, "0")}:${match[2]}`, endTime: `${match[3].padStart(2, "0")}:${match[4]}`} : {startTime: null, endTime: null};
}

const HIGH_SCHOOL_PERIOD_TIMES: Record<number, {endTime: string; startTime: string}> = {
  1: {startTime: "08:30", endTime: "09:20"},
  2: {startTime: "09:20", endTime: "10:10"},
  3: {startTime: "10:10", endTime: "11:00"},
  4: {startTime: "11:00", endTime: "11:50"},
  5: {startTime: "12:40", endTime: "13:30"},
  6: {startTime: "13:30", endTime: "14:20"},
  7: {startTime: "14:20", endTime: "15:10"},
  8: {startTime: "15:10", endTime: "16:00"},
  9: {startTime: "16:00", endTime: "16:50"},
  10: {startTime: "16:50", endTime: "17:40"},
};

function parseHighSchoolPeriod(text: string) {
  const matches = [...text.matchAll(/(?:คาบ\s*(\d{1,2})(?:\s*(?:-|–|—|ถึง)\s*(?:คาบ\s*)?(\d{1,2}))?|period\s*(\d{1,2})(?:\s*(?:-|–|—|to)\s*(?:period\s*)?(\d{1,2}))?|พักเที่ยง|lunch(?:\s*break)?)/gi)];
  if (!matches.length) return {endTime: null, periodLabel: null, startTime: null};

  const periods = matches
    .flatMap((match) => [match[1], match[2], match[3], match[4]])
    .map((value) => Number(value))
    .filter((period) => Number.isInteger(period) && Boolean(HIGH_SCHOOL_PERIOD_TIMES[period]));
  if (!periods.length) {
    return matches.some((match) => /พักเที่ยง|lunch/i.test(match[0]))
      ? {startTime: "11:50", endTime: "12:40", periodLabel: "พักเที่ยง"}
      : {endTime: null, periodLabel: matches.map((match) => match[0]).join(" - "), startTime: null};
  }

  const firstPeriod = Math.min(...periods);
  const lastPeriod = Math.max(...periods);
  return {
    startTime: HIGH_SCHOOL_PERIOD_TIMES[firstPeriod].startTime,
    endTime: HIGH_SCHOOL_PERIOD_TIMES[lastPeriod].endTime,
    periodLabel: firstPeriod === lastPeriod ? `คาบ ${firstPeriod}` : `คาบ ${firstPeriod}-${lastPeriod}`,
  };
}

function extractCourseCodes(text: string) {
  return [...new Set(extractCourseMatches(text).map((match) => match.courseCode))];
}

function extractCourseMatches(text: string) {
  const expression = /\b(?:\d{6,7}|[A-Z]{2,6}(?:\s*\d){4,10})\b/gi;
  return [...text.matchAll(expression)].map((match) => ({
    courseCode: match[0].toUpperCase().replace(/\s+/g, ""),
    index: match.index ?? 0,
    raw: match[0],
  }));
}

function classifyDocument(text: string) {
  const receiptSignals = [
    /สำเร็จ/gi, /ชำระเงิน/gi, /รหัสอ้างอิง/gi, /จำนวนเงิน/gi, /ยอดรวม/gi,
    /ผู้รับเงิน|ไปยัง|บัญชีผู้รับ/gi, /K[ -]?PLUS|เป๋าตัง|PromptPay|พร้อมเพย์/gi, /(?:฿|บาท|THB)/gi,
  ];
  const scheduleSignals = [
    /ปีการศึกษา|ภาคการศึกษา/gi, /จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์/gi,
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue(?:s)?|wed|thu(?:rs)?|fri|sat|sun)\b/gi,
    /รายวิชา|รหัสวิชา|ตารางเรียน|ห้องเรียน/gi, /คาบ\s*\d+|period\s*\d+|พักเที่ยง|lunch(?:\s*break)?/gi,
    /\b\d{6,8}\b/g, /\b\d{1,2}[:.]\d{2}\s*(?:-|–|—|ถึง)\s*\d{1,2}[:.]\d{2}\b/g,
  ];
  const score = (patterns: RegExp[]) => patterns.reduce((total, pattern) => total + Math.min(3, [...text.matchAll(pattern)].length), 0);
  const receiptScore = score(receiptSignals);
  const alphanumericCourseScore = extractCourseCodes(text).filter((code) => /^[A-Z]/.test(code)).length;
  const scheduleScore = score(scheduleSignals) + Math.min(3, alphanumericCourseScore);
  const type: ScanType = scheduleScore > receiptScore ? "schedule" : "receipt";
  const total = Math.max(1, receiptScore + scheduleScore);
  return {type, confidence: Number((Math.max(receiptScore, scheduleScore) / total).toFixed(2)), scores: {receipt: receiptScore, schedule: scheduleScore}};
}

function parseReceipt(text: string) {
  const lines = cleanOcrText(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const labeledMerchant = text.match(/(?:ผู้รับเงิน|บัญชีผู้รับ|ชำระให้|ไปยัง|ร้านค้า|merchant|payee|to)\s*[:\-]?\s*([^\n]{2,80})/i)?.[1]?.trim();
  const ignored = /สำเร็จ|ชำระเงิน|รหัสอ้างอิง|จำนวนเงิน|ยอดรวม|ค่าธรรมเนียม|วันที่|เวลา|receipt|invoice|ธนาคาร|bank|promptpay|พร้อมเพย์|K[ -]?PLUS|เป๋าตัง/i;
  const merchant = labeledMerchant ?? lines.find((line) => /[A-Za-zก-๙]{2,}/.test(line) && !ignored.test(line) && !/^\d[\d\s.,:/-]+$/.test(line)) ?? null;
  const reference = text.match(/(?:รหัสอ้างอิง|เลขที่รายการ|reference(?:\s*no\.?)?|transaction\s*id)\s*[:#\-]?\s*([A-Z0-9-]{5,})/i)?.[1] ?? null;
  return {merchant, total: parseMoney(text), currency: "THB", date: parseDate(text), time: parseTime(text), reference};
}

function parseScheduleFallback(text: string) {
  const lines = cleanOcrText(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const dayPattern = /(จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i;
  const entries = lines.flatMap((line, index) => {
    const courseCodes = extractCourseCodes(line);
    if (!courseCodes.length) return [];
    const context = lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 4)).join(" ");
    const {startTime, endTime, periodLabel} = parseParenthesizedTimeRange(context);
    const {startDate, endDate} = parseScheduleDateRange(context);
    const section = context.match(/(?:section|sec\.?|กลุ่ม|หมู่เรียน)\s*[:#\-]?\s*([A-Z0-9-]+)/i)?.[1] ?? null;
    const room = context.match(/(?:ห้อง|room|อาคาร|building)\s*[:\-]?\s*([A-Zก-๙]{0,8}\s*[A-Z]{0,3}\d{3,5}(?:-[A-Z0-9]+)?)/i)?.[1]?.trim() ?? context.match(/\b[A-Z]{1,3}\d{3,5}(?:-[A-Z0-9]+)?\b/)?.[0] ?? null;
    const day = context.match(dayPattern)?.[1] ?? null;
    return courseCodes.map((courseCode) => ({courseCode, section, room, day, startDate, endDate, startTime, endTime, periodLabel, raw: line}));
  });
  const unique = [...new Map(entries.map((entry) => [`${entry.courseCode}-${entry.day}-${entry.startTime}`, entry])).values()];
  return {academicYear: text.match(/(?:ปีการศึกษา|พ\.ศ\.)\s*[:\-]?\s*(\d{4})/)?.[1] ?? null, entries: unique};
}

type DayCode = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
type VisionVertex = {x?: number | null; y?: number | null};
type VisionWord = {
  boundingBox?: {vertices?: VisionVertex[] | null} | null;
  confidence?: number | null;
  symbols?: {text?: string | null}[] | null;
};
type VisionParagraph = {words?: VisionWord[] | null};
type VisionBlock = {
  boundingBox?: {vertices?: VisionVertex[] | null} | null;
  confidence?: number | null;
  paragraphs?: VisionParagraph[] | null;
};
type VisionAnnotation = {
  pages?: {
    blocks?: VisionBlock[] | null;
    height?: number | null;
    width?: number | null;
  }[] | null;
};
type PositionedToken = {
  bottom: number;
  confidence: number;
  cx: number;
  cy: number;
  left: number;
  right: number;
  text: string;
  top: number;
};

type PositionedBlock = PositionedToken & {paragraphs: VisionParagraph[]};

const dayAliases: [DayCode, string[]][] = [
  ["MON", ["จันทร์", "monday", "mon"]],
  ["TUE", ["อังคาร", "tuesday", "tues", "tue"]],
  ["WED", ["พุธ", "wednesday", "wed"]],
  ["THU", ["พฤหัสบดี", "พฤหัส", "thursday", "thurs", "thu"]],
  ["FRI", ["ศุกร์", "friday", "fri"]],
  ["SAT", ["เสาร์", "saturday", "sat"]],
  ["SUN", ["อาทิตย์", "sunday", "sun"]],
];

function normalizeDayLabel(value: string): DayCode | null {
  const normalized = value.toLowerCase().replace(/[.,:()\s]/g, "").replace(/^วัน/, "");
  return dayAliases.find(([, aliases]) => aliases.some((alias) => normalized === alias.replace(/[.,:()\s]/g, "")))?.[0] ?? null;
}

function wordText(word: VisionWord) {
  return (word.symbols ?? []).map((symbol) => symbol.text ?? "").join("").trim();
}

function positionedText(vertices: VisionVertex[], text: string, confidence: number): PositionedToken | null {
  const xs = vertices.map((vertex) => Number(vertex.x ?? 0));
  const ys = vertices.map((vertex) => Number(vertex.y ?? 0));
  if (!text || xs.length < 4 || ys.length < 4) return null;
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {bottom, confidence, cx: (left + right) / 2, cy: (top + bottom) / 2, left, right, text, top};
}

function positionedWords(annotation: unknown) {
  const pages = (annotation as VisionAnnotation | null)?.pages ?? [];
  return pages.flatMap((page) => (page.blocks ?? []).flatMap((block) =>
    (block.paragraphs ?? []).flatMap((paragraph) => (paragraph.words ?? []).flatMap((word) => {
      const positioned = positionedText(word.boundingBox?.vertices ?? [], wordText(word), Number(word.confidence ?? 0));
      return positioned ? [positioned] : [];
    })),
  ));
}

function positionedBlocks(annotation: unknown) {
  const pages = (annotation as VisionAnnotation | null)?.pages ?? [];
  return pages.flatMap((page) => (page.blocks ?? []).flatMap((block) => {
    const paragraphs = block.paragraphs ?? [];
    const text = paragraphs.map((paragraph) => (paragraph.words ?? []).map(wordText).filter(Boolean).join(" ")).filter(Boolean).join("\n");
    let positioned = positionedText(block.boundingBox?.vertices ?? [], text, Number(block.confidence ?? 0));
    if (!positioned) {
      const words = paragraphs.flatMap((paragraph) => paragraph.words ?? []).flatMap((word) => {
        const item = positionedText(word.boundingBox?.vertices ?? [], wordText(word), Number(word.confidence ?? 0));
        return item ? [item] : [];
      });
      if (!words.length) return [];
      const vertices = [
        {x: Math.min(...words.map((word) => word.left)), y: Math.min(...words.map((word) => word.top))},
        {x: Math.max(...words.map((word) => word.right)), y: Math.min(...words.map((word) => word.top))},
        {x: Math.max(...words.map((word) => word.right)), y: Math.max(...words.map((word) => word.bottom))},
        {x: Math.min(...words.map((word) => word.left)), y: Math.max(...words.map((word) => word.bottom))},
      ];
      positioned = positionedText(vertices, text, Number(block.confidence ?? 0));
    }
    return positioned ? [{...positioned, paragraphs} as PositionedBlock] : [];
  }));
}

function normalizedScheduleDate(dayValue: string, monthValue: string, yearValue: string) {
  const day = Number(dayValue);
  const month = Number(monthValue);
  let year = Number(yearValue);
  if (year > 2400) year -= 543;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseScheduleDateRange(text: string) {
  const match = text.match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\s*(?:-|–|—|ถึง)\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})\b/);
  if (!match) return {endDate: null, startDate: null};
  return {
    endDate: normalizedScheduleDate(match[4], match[5], match[6]),
    startDate: normalizedScheduleDate(match[1], match[2], match[3]),
  };
}

function parseParenthesizedTimeRange(text: string) {
  const match = text.match(/\(\s*([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\s*(?:-|–|—|ถึง)\s*([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\s*\)/);
  if (match) return {
    endTime: `${match[3].padStart(2, "0")}:${match[4]}`,
    periodLabel: null,
    startTime: `${match[1].padStart(2, "0")}:${match[2]}`,
  };
  const exactRange = parseTimeRange(text);
  return exactRange.startTime
    ? {...exactRange, periodLabel: null}
    : parseHighSchoolPeriod(text);
}

function parseCourseNameFromBlock(text: string, rawCourseCode: string) {
  const labeled = text.match(/(?:ชื่อวิชา|รายวิชา|course(?:\s*name)?|subject)\s*[:\-]?\s*([^\n]{2,120})/i)?.[1];
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const codePattern = new RegExp(rawCourseCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*"), "i");
  const codeLineIndex = lines.findIndex((line) => codePattern.test(line));
  const nearby = codeLineIndex >= 0
    ? [lines[codeLineIndex].replace(codePattern, " "), ...lines.slice(codeLineIndex + 1, codeLineIndex + 3)]
    : [];
  const candidates = [labeled, ...nearby].filter((value): value is string => Boolean(value));

  for (const value of candidates) {
    const cleaned = value
      .replace(/^\s*[,;]\s*[A-Z0-9-]{1,6}\b/i, " ")
      .replace(/\b(?:section|sec\.?)\s*[:#-]?\s*[A-Z0-9-]+\b/gi, " ")
      .replace(/(?:กลุ่ม|หมู่เรียน)\s*[:#-]?\s*[A-Z0-9-]+/gi, " ")
      .replace(/\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}(?:\s*(?:-|–|—|ถึง|to)\s*\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4})?\b/gi, " ")
      .replace(/\(?\b(?:[01]?\d|2[0-3])[:.]\d{2}\s*(?:-|–|—|ถึง|to)\s*(?:[01]?\d|2[0-3])[:.]\d{2}\b\)?/gi, " ")
      .replace(/(?:ห้อง|room|อาคาร|building)\s*[:-]?\s*[A-Zก-๙0-9-]+/gi, " ")
      .replace(/\b(?:MON|TUE|WED|THU|FRI|SAT|SUN|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi, " ")
      .replace(/(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์)/g, " ")
      .replace(/^[\s,;:|\-]+|[\s,;:|\-]+$/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (/^(?:[A-Z]{1,5}\d{2,5}(?:-[A-Z0-9]+)?)$/i.test(cleaned)) continue;
    if (cleaned.length >= 2 && cleaned.length <= 120 && /[A-Za-zก-๙]{2,}/.test(cleaned)) return cleaned;
  }
  return null;
}

function parseCourseBlockFields(text: string, rawCourseCode: string) {
  const tail = text.slice(Math.max(0, text.toUpperCase().indexOf(rawCourseCode.toUpperCase()) + rawCourseCode.length));
  const section = tail.match(/^\s*[,;]\s*([A-Z0-9-]{1,6})\b/i)?.[1] ??
    text.match(/(?:section|sec\.?|กลุ่ม|หมู่เรียน)\s*[:#-]?\s*([A-Z0-9-]+)/i)?.[1] ?? null;
  const room = text.match(/(?:ห้อง|room|อาคาร|building)\s*[:-]?\s*([A-Zก-๙]{0,8}\s*[A-Z]{0,3}\d{3,5}(?:-[A-Z0-9]+)?)/i)?.[1]?.trim() ??
    text.match(/\b[A-Z]{1,3}\d{3,5}(?:-[A-Z0-9]+)?\b/)?.[0] ?? null;
  const courseName = parseCourseNameFromBlock(text, rawCourseCode);
  return {...parseScheduleDateRange(text), ...parseParenthesizedTimeRange(text), courseName, room, section};
}

function parseScheduleGrid(annotation: unknown) {
  const words = positionedWords(annotation);
  const blocks = positionedBlocks(annotation);
  if (!words.length || !blocks.length) return [];
  const maxY = Math.max(...words.map((word) => word.bottom));
  const dayAnchors = words.flatMap((word) => {
    const day = normalizeDayLabel(word.text);
    return day ? [{...word, day}] : [];
  });
  if (!dayAnchors.length) return [];

  return blocks.flatMap((block) => {
    const matches = extractCourseMatches(block.text);
    if (!matches.length) return [];
    const dayAnchor = [...dayAnchors].sort((first, second) => Math.abs(first.cy - block.cy) - Math.abs(second.cy - block.cy))[0];
    const yDistance = dayAnchor ? Math.abs(dayAnchor.cy - block.cy) : Number.POSITIVE_INFINITY;
    if (!dayAnchor || yDistance > maxY * 0.14) return [];

    return matches.map((match, index) => {
      const nextIndex = matches[index + 1]?.index ?? block.text.length;
      const segment = block.text.slice(match.index, nextIndex).trim();
      const fields = parseCourseBlockFields(segment, match.raw);
      return {
        ...fields,
        courseCode: match.courseCode,
        day: dayAnchor.day,
        gridConfidence: Number(Math.max(0, Math.min(1, 1 - yDistance / Math.max(1, maxY * 0.14))).toFixed(2)),
        parserSource: "vision-course-block",
        raw: segment,
      };
    });
  });
}

async function parseSchedule(text: string, annotation: unknown, apiKey?: string) {
  const fallback = parseScheduleFallback(text);
  const normalizedFallback = fallback.entries.map((entry) => ({...entry, day: normalizeDayLabel(String(entry.day ?? "")) ?? entry.day}));
  const gridEntries = parseScheduleGrid(annotation);
  const withRange = <T extends {endDate?: string | null; startDate?: string | null}>(entries: T[]) => {
    const starts = entries.map((entry) => entry.startDate).filter((value): value is string => Boolean(value)).sort();
    const ends = entries.map((entry) => entry.endDate).filter((value): value is string => Boolean(value)).sort();
    return {semesterEnd: ends.length ? ends[ends.length - 1] : null, semesterStart: starts[0] ?? null};
  };
  const fallbackByCode = new Map(normalizedFallback.map((entry) => [entry.courseCode.replace(/\s+/g, "").toUpperCase(), entry]));
  const mergedGridEntries = gridEntries.map((entry) => {
    const fallbackEntry = fallbackByCode.get(entry.courseCode);
    return {
      ...fallbackEntry,
      ...entry,
      endDate: entry.endDate ?? fallbackEntry?.endDate ?? null,
      endTime: entry.endTime ?? fallbackEntry?.endTime ?? null,
      room: entry.room ?? fallbackEntry?.room ?? null,
      section: entry.section ?? fallbackEntry?.section ?? null,
      startDate: entry.startDate ?? fallbackEntry?.startDate ?? null,
      startTime: entry.startTime ?? fallbackEntry?.startTime ?? null,
    };
  });
  const uniqueGridEntries = [...new Map(mergedGridEntries.map((entry) => [`${entry.courseCode}-${entry.day}-${entry.startTime}`, entry])).values()];
  const normalizedLegacyEntries: StandardScheduleEntry[] = normalizedFallback.map((entry) => ({
    ...entry,
    courseName: "courseName" in entry && typeof entry.courseName === "string" ? entry.courseName : null,
    parserSource: "text-fallback",
  }));
  const normalizedGridEntries: StandardScheduleEntry[] = uniqueGridEntries.map((entry) => ({
    ...entry,
    courseName: entry.courseName ?? null,
  }));

  const legacyStrategies: ScheduleParserStrategy[] = [
    {
      id: "vision-course-block",
      institution: "Vision grid timetable",
      detect: () => normalizedGridEntries.length ? 0.92 : 0,
      parse: () => normalizedGridEntries,
    },
    {
      id: "legacy-text-fallback",
      institution: "Legacy timetable text",
      detect: () => normalizedLegacyEntries.length ? 0.45 : 0,
      parse: () => normalizedLegacyEntries,
    },
  ];
  const routed = await new UniversityRouter(apiKey, legacyStrategies).parse({annotation, rawText: text});
  return {
    ...fallback,
    ...withRange(routed.entries),
    entries: routed.entries,
    institution: routed.institution,
    parserConfidence: routed.confidence,
    parserSource: routed.strategyId,
    usedLlm: routed.usedLlm,
  };
}

export const analyzeScan = onCall(
  {region, memory: "512MiB", timeoutSeconds: 120, enforceAppCheck: false, secrets: [openAiApiKey]},
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Please sign in before scanning.");

    const storagePath = requireString(request.data?.storagePath, "storagePath");
    const requestedType = requireString(request.data?.scanType, "scanType") as ScanRequestType;
    if (requestedType !== "auto" && requestedType !== "receipt" && requestedType !== "schedule") {
      throw new HttpsError("invalid-argument", "scanType must be auto, receipt, or schedule.");
    }

    const allowedFolders = requestedType === "auto" ? ["scans"] : [requestedType === "receipt" ? "receipts" : "schedules"];
    if (!allowedFolders.some((folder) => storagePath.startsWith(`users/${uid}/${folder}/`))) {
      throw new HttpsError("permission-denied", "You can only scan your own uploaded files.");
    }

    const logRef = db.collection("users").doc(uid).collection("scanLogs").doc();
    await logRef.set({
      ownerId: uid,
      kind: requestedType,
      imagePath: storagePath,
      status: "processing",
      extractedText: "",
      errorMessage: "",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    try {
      const [result] = await vision.documentTextDetection({
        image: {source: {imageUri: `gs://${bucket.name}/${storagePath}`}},
        imageContext: {languageHints: ["th", "en"]},
      });
      const rawText = result.fullTextAnnotation?.text?.trim() ?? "";
      if (!rawText) throw new HttpsError("not-found", "No readable text was found in this image.");

      const classification = classifyDocument(rawText);
      const scanType: ScanType = requestedType === "auto" ? classification.type : requestedType;
      const parsed = scanType === "receipt" ? parseReceipt(rawText) : await parseSchedule(rawText, result.fullTextAnnotation, openAiApiKey.value());
      await logRef.update({
        kind: scanType,
        status: "completed",
        extractedText: rawText,
        characterCount: rawText.length,
        classification,
        parsed,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {classification, logId: logRef.id, rawText, parsed, scanType};
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vision OCR failed.";
      await logRef.update({
        status: "failed",
        errorMessage: message,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Unable to read this image. Please try a clearer photo.");
    }
  },
);

export const adminListUsers = onCall({region}, async (request) => {
  requireAdmin(request);
  const result = await getAuth().listUsers(1000);
  return {
    users: result.users.map((user) => ({
      uid: user.uid,
      email: user.email ?? "",
      displayName: user.displayName ?? "",
      disabled: user.disabled,
      emailVerified: user.emailVerified,
      createdAt: user.metadata.creationTime,
      lastSignInAt: user.metadata.lastSignInTime ?? "",
    })),
  };
});

export const adminDashboardCounts = onCall({region}, async (request) => {
  requireAdmin(request);
  const references = {
    users: db.collection("users"),
    schedules: db.collectionGroup("schedules"),
    notes: db.collectionGroup("notes"),
    transactions: db.collectionGroup("transactions"),
    activities: db.collectionGroup("activities"),
    aiRecommendations: db.collectionGroup("aiRecommendations"),
    scans: db.collectionGroup("scanLogs"),
  };
  const entries = await Promise.all(Object.entries(references).map(async ([name, reference]) => {
    const snapshot = await reference.count().get();
    return [name, snapshot.data().count] as const;
  }));
  return {counts: Object.fromEntries(entries)};
});

export const adminSeedDemoData = onCall({region}, async (request) => {
  requireAdmin(request);
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in is required.");

  const marker = db.collection("systemStatus").doc("demo-seed");
  if ((await marker.get()).exists) return {seeded: false};

  const admin = await getAuth().getUser(uid);
  const now = Timestamp.now();
  const plusHours = (hours: number) => Timestamp.fromMillis(now.toMillis() + hours * 60 * 60 * 1000);
  const batch = db.batch();
  const user = db.collection("users").doc(uid);

  batch.set(user, {
    uid,
    email: admin.email ?? "admin@smartlife.local",
    displayName: admin.displayName ?? "SmartLife Admin",
    avatarUrl: admin.photoURL ?? "",
    role: "user",
    createdAt: now,
    updatedAt: now,
  }, {merge: true});

  const schedules = [
    ["demo-data-structures", "Data Structures", "SC1-201", 24, 27],
    ["demo-digital-tech", "Project in Digital Tech", "110191", 30, 33],
  ];
  schedules.forEach(([id, title, courseCode, start, end]) => {
    batch.set(user.collection("schedules").doc(id as string), {
      ownerId: uid, title, courseCode, startAt: plusHours(start as number), endAt: plusHours(end as number),
      location: "อาคารเรียนรวม", color: "#6F8F6D", source: "manual", createdAt: now, updatedAt: now,
    }, {merge: true});
  });

  [
    ["demo-task-ds", "อ่าน Linked List ก่อนควิซ", "task", 4],
    ["demo-activity-break", "พักเบรก 15 นาที", "activity", 8],
    ["demo-appointment", "ประชุมกลุ่ม Project", "appointment", 36],
  ].forEach(([id, title, type, start]) => {
    batch.set(user.collection("activities").doc(id as string), {
      ownerId: uid, title, type, startAt: plusHours(start as number), endAt: plusHours((start as number) + 1),
      location: "SmartLife", color: "#9297BB", status: "planned", source: "ai", createdAt: now, updatedAt: now,
    }, {merge: true});
  });

  [
    ["demo-note-linked-list", "Linked List", "สรุปโครงสร้างข้อมูลและโจทย์ที่ควรทบทวนก่อนควิซ", "study"],
    ["demo-note-project", "Project Plan", "แบ่งงานและกำหนดส่งของทีม", "work"],
    ["demo-note-idea", "ไอเดีย SmartLife", "เพิ่มการแนะนำงบอาหารตามตารางเรียน", "idea"],
  ].forEach(([id, title, content, category]) => {
    batch.set(user.collection("notes").doc(id as string), {
      ownerId: uid, title, content, category, relatedScheduleId: "demo-data-structures",
      color: "#9297BB", createdAt: now, updatedAt: now,
    }, {merge: true});
  });

  [
    ["demo-expense-food", "expense", 89, "อาหาร", "McDonald's"],
    ["demo-expense-travel", "expense", 40, "เดินทาง", "BTS"],
    ["demo-income", "income", 500, "รายรับ", "เงินค่าขนม"],
  ].forEach(([id, type, amount, category, merchant]) => {
    batch.set(user.collection("transactions").doc(id as string), {
      ownerId: uid, type, amount, category, merchant, note: "ข้อมูลตัวอย่างจาก Firebase",
      occurredAt: now, receiptPath: "", createdAt: now, updatedAt: now,
    }, {merge: true});
  });

  [
    ["demo-ai-priority", "อ่าน Linked List ก่อนควิซ", "priority", ["schedule", "note"]],
    ["demo-ai-budget", "กันงบอาหารวันนี้ 120 บาท", "finance", ["schedule", "finance"]],
  ].forEach(([id, title, kind, contextSources]) => {
    batch.set(user.collection("aiRecommendations").doc(id as string), {
      ownerId: uid, title, kind, contextSources, action: {type: "suggestion"},
      explanation: "AI สรุปจากข้อมูลตารางเวลา โน้ต และการเงิน", status: "new", createdAt: now, updatedAt: now,
    }, {merge: true});
  });

  [
    ["demo-feedback", "ai", "อยากให้ AI แนะนำเวลาอ่านหนังสือได้ละเอียดขึ้น"],
  ].forEach(([id, type, message]) => {
    batch.set(user.collection("feedback").doc(id as string), {
      ownerId: uid, type, message, status: "new", createdAt: now, updatedAt: now,
    }, {merge: true});
  });

  [
    ["demo-scan-receipt", "receipt", "OCR อ่านใบเสร็จ McDonald's สำเร็จ"],
    ["demo-scan-schedule", "schedule", "OCR อ่านตารางเรียนสำเร็จ"],
  ].forEach(([id, kind, extractedText]) => {
    batch.set(user.collection("scanLogs").doc(id as string), {
      ownerId: uid, kind, imagePath: `users/${uid}/${kind === "receipt" ? "receipts" : "schedules"}/demo.jpg`,
      status: "completed", extractedText, errorMessage: "", createdAt: now, updatedAt: now,
    }, {merge: true});
  });

  [
    ["food", "expense", "อาหาร", "Food", "#6F8F6D", 10],
    ["travel", "expense", "เดินทาง", "Travel", "#9297BB", 20],
    ["study", "note", "เรียน", "Study", "#6F8F6D", 10],
    ["work", "note", "งาน", "Work", "#9297BB", 20],
    ["activity", "activity", "กิจกรรม", "Activity", "#6F8F6D", 10],
  ].forEach(([id, domain, labelTh, labelEn, color, sortOrder]) => {
    batch.set(db.collection("categories").doc(id as string), {
      domain, labelTh, labelEn, icon: "tag", color, active: true, sortOrder, createdAt: now, updatedAt: now,
    }, {merge: true});
  });

  batch.set(db.collection("announcements").doc("demo-welcome"), {
    title: "ยินดีต้อนรับสู่ SmartLife", message: "ระบบเชื่อมข้อมูลตารางเรียน โน้ต และการเงินแล้ว",
    kind: "feature", active: true, startAt: now, endAt: plusHours(24 * 30), createdBy: uid, createdAt: now, updatedAt: now,
  }, {merge: true});
  batch.set(marker, {
    name: "Demo data", detail: "Initial Firebase data created for SmartLife Admin", status: "operational",
    latencyMs: 0, checkedAt: now,
  });
  await batch.commit();
  return {seeded: true};
});

export const adminMonitoringData = onCall({region}, async (request) => {
  requireAdmin(request);
  const view = requireString(request.data?.view, "view");

  if (view === "feedback") {
    const snapshot = await db.collectionGroup("feedback")
      .where("status", "==", "new")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    return {items: serializeDocuments(snapshot)};
  }
  if (view === "scanLogs") {
    const snapshot = await db.collectionGroup("scanLogs")
      .limit(100)
      .get();
    return {items: sortByCreatedAt(serializeDocuments(snapshot))};
  }
  if (view === "recommendations") {
    const snapshot = await db.collectionGroup("aiRecommendations")
      .limit(100)
      .get();
    return {items: sortByCreatedAt(serializeDocuments(snapshot))};
  }
  if (view === "systemStatus") {
    const snapshot = await db.collection("systemStatus").get();
    return {items: serializeDocuments(snapshot)};
  }

  throw new HttpsError("invalid-argument", "Unsupported admin monitoring view.");
});

export const adminSetUserDisabled = onCall({region}, async (request) => {
  requireAdmin(request);
  const uid = requireString(request.data?.uid, "uid");
  if (uid === request.auth?.uid) {
    throw new HttpsError("failed-precondition", "You cannot disable your own account.");
  }
  const disabled = request.data?.disabled === true;
  await getAuth().updateUser(uid, {disabled});
  return {uid, disabled};
});

export const adminCreatePasswordResetLink = onCall({region}, async (request) => {
  requireAdmin(request);
  const email = requireString(request.data?.email, "email");
  const link = await getAuth().generatePasswordResetLink(email);
  return {link};
});

export const adminRefreshSystemStatus = onCall({region}, async (request) => {
  requireAdmin(request);
  const startedAt = Date.now();
  await db.collection("users").limit(1).get();
  const latencyMs = Date.now() - startedAt;
  const statuses = [
    {id: "firestore", name: "Cloud Firestore", detail: "Database query completed", status: "operational", latencyMs},
    {id: "functions", name: "Cloud Functions", detail: "Admin health function responded", status: "operational", latencyMs: 0},
    {id: "ocr", name: "Cloud Vision OCR", detail: "Vision API configured for Thai and English", status: "operational", latencyMs: 0},
    {id: "calendar", name: "Google Calendar Sync", detail: "Waiting for OAuth connection checks", status: "degraded", latencyMs: 0},
  ];
  const batch = db.batch();
  statuses.forEach(({id, ...status}) => {
    batch.set(db.collection("systemStatus").doc(id), {
      ...status,
      checkedAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  return {statuses};
});

export const fanOutAnnouncement = onDocumentCreated(
  {document: "announcements/{announcementId}", region},
  async (event) => {
    const announcement = event.data?.data();
    if (!announcement?.active) return;
    const users = await db.collection("users").select().get();
    const chunks = [];
    for (let index = 0; index < users.docs.length; index += 400) {
      chunks.push(users.docs.slice(index, index + 400));
    }
    await Promise.all(chunks.map(async (chunk) => {
      const batch = db.batch();
      chunk.forEach((user) => {
        const reference = user.ref.collection("notifications").doc();
        batch.set(reference, {
          ownerId: user.id,
          title: announcement.title,
          message: announcement.message,
          kind: announcement.kind === "urgent" ? "urgent" : "system",
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }));
  },
);
