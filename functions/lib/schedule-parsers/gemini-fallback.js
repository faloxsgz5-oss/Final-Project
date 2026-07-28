"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCHEDULE_EXTRACTION_SYSTEM_PROMPT = void 0;
exports.extractScheduleWithGemini = extractScheduleWithGemini;
exports.SCHEDULE_EXTRACTION_SYSTEM_PROMPT = `Act as a high-precision university timetable extraction engine.

Analyze the supplied high-resolution schedule image and OCR text. Accuracy is the highest priority. Extract only information visibly supported by the image or OCR; never autocomplete, invent, or use a default time.

STEP 1 - COURSE DICTIONARY AND EXAMS
Scan the bottom table labelled "ตารางสอบ" first. Build a dictionary that maps each base course code and section to its exact full course name. A code such as "1101101-1" in the table matches course code "1101101", section "1" in the grid. Preserve meaningful spaces in alphanumeric codes such as "IST30 1104". This dictionary step is mandatory: when a grid course code exists in the bottom table, courseName must contain that table's complete course name and must never be empty.
Read the midterm column "สอบกลางภาค" and final column "สอบประจำภาค" for each matched course. Preserve the complete visible exam text, including date, time, location, and seat. A dash or blank cell means null. If no exam table exists, both exam fields are null.

STEP 2 - SPATIAL SCHEDULE GRID
Scan the top grid row by row from Monday through Sunday and inspect every colored class block.
Line 1 is the course code and section.
Line 2 is the exact room, building, or location. Preserve it exactly without translation or correction.
Line 3 is the class time in parentheses. If it is legible, split that exact range into startTime and endTime. If it is blurry or missing, infer both values only by tracing the LEFT and RIGHT edges of that same colored block to the visible time-column headers. Every returned class must have startTime and endTime. Never output a guessed or default time.
Return one entry per colored class block, including duplicate course codes when they represent different blocks, locations, days, or times.

STRICT RULES
- Preserve Thai and English course names and locations exactly as visible.
- Preserve literal Buddhist Era years and dates exactly; do not compare them with today's date.
- Never use 09:00, 10:00, or any other time unless the block text or its grid boundaries visibly support it.
- courseName, startTime, and endTime are mandatory for every returned class. Re-check the bottom table and grid boundaries before producing the response.
- Other fields that genuinely cannot be determined may be null.
- Do not return exam-only rows that do not appear as classes in the top grid.
- Return only the JSON array required by the response schema. Do not include Markdown or reasoning.`;
const nullableString = { type: ["string", "null"] };
const requiredString = { type: "string" };
const requiredTime = { type: "string" };
const SCHEDULE_SCHEMA = {
    type: "array",
    items: {
        type: "object",
        additionalProperties: false,
        properties: {
            courseCode: requiredString,
            courseName: requiredString,
            section: nullableString,
            buildingName: nullableString,
            day: nullableString,
            startTime: requiredTime,
            endTime: requiredTime,
            midtermExam: nullableString,
            finalExam: nullableString,
        },
        required: [
            "courseCode",
            "courseName",
            "section",
            "buildingName",
            "day",
            "startTime",
            "endTime",
            "midtermExam",
            "finalExam",
        ],
    },
};
const DAY_MAP = {
    MON: "MON",
    MONDAY: "MON",
    "จันทร์": "MON",
    TUE: "TUE",
    TUESDAY: "TUE",
    "อังคาร": "TUE",
    WED: "WED",
    WEDNESDAY: "WED",
    "พุธ": "WED",
    THU: "THU",
    THURSDAY: "THU",
    "พฤหัส": "THU",
    "พฤหัสบดี": "THU",
    FRI: "FRI",
    FRIDAY: "FRI",
    "ศุกร์": "FRI",
    SAT: "SAT",
    SATURDAY: "SAT",
    "เสาร์": "SAT",
    SUN: "SUN",
    SUNDAY: "SUN",
    "อาทิตย์": "SUN",
};
function cleanNullable(value) {
    if (typeof value !== "string")
        return null;
    const cleaned = value.replace(/\s+/g, " ").trim();
    return cleaned && cleaned !== "-" ? cleaned : null;
}
function normalizeDay(value) {
    const cleaned = cleanNullable(value);
    return cleaned ? DAY_MAP[cleaned.toUpperCase()] ?? DAY_MAP[cleaned] ?? null : null;
}
function normalizeTime(value) {
    const match = cleanNullable(value)?.match(/^([01]?\d|2[0-3])[:.]([0-5]\d)$/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : null;
}
function parseImageDataUrl(imageDataUrl) {
    const match = imageDataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
    if (!match)
        throw new Error("Gemini requires a valid base64 image data URL.");
    return { data: match[2].replace(/\s+/g, ""), mimeType: match[1] };
}
function interactionOutputText(response) {
    return response.steps
        ?.filter((step) => step.type === "model_output")
        .flatMap((step) => step.content ?? [])
        .filter((content) => content.type === "text")
        .map((content) => content.text ?? "")
        .join("")
        .trim() ?? "";
}
async function extractScheduleWithGemini(rawText, apiKey, imageDataUrl) {
    const input = [
        {
            type: "text",
            text: `Cross-reference the schedule image using these OCR hints. The OCR may contain mistakes, so prefer visible image evidence and use the text only as an aid:\n\n${rawText.slice(0, 30000)}`,
        },
    ];
    if (imageDataUrl) {
        const image = parseImageDataUrl(imageDataUrl);
        input.push({
            type: "image",
            data: image.data,
            mime_type: image.mimeType,
            resolution: "high",
        });
    }
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
            model: process.env.GEMINI_SCHEDULE_MODEL ?? "gemini-3.5-flash",
            store: false,
            system_instruction: exports.SCHEDULE_EXTRACTION_SYSTEM_PROMPT,
            input,
            response_format: {
                type: "text",
                mime_type: "application/json",
                schema: SCHEDULE_SCHEMA,
            },
            generation_config: {
                temperature: 0,
            },
        }),
    });
    const payload = await response.json();
    if (!response.ok)
        throw new Error(payload.error?.message ?? `Gemini request failed with ${response.status}.`);
    const outputText = interactionOutputText(payload);
    if (!outputText)
        throw new Error("Gemini returned no structured schedule output.");
    const parsed = JSON.parse(outputText);
    if (!Array.isArray(parsed))
        throw new Error("Gemini returned an invalid schedule payload.");
    const normalized = parsed.map((entry) => {
        const courseCode = cleanNullable(entry.courseCode)?.toUpperCase() ?? null;
        const courseName = cleanNullable(entry.courseName);
        const startTime = normalizeTime(entry.startTime);
        const endTime = normalizeTime(entry.endTime);
        const buildingName = cleanNullable(entry.buildingName);
        return {
            buildingName,
            classTime: startTime && endTime ? `${startTime}-${endTime}` : null,
            courseCode,
            courseName,
            day: normalizeDay(entry.day),
            endTime,
            finalExam: cleanNullable(entry.finalExam),
            midtermExam: cleanNullable(entry.midtermExam),
            parserSource: "gemini-high-resolution-vision",
            room: buildingName,
            section: cleanNullable(entry.section),
            startTime,
        };
    });
    if (normalized.some((entry) => !entry.courseCode || !entry.courseName || !entry.startTime || !entry.endTime)) {
        throw new Error("Gemini returned an incomplete schedule entry after mandatory cross-reference extraction.");
    }
    return normalized;
}
//# sourceMappingURL=gemini-fallback.js.map