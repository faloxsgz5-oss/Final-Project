import type {StandardScheduleEntry} from "./types";

const COURSE_CODE = /\b(?:\d{6,8}|[A-Z]{2,8}(?:[ -]?\d){3,10})\b/i;
const DAY = /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue(?:s)?|wed|thu(?:rs)?|fri|sat|sun)\b|(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|พฤหัส|ศุกร์|เสาร์|อาทิตย์)/i;
const DATE = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/;
const DATE_RANGE = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\s*(?:-|–|—|ถึง|to)\s*(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/i;
const TIME_RANGE = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:-|–|—|ถึง|to)\s*([01]?\d|2[0-3])[:.]([0-5]\d)\b/i;
const ROOM_LABEL = /^(?:ห้อง|room|อาคาร|building|bldg\.?|classroom)\b/i;

const DAY_CODES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const DAY_ALIASES: [string, RegExp][] = [
  ["MON", /จันทร์|monday|mon/i], ["TUE", /อังคาร|tuesday|tues|tue/i],
  ["WED", /พุธ|wednesday|wed/i], ["THU", /พฤหัสบดี|พฤหัส|thursday|thurs|thu/i],
  ["FRI", /ศุกร์|friday|fri/i], ["SAT", /เสาร์|saturday|sat/i],
  ["SUN", /อาทิตย์|sunday|sun/i],
];

function clean(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function normalizeCourseCode(value: string) {
  return value.toUpperCase().replace(/[ -]/g, "");
}

function normalizeDay(context: string) {
  const explicit = DAY_ALIASES.find(([, expression]) => expression.test(context))?.[0];
  if (explicit) return explicit;
  const date = context.match(DATE);
  if (!date) return null;
  let year = Number(date[3]);
  if (year > 2400) year -= 543;
  if (year < 100) year += 2000;
  const parsed = new Date(Date.UTC(year, Number(date[2]) - 1, Number(date[1])));
  return Number.isNaN(parsed.getTime()) ? null : DAY_CODES[parsed.getUTCDay()];
}

function isoDate(dayValue: string, monthValue: string, yearValue: string) {
  const day = Number(dayValue);
  const month = Number(monthValue);
  let year = Number(yearValue);
  if (year > 2400) year -= 543;
  if (year < 100) year += 2000;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateRange(context: string) {
  const range = context.match(DATE_RANGE);
  if (range) return {
    endDate: isoDate(range[4], range[5], range[6]),
    startDate: isoDate(range[1], range[2], range[3]),
  };
  const date = context.match(DATE);
  const value = date ? isoDate(date[1], date[2], date[3]) : null;
  return {endDate: value, startDate: value};
}

function timeRange(context: string) {
  const match = context.match(TIME_RANGE);
  return match ? {
    startTime: `${match[1].padStart(2, "0")}:${match[2]}`,
    endTime: `${match[3].padStart(2, "0")}:${match[4]}`,
  } : {endTime: null, startTime: null};
}

function room(context: string) {
  const labeled = context.match(/(?:ห้อง|room|อาคาร|building|bldg\.?|classroom)\s*[:#\-]?\s*([A-Z0-9ก-๙][A-Z0-9ก-๙\-/ ]{1,30})/i)?.[1]?.trim();
  if (labeled) return labeled.split(/\n|\s{2,}/)[0].trim();
  const candidates = context.match(/\b(?:[A-Z]{1,5}[- ]?)?\d{2,5}(?:-[A-Z0-9]{1,8})?\b/g) ?? [];
  return candidates.find((candidate) =>
    !candidate.includes(":") && !COURSE_CODE.test(candidate) && !/^\d{4}$/.test(candidate),
  ) ?? null;
}

function courseName(firstLine: string, context: string, rawCode: string) {
  const labeled = context.match(/(?:ชื่อวิชา|รายวิชา|course(?:\s*name)?|subject)\s*[:\-]?\s*([^\n]{2,100})/i)?.[1];
  const candidate = labeled ?? firstLine.replace(rawCode, " ");
  const cleaned = candidate
    .replace(TIME_RANGE, " ").replace(DAY, " ").replace(DATE, " ")
    .replace(/(?:ห้อง|room|อาคาร|building|section|sec\.?|กลุ่ม).*$/i, " ")
    .replace(/^[\s,;:\-|]+|[\s,;:\-|]+$/g, "").trim();
  return /[A-Za-zก-๙]{2,}/.test(cleaned) ? cleaned.slice(0, 120) : null;
}

export function parseListSchedule(rawText: string): StandardScheduleEntry[] {
  const lines = rawText.split(/\r?\n/).map(clean).filter(Boolean);
  const starts = lines.flatMap((line, index) => line.match(COURSE_CODE) && !ROOM_LABEL.test(line) ? [index] : []);
  const entries: StandardScheduleEntry[] = starts.flatMap((lineIndex, position) => {
    const firstLine = lines[lineIndex];
    const codeMatch = firstLine.match(COURSE_CODE);
    if (!codeMatch) return [];
    const nextCourse = starts[position + 1] ?? lines.length;
    const contextLines = lines.slice(Math.max(0, lineIndex - 1), Math.min(nextCourse, lineIndex + 7));
    const context = contextLines.join("\n");
    const times = timeRange(context);
    const entry: StandardScheduleEntry = {
      courseCode: normalizeCourseCode(codeMatch[0]),
      courseName: courseName(firstLine, context, codeMatch[0]),
      day: normalizeDay(context),
      ...dateRange(context),
      ...times,
      parserSource: "universal-list",
      raw: context,
      room: room(context),
    };
    return [entry];
  });

  return [...new Map(entries.map((entry) => [
    `${entry.courseCode}-${entry.day}-${entry.startTime}-${entry.room}`,
    entry,
  ])).values()];
}
