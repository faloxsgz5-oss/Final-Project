"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveReceiptTimestamp = resolveReceiptTimestamp;
const deterministic_receipt_1 = require("./deterministic-receipt");
function sameOrMissing(left, right) {
    return !left || !right || left === right;
}
function resolveReceiptTimestamp(receipt, rawText, gemini) {
    const ocr = (0, deterministic_receipt_1.extractReceiptTimestampEvidence)(rawText);
    const hasOcr = Boolean(ocr.date || ocr.time);
    const geminiUsable = Boolean(gemini &&
        gemini.confidence >= 0.65 &&
        (gemini.date || gemini.time));
    const date = ocr.date ?? (geminiUsable ? gemini?.date : null) ??
        (typeof receipt.date === "string" ? receipt.date : null);
    const time = ocr.time ?? (geminiUsable ? gemini?.time : null) ??
        (typeof receipt.time === "string" ? receipt.time : null);
    const agrees = geminiUsable &&
        sameOrMissing(ocr.date, gemini?.date ?? null) &&
        sameOrMissing(ocr.time, gemini?.time ?? null);
    const conflicts = geminiUsable && hasOcr && !agrees;
    const verification = hasOcr ?
        (conflicts ? "gemini-conflict-kept-ocr" :
            agrees ? "gemini-confirmed-ocr" : "ocr-direct") :
        geminiUsable ? "gemini-image" : "unverified";
    return {
        ...receipt,
        ...(date ? { date } : {}),
        ...(time ? { time } : {}),
        timestampCalendarEra: ocr.calendarEra,
        timestampConfidence: hasOcr ? ocr.confidence : gemini?.confidence ?? 0,
        ...(ocr.evidence ? { timestampEvidence: ocr.evidence } : {}),
        ...(gemini?.evidence ? { timestampGeminiEvidence: gemini.evidence } : {}),
        timestampPrintedYear: ocr.printedYear,
        timestampSource: hasOcr ? "iapp-document-ocr" :
            geminiUsable ? "gemini-document-image" : "provider",
        timestampVerification: verification,
    };
}
//# sourceMappingURL=receipt-timestamp-resolution.js.map