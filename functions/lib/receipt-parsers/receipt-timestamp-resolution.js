"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveReceiptTimestamp = resolveReceiptTimestamp;
const deterministic_receipt_1 = require("./deterministic-receipt");
function sameOrMissing(left, right) {
    return !left || !right || left === right;
}
function sameMonthAndDay(left, right) {
    if (!left || !right)
        return false;
    return left.slice(5) === right.slice(5);
}
function resolveReceiptTimestamp(receipt, rawText, gemini) {
    const ocr = (0, deterministic_receipt_1.extractReceiptTimestampEvidence)(rawText);
    const hasOcr = Boolean(ocr.date || ocr.time);
    const geminiUsable = Boolean(gemini &&
        gemini.confidence >= 0.65 &&
        (gemini.date || gemini.time));
    const geminiEvidenceHasPrintedYear = Boolean(gemini?.printedYear &&
        gemini.evidence?.includes(String(gemini.printedYear)));
    const geminiCorrectsMisreadBeYear = Boolean(geminiUsable &&
        gemini?.calendarEra === "BE" &&
        gemini?.printedYear !== null &&
        (gemini?.printedYear ?? 0) >= 2400 &&
        ocr.calendarEra === "AD" &&
        ocr.printedYear !== null &&
        ocr.printedYear >= 1900 &&
        ocr.printedYear <= 2099 &&
        (gemini?.confidence ?? 0) >= 0.9 &&
        geminiEvidenceHasPrintedYear &&
        sameMonthAndDay(ocr.date, gemini?.date ?? null) &&
        sameOrMissing(ocr.time, gemini?.time ?? null));
    const date = (geminiCorrectsMisreadBeYear ? gemini?.date : ocr.date) ??
        (geminiUsable ? gemini?.date : null) ??
        (typeof receipt.date === "string" ? receipt.date : null);
    const time = ocr.time ?? (geminiUsable ? gemini?.time : null) ??
        (typeof receipt.time === "string" ? receipt.time : null);
    const agrees = geminiUsable &&
        sameOrMissing(ocr.date, gemini?.date ?? null) &&
        sameOrMissing(ocr.time, gemini?.time ?? null);
    const conflicts = geminiUsable && hasOcr && !agrees;
    const verification = geminiCorrectsMisreadBeYear ?
        "gemini-image-corrected-be-year" : hasOcr ?
        (conflicts ? "gemini-conflict-kept-ocr" :
            agrees ? "gemini-confirmed-ocr" : "ocr-direct") :
        geminiUsable ? "gemini-image" : "unverified";
    return {
        ...receipt,
        ...(date ? { date } : {}),
        ...(time ? { time } : {}),
        timestampCalendarEra: geminiCorrectsMisreadBeYear ? "BE" : ocr.calendarEra,
        timestampConfidence: geminiCorrectsMisreadBeYear ?
            gemini?.confidence ?? ocr.confidence :
            hasOcr ? ocr.confidence : gemini?.confidence ?? 0,
        ...(ocr.evidence ? { timestampEvidence: ocr.evidence } : {}),
        ...(gemini?.evidence ? { timestampGeminiEvidence: gemini.evidence } : {}),
        timestampPrintedYear: geminiCorrectsMisreadBeYear ?
            gemini?.printedYear ?? ocr.printedYear :
            ocr.printedYear,
        timestampSource: geminiCorrectsMisreadBeYear ? "gemini-image+vision-year-correction" :
            hasOcr ? "iapp-document-ocr" :
                geminiUsable ? "gemini-document-image" : "provider",
        timestampVerification: verification,
    };
}
//# sourceMappingURL=receipt-timestamp-resolution.js.map