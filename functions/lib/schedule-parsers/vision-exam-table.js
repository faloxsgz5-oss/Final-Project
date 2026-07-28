"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseOptionalExamTable = parseOptionalExamTable;
exports.mergeExamFields = mergeExamFields;
const vision_course_table_1 = require("./vision-course-table");
const EXAM_TABLE_TITLE = /\u0e15\u0e32\u0e23\u0e32\u0e07\s*\u0e2a\u0e2d\u0e1a/i;
const MIDTERM_HEADER = /(?:\u0e2a\u0e2d\u0e1a\s*\u0e01\u0e25\u0e32\u0e07|\u0e01\u0e25\u0e32\u0e07\s*\u0e20\u0e32\u0e04|midterm)/i;
const FINAL_HEADER = /(?:\u0e2a\u0e2d\u0e1a\s*\u0e1b\u0e23\u0e30\u0e08\u0e33|\u0e1b\u0e23\u0e30\u0e08\u0e33\s*\u0e20\u0e32\u0e04|final)/i;
const GROUP_HEADER = /(?:\u0e01\u0e25\u0e38\u0e48\u0e21|section|group)/i;
function normalizeWhitespace(value) {
    return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function wordText(word) {
    return (word.symbols ?? []).map((symbol) => symbol.text ?? "").join("").trim();
}
function positionWord(word) {
    const text = wordText(word);
    const vertices = word.boundingBox?.vertices ?? [];
    if (!text || vertices.length < 4)
        return null;
    const xs = vertices.map((vertex) => Number(vertex.x ?? 0));
    const ys = vertices.map((vertex) => Number(vertex.y ?? 0));
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return { bottom, cx: (left + right) / 2, cy: (top + bottom) / 2, height: Math.max(1, bottom - top), left, right, text, top };
}
function positionedWords(annotation) {
    const pages = annotation?.pages ?? [];
    return pages.flatMap((page) => (page.blocks ?? []).flatMap((block) => (block.paragraphs ?? []).flatMap((paragraph) => (paragraph.words ?? []).flatMap((word) => {
        const positioned = positionWord(word);
        return positioned ? [positioned] : [];
    }))));
}
function groupLines(words) {
    const lines = [];
    for (const word of [...words].sort((first, second) => first.cy - second.cy || first.left - second.left)) {
        const line = lines.find((candidate) => {
            const typicalHeight = Math.max(word.height, ...candidate.words.map((item) => item.height));
            return Math.abs(candidate.cy - word.cy) <= Math.max(4, typicalHeight * .62);
        });
        if (line) {
            line.words.push(word);
            line.cy = line.words.reduce((total, item) => total + item.cy, 0) / line.words.length;
        }
        else {
            lines.push({ cy: word.cy, words: [word] });
        }
    }
    return lines.map((line) => {
        const ordered = [...line.words].sort((first, second) => first.left - second.left);
        return {
            bottom: Math.max(...ordered.map((word) => word.bottom)),
            cy: line.cy,
            text: normalizeWhitespace(ordered.map((word) => word.text).join(" ")),
            top: Math.min(...ordered.map((word) => word.top)),
            words: ordered,
        };
    }).sort((first, second) => first.cy - second.cy);
}
function textInColumn(words) {
    if (!words.length)
        return null;
    const lines = groupLines(words).map((line) => normalizeWhitespace(line.words.map((word) => word.text).join(" "))).filter(Boolean);
    const value = normalizeWhitespace(lines.join(" "));
    if (!value || /^[\s.()|,;:\-\u2013\u2014]+$/.test(value))
        return null;
    return value;
}
function headerCenter(words, pattern) {
    const matches = words.filter((word) => pattern.test(word.text));
    if (matches.length)
        return matches.reduce((total, word) => total + word.cx, 0) / matches.length;
    const lines = groupLines(words);
    for (const line of lines) {
        for (let windowSize = 2; windowSize <= Math.min(4, line.words.length); windowSize += 1) {
            for (let start = 0; start <= line.words.length - windowSize; start += 1) {
                const window = line.words.slice(start, start + windowSize);
                if (!pattern.test(window.map((word) => word.text).join(" ")))
                    continue;
                return window.reduce((total, word) => total + word.cx, 0) / window.length;
            }
        }
    }
    return null;
}
function pageWidth(annotation, words) {
    const configured = annotation?.pages?.[0]?.width;
    return Number(configured ?? Math.max(1, ...words.map((word) => word.right)));
}
/**
 * Parses only when a literal "exam table" heading exists. Exam strings are
 * returned as OCR text with whitespace collapsed; dates and times are never
 * converted, corrected, or compared with the current date.
 */
function parseOptionalExamTable(rawText, annotation) {
    const titleExistsInText = EXAM_TABLE_TITLE.test(rawText);
    if (!titleExistsInText)
        return { entries: new Map(), found: false };
    const words = positionedWords(annotation);
    const lines = groupLines(words);
    const titleLine = lines.find((line) => EXAM_TABLE_TITLE.test(line.text));
    if (!titleLine || !words.length)
        return { entries: new Map(), found: true };
    const width = pageWidth(annotation, words);
    const tableWords = words.filter((word) => word.cy > titleLine.cy);
    const anchors = lines.flatMap((line) => {
        if (line.cy <= titleLine.cy)
            return [];
        const leftText = normalizeWhitespace(line.words.filter((word) => word.cx <= width * .3).map((word) => word.text).join(" "));
        const courseCode = (0, vision_course_table_1.courseCodeKey)(leftText);
        return courseCode ? [{ courseCode, line }] : [];
    });
    if (!anchors.length)
        return { entries: new Map(), found: true };
    const firstCourseTop = Math.min(...anchors.map((anchor) => anchor.line.top));
    const headerWords = tableWords.filter((word) => word.bottom < firstCourseTop);
    const groupCenter = headerCenter(headerWords, GROUP_HEADER);
    let midtermCenter = headerCenter(headerWords, MIDTERM_HEADER);
    let finalCenter = headerCenter(headerWords, FINAL_HEADER);
    if (midtermCenter === null && finalCenter === null) {
        midtermCenter = width * .76;
        finalCenter = width * .91;
    }
    else if (midtermCenter === null) {
        midtermCenter = Math.max(width * .65, finalCenter - width * .15);
    }
    else if (finalCenter === null) {
        finalCenter = Math.min(width * .96, midtermCenter + width * .15);
    }
    const columnDistance = Math.max(width * .1, finalCenter - midtermCenter);
    const inferredMidtermStart = midtermCenter - columnDistance * .55;
    const midtermStart = groupCenter === null
        ? Math.max(width * .58, inferredMidtermStart)
        : Math.max(width * .58, (groupCenter + midtermCenter) / 2);
    const finalStart = (midtermCenter + finalCenter) / 2;
    const entries = new Map();
    anchors.forEach((anchor, index) => {
        const previous = anchors[index - 1]?.line;
        const next = anchors[index + 1]?.line;
        const rowTop = previous ? (previous.cy + anchor.line.cy) / 2 : anchor.line.top - Math.max(3, anchor.line.bottom - anchor.line.top) * .25;
        const rowBottom = next ? (anchor.line.cy + next.cy) / 2 : Math.max(...tableWords.map((word) => word.bottom)) + 1;
        const rowWords = tableWords.filter((word) => word.cy >= rowTop && word.cy < rowBottom);
        entries.set(anchor.courseCode, {
            finalExam: textInColumn(rowWords.filter((word) => word.cx >= finalStart)),
            midtermExam: textInColumn(rowWords.filter((word) => word.cx >= midtermStart && word.cx < finalStart)),
        });
    });
    return { entries, found: true };
}
function mergeExamFields(entries, examTable) {
    return entries.map((entry) => {
        const exam = examTable.entries.get((0, vision_course_table_1.courseCodeKey)(entry.courseCode));
        return {
            ...entry,
            finalExam: exam?.finalExam ?? null,
            midtermExam: exam?.midtermExam ?? null,
        };
    });
}
//# sourceMappingURL=vision-exam-table.js.map