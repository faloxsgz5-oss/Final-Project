import type {StandardScheduleEntry} from "./types";

export const SCHEDULE_EXTRACTION_SYSTEM_PROMPT = `You are a university timetable extraction engine.
Extract class meetings from noisy OCR text in Thai or English.
Return only data supported by the OCR. Never invent a course, day, time, or room.
Normalize day to one of MON, TUE, WED, THU, FRI, SAT, SUN.
Normalize times to 24-hour HH:mm. If a field cannot be determined, return null.
Keep alphanumeric course codes and remove accidental spaces inside the code.
If the same course meets on multiple days or times, return one item per meeting.
Ignore exam-only rows unless they are explicitly labeled as regular classes.
The response must match the supplied JSON schema exactly.`;

const SCHEDULE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          courseCode: {type: ["string", "null"]},
          courseName: {type: ["string", "null"]},
          day: {type: ["string", "null"], enum: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", null]},
          startTime: {type: ["string", "null"]},
          endTime: {type: ["string", "null"]},
          room: {type: ["string", "null"]},
        },
        required: ["courseCode", "courseName", "day", "startTime", "endTime", "room"],
      },
    },
  },
  required: ["entries"],
} as const;

type OpenAiResponse = {
  error?: {message?: string};
  output?: {content?: {text?: string; type?: string}[]}[];
};

function outputText(response: OpenAiResponse) {
  return response.output?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text ?? null;
}

function validTime(value: unknown) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

export async function extractScheduleWithOpenAI(rawText: string, apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json"},
    body: JSON.stringify({
      model: process.env.OPENAI_SCHEDULE_MODEL ?? "gpt-5-mini",
      store: false,
      input: [
        {role: "system", content: SCHEDULE_EXTRACTION_SYSTEM_PROMPT},
        {role: "user", content: `OCR timetable text:\n\n${rawText.slice(0, 30000)}`},
      ],
      text: {format: {type: "json_schema", name: "class_schedule", strict: true, schema: SCHEDULE_SCHEMA}},
    }),
  });
  const payload = await response.json() as OpenAiResponse;
  if (!response.ok) throw new Error(payload.error?.message ?? `OpenAI request failed with ${response.status}.`);
  const text = outputText(payload);
  if (!text) throw new Error("OpenAI returned no structured schedule output.");
  const parsed = JSON.parse(text) as {entries?: StandardScheduleEntry[]};
  return (parsed.entries ?? []).map((entry) => ({
    courseCode: entry.courseCode?.replace(/[ -]/g, "").toUpperCase() ?? null,
    courseName: entry.courseName ?? null,
    day: entry.day ?? null,
    startTime: validTime(entry.startTime),
    endTime: validTime(entry.endTime),
    parserSource: "openai-structured-fallback",
    room: entry.room ?? null,
  } satisfies StandardScheduleEntry));
}
