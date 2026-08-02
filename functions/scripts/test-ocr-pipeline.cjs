const assert = require("node:assert/strict");

const {
  normalizeIappDocumentResponse,
} = require("../lib/document-ocr/iapp-document");
const {
  extractReceiptTimestampEvidence,
} = require("../lib/receipt-parsers/deterministic-receipt");
const {
  extractDocumentTimestampWithGemini,
} = require("../lib/receipt-parsers/gemini-document-timestamp");
const {
  resolveReceiptTimestamp,
} = require("../lib/receipt-parsers/receipt-timestamp-resolution");
const {
  reviewScheduleTemporalFieldsWithGemini,
} = require("../lib/schedule-parsers/gemini-fallback");

function interactionResponse(value) {
  return new Response(JSON.stringify({
    steps: [{
      type: "model_output",
      content: [{type: "text", text: JSON.stringify(value)}],
    }],
  }), {
    headers: {"Content-Type": "application/json"},
    status: 200,
  });
}

async function main() {
  const iapp = normalizeIappDocumentResponse({
    iapp: {page: 2, char: 28},
    text: ["ตารางเรียน\nวันจันทร์", "09:00 - 12:00"],
  });
  assert.equal(iapp.pageCount, 2);
  assert.equal(iapp.text, "ตารางเรียน\nวันจันทร์\n\n09:00 - 12:00");

  const walletOcr = [
    "ทำรายการสำเร็จ",
    "รหัสอ้างอิง 10d3e340927641e28b49357b5d544533",
    "12 ก.ค. 2569 22:01 น.",
  ].join("\n");
  const directTimestamp = extractReceiptTimestampEvidence(walletOcr);
  assert.deepEqual(directTimestamp, {
    calendarEra: "BE",
    confidence: 0.99,
    date: "2026-07-12",
    evidence: "12 ก.ค. 2569 22:01 น.",
    printedYear: 2569,
    time: "22:01",
  });

  const originalFetch = global.fetch;
  try {
    global.fetch = async () => interactionResponse({
      academic_year: "2569",
      semester_start: "2026-08-03",
      semester_end: "2026-12-01",
      calendar_confidence: 0.96,
      calendar_evidence: "ปีการศึกษา 2569 3/8/2569 - 1/12/2569",
      entries: [{
        entry_index: 0,
        day: "TUE",
        start_time: "09:00",
        end_time: "12:00",
        confidence: 0.97,
        evidence: "วันอังคาร (09:00-12:00)",
      }],
    });
    const baseEntries = [{
      buildingName: "อาคารเดิม",
      courseCode: "SC1-201",
      courseName: "Data Structures",
      day: "MON",
      endTime: "11:00",
      room: "A101",
      section: "1",
      startTime: "08:00",
    }];
    const reviewed = await reviewScheduleTemporalFieldsWithGemini({
      apiKey: "test-key",
      entries: baseEntries,
      imageDataUrl: "data:image/png;base64,AA==",
      rawText: "SC1-201 วันอังคาร 09:00-12:00 ปีการศึกษา 2569",
    });
    assert.equal(reviewed.entries[0].day, "TUE");
    assert.equal(reviewed.entries[0].startTime, "09:00");
    assert.equal(reviewed.entries[0].endTime, "12:00");
    assert.equal(reviewed.entries[0].courseName, "Data Structures");
    assert.equal(reviewed.entries[0].room, "A101");
    assert.equal(reviewed.academicYear, "2569");
    assert.equal(reviewed.semesterStart, "2026-08-03");

    global.fetch = async () => interactionResponse({
      transaction_date: "2026-08-02",
      transaction_time: "14:35",
      printed_year: 2569,
      calendar_era: "BE",
      confidence: 0.95,
      evidence: "02/08/2569 14:35",
      merchant: "must be ignored",
      total: 999999,
    });
    const timestamp = await extractDocumentTimestampWithGemini({
      apiKey: "test-key",
      imageDataUrl: "data:image/png;base64,AA==",
      rawText: "02/08/2569 14:35 ยอด 89 บาท",
    });
    assert.deepEqual(timestamp, {
      calendarEra: "BE",
      confidence: 0.95,
      date: "2026-08-02",
      evidence: "02/08/2569 14:35",
      printedYear: 2569,
      time: "14:35",
    });

    const conflict = resolveReceiptTimestamp({}, walletOcr, {
      calendarEra: "BE",
      confidence: 0.98,
      date: "2021-07-12",
      evidence: "12 ก.ค. 2564 22:01 น.",
      printedYear: 2564,
      time: "22:01",
    });
    assert.equal(conflict.date, "2026-07-12");
    assert.equal(conflict.time, "22:01");
    assert.equal(conflict.timestampCalendarEra, "BE");
    assert.equal(conflict.timestampPrintedYear, 2569);
    assert.equal(conflict.timestampVerification, "gemini-conflict-kept-ocr");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("OCR pipeline checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
