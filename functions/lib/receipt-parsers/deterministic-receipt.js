"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyScanText = classifyScanText;
exports.extractAnchoredReceiptTotal = extractAnchoredReceiptTotal;
exports.parseReceiptDeterministic = parseReceiptDeterministic;
const RECEIPT_SIGNALS = [
    { pattern: /(?:RECEIPT\s*\/\s*TAX\s*INVOICE|TAX\s*INVOICE|ใบเสร็จรับเงิน|ใบกำกับภาษี)/gi, weight: 10 },
    // Payment-success slips may not use the word "receipt", but their wallet and
    // paid-amount labels are stronger evidence than incidental timetable text.
    { pattern: /(?:ทำรายการสำเร็จ|เป๋าตัง|G\s*-?\s*WALLET|จำนวน(?:เงิน)?(?:ที่)?(?:ชำระ|จ่าย)|ยอด(?:เงิน)?ที่ชำระ)/gi, weight: 12 },
    { pattern: /(?:GRAND\s*TOTAL|TOTAL\s*(?:INCL\.?\s*VAT|AMOUNT)?|ยอดรวม|ยอดสุทธิ|ยอดชำระ)/gi, weight: 5 },
    { pattern: /(?:QR\s*PAYMENT|PROMPT\s*QR|PROMPTPAY|พร้อมเพย์)/gi, weight: 4 },
    { pattern: /(?:TAX\s*ID|POS\s*ID|APPROVAL\s*CODE|TRC\s*NUM|BATCH\s*NO)/gi, weight: 3 },
    { pattern: /(?:DESCRIPTION\s+QTY\s+PRICE\s+AMOUNT|ITEM\(S\)|QTY\(S\)|สินค้า|จำนวน|ราคา)/gi, weight: 4 },
    { pattern: /(?:VATABLE|VAT\s*7|VAT\s*INCLUDED|THB|บาท|\u0e3f)/gi, weight: 2 },
    { pattern: /(?:MERCHANT|PAYEE|ร้านค้า|ผู้รับเงิน|ชำระเงิน|รหัสอ้างอิง)/gi, weight: 3 },
];
const SCHEDULE_SIGNALS = [
    { pattern: /(?:ตารางเรียน|ตารางสอบ|ปีการศึกษา|ภาคการศึกษา|DAY\s*\/\s*TIME)/gi, weight: 9 },
    { pattern: /(?:รหัสวิชา|ชื่อรายวิชา|COURSE\s*CODE|COURSE\s*NAME|SECTION|ห้องเรียน)/gi, weight: 5 },
    { pattern: /(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)/gi, weight: 2 },
    { pattern: /\b(?:[01]?\d|2[0-3])[:.]\d{2}\s*(?:-|–|—|ถึง)\s*(?:[01]?\d|2[0-3])[:.]\d{2}\b/g, weight: 2 },
    { pattern: /(?:คาบ\s*\d+|PERIOD\s*\d+)/gi, weight: 3 },
];
function matchCount(text, pattern) {
    return Math.min(5, text.match(pattern)?.length ?? 0);
}
function weightedScore(text, signals) {
    return signals.reduce((total, signal) => total + matchCount(text, signal.pattern) * signal.weight, 0);
}
function classifyScanText(rawText) {
    const text = rawText.replace(/\u00a0/g, " ");
    let receipt = weightedScore(text, RECEIPT_SIGNALS);
    let schedule = weightedScore(text, SCHEDULE_SIGNALS);
    const hardReceipt = matchCount(text, /(?:RECEIPT\s*\/\s*TAX\s*INVOICE|TAX\s*INVOICE|ใบเสร็จรับเงิน|ใบกำกับภาษี|ทำรายการสำเร็จ|เป๋าตัง|G\s*-?\s*WALLET|จำนวน(?:เงิน)?(?:ที่)?(?:ชำระ|จ่าย)|ยอด(?:เงิน)?ที่ชำระ)/gi);
    const hardSchedule = matchCount(text, /(?:ตารางเรียน|ตารางสอบ|ปีการศึกษา|DAY\s*\/\s*TIME)/gi);
    // Financial documents can contain dates, times, and long numeric IDs. Two
    // receipt anchors are enough to distinguish them from timetable evidence.
    const receiptAnchors = matchCount(text, /(?:RECEIPT(?:\s*\/\s*TAX\s*INVOICE)?|TAX\s*ID|POS\s*ID|QR\s*PAYMENT|PROMPT\s*QR|APPROVAL\s*CODE|VAT(?:ABLE|\s*7|\s*INCLUDED)|GRAND\s*TOTAL|TOTAL\s*(?:INCL\.?\s*VAT|AMOUNT)?|\u0e43\u0e1a\u0e01\u0e33\u0e01\u0e31\u0e1a\u0e20\u0e32\u0e29\u0e35|\u0e0a\u0e33\u0e23\u0e30\u0e40\u0e07\u0e34\u0e19\u0e2a\u0e33\u0e40\u0e23\u0e47\u0e08|\u0e08\u0e33\u0e19\u0e27\u0e19(?:\u0e40\u0e07\u0e34\u0e19)?(?:\u0e17\u0e35\u0e48)?(?:\u0e0a\u0e33\u0e23\u0e30|\u0e08\u0e48\u0e32\u0e22))/gi);
    const weekdayCount = new Set([...text.matchAll(/(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY)/gi)]
        .map((match) => match[0].toLowerCase())).size;
    // Long product, tax, POS, and reference numbers are not course codes.
    // Numeric course-code evidence is considered only when schedule structure exists.
    if (hardSchedule > 0 || weekdayCount >= 3) {
        const courseCodes = text.match(/\b\d{6,7}(?:\s*[-,]\s*\d{1,2})?\b/g)?.length ?? 0;
        schedule += Math.min(4, courseCodes) * 2;
    }
    let type = schedule > receipt ? "schedule" : "receipt";
    if (hardReceipt > 0 && hardSchedule === 0)
        type = "receipt";
    if (receiptAnchors >= 2 && hardSchedule === 0)
        type = "receipt";
    if (hardSchedule > 0 && hardReceipt === 0 && schedule >= receipt)
        type = "schedule";
    const winner = type === "receipt" ? receipt : schedule;
    const loser = type === "receipt" ? schedule : receipt;
    const confidence = Math.min(0.99, Math.max(0.55, 0.55 + (winner - loser) / Math.max(1, winner + loser) * 0.44));
    return {
        confidence: Number(confidence.toFixed(2)),
        scores: { receipt, schedule },
        type,
    };
}
function cleanText(text) {
    return text.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\r/g, "").trim();
}
function amountsOnLine(line) {
    return [...line.matchAll(/(?:THB|\u0e3f)?\s*([0-9][0-9,]*\.\d{2})(?!\d)/gi)]
        .map((match) => Number(match[1].replace(/,/g, "")))
        .filter((amount) => Number.isFinite(amount) && amount >= 0);
}
function moneyValuesOnLine(line) {
    return [...line.matchAll(/(?:THB|\u0e3f)?\s*(-?\d[\d,]*(?:\.\d{1,2})?)\s*(?:THB|\u0e1a\u0e32\u0e17|\u0e3f)?/gi)]
        .map((match) => Number(match[1].replace(/,/g, "")))
        .filter((amount) => Number.isFinite(amount) && amount >= 0);
}
function normalizedAmount(value) {
    if (!value)
        return null;
    const amount = Number(value.replace(/,/g, ""));
    return Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : null;
}
const NON_PRODUCT_TEXT = /(?:\b(?:TOTAL|SUBTOTAL|NET|VAT|VATABLE|QR\s*PAYMENT|PROMPT\s*QR|TRUE\s*MONEY|TRUEMONEY|PAYMENT|APPROVAL|TAX|POS\s*ID|TRC\s*NUM|BATCH\s*NO|HOST\s*NUM|OPERATOR|CASHIER|CHANGE|DISCOUNT|BRANCH|TEL\.?|RECEIPT|INVOICE|QUESTIONNAIRE|SURVEY|DOWNLOAD|EXCHANGE|REFUND|CASH|CREDIT\s*CARD|DEBIT\s*CARD)\b|ITEM\s*\(\s*S\s*\)|QTY\s*\(\s*S\s*\)|\u0e22\u0e2d\u0e14\u0e23\u0e27\u0e21|\u0e22\u0e2d\u0e14\u0e2a\u0e38\u0e17\u0e18\u0e34|\u0e22\u0e2d\u0e14\u0e0a\u0e33\u0e23\u0e30|\u0e08\u0e33\u0e19\u0e27\u0e19\u0e40\u0e07\u0e34\u0e19\u0e17\u0e35\u0e48\u0e0a\u0e33\u0e23\u0e30|\u0e17\u0e23\u0e39\u0e21\u0e31\u0e19\u0e19\u0e35\u0e48|\u0e27\u0e34\u0e18\u0e35\u0e01\u0e32\u0e23\u0e0a\u0e33\u0e23\u0e30|\u0e0a\u0e33\u0e23\u0e30\u0e14\u0e49\u0e27\u0e22|\u0e40\u0e07\u0e34\u0e19\u0e2a\u0e14|\u0e1a\u0e31\u0e15\u0e23\u0e40\u0e04\u0e23\u0e14\u0e34\u0e15|\u0e2a\u0e48\u0e27\u0e19\u0e25\u0e14|\u0e40\u0e07\u0e34\u0e19\u0e17\u0e2d\u0e19|\u0e41\u0e1a\u0e1a\u0e2a\u0e2d\u0e1a\u0e16\u0e32\u0e21|\u0e23\u0e48\u0e27\u0e21\u0e15\u0e2d\u0e1a|\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14|\u0e43\u0e1a\u0e01\u0e33\u0e01\u0e31\u0e1a\u0e20\u0e32\u0e29\u0e35|\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\s*\/\s*\u0e04\u0e37\u0e19)/i;
const QUANTITY_BREAKDOWN_ONLY = /^(?:\d{5,14}\s+)?\d+(?:\.\d+)?\s+\d[\d,]*(?:\.\d{1,4})?\s*\/?\s*(?:PCS?|EA|UNIT|\u0e0a\u0e34\u0e49\u0e19)\s*$/i;
const RECEIPT_FOOTER_TEXT = /(?:^\s*\*|\u0e40\u0e07\u0e37\u0e48\u0e2d\u0e19\u0e44\u0e02|\u0e44\u0e21\u0e48\u0e23\u0e31\u0e1a\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19|\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19(?:\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32)?\u0e04\u0e37\u0e19|\u0e02\u0e2d\u0e1a\u0e04\u0e38\u0e13|\u0e01\u0e23\u0e38\u0e13\u0e32|\u0e17\u0e38\u0e01\u0e27\u0e31\u0e19|\u0e25\u0e38\u0e49\u0e19\u0e0a\u0e34\u0e07\u0e42\u0e0a\u0e04|\u0e0a\u0e34\u0e07\u0e42\u0e0a\u0e04|EXCHANGE\s+(?:ARE|IS)|RETURN\s+POLICY|THANK\s+YOU)/i;
const RECEIPT_ITEM_HEADER = /^(?:#?\s*(?:\u0e22\u0e01\u0e40\u0e27\u0e49\u0e19|\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32|\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e21\u0e35\u0e20\u0e32\u0e29\u0e35|\u0e23\u0e32\u0e04\u0e32\u0e23\u0e27\u0e21\u0e20\u0e32\u0e29\u0e35(?:\u0e21\u0e39\u0e25\u0e04\u0e48\u0e32\u0e40\u0e1e\u0e34\u0e48\u0e21)?\u0e41\u0e25\u0e49\u0e27|\u0e20\.?\u0e1e\.?|EXEMPT|DESCRIPTION|QTY|PRICE|AMOUNT|ITEMS?))\s*$/i;
const RECEIPT_ITEM_END = /^(?:(?:ยอดสุทธิ|ยอดรวม|ยอดชำระ|จำนวนเงินที่ชำระ)(?:\s|[:：])|(?:GRAND\s*TOTAL|TOTAL(?:\s*INCL\.?\s*VAT)?|QR\s*PAYMENT|NET)\b)/i;
function cleanPurchasedItemName(value) {
    return value
        .replace(/\b\d{8,14}\b/g, " ")
        .replace(/\b\d+(?:\.\d+)?\s*(?:ML|MEB|L|G|KG|PCS?)\b/gi, " ")
        .replace(/\d+(?:\.\d+)?\s*(?:\u0e21\u0e25\.?|\u0e01\.?|\u0e01\u0e01\.?|\u0e0a\u0e34\u0e49\u0e19)\b/gi, " ")
        .replace(/\s*[\[({]?\s*[xX@]\s*\d+(?:\.\d+)?\s*[\])}]?/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function normalizedItemName(value) {
    return value
        .normalize("NFKC")
        .toLocaleLowerCase("th-TH")
        .replace(/^(?:\u0e25\u0e14|\u0e2a\u0e48\u0e27\u0e19\u0e25\u0e14|disc(?:ount)?|promo(?:tion)?)\s*/i, "")
        .replace(/[^a-z0-9\u0e00-\u0e7f]+/gi, "")
        .trim();
}
function bigramScore(left, right) {
    if (!left || !right)
        return 0;
    if (left === right)
        return 1;
    if (left.includes(right) || right.includes(left))
        return 0.92;
    const pairs = (value) => {
        const result = [];
        for (let index = 0; index < value.length - 1; index += 1) {
            result.push(value.slice(index, index + 2));
        }
        return result;
    };
    const leftPairs = pairs(left);
    const rightPairs = pairs(right);
    if (!leftPairs.length || !rightPairs.length)
        return 0;
    const remaining = [...rightPairs];
    let matches = 0;
    for (const pair of leftPairs) {
        const matchIndex = remaining.indexOf(pair);
        if (matchIndex < 0)
            continue;
        matches += 1;
        remaining.splice(matchIndex, 1);
    }
    return (2 * matches) / (leftPairs.length + rightPairs.length);
}
function isPurchasedProductName(value) {
    const name = value.replace(/\s+/g, " ").trim();
    return Boolean(name &&
        /[A-Za-z\u0e00-\u0e7f]{2,}/u.test(name) &&
        !NON_PRODUCT_TEXT.test(name) &&
        !RECEIPT_ITEM_HEADER.test(name) &&
        !QUANTITY_BREAKDOWN_ONLY.test(name) &&
        !/^(?:(?:\u0e25\u0e14|\u0e2a\u0e48\u0e27\u0e19\u0e25\u0e14)\s*|(?:disc(?:ount)?|promo(?:tion)?)\b)/i.test(name));
}
function receiptItems(lines) {
    const items = [];
    const startIndex = lines.findIndex((line) => /(?:DESCRIPTION\s+QTY\s+PRICE\s+AMOUNT|RECEIPT\s*\/\s*TAX\s*INVOICE|TAX\s*INVOICE)/i.test(line));
    const candidates = lines.slice(startIndex >= 0 ? startIndex + 1 : 0);
    let pending = null;
    const metadata = NON_PRODUCT_TEXT;
    const codeOnly = /^(?:[A-Z0-9_-]{4,}\s*(?:[-/]\s*\d+\/\d+)?)$/i;
    let ignoreDiscountBreakdown = false;
    let footerStarted = false;
    const flushPending = () => {
        if (!pending)
            return;
        pending.name = cleanPurchasedItemName(pending.name).slice(0, 180);
        if (pending.quantity === null)
            pending.quantity = 1;
        if (pending.totalPrice <= 0 &&
            pending.quantity !== null &&
            pending.unitPrice !== null) {
            pending.totalPrice = Number((pending.quantity * pending.unitPrice).toFixed(2));
        }
        if (isPurchasedProductName(pending.name) && pending.totalPrice > 0)
            items.push(pending);
        pending = null;
    };
    const applyDiscount = (rawName, rawDiscount) => {
        const discount = Math.abs(Number(rawDiscount.replace(/,/g, "")));
        if (!Number.isFinite(discount) || discount <= 0)
            return;
        const target = normalizedItemName(rawName);
        const candidates = [...items, ...(pending ? [pending] : [])];
        let best = null;
        let bestScore = 0;
        for (const item of candidates) {
            const score = bigramScore(target, normalizedItemName(item.name));
            if (score > bestScore) {
                best = item;
                bestScore = score;
            }
        }
        if (!best || bestScore < 0.34)
            return;
        best.discount = Number(((best.discount ?? 0) + discount).toFixed(2));
        best.totalPrice = Number(Math.max(0, best.totalPrice - discount).toFixed(2));
        if (best.quantity !== null && best.quantity > 0) {
            best.unitPrice = Number((best.totalPrice / best.quantity).toFixed(2));
        }
    };
    for (const rawLine of candidates) {
        const line = rawLine.replace(/\s+/g, " ").trim();
        if (!line)
            continue;
        if (footerStarted)
            continue;
        // Policy, survey, and thank-you text appears after the purchase section.
        // It is never a product, even when OCR associates a nearby total with it.
        if (RECEIPT_FOOTER_TEXT.test(line)) {
            footerStarted = true;
            continue;
        }
        // A printed total closes the product section. Never parse totals or a
        // following payment method (for example TrueMoney) as products.
        if (RECEIPT_ITEM_END.test(line)) {
            flushPending();
            footerStarted = true;
            continue;
        }
        if (QUANTITY_BREAKDOWN_ONLY.test(line))
            continue;
        const discountLine = line.match(/^(?:\u0e25\u0e14|\u0e2a\u0e48\u0e27\u0e19\u0e25\u0e14|disc(?:ount)?|promo(?:tion)?)\s+(.+?)\s+-\s*(\d[\d,]*(?:\.\d{1,2})?)\s*(?:THB|\u0e3f|\u0e1a\u0e32\u0e17)?$/i);
        if (discountLine) {
            applyDiscount(discountLine[1], discountLine[2]);
            ignoreDiscountBreakdown = true;
            continue;
        }
        const quantityRow = line.match(/^(?:\d{5,14}\s+)?(\d+(?:\.\d+)?)\s*[Xx@]\s*(\d[\d,]*\.\d{2})(?:\s*(?:\/\s*PCS)?)?(?:\s+(\d[\d,]*\.\d{2}))?$/i);
        if (ignoreDiscountBreakdown && quantityRow) {
            ignoreDiscountBreakdown = false;
            continue;
        }
        // A printed quantity breakdown belongs to a discount only when it is the
        // immediately following line. Do not suppress later real products.
        ignoreDiscountBreakdown = false;
        if (metadata.test(line))
            continue;
        if (/^(?:\u0e25\u0e14|DISC(?:OUNT)?)\b/i.test(line) || /-\s*\d[\d,]*\.\d{2}\s*$/.test(line)) {
            ignoreDiscountBreakdown = true;
            continue;
        }
        if (quantityRow) {
            const quantity = normalizedAmount(quantityRow[1]);
            const unitPrice = normalizedAmount(quantityRow[2]);
            const explicitTotal = normalizedAmount(quantityRow[3]);
            if (!pending && items.length && explicitTotal === null) {
                const previous = items[items.length - 1];
                previous.quantity = quantity;
                previous.unitPrice = unitPrice;
                continue;
            }
            if (pending && quantity !== null && unitPrice !== null) {
                pending.quantity = quantity;
                pending.unitPrice = unitPrice;
                pending.totalPrice = explicitTotal ?? Number((quantity * unitPrice).toFixed(2));
            }
            continue;
        }
        const quantityOnly = line.match(/^(\d+(?:\.\d+)?)\s*[Xx@]\s*$/);
        if (quantityOnly && pending) {
            pending.quantity = normalizedAmount(quantityOnly[1]);
            continue;
        }
        // Some Thai tax invoices print a product name, a barcode, then one dense
        // quantity/price row (for example "1.0 ... @x48.00 ... 48.00"). Keep the
        // preceding product name instead of replacing it with that technical row.
        const pendingPriceValues = amountsOnLine(line);
        const pendingQuantity = line.match(/^(\d+(?:\.\d+)?)\s+/)?.[1];
        if (pending &&
            pendingQuantity &&
            pendingPriceValues.length &&
            /(?:@|[xX]|\/\s*(?:PCS?|EA|UNIT))/i.test(line)) {
            const quantity = normalizedAmount(pendingQuantity);
            const totalPrice = pendingPriceValues.at(-1) ?? null;
            const unitPrice = pendingPriceValues.length > 1
                ? pendingPriceValues.at(-2) ?? totalPrice
                : totalPrice;
            if (quantity !== null && totalPrice !== null && totalPrice > 0) {
                pending.quantity = quantity;
                pending.unitPrice = unitPrice;
                pending.totalPrice = totalPrice;
                continue;
            }
        }
        // Vision commonly returns a product name and its amount as two separate
        // lines. Bind the amount-only row to the closest pending product name.
        const amountOnly = line.match(/^(?:THB|\u0e3f)?\s*(\d[\d,]*\.\d{2})\s*$/i);
        if (amountOnly) {
            const amount = normalizedAmount(amountOnly[1]);
            if (pending && amount !== null && amount > 0) {
                if (pending.quantity !== null && pending.unitPrice === null) {
                    pending.unitPrice = amount;
                }
                else if (pending.totalPrice <= 0) {
                    pending.totalPrice = amount;
                }
            }
            continue;
        }
        const directItem = line.match(/^(?:(\d+(?:\.\d+)?)\s+)?(.+?)\s+(-?\d[\d,]*\.\d{2})\s*$/);
        if (directItem) {
            const parsedQuantity = normalizedAmount(directItem[1]);
            const quantity = parsedQuantity !== null && parsedQuantity > 0 ? parsedQuantity : 1;
            const name = directItem[2].trim();
            const totalPrice = normalizedAmount(directItem[3]);
            if (totalPrice !== null && totalPrice > 0 &&
                /[A-Za-z\u0e00-\u0e7f]{2,}/.test(name) &&
                isPurchasedProductName(name) && !codeOnly.test(name)) {
                flushPending();
                pending = {
                    discount: null,
                    name,
                    quantity,
                    totalPrice,
                    unitPrice: Number((totalPrice / quantity).toFixed(2)),
                };
            }
            continue;
        }
        if (isPurchasedProductName(line) && !codeOnly.test(line) &&
            !/^\d[\d\s.,:/-]+$/.test(line)) {
            flushPending();
            pending = {
                discount: null,
                name: line.slice(0, 180),
                quantity: null,
                totalPrice: 0,
                unitPrice: null,
            };
        }
    }
    flushPending();
    return items.slice(0, 200);
}
function receiptTotal(lines) {
    const footerIndex = lines.findIndex((line) => RECEIPT_FOOTER_TEXT.test(line));
    const contentLines = footerIndex >= 0 ? lines.slice(0, footerIndex) : lines;
    const paidLabel = /(?:จำนวนเงินที่ชำระ|ยอดสุทธิ|ยอดชำระ)/i;
    // A payment confirmation is authoritative. OCR can misread decorative
    // characters next to Total (for example "(4)********54.00").
    const paymentLabel = /QR\s*PAYMENT/i;
    const totalLabel = /(?:\bTOTAL\s*INCL\.?\s*VAT\b|\bTOTAL\b|\bNET\b|ยอดรวม)/i;
    const excluded = /(?:SUBTOTAL|VATABLE|VAT\s*7|CHANGE|DISCOUNT|ค่าสินค้า|สิทธิ|ส่วนลด|เงินทอน)/i;
    for (const label of [paidLabel, paymentLabel, totalLabel]) {
        for (const [index, line] of contentLines.entries()) {
            // A final paid-amount label remains authoritative even when OCR merged
            // it with the preceding discount line (for example, "-24 บาท ... 16 บาท").
            if (!label.test(line) || (label !== paidLabel && excluded.test(line)))
                continue;
            const direct = moneyValuesOnLine(line).at(-1);
            if (direct !== undefined)
                return direct;
            const following = contentLines.slice(index + 1, index + (label === paidLabel ? 4 : 8));
            const amountWithCurrency = following
                .filter((nearby) => /(?:THB|\u0e3f|\u0e1a\u0e32\u0e17)/i.test(nearby) && !excluded.test(nearby))
                .flatMap((nearby) => moneyValuesOnLine(nearby))
                .at(0);
            if (amountWithCurrency !== undefined)
                return amountWithCurrency;
            const amountOnly = following
                .filter((nearby) => !excluded.test(nearby) && /^\s*(?:THB|\u0e3f)?\s*\d[\d,]*(?:\.\d{1,2})?\s*(?:THB|\u0e1a\u0e32\u0e17|\u0e3f)?\s*$/i.test(nearby))
                .flatMap((nearby) => moneyValuesOnLine(nearby))
                .at(0);
            if (amountOnly !== undefined)
                return amountOnly;
        }
    }
    // Never guess from the last/largest currency number. Without an approved
    // anchor the correct result is unknown and must remain empty for review.
    return null;
}
function extractAnchoredReceiptTotal(rawText) {
    const text = cleanText(rawText);
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    return receiptTotal(lines);
}
function knownMerchant(lines, text) {
    const findLine = (pattern) => lines.find((line) => pattern.test(line));
    const mrDiy = findLine(/\bMR\.?\s*D\.?\s*I\.?\s*Y\.?\b/i);
    if (mrDiy)
        return mrDiy.replace(/\s+/g, " ").trim();
    const bigC = findLine(/\bBIG\s*C\b/i);
    if (bigC)
        return bigC.replace(/\s+/g, " ").trim();
    if (/\bBCM\b/i.test(text))
        return "Big C Market";
    const brands = /(?:McDonald'?s|KFC|Starbucks|Cafe Amazon|7[ -]?Eleven|Lotus'?s?|Makro|Tops|Foodland|CJ Express|PTT|Bangchak|Shell|Grab|Shopee|Lazada|Uniqlo)/i;
    const brandLine = findLine(brands);
    if (brandLine)
        return brandLine.replace(/\s+/g, " ").trim();
    const thaiShop = lines.find((line) => /^ร้าน(?!ค้า\s*$)[^:：]{2,100}$/u.test(line.trim()));
    if (thaiShop)
        return thaiShop.replace(/\s+/g, " ").trim();
    const labeledMerchant = text.match(/(?:ผู้รับเงิน|ร้านค้า|ชำระให้|ไปยัง)\s*[:：-]?\s*([^\n]{2,100})/iu)?.[1]?.trim();
    if (labeledMerchant && /[A-Za-z\u0e00-\u0e7f]{2,}/u.test(labeledMerchant)) {
        return labeledMerchant.replace(/\s+/g, " ");
    }
    const ignored = /(?:RECEIPT|INVOICE|TAX|VAT|POS\s*ID|DESCRIPTION|QTY|PRICE|AMOUNT|TOTAL|PAYMENT|APPROVAL|BRANCH|TEL\.?|ITEM|CASHIER|CHANGE|DISCOUNT|ทำรายการสำเร็จ|รหัสอ้างอิง|จำนวนเงิน|ค่าสินค้า|สิทธิ|วันที่|เวลา)/i;
    return lines.slice(0, 18).find((line) => /[A-Za-z\u0e00-\u0e7f]{2,}/u.test(line) &&
        !ignored.test(line) &&
        !/^\d[\d\s.,:/-]+$/.test(line) &&
        !/[!@#$%^&*()_+={}\[\]<>?]{3,}/.test(line)) ?? null;
}
function receiptCategory(text) {
    if (/(?:BIG\s*C|\bBCM\b|7[ -]?ELEVEN|LOTUS|MAKRO|TOPS|FOODLAND|CJ\s*EXPRESS|MAXVALU|SUPERMARKET|CONVENIENCE)/i.test(text))
        return "Groceries";
    if (/(?:MCDONALD|KFC|STARBUCKS|CAFE|COFFEE|RESTAURANT|PIZZA|BURGER|SUSHI|FOOD\s*COURT|ร้านอาหาร|กาแฟ|ข้าว|ก๋วยเตี๋ยว)/i.test(text))
        return "Food";
    if (/(?:MR\.?\s*D\.?\s*I\.?\s*Y|SHOPEE|LAZADA|UNIQLO|ADVICE|ELECTRONIC|DEPARTMENT\s*STORE)/i.test(text))
        return "Shopping";
    if (/(?:PEA|MEA|ELECTRIC|WATER\s*BILL|INTERNET|AIS|TRUE|DTAC|UTILITY)/i.test(text))
        return "Utilities";
    if (/(?:PTT|BANGCHAK|SHELL|ESSO|GRAB|BOLT|BTS|MRT|TOLL|PARKING|FUEL)/i.test(text))
        return "Transport";
    if (/(?:NETFLIX|SPOTIFY|STEAM|CINEMA|MAJOR\s*CINEPLEX|GAME)/i.test(text))
        return "Entertainment";
    return "Others";
}
function receiptDate(text) {
    const match = [...text.matchAll(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})\b/g)].at(-1);
    const thaiMonthMatch = text.match(/\b(\d{1,2})\s*(ม\.?ค\.?|ก\.?พ\.?|มี\.?ค\.?|เม\.?ย\.?|พ\.?ค\.?|มิ\.?ย\.?|ก\.?ค\.?|ส\.?ค\.?|ก\.?ย\.?|ต\.?ค\.?|พ\.?ย\.?|ธ\.?ค\.?)\s*(\d{2}|\d{4})\b/u);
    if (!match && !thaiMonthMatch)
        return null;
    const thaiMonths = {
        "มค": 1, "กพ": 2, "มีค": 3, "เมย": 4, "พค": 5, "มิย": 6,
        "กค": 7, "สค": 8, "กย": 9, "ตค": 10, "พย": 11, "ธค": 12,
    };
    const day = Number(match?.[1] ?? thaiMonthMatch?.[1]);
    const month = match
        ? Number(match[2])
        : thaiMonths[String(thaiMonthMatch?.[2] ?? "").replace(/\./g, "")];
    const yearText = String(match?.[3] ?? thaiMonthMatch?.[3] ?? "");
    let year = Number(yearText);
    if (yearText.length === 2)
        year = year <= 39 ? 2000 + year : 1957 + year;
    if (year > 2400)
        year -= 543;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
        return null;
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function receiptTime(text) {
    // Receipt totals frequently contain decimals such as "3.14" (VAT). A
    // colon is the normal printed time separator, so it must win over decimal
    // numbers. Accept a dot only when OCR also read a time label beside it.
    const colonTime = [...text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].at(-1);
    if (colonTime)
        return `${colonTime[1].padStart(2, "0")}:${colonTime[2]}`;
    const labelledDotTime = [...text.matchAll(/(?:\u0e40\u0e27\u0e25\u0e32|TIME)\D{0,12}([01]?\d|2[0-3])\.([0-5]\d)\b/gi)].at(-1);
    return labelledDotTime
        ? `${labelledDotTime[1].padStart(2, "0")}:${labelledDotTime[2]}`
        : null;
}
function receiptReference(text) {
    return text.match(/\bR\d{8,}[A-Z0-9]*\b/i)?.[0] ??
        text.match(/(?:TRC\s*NUM|REFERENCE|TRANSACTION\s*ID|รหัสอ้างอิง)\s*[:#-]?\s*([A-Z0-9-]{5,})/i)?.[1] ??
        text.match(/(?:APPROVAL\s*CODE)\s*[:#-]?\s*([A-Z0-9-]{5,})/i)?.[1] ??
        null;
}
function parseReceiptDeterministic(rawText) {
    const text = cleanText(rawText);
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const items = receiptItems(lines);
    const merchant = knownMerchant(lines, text);
    const detectedTotal = receiptTotal(lines);
    // Copy only an explicitly anchored amount. Never manufacture a grand total
    // by summing or multiplying product rows.
    const total = detectedTotal;
    const date = receiptDate(text);
    const time = receiptTime(text);
    const reference = receiptReference(text);
    const category = receiptCategory(`${merchant ?? ""}\n${text}`);
    const populated = [merchant, total, date, time].filter((value) => value !== null).length;
    return {
        category,
        confidenceScore: Number(Math.min(0.97, 0.48 + populated * 0.12).toFixed(2)),
        currency: "THB",
        date,
        items,
        merchant,
        merchantName: merchant,
        parserSource: "deterministic-receipt-v5",
        reference,
        time,
        total,
        totalAmount: total,
    };
}
//# sourceMappingURL=deterministic-receipt.js.map