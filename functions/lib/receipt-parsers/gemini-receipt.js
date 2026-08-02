"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RECEIPT_EXTRACTION_SYSTEM_PROMPT = void 0;
exports.extractReceiptWithGemini = extractReceiptWithGemini;
exports.RECEIPT_EXTRACTION_SYSTEM_PROMPT = `Act as an expert Data Extraction AI specialized in Thai retail receipts, e-receipts, bank transfer slips, and e-wallets.

Your ONLY task is to extract data from the supplied high-resolution document image and OCR text into the strict JSON response schema. Extract only details supported by the document.

DOCUMENT TYPE
- Return exactly one document_type: "receipt" when purchased items and prices are present, "bank_slip" for a bank transfer without purchased items, or "e_wallet" for an app/wallet payment showing a net paid amount.

GRAND TOTAL (CRITICAL)
- Consider a number as grand_total only when it is directly associated with or immediately follows one of these exact anchors: "ยอดสุทธิ", "ยอดรวม", "Total", "Total Incl. VAT", "จำนวนเงินที่ชำระ", "QR Payment", or "Net".
- If several anchors exist, the final paid/payment anchor is authoritative.
- Ignore piece counts such as "2 ชิ้น" and "รวมชิ้น 1".
- Ignore numbers associated with "ลุ้นช้อปฟรี", "ลุ้นชิงโชค", "500 บาท", "คะแนน", "Points", "Survey", "Change", "เงินทอน", prizes, promotions, references, balances, tax IDs, and account numbers.
- Never choose a number merely because it is the largest or the last number on the document.
- Copy grand_total from the permitted anchor. Never calculate, add, multiply, estimate, or adjust grand_total from item rows.
- If no permitted anchor has a reliable associated amount, return grand_total as null. Never guess.

PROCESSING RULES
1. Extract the merchant or payee name exactly as visibly printed. On payment-success screenshots, the merchant/payee is the destination shown after the transfer arrow, not the sender, status text, phone status bar, or wallet ID. Never return garbled punctuation or status-bar characters as the merchant name.
2. Extract the final amount actually paid using only the Grand Total anchors above. Ignore balances, account numbers, change, discounts, subtotals, reference numbers, and prize or promotional amounts printed in a footer (for example, "win 1,500 Baht").
   On payment-success slips and receipts, labels such as \"QR Payment\", \"amount paid\", \"paid amount\", or \"\u0e08\u0e33\u0e19\u0e27\u0e19\u0e40\u0e07\u0e34\u0e19\u0e17\u0e35\u0e48\u0e0a\u0e33\u0e23\u0e30\" are authoritative. Accept whole-Baht amounts such as \"16 \u0e1a\u0e32\u0e17\" as well as decimal amounts.
3. Extract every visibly purchased product in reading order. Inspect the entire receipt from the first product row through the row immediately before Item(s), Total, or payment. Do not stop after the first product. Product name, quantity, and line total may be split across several OCR lines; bind them by visual proximity.
   Clean each item name by removing barcode-only lines and pack-size, weight, volume, or quantity metadata such as "600MEB", "600ML", "13ก.", "500G", "x12", and "8851952350789".
4. Return ONLY purchased products and explicit discount rows in items. Never create items from Total, VAT, payment, QR payment, references, change, questionnaire/survey, download, exchange/refund, footer, loyalty-message rows, payment methods such as "TrueMoney", "ทรูมันนี่", cash, credit card, or debit card, or section headers such as "#ยกเว้น", "EXEMPT", "Description", "Qty", "Price", and "Amount". A positive-priced product name must identify an actual thing or product.
5. Return a discount row such as "ลด -5.00" as a separate item with a descriptive name and a negative total_price. Keep the related product's total_price before that discount so the discount is not subtracted twice.
6. If quantity is not visibly printed for a genuine product, use quantity 1. Never invent a product.
   Lines containing only quantity and per-unit metadata, such as \"2.0000 1.00/PCS\", are not products and must never appear as item names.
   Payment slips are a single financial transaction, not an itemized receipt; return an empty items array unless actual purchased-product rows are visibly present.
7. For a receipt, calculate the sum of every item total_price, including negative discount rows. It must closely agree with grand_total, allowing only a reasonable VAT or rounding difference. If the difference is massive, the selected total is wrong: re-read only the permitted Grand Total anchors and never substitute a footer or promotional number.
8. Return exactly four top-level fields: document_type, merchant_name, grand_total, and items. Each item must contain exactly name, quantity, and total_price.
9. Return only raw valid JSON required by the response schema. Do not return Markdown, backticks, explanations, or additional properties.`;
const CATEGORY_VALUES = [
    "Food",
    "Groceries",
    "Utilities",
    "Transport",
    "Entertainment",
    "Shopping",
    "Others",
];
const DOCUMENT_TYPE_VALUES = ["receipt", "bank_slip", "e_wallet"];
const RECEIPT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    properties: {
        document_type: { type: "string", enum: DOCUMENT_TYPE_VALUES },
        merchant_name: { type: ["string", "null"] },
        grand_total: { type: ["number", "null"], minimum: 0 },
        items: {
            type: "array",
            maxItems: 200,
            items: {
                type: "object",
                additionalProperties: false,
                properties: {
                    name: { type: "string" },
                    quantity: { type: "number", minimum: 0 },
                    total_price: { type: "number" },
                },
                required: ["name", "quantity", "total_price"],
            },
        },
    },
    required: ["document_type", "merchant_name", "grand_total", "items"],
};
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
function bangkokDateKey(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Asia/Bangkok",
        year: "numeric",
    }).formatToParts(value);
    const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
}
function normalizeResult(value, fallbackDate) {
    if (!value || typeof value !== "object")
        throw new Error("Gemini returned an invalid receipt payload.");
    const payload = value;
    const rawMerchantName = typeof payload.merchant_name === "string"
        ? payload.merchant_name.replace(/\s+/g, " ").trim().slice(0, 160)
        : "";
    const merchantName = rawMerchantName &&
        /[A-Za-z\u0e00-\u0e7f]{2,}/u.test(rawMerchantName) &&
        !/[!@#$%^&*()_+={}\[\]<>?]{3,}/.test(rawMerchantName)
        ? rawMerchantName
        : null;
    const amount = payload.grand_total === null || payload.grand_total === undefined
        ? Number.NaN
        : typeof payload.grand_total === "number" ? payload.grand_total : Number(payload.grand_total);
    const nonProductText = /(?:\b(?:TOTAL|SUBTOTAL|VAT|VATABLE|PAYMENT|APPROVAL|REFERENCE|CHANGE|QUESTIONNAIRE|SURVEY|DOWNLOAD|EXCHANGE|REFUND|CASHIER|OPERATOR)\b|\u0e20\.?\u0e1e\.?|\u0e20\u0e32\u0e29\u0e35|\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e21\u0e35\u0e20\u0e1e|\u0e41\u0e1a\u0e1a\u0e2a\u0e2d\u0e1a\u0e16\u0e32\u0e21|\u0e23\u0e48\u0e27\u0e21\u0e15\u0e2d\u0e1a|\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14)/i;
    const discountName = /^(?:(?:\u0e25\u0e14|\u0e2a\u0e48\u0e27\u0e19\u0e25\u0e14)|(?:disc(?:ount)?|promo(?:tion)?)\b)/i;
    const quantityMetadataOnly = /^\s*\d+(?:\.\d+)?\s*(?:@|x)?\s*\d+(?:\.\d+)?\s*\/?\s*(?:pcs?|ea|ชิ้น)?\s*$/i;
    const items = Array.isArray(payload.items) ? payload.items.flatMap((value) => {
        if (!value || typeof value !== "object")
            return [];
        const item = value;
        const rawName = typeof item.name === "string" ? item.name : "";
        const name = rawName
            .replace(/\b\d{8,14}\b/g, " ")
            .replace(/\b\d+(?:\.\d+)?\s*(?:ML|MEB|L|G|KG|PCS?)\b/gi, " ")
            .replace(/\d+(?:\.\d+)?\s*(?:มล\.?|ก\.?|กก\.?|ชิ้น)\b/gi, " ")
            .replace(/\s*[xX]\s*\d+(?:\.\d+)?\b/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 180);
        const quantity = Number(item.quantity);
        const totalPrice = Number(item.total_price);
        const isDiscount = discountName.test(name);
        if (!name || quantityMetadataOnly.test(name) ||
            (!isDiscount && nonProductText.test(name)) ||
            !Number.isFinite(totalPrice) ||
            (totalPrice < 0 && !isDiscount) ||
            (totalPrice >= 0 && isDiscount))
            return [];
        const normalizedQuantity = Number.isFinite(quantity) && quantity > 0
            ? quantity
            : 1;
        return [{
                discount: null,
                name,
                quantity: normalizedQuantity,
                totalPrice: Number(totalPrice.toFixed(2)),
                unitPrice: Number((totalPrice / normalizedQuantity).toFixed(2)),
            }];
    }).slice(0, 200) : [];
    const documentType = DOCUMENT_TYPE_VALUES.includes(payload.document_type)
        ? payload.document_type
        : items.length ? "receipt" : "bank_slip";
    const categoryText = `${merchantName ?? ""} ${items.map((item) => item.name).join(" ")}`;
    const category = /(?:7[\s-]?ELEVEN|BIG\s*C|LOTUS|MAKRO|TOPS|FOODLAND|CJ\s*EXPRESS|SUPERMARKET|ซูเปอร์|ตลาด)/i.test(categoryText) ? "Groceries" :
        /(?:RESTAURANT|CAFE|COFFEE|MCDONALD|KFC|STARBUCKS|ร้านอาหาร|กาแฟ|ข้าว|อาหาร)/i.test(categoryText) ? "Food" :
            /(?:FUEL|PTT|BANGCHAK|SHELL|TAXI|GRAB|BTS|MRT|น้ำมัน|เดินทาง|รถ)/i.test(categoryText) ? "Transport" :
                "Others";
    const confidenceScore = amount >= 0 && merchantName ? 0.9 : amount >= 0 || merchantName ? 0.7 : 0.4;
    return {
        category,
        confidenceScore,
        date: fallbackDate,
        documentType,
        items,
        merchantName,
        totalAmount: Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : null,
    };
}
async function extractReceiptWithGemini(rawText, apiKey, imageDataUrl) {
    const currentBangkokDate = bangkokDateKey();
    const image = parseImageDataUrl(imageDataUrl);
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
            model: process.env.GEMINI_RECEIPT_MODEL ?? "gemini-3.5-flash",
            store: false,
            system_instruction: exports.RECEIPT_EXTRACTION_SYSTEM_PROMPT,
            input: [
                {
                    type: "text",
                    text: `Current Bangkok date: ${currentBangkokDate}\n\nOCR text (may contain recognition errors; prefer visible image evidence):\n${rawText.slice(0, 30000)}`,
                },
                {
                    type: "image",
                    data: image.data,
                    mime_type: image.mimeType,
                },
            ],
            response_format: {
                type: "text",
                mime_type: "application/json",
                schema: RECEIPT_SCHEMA,
            },
        }),
    });
    const payload = await response.json();
    if (!response.ok)
        throw new Error(payload.error?.message ?? `Gemini request failed with ${response.status}.`);
    const outputText = interactionOutputText(payload);
    if (!outputText)
        throw new Error("Gemini returned no structured receipt output.");
    return normalizeResult(JSON.parse(outputText), currentBangkokDate);
}
//# sourceMappingURL=gemini-receipt.js.map