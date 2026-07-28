"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.courseCodeKey = courseCodeKey;
exports.buildCourseTableLookup = buildCourseTableLookup;
exports.mergeCourseTableNames = mergeCourseTableNames;
const COURSE_MATCH = /\b((?:\d{6,8}|[A-Z]{2,8}(?:\s*\d){3,10}))(?:\s*[-,]\s*\d{1,3})?\b/gi;
const TABLE_HEADER = /(?:\u0e15\u0e32\u0e23\u0e32\u0e07(?:\u0e2a\u0e2d\u0e1a|\u0e40\u0e23\u0e35\u0e22\u0e19)|\u0e23\u0e2b\u0e31\u0e2a\u0e27\u0e34\u0e0a\u0e32|\u0e0a\u0e37\u0e48\u0e2d\u0e23\u0e32\u0e22\u0e27\u0e34\u0e0a\u0e32|course\s*(?:list|code)|course\s*name|subject\s*name)/i;
const GROUP_HEADER = /(?:\u0e01\u0e25\u0e38\u0e48\u0e21|section|group)/i;
const NOT_A_COURSE_NAME = /(?:\u0e23\u0e2b\u0e31\u0e2a\u0e27\u0e34\u0e0a\u0e32|\u0e0a\u0e37\u0e48\u0e2d\u0e23\u0e32\u0e22\u0e27\u0e34\u0e0a\u0e32|\u0e01\u0e25\u0e38\u0e48\u0e21|\u0e2a\u0e2d\u0e1a|\u0e15\u0e32\u0e23\u0e32\u0e07|\u0e27\u0e31\u0e19\u0e08\u0e31\u0e19\u0e17\u0e23\u0e4c|\u0e27\u0e31\u0e19\u0e2d\u0e31\u0e07\u0e04\u0e32\u0e23|\u0e27\u0e31\u0e19\u0e1e\u0e38\u0e18|\u0e27\u0e31\u0e19\u0e1e\u0e24\u0e2b\u0e31\u0e2a\u0e1a\u0e14\u0e35|\u0e27\u0e31\u0e19\u0e28\u0e38\u0e01\u0e23\u0e4c|\u0e40\u0e27\u0e25\u0e32|\u0e2b\u0e49\u0e2d\u0e07|room|building|course\s*(?:code|name)|subject\s*name|section|group)/i;
const TIME_OR_DATE = /\b(?:[01]?\d|2[0-3])[:.]\d{2}\s*(?:-|\u2013|\u2014)\s*(?:[01]?\d|2[0-3])[:.]\d{2}\b|\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b/;
function wordText(word) { return (word.symbols ?? []).map((symbol) => symbol.text ?? "").join("").trim(); }
function bounds(vertices, text) {
    if (!text || vertices.length < 4)
        return null;
    const xs = vertices.map((vertex) => Number(vertex.x ?? 0));
    const ys = vertices.map((vertex) => Number(vertex.y ?? 0));
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const bottom = Math.max(...ys);
    return { bottom, cx: (left + right) / 2, cy: (top + bottom) / 2, left, right, text, top };
}
function positionedBlocks(annotation) {
    const pages = annotation?.pages ?? [];
    return pages.flatMap((page) => (page.blocks ?? []).flatMap((block) => {
        const paragraphs = block.paragraphs ?? [];
        const text = paragraphs.map((paragraph) => (paragraph.words ?? []).map(wordText).filter(Boolean).join(" ")).filter(Boolean).join("\n");
        const direct = bounds(block.boundingBox?.vertices ?? [], text);
        if (direct)
            return [direct];
        const words = paragraphs.flatMap((paragraph) => paragraph.words ?? []).flatMap((word) => bounds(word.boundingBox?.vertices ?? [], wordText(word)) ? [bounds(word.boundingBox?.vertices ?? [], wordText(word))] : []);
        if (!words.length)
            return [];
        const left = Math.min(...words.map((word) => word.left));
        const right = Math.max(...words.map((word) => word.right));
        const top = Math.min(...words.map((word) => word.top));
        const bottom = Math.max(...words.map((word) => word.bottom));
        return [{ bottom, cx: (left + right) / 2, cy: (top + bottom) / 2, left, right, text, top }];
    }));
}
function positionedWords(annotation) {
    const pages = annotation?.pages ?? [];
    return pages.flatMap((page) => (page.blocks ?? []).flatMap((block) => (block.paragraphs ?? []).flatMap((paragraph) => (paragraph.words ?? []).flatMap((word) => {
        const item = bounds(word.boundingBox?.vertices ?? [], wordText(word));
        return item ? [{ ...item, height: Math.max(1, item.bottom - item.top) }] : [];
    }))));
}
function groupWordLines(words) {
    const groups = [];
    for (const word of [...words].sort((first, second) => first.cy - second.cy || first.left - second.left)) {
        const group = groups.find((candidate) => {
            const typicalHeight = Math.max(word.height, ...candidate.words.map((item) => item.height));
            return Math.abs(candidate.cy - word.cy) <= Math.max(3, typicalHeight * .58);
        });
        if (group) {
            group.words.push(word);
            group.cy = group.words.reduce((sum, item) => sum + item.cy, 0) / group.words.length;
        }
        else
            groups.push({ cy: word.cy, words: [word] });
    }
    return groups.map((group) => {
        const ordered = [...group.words].sort((first, second) => first.left - second.left);
        return {
            bottom: Math.max(...ordered.map((word) => word.bottom)),
            cy: group.cy,
            text: normal(ordered.map((word) => word.text).join(" ")),
            top: Math.min(...ordered.map((word) => word.top)),
            words: ordered,
        };
    }).sort((first, second) => first.cy - second.cy);
}
function courseCodeKey(value) {
    const match = [...String(value ?? "").toUpperCase().matchAll(COURSE_MATCH)][0]?.[1] ?? "";
    return match.replace(/[\s-]/g, "");
}
function courseCodes(value) { return [...value.matchAll(COURSE_MATCH)].map((match) => courseCodeKey(match[1])).filter(Boolean); }
function normal(value) { return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim(); }
function courseNameFromText(value) {
    const candidate = normal(value).replace(COURSE_MATCH, " ").replace(/(?:\u0e01\u0e25\u0e38\u0e48\u0e21|section|group)\s*[:#\-]?\s*\d+/gi, " ").replace(TIME_OR_DATE, " ").replace(/^[\s,;:|\-]+|[\s,;:|\-]+$/g, " ").replace(/\s+/g, " ").trim();
    if (candidate.length < 3 || candidate.length > 180 || NOT_A_COURSE_NAME.test(candidate))
        return null;
    return /[A-Za-z\u0e00-\u0e7f]{2,}/.test(candidate) ? candidate : null;
}
function tableStart(blocks) { return blocks.filter((block) => TABLE_HEADER.test(block.text)).sort((first, second) => first.top - second.top)[0]?.top ?? null; }
function closestNameBlock(source, candidates, groupX) {
    const maxDistance = Math.max(28, source.bottom - source.top + 24);
    return candidates.filter((candidate) => candidate.left >= source.left - 8).filter((candidate) => Math.abs(candidate.cy - source.cy) <= maxDistance).filter((candidate) => groupX === null || candidate.left < groupX - 4).map((candidate) => ({ candidate, name: courseNameFromText(candidate.text) })).filter((item) => Boolean(item.name)).sort((first, second) => (Math.abs(first.candidate.cy - source.cy) + Math.max(0, first.candidate.left - source.right) * .08) - (Math.abs(second.candidate.cy - source.cy) + Math.max(0, second.candidate.left - source.right) * .08))[0]?.name ?? null;
}
function readSpatialTable(blocks) {
    const start = tableStart(blocks);
    if (start === null)
        return [];
    const tableBlocks = blocks.filter((block) => block.top >= start - 4);
    const groupX = tableBlocks.filter((block) => GROUP_HEADER.test(block.text)).sort((first, second) => first.left - second.left)[0]?.left ?? null;
    return tableBlocks.flatMap((block) => {
        const codes = courseCodes(block.text);
        if (!codes.length)
            return [];
        const name = courseNameFromText(block.text) ?? closestNameBlock(block, tableBlocks, groupX);
        return name ? codes.map((courseCode) => ({ courseCode, courseName: name })) : [];
    });
}
function readTextTable(rawText) {
    const lines = rawText.replace(/\r/g, "").split("\n").map(normal).filter(Boolean);
    const start = lines.findIndex((line) => TABLE_HEADER.test(line));
    if (start < 0)
        return [];
    const records = [];
    for (let index = start + 1; index < lines.length; index += 1) {
        const codes = courseCodes(lines[index]);
        if (!codes.length)
            continue;
        const candidates = [courseNameFromText(lines[index])];
        for (let offset = 1; offset <= 3; offset += 1) {
            const next = lines[index + offset];
            if (!next || courseCodes(next).length)
                break;
            candidates.push(courseNameFromText(next));
        }
        const courseName = candidates.find((value) => Boolean(value));
        if (courseName)
            records.push(...codes.map((courseCode) => ({ courseCode, courseName })));
    }
    return records;
}
function readWordTable(annotation) {
    const words = positionedWords(annotation);
    if (!words.length)
        return [];
    const lines = groupWordLines(words);
    const title = lines.find((line) => /\u0e15\u0e32\u0e23\u0e32\u0e07\s*\u0e2a\u0e2d\u0e1a/i.test(line.text));
    if (!title)
        return [];
    const configuredWidth = annotation?.pages?.[0]?.width;
    const width = Number(configuredWidth ?? Math.max(...words.map((word) => word.right)));
    const tableLines = lines.filter((line) => line.cy > title.cy);
    const anchors = tableLines.flatMap((line) => {
        const leftText = normal(line.words.filter((word) => word.cx < width * .19).map((word) => word.text).join(" "));
        const codes = courseCodes(leftText);
        return codes.length ? codes.map((courseCode) => ({ courseCode, line })) : [];
    });
    return anchors.flatMap((anchor, index) => {
        const nextTop = anchors[index + 1]?.line.top ?? Number.POSITIVE_INFINITY;
        const rowWords = words.filter((word) => word.cy >= anchor.line.top - 2 && word.cy < nextTop)
            .filter((word) => word.cx >= width * .14 && word.cx < width * .7);
        const nameLines = groupWordLines(rowWords)
            .map((line) => normal(line.text))
            .map((line) => line.replace(COURSE_MATCH, " ").replace(/^\s*[-,]\s*\d{1,3}\s*/, "").trim())
            .filter((line) => line.length >= 3 && line.length <= 180 && !NOT_A_COURSE_NAME.test(line));
        const englishName = nameLines.find((line) => /[A-Z]{2,}/.test(line) && /^[A-Z0-9&(),.'\-/\s]+$/.test(line));
        const courseName = englishName ?? nameLines.find((line) => /[A-Za-z\u0e00-\u0e7f]{2,}/.test(line)) ?? null;
        return courseName ? [{ courseCode: anchor.courseCode, courseName }] : [];
    });
}
/** Reads the lower course-list table with both Vision coordinates and text order. */
function buildCourseTableLookup(rawText, annotation) {
    const lookup = new Map();
    for (const entry of readTextTable(rawText))
        lookup.set(entry.courseCode, entry.courseName);
    for (const entry of readSpatialTable(positionedBlocks(annotation)))
        lookup.set(entry.courseCode, entry.courseName);
    for (const entry of readWordTable(annotation))
        lookup.set(entry.courseCode, entry.courseName);
    return lookup;
}
function mergeCourseTableNames(entries, lookup) {
    return entries.map((entry) => ({ ...entry, courseName: lookup.get(courseCodeKey(entry.courseCode)) ?? entry.courseName ?? null }));
}
//# sourceMappingURL=vision-course-table.js.map