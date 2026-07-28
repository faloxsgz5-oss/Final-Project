"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IappReceiptError = void 0;
exports.normalizeIappReceiptResponse = normalizeIappReceiptResponse;
exports.extractReceiptWithIapp = extractReceiptWithIapp;
class IappReceiptError extends Error {
    statusCode;
    constructor(message, statusCode = null) {
        super(message);
        this.statusCode = statusCode;
        this.name = "IappReceiptError";
    }
}
exports.IappReceiptError = IappReceiptError;
function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) ?
        value :
        {};
}
function text(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}
function number(value) {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}
function confidence(value) {
    const parsed = number(value);
    return parsed === null ? 0 : Math.min(1, Math.max(0, parsed));
}
function normalizeReceiptDate(value) {
    const raw = text(value);
    if (!raw)
        return null;
    const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (!match)
        return raw;
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year > 2400)
        year -= 543;
    if (year < 100)
        year += year >= 70 ? 1900 : 2000;
    if (!Number.isInteger(day) ||
        !Number.isInteger(month) ||
        day < 1 ||
        day > 31 ||
        month < 1 ||
        month > 12)
        return raw;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function receiptTime(rawOcr) {
    const matches = [...rawOcr.matchAll(/(?:^|\s)([01]?\d|2[0-3])[:.](\d{2})(?:\s|$)/g)];
    const last = matches[matches.length - 1];
    return last ? `${last[1].padStart(2, "0")}:${last[2]}` : null;
}
function responseMessage(status) {
    if (status === 400)
        return "ไฟล์ใบเสร็จไม่ถูกต้องหรือ iApp ไม่รองรับรูปแบบนี้";
    if (status === 401)
        return "ไม่สามารถยืนยันสิทธิ์ iApp ได้ กรุณาตรวจสอบ API Key";
    if (status === 429)
        return "โควตา iApp ถูกใช้งานครบแล้ว กรุณาลองใหม่ภายหลัง";
    if (status >= 500)
        return "ระบบอ่านใบเสร็จ iApp ขัดข้องชั่วคราว";
    return "ไม่สามารถอ่านใบเสร็จด้วย iApp ได้";
}
function normalizeIappReceiptResponse(value) {
    const rawResponse = record(value);
    const docs = Array.isArray(rawResponse.docs) ? rawResponse.docs : [];
    // iApp's current production response wraps each page in docs[]. Keep
    // supporting the legacy top-level shape documented on their website.
    const documentResponse = docs.length ? record(docs[0]) : rawResponse;
    const processed = record(documentResponse.processed);
    if (!Object.keys(processed).length) {
        throw new IappReceiptError(text(documentResponse.message) ??
            text(rawResponse.message) ??
            "iApp ไม่ส่งข้อมูลใบเสร็จที่ประมวลผลแล้วกลับมา");
    }
    const confidenceByField = record(documentResponse.confidence);
    const raw = record(documentResponse.raw);
    const rawOcr = text(raw.text) ?? "";
    const rawItems = Array.isArray(processed.items) ? processed.items : [];
    const items = rawItems.flatMap((rawItem) => {
        const item = record(rawItem);
        const name = text(item.itemName);
        const totalPrice = number(item.itemTotalCost);
        if (!name || totalPrice === null)
            return [];
        return [{
                discount: null,
                itemCode: text(item.itemCode),
                name,
                quantity: number(item.itemUnit) ?? 1,
                totalPrice,
                unitPrice: number(item.itemUnitCost),
            }];
    });
    const importantConfidence = {
        invoiceDate: confidence(confidenceByField.invoiceDate),
        issuerName: confidence(confidenceByField.issuerName),
        grandTotal: confidence(confidenceByField.grandTotal),
        items: confidence(confidenceByField.items),
    };
    const importantValues = Object.values(importantConfidence);
    const overallConfidence = Number((importantValues.reduce((sum, score) => sum + score, 0) / importantValues.length).toFixed(2));
    const lowConfidenceFields = Object.entries(importantConfidence)
        .filter(([, score]) => score < 0.75)
        .map(([field]) => field);
    const grandTotal = number(processed.grandTotal);
    const merchantName = text(processed.issuerName);
    return {
        confidence: confidenceByField,
        lowConfidenceFields,
        overallConfidence,
        parsed: {
            category: "Others",
            confidenceByField,
            confidenceScore: overallConfidence,
            currency: "THB",
            date: normalizeReceiptDate(processed.invoiceDate),
            discountAmount: number(processed.discount) ?? 0,
            documentType: "receipt",
            invoiceType: text(processed.invoiceType),
            items,
            lowConfidenceFields,
            merchant: merchantName,
            merchantName,
            paidAmount: grandTotal,
            parserSource: "iapp-receipt-ocr-v3",
            provider: "iapp",
            reference: text(processed.invoiceID),
            subtotal: number(processed.totalCost),
            time: receiptTime(rawOcr),
            total: grandTotal,
            totalAfterDiscount: number(processed.totalCostAfterDiscount),
            totalAmount: grandTotal,
            vat: number(processed.vat),
        },
        processed,
        rawOcr,
        rawResponse,
    };
}
async function extractReceiptWithIapp({ apiKey, bytes, contentType, fileName, }) {
    if (!apiKey.trim())
        throw new IappReceiptError("ยังไม่ได้ตั้งค่า IAPP_API_KEY");
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) {
        throw new IappReceiptError("ไฟล์ใบเสร็จต้องมีขนาดไม่เกิน 10 MB", 400);
    }
    if (!["image/jpeg", "image/png", "application/pdf"].includes(contentType)) {
        throw new IappReceiptError("iApp รองรับเฉพาะ JPG, JPEG, PNG และ PDF", 400);
    }
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: contentType }), fileName);
    form.append("return_ocr", "true");
    form.append("return_image", "false");
    let response;
    try {
        response = await fetch("https://api.iapp.co.th/ocr/v3/receipt/file", {
            body: form,
            headers: { apikey: apiKey },
            method: "POST",
            signal: AbortSignal.timeout(55_000),
        });
    }
    catch (error) {
        const message = error instanceof Error && error.name === "TimeoutError" ?
            "iApp ใช้เวลาประมวลผลนานเกินไป" :
            "ไม่สามารถเชื่อมต่อระบบ iApp ได้";
        throw new IappReceiptError(message);
    }
    if (!response.ok) {
        throw new IappReceiptError(responseMessage(response.status), response.status);
    }
    const body = await response.json().catch(() => null);
    return normalizeIappReceiptResponse(body);
}
//# sourceMappingURL=iapp-receipt.js.map