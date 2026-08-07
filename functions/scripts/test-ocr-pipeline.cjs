const assert = require("node:assert/strict");

const {
  normalizeIappDocumentResponse,
} = require("../lib/document-ocr/iapp-document");
const {
  extractReceiptTimestampEvidence,
  parseReceiptDeterministic,
} = require("../lib/receipt-parsers/deterministic-receipt");
const {
  extractDocumentTimestampWithGemini,
} = require("../lib/receipt-parsers/gemini-document-timestamp");
const {
  extractReceiptWithGemini,
} = require("../lib/receipt-parsers/gemini-receipt");
const {
  normalizeIappReceiptResponse,
} = require("../lib/receipt-parsers/iapp-receipt");
const {
  resolveReceiptTimestamp,
} = require("../lib/receipt-parsers/receipt-timestamp-resolution");
const {
  reviewScheduleTemporalFieldsWithGemini,
} = require("../lib/schedule-parsers/gemini-fallback");
const {
  reviewScheduleCoursesAndExamsWithGemini,
} = require("../lib/schedule-parsers/gemini-course-exam-review");
const {
  buildCourseTableLookup,
} = require("../lib/schedule-parsers/vision-course-table");
const {
  parseOptionalExamTable,
} = require("../lib/schedule-parsers/vision-exam-table");

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

function visionWord(text, x, y, width = Math.max(20, text.length * 7)) {
  return {
    boundingBox: {vertices: [
      {x, y}, {x: x + width, y}, {x: x + width, y: y + 18}, {x, y: y + 18},
    ]},
    symbols: [...text].map((character) => ({text: character})),
  };
}

function scheduleTableAnnotation() {
  const rows = [
    ["1101101-1", "SCRIPTING LANGUAGE PROGRAMMING", "1", "-", "(C) 22 ม.ค. 2568 09:30-12:30"],
    ["1101102-1", "CROSS-PLATFORM APPLICATION DEVELOPMENT WITH SCRIPTING LANGUAGE", "1", "(C) 16 ส.ค. 2568 15:00-16:30", "-"],
    ["1101103-1", "PROJECT IN SCRIPTING LANGUAGE APPLICATION DEVELOPMENT", "1", "14 กัน 15", "-"],
  ];
  const words = [
    visionWord("ตารางสอบ", 400, 500, 100),
    visionWord("รหัสวิชา", 45, 535, 80),
    visionWord("ชื่อรายวิชา", 250, 535, 120),
    visionWord("กลุ่ม", 625, 535, 60),
    visionWord("สอบกลางภาค", 735, 535, 90),
    visionWord("สอบประจำภาค", 880, 535, 100),
  ];
  rows.forEach((row, index) => {
    const y = 590 + index * 85;
    words.push(
      visionWord(row[0], 45, y, 85),
      visionWord(row[1], 180, y, 390),
      visionWord(row[2], 640, y, 20),
      visionWord(row[3], 745, y, 90),
      visionWord(row[4], 875, y, 115),
    );
  });
  return {pages: [{width: 1000, blocks: [{paragraphs: [{words}]}]}]};
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
  assert.equal(parseReceiptDeterministic("McDonald's\nยอดรวม 89.00 บาท").category, "Food");
  assert.equal(parseReceiptDeterministic("BTS\nยอดรวม 44.00 บาท").category, "Transport");
  const iappReceipt = normalizeIappReceiptResponse({
    processed: {
      grandTotal: 35,
      issuerName: "Test Mart",
      items: [{itemName: "Notebook", itemUnit: 0, itemUnitCost: 35, itemTotalCost: 35}],
    },
    confidence: {},
    raw: {text: "Notebook 35"},
  });
  assert.equal(iappReceipt.parsed.items[0].quantity, 1);

  const scheduleAnnotation = scheduleTableAnnotation();
  const scheduleText = "ตารางสอบ\nรหัสวิชา ชื่อรายวิชา กลุ่ม สอบกลางภาค สอบประจำภาค";
  const courseLookup = buildCourseTableLookup(scheduleText, scheduleAnnotation);
  assert.equal(courseLookup.get("1101101"), "SCRIPTING LANGUAGE PROGRAMMING");
  assert.equal(
    courseLookup.get("1101102"),
    "CROSS-PLATFORM APPLICATION DEVELOPMENT WITH SCRIPTING LANGUAGE",
  );
  const examTable = parseOptionalExamTable(scheduleText, scheduleAnnotation);
  assert.equal(examTable.entries.get("1101101").midtermExam, null);
  assert.match(examTable.entries.get("1101101").finalExam, /22 ม\.\u0e04\. 2568/);
  assert.match(examTable.entries.get("1101102").midtermExam, /16 ส\.\u0e04\. 2568/);
  assert.equal(examTable.entries.get("1101102").finalExam, null);
  assert.equal(examTable.entries.get("1101103").midtermExam, null);
  assert.equal(examTable.entries.get("1101103").finalExam, null);

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
      entries: [{
        entry_index: 0,
        course_code: "SC1-201",
        course_name: "Data Structures",
        course_pair_valid: true,
        course_confidence: 0.97,
        course_evidence: "SC1-201 Data Structures",
        midterm_present: true,
        midterm_exam: "15/10/2569 09:00-12:00",
        midterm_confidence: 0.96,
        midterm_evidence: "15/10/2569 09:00-12:00",
        final_present: false,
        final_exam: null,
        final_confidence: 0.99,
        final_evidence: "-",
      }],
    });
    const courseExamReview = await reviewScheduleCoursesAndExamsWithGemini({
      apiKey: "test-key",
      entries: [{...baseEntries[0], finalExam: "incorrect inherited value"}],
      imageDataUrl: "data:image/png;base64,AA==",
      rawText: "SC1-201 Data Structures 15/10/2569 09:00-12:00",
    });
    assert.equal(courseExamReview.entries[0].courseName, "Data Structures");
    assert.equal(courseExamReview.entries[0].midtermExam, "15/10/2569 09:00-12:00");
    assert.equal(courseExamReview.entries[0].finalExam, null);
    assert.equal(courseExamReview.appliedCourseCount, 1);
    assert.equal(courseExamReview.appliedExamCount, 1);

    global.fetch = async () => interactionResponse({
      document_type: "receipt",
      merchant_name: "Netflix",
      grand_total: 199,
      items: [],
    });
    const categorised = await extractReceiptWithGemini(
      "NETFLIX TOTAL 199.00",
      "test-key",
      "data:image/png;base64,AA==",
    );
    assert.equal(categorised.category, "Entertainment");

    global.fetch = async () => interactionResponse({
      document_type: "receipt",
      merchant_name: "Test Mart",
      grand_total: 35,
      items: [{
        name: "Notebook",
        quantity: 0,
        original_price: 50,
        discount_amount: 15,
        final_price: 35,
      }],
    });
    const discountedReceipt = await extractReceiptWithGemini(
      "Notebook 50 discount 15 total 35",
      "test-key",
      "data:image/png;base64,AA==",
    );
    assert.equal(discountedReceipt.items[0].quantity, 1);
    assert.equal(discountedReceipt.items[0].discount, 15);
    assert.equal(discountedReceipt.items[0].unitPrice, 50);
    assert.equal(discountedReceipt.items[0].totalPrice, 35);

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

    const correctedBeYear = resolveReceiptTimestamp(
      {},
      "ทำรายการสำเร็จ\n12 ก.ค. 2016 22:01 น.",
      {
        calendarEra: "BE",
        confidence: 0.98,
        date: "2026-07-12",
        evidence: "12 ก.ค. 2569 22:01 น.",
        printedYear: 2569,
        time: "22:01",
      },
    );
    assert.equal(correctedBeYear.date, "2026-07-12");
    assert.equal(correctedBeYear.timestampCalendarEra, "BE");
    assert.equal(correctedBeYear.timestampPrintedYear, 2569);
    assert.equal(correctedBeYear.timestampVerification, "gemini-image-corrected-be-year");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("OCR pipeline checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
