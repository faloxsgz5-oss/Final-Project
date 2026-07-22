import type {StandardScheduleEntry} from "./types";

type Vertex = {x?: number | null; y?: number | null};
type VisionWord = {boundingBox?: {vertices?: Vertex[] | null} | null; symbols?: {text?: string | null}[] | null};
type VisionParagraph = {words?: VisionWord[] | null};
type VisionBlock = {paragraphs?: VisionParagraph[] | null};
type VisionPage = {blocks?: VisionBlock[] | null; width?: number | null};
type VisionAnnotation = {pages?: VisionPage[] | null};

type Word = {bottom: number; cx: number; cy: number; height: number; left: number; right: number; text: string; top: number};
type Line = {cy: number; words: Word[]};
type Span = {bottom: number; cx: number; cy: number; left: number; right: number; text: string; top: number; words: Word[]};
type CourseAnchor = Span & {courseCode: string; section: string | null};

const COURSE_LINE = /^\s*((?:\d{6,8}|[A-Z]{2,8}(?:\s*\d){3,10}))\s*[,;]\s*([A-Z0-9-]{1,6})\s*$/i;
const CLASS_TIME = /\(?\s*([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\s*(?:-|\u2013|\u2014|\u0e16\u0e36\u0e07)\s*([01]?\d|2[0-3])\s*[:.]\s*([0-5]\d)\s*\)?/;
const EXAM_TITLE = /\u0e15\u0e32\u0e23\u0e32\u0e07\s*\u0e2a\u0e2d\u0e1a/i;

const DAY_PATTERNS: {day: string; pattern: RegExp}[] = [
  {day: "\u0e08\u0e31\u0e19\u0e17\u0e23\u0e4c", pattern: /^(?:\u0e08\u0e31\u0e19\u0e17\u0e23\u0e4c|MON(?:DAY)?)$/i},
  {day: "\u0e2d\u0e31\u0e07\u0e04\u0e32\u0e23", pattern: /^(?:\u0e2d\u0e31\u0e07\u0e04\u0e32\u0e23|TUE(?:SDAY)?)$/i},
  {day: "\u0e1e\u0e38\u0e18", pattern: /^(?:\u0e1e\u0e38\u0e18|WED(?:NESDAY)?)$/i},
  {day: "\u0e1e\u0e24\u0e2b\u0e31\u0e2a\u0e1a\u0e14\u0e35", pattern: /^(?:\u0e1e\u0e24\u0e2b\u0e31\u0e2a\u0e1a\u0e14\u0e35|THU(?:RSDAY)?)$/i},
  {day: "\u0e28\u0e38\u0e01\u0e23\u0e4c", pattern: /^(?:\u0e28\u0e38\u0e01\u0e23\u0e4c|FRI(?:DAY)?)$/i},
  {day: "\u0e40\u0e2a\u0e32\u0e23\u0e4c", pattern: /^(?:\u0e40\u0e2a\u0e32\u0e23\u0e4c|SAT(?:URDAY)?)$/i},
  {day: "\u0e2d\u0e32\u0e17\u0e34\u0e15\u0e22\u0e4c", pattern: /^(?:\u0e2d\u0e32\u0e17\u0e34\u0e15\u0e22\u0e4c|SUN(?:DAY)?)$/i},
];

function normal(value: string) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function wordText(word: VisionWord) { return (word.symbols ?? []).map((symbol) => symbol.text ?? "").join("").trim(); }

function position(word: VisionWord): Word | null {
  const text = wordText(word); const vertices = word.boundingBox?.vertices ?? [];
  if (!text || vertices.length < 4) return null;
  const xs = vertices.map((vertex) => Number(vertex.x ?? 0)); const ys = vertices.map((vertex) => Number(vertex.y ?? 0));
  const left = Math.min(...xs); const right = Math.max(...xs); const top = Math.min(...ys); const bottom = Math.max(...ys);
  return {bottom, cx: (left + right) / 2, cy: (top + bottom) / 2, height: Math.max(1, bottom - top), left, right, text, top};
}

function wordsFrom(annotation: unknown) {
  const pages = (annotation as VisionAnnotation | null)?.pages ?? [];
  return pages.flatMap((page) => (page.blocks ?? []).flatMap((block) => (block.paragraphs ?? []).flatMap((paragraph) =>
    (paragraph.words ?? []).flatMap((word) => { const item = position(word); return item ? [item] : []; }),
  )));
}

function groupLines(words: Word[]) {
  const lines: Line[] = [];
  for (const word of [...words].sort((a, b) => a.cy - b.cy || a.left - b.left)) {
    const candidate = lines.find((line) => {
      const height = Math.max(word.height, ...line.words.map((item) => item.height));
      return Math.abs(line.cy - word.cy) <= Math.max(3, height * .58);
    });
    if (candidate) {
      candidate.words.push(word);
      candidate.cy = candidate.words.reduce((sum, item) => sum + item.cy, 0) / candidate.words.length;
    } else lines.push({cy: word.cy, words: [word]});
  }
  return lines.map((line) => ({...line, words: [...line.words].sort((a, b) => a.left - b.left)})).sort((a, b) => a.cy - b.cy);
}

function span(words: Word[]): Span {
  const left = Math.min(...words.map((word) => word.left)); const right = Math.max(...words.map((word) => word.right));
  const top = Math.min(...words.map((word) => word.top)); const bottom = Math.max(...words.map((word) => word.bottom));
  return {bottom, cx: (left + right) / 2, cy: (top + bottom) / 2, left, right, text: normal(words.map((word) => word.text).join(" ")), top, words};
}

function windows(line: Line, maximum = 12) {
  const result: Span[] = [];
  for (let start = 0; start < line.words.length; start += 1) {
    for (let length = 1; length <= maximum && start + length <= line.words.length; length += 1) {
      result.push(span(line.words.slice(start, start + length)));
    }
  }
  return result;
}

function courseAnchors(lines: Line[], cutoffY: number) {
  const anchors: CourseAnchor[] = [];
  for (const line of lines.filter((item) => item.cy < cutoffY)) {
    for (const candidate of windows(line)) {
      const match = candidate.text.match(COURSE_LINE); if (!match) continue;
      const courseCode = normal(match[1]).toUpperCase();
      if (anchors.some((item) => item.courseCode === courseCode && Math.abs(item.cx - candidate.cx) < 8 && Math.abs(item.top - candidate.top) < 5)) continue;
      anchors.push({...candidate, courseCode, section: match[2] || null});
    }
  }
  return anchors;
}

function dayAnchors(lines: Line[], pageWidth: number, cutoffY: number) {
  return lines.filter((line) => line.cy < cutoffY).flatMap((line) => windows(line, 2).flatMap((candidate) => {
    if (candidate.cx > pageWidth * .2) return [];
    const found = DAY_PATTERNS.find((item) => item.pattern.test(candidate.text));
    return found ? [{cy: line.cy, day: found.day}] : [];
  }));
}

function classTime(candidate: Span) {
  const match = candidate.text.match(CLASS_TIME);
  if (!match) return null;
  const startTime = `${match[1].padStart(2, "0")}:${match[2]}`; const endTime = `${match[3].padStart(2, "0")}:${match[4]}`;
  return {...candidate, classTime: `${startTime}-${endTime}`, endTime, startTime};
}

function horizontalClusters(line: Line) {
  const clusters: Word[][] = [];
  for (const word of line.words) {
    const current = clusters.at(-1); const previous = current?.at(-1);
    const gapLimit = Math.max(12, word.height * 1.8);
    if (!current || !previous || word.left - previous.right > gapLimit) clusters.push([word]);
    else current.push(word);
  }
  return clusters.map(span);
}

/** Reads each top-grid class from word coordinates. Missing fields stay null; no column-time defaults are used. */
export function parseSpatialScheduleGrid(annotation: unknown): StandardScheduleEntry[] {
  const words = wordsFrom(annotation); if (!words.length) return [];
  const lines = groupLines(words); const pageWidth = Math.max(...words.map((word) => word.right));
  const examY = lines.filter((line) => EXAM_TITLE.test(normal(line.words.map((word) => word.text).join(" ")))).sort((a, b) => a.cy - b.cy)[0]?.cy;
  const cutoffY = examY ?? Number.POSITIVE_INFINITY;
  const anchors = courseAnchors(lines, cutoffY); const days = dayAnchors(lines, pageWidth, cutoffY);

  return anchors.flatMap((anchor) => {
    const day = [...days].sort((a, b) => Math.abs(a.cy - anchor.cy) - Math.abs(b.cy - anchor.cy))[0];
    if (!day || Math.abs(day.cy - anchor.cy) > Math.max(45, pageWidth * .085)) return [];
    const nextAnchorY = anchors.filter((item) => item.top > anchor.bottom && Math.abs(item.cx - anchor.cx) < pageWidth * .12).sort((a, b) => a.top - b.top)[0]?.top ?? cutoffY;
    const maxY = Math.min(nextAnchorY - 1, day.cy + Math.max(55, pageWidth * .1), cutoffY);
    const timeCandidates = lines.filter((line) => line.cy > anchor.cy && line.cy <= maxY)
      .flatMap((line) => horizontalClusters(line).flatMap((cluster) =>
        windows({cy: cluster.cy, words: cluster.words}, 12)
          .map(classTime)
          .filter((item): item is NonNullable<ReturnType<typeof classTime>> => Boolean(item)),
      ))
      .filter((item) => Math.abs(item.cx - anchor.cx) <= pageWidth * .12)
      .sort((a, b) => a.top - b.top || Math.abs(a.cx - anchor.cx) - Math.abs(b.cx - anchor.cx));
    const time = timeCandidates[0] ?? null;

    const locationEndY = time?.cy ?? maxY;
    const locationLines = lines.filter((line) => line.cy > anchor.cy && line.cy < locationEndY);
    const location = locationLines.flatMap(horizontalClusters)
      .filter((candidate) => Math.abs(candidate.cx - anchor.cx) <= pageWidth * .13)
      .filter((candidate) => !COURSE_LINE.test(candidate.text) && !CLASS_TIME.test(candidate.text))
      .sort((a, b) => Math.abs(a.cx - anchor.cx) - Math.abs(b.cx - anchor.cx) || a.top - b.top)[0]?.text ?? null;

    return [{
      buildingName: location,
      classTime: time?.classTime ?? null,
      courseCode: anchor.courseCode,
      courseName: null,
      day: day.day,
      endTime: time?.endTime ?? null,
      parserSource: "vision-spatial-grid",
      raw: normal([anchor.text, location, time?.text].filter(Boolean).join("\n")),
      room: location,
      section: anchor.section,
      startTime: time?.startTime ?? null,
    }];
  });
}
