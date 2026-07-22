export const RECEIPT_EXTRACTION_SYSTEM_PROMPT = `Act as an expert financial NLP engine and OCR receipt parser.

Analyze the supplied high-resolution receipt or bank-slip image together with the OCR text. Extract only details supported by the document.

CATEGORIZATION RULES
Choose exactly one category:
- Food: restaurants, fast food, cafes, bakeries, and local food stalls.
- Groceries: supermarkets, convenience stores, and fresh-food stores.
- Utilities: electricity, water, internet, telephone, and other monthly services.
- Transport: fuel, public transport, ride hailing, parking, and tollways.
- Entertainment: games, cinemas, streaming subscriptions, and leisure.
- Shopping: clothes, electronics, general merchandise, and online shopping.
- Others: anything that does not fit the categories above.

PROCESSING RULES
1. Extract the merchant or payee name exactly as visibly printed. On payment-success screenshots, the merchant/payee is the destination shown after the transfer arrow, not the sender, status text, phone status bar, or wallet ID. Never return garbled punctuation or status-bar characters as the merchant name.
2. Extract the final amount actually paid. Ignore balances, account numbers, change, discounts, subtotals, and reference numbers.
   On payment-success slips, labels such as \"amount paid\", \"paid amount\", or \"\u0e08\u0e33\u0e19\u0e27\u0e19\u0e40\u0e07\u0e34\u0e19\u0e17\u0e35\u0e48\u0e0a\u0e33\u0e23\u0e30\" are authoritative. Accept whole-Baht amounts such as \"16 \u0e1a\u0e32\u0e17\" as well as decimal amounts.
3. Return the transaction date as YYYY-MM-DD. Thai Buddhist Era years must be converted to Gregorian years. If no date is visible, use the supplied current Bangkok date.
4. Use item details and merchant context together when selecting a category.
5. Extract every visibly purchased product in reading order. Inspect the entire receipt from the first product row through the row immediately before Item(s), Total, or payment. Do not stop after the first product. Product name, barcode, quantity, unit price, line total, and later discount rows may be split across several OCR lines; bind them by visual proximity and matching product names.
6. Return ONLY purchased products in items. Never create items from Total, VAT, payment, QR payment, discount/promotion, reference, change, questionnaire/survey, download, exchange/refund, footer, or loyalty-message rows.
7. A discount row belongs to the matching purchased product, not to a new item. Return discount as a positive Baht amount. Set totalPrice to the FINAL NET line price after all discounts. When quantity is known, set unitPrice to the final net price per unit. If there is no discount, return discount as null.
8. If quantity is not visibly printed for a genuine product, use quantity 1. Never invent a product.
   Lines containing only quantity and per-unit metadata, such as \"2.0000 1.00/PCS\", are not products and must never appear as item names.
   Payment slips are a single financial transaction, not an itemized receipt; return an empty items array unless actual purchased-product rows are visibly present.
9. Verify totalAmount against the net item list when possible, but always prefer the clearly labelled final paid total printed on the receipt.
10. confidenceScore must reflect confidence in the complete extraction and be between 0 and 1.
11. Return only the JSON object required by the response schema.`;

const CATEGORY_VALUES = [
  "Food",
  "Groceries",
  "Utilities",
  "Transport",
  "Entertainment",
  "Shopping",
  "Others",
] as const;

export type ReceiptCategory = typeof CATEGORY_VALUES[number];

export type GeminiReceiptResult = {
  category: ReceiptCategory;
  confidenceScore: number;
  date: string;
  items: {
    discount: number | null;
    name: string;
    quantity: number | null;
    totalPrice: number;
    unitPrice: number | null;
  }[];
  merchantName: string | null;
  totalAmount: number | null;
};

type GeminiInteractionResponse = {
  error?: {message?: string};
  steps?: {
    content?: {text?: string; type?: string}[];
    type?: string;
  }[];
};

const RECEIPT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    merchantName: {type: ["string", "null"]},
    totalAmount: {type: ["number", "null"], minimum: 0},
    date: {type: "string"},
    category: {type: "string", enum: CATEGORY_VALUES},
    confidenceScore: {type: "number", minimum: 0, maximum: 1},
    items: {
      type: "array",
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          discount: {type: ["number", "null"], minimum: 0},
          name: {type: "string"},
          quantity: {type: ["number", "null"], minimum: 0},
          unitPrice: {type: ["number", "null"], minimum: 0},
          totalPrice: {type: "number", minimum: 0},
        },
        required: ["discount", "name", "quantity", "unitPrice", "totalPrice"],
      },
    },
  },
  required: ["merchantName", "totalAmount", "date", "category", "confidenceScore", "items"],
} as const;

function parseImageDataUrl(imageDataUrl: string) {
  const match = imageDataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) throw new Error("Gemini requires a valid base64 image data URL.");
  return {data: match[2].replace(/\s+/g, ""), mimeType: match[1]};
}

function interactionOutputText(response: GeminiInteractionResponse) {
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
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function normalizeDate(value: unknown, fallback: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day
    ? value
    : fallback;
}

function normalizeResult(value: unknown, fallbackDate: string): GeminiReceiptResult {
  if (!value || typeof value !== "object") throw new Error("Gemini returned an invalid receipt payload.");
  const payload = value as Record<string, unknown>;
  const rawMerchantName = typeof payload.merchantName === "string"
    ? payload.merchantName.replace(/\s+/g, " ").trim().slice(0, 160)
    : "";
  const merchantName = rawMerchantName &&
    /[A-Za-z\u0e00-\u0e7f]{2,}/u.test(rawMerchantName) &&
    !/[!@#$%^&*()_+={}\[\]<>?]{3,}/.test(rawMerchantName)
    ? rawMerchantName
    : null;
  const amount = typeof payload.totalAmount === "number" ? payload.totalAmount : Number(payload.totalAmount);
  const category = CATEGORY_VALUES.includes(payload.category as ReceiptCategory)
    ? payload.category as ReceiptCategory
    : "Others";
  const confidence = Number(payload.confidenceScore);
  const nonProductText = /(?:\b(?:TOTAL|SUBTOTAL|VAT|VATABLE|PAYMENT|APPROVAL|REFERENCE|CHANGE|DISCOUNT|QUESTIONNAIRE|SURVEY|DOWNLOAD|EXCHANGE|REFUND)\b|\u0e2a\u0e48\u0e27\u0e19\u0e25\u0e14|\u0e41\u0e1a\u0e1a\u0e2a\u0e2d\u0e1a\u0e16\u0e32\u0e21|\u0e23\u0e48\u0e27\u0e21\u0e15\u0e2d\u0e1a|\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14)/i;
  const quantityMetadataOnly = /^\s*\d+(?:\.\d+)?\s*(?:@|x)?\s*\d+(?:\.\d+)?\s*\/?\s*(?:pcs?|ea|ชิ้น)?\s*$/i;
  const items = Array.isArray(payload.items) ? payload.items.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const item = value as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name.replace(/\s+/g, " ").trim().slice(0, 180) : "";
    const quantity = item.quantity === null ? 1 : Number(item.quantity);
    const rawUnitPrice = item.unitPrice === null ? null : Number(item.unitPrice);
    const totalPrice = Number(item.totalPrice);
    const discount = item.discount === null ? null : Number(item.discount);
    if (
      !name || nonProductText.test(name) || quantityMetadataOnly.test(name) ||
      /^(?:(?:\u0e25\u0e14|\u0e2a\u0e48\u0e27\u0e19\u0e25\u0e14)\s*|(?:disc(?:ount)?|promo(?:tion)?)\b)/i.test(name) ||
      !Number.isFinite(totalPrice) || totalPrice < 0
    ) return [];
    const normalizedQuantity = typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0
      ? quantity
      : 1;
    const unitPrice = typeof rawUnitPrice === "number" && Number.isFinite(rawUnitPrice) && rawUnitPrice >= 0
      ? Number(rawUnitPrice.toFixed(2))
      : Number((totalPrice / normalizedQuantity).toFixed(2));
    return [{
      discount: typeof discount === "number" && Number.isFinite(discount) && discount > 0 ? Number(discount.toFixed(2)) : null,
      name,
      quantity: normalizedQuantity,
      totalPrice: Number(totalPrice.toFixed(2)),
      unitPrice,
    }];
  }).slice(0, 200) : [];
  return {
    category,
    confidenceScore: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    date: normalizeDate(payload.date, fallbackDate),
    items,
    merchantName,
    totalAmount: Number.isFinite(amount) && amount >= 0 ? Number(amount.toFixed(2)) : null,
  };
}

export async function extractReceiptWithGemini(rawText: string, apiKey: string, imageDataUrl: string) {
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
      system_instruction: RECEIPT_EXTRACTION_SYSTEM_PROMPT,
      input: [
        {
          type: "text",
          text: `Current Bangkok date: ${currentBangkokDate}\n\nOCR text (may contain recognition errors; prefer visible image evidence):\n${rawText.slice(0, 30000)}`,
        },
        {
          type: "image",
          data: image.data,
          mime_type: image.mimeType,
          resolution: "high",
        },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: RECEIPT_SCHEMA,
      },
      generation_config: {temperature: 0},
    }),
  });

  const payload = await response.json() as GeminiInteractionResponse;
  if (!response.ok) throw new Error(payload.error?.message ?? `Gemini request failed with ${response.status}.`);
  const outputText = interactionOutputText(payload);
  if (!outputText) throw new Error("Gemini returned no structured receipt output.");
  return normalizeResult(JSON.parse(outputText) as unknown, currentBangkokDate);
}
