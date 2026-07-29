export type ReceiptItem = {
  discount: number | null;
  name: string;
  quantity: number | null;
  totalPrice: number | null;
  unitPrice: number | null;
};

const NON_PRODUCT_ITEM = /(?:\b(?:TOTAL|SUBTOTAL|VAT|VATABLE|PAYMENT|APPROVAL|REFERENCE|CHANGE|DISCOUNT|QUESTIONNAIRE|SURVEY|DOWNLOAD|EXCHANGE|REFUND|CASHIER|OPERATOR)\b|\u0e2a\u0e48\u0e27\u0e19\u0e25\u0e14|\u0e41\u0e1a\u0e1a\u0e2a\u0e2d\u0e1a\u0e16\u0e32\u0e21|\u0e23\u0e48\u0e27\u0e21\u0e15\u0e2d\u0e1a|\u0e14\u0e32\u0e27\u0e19\u0e4c\u0e42\u0e2b\u0e25\u0e14|\u0e22\u0e2d\u0e14\u0e23\u0e27\u0e21|\u0e22\u0e2d\u0e2a\u0e38\u0e17\u0e18\u0e34|\u0e22\u0e2d\u0e14\u0e0a\u0e33\u0e23\u0e30|\u0e40\u0e07\u0e34\u0e19\u0e17\u0e2d\u0e19|\u0e40\u0e1b\u0e25\u0e35\u0e48\u0e22\u0e19\s*\/\s*\u0e04\u0e37\u0e19)/i;

function isProductName(name: string) {
  const isDiscount = /^(?:(?:\u0e25\u0e14|\u0e2a\u0e48\u0e27\u0e19\u0e25\u0e14)|(?:disc(?:ount)?|promo(?:tion)?)\b)/i.test(name);
  return isDiscount || /[A-Za-z\u0e00-\u0e7f]{2,}/u.test(name) &&
    !NON_PRODUCT_ITEM.test(name) &&
    !/^(?:(?:\u0e25\u0e14|\u0e2a\u0e48\u0e27\u0e19\u0e25\u0e14)\s*|(?:disc(?:ount)?|promo(?:tion)?)\b)/i.test(name);
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number"
    ? value
    : Number(String(value).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(2)) : null;
}

function optionalSignedNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number"
    ? value
    : Number(String(value).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? Number(number.toFixed(2)) : null;
}

export function normalizeReceiptItems(value: unknown): ReceiptItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const name = String(item.name ?? item.description ?? "").replace(/\s+/g, " ").trim();
    const totalPrice = optionalSignedNumber(item.totalPrice ?? item.amount ?? item.price);
    const quantity = optionalNumber(item.quantity ?? item.qty) ?? 1;
    const discount = optionalNumber(item.discount ?? item.discountAmount);
    const unitPrice = optionalNumber(item.unitPrice) ??
      (totalPrice !== null && quantity > 0 ? Number((totalPrice / quantity).toFixed(2)) : null);
    if (!name || !isProductName(name)) return [];
    return [{
      discount: discount !== null && discount > 0 ? discount : null,
      name: name.slice(0, 180),
      quantity,
      totalPrice,
      unitPrice,
    }];
  }).slice(0, 80);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function money(value: unknown) {
  const number = optionalSignedNumber(value);
  return number === null
    ? "-"
    : new Intl.NumberFormat("th-TH", {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(number);
}

export function buildReceiptHtml({
  category,
  date,
  items: rawItems,
  merchant,
  reference,
  time,
  total,
}: {
  category?: unknown;
  date?: unknown;
  items?: unknown;
  merchant?: unknown;
  reference?: unknown;
  time?: unknown;
  total?: unknown;
}) {
  const items = normalizeReceiptItems(rawItems);
  const itemRows = items.length
    ? items.map((item, index) => `
      <tr>
        <td class="index">${index + 1}</td>
        <td><strong>${escapeHtml(item.name)}</strong>${item.quantity !== null ? `<small>${escapeHtml(item.quantity)} x ${money(item.unitPrice)}</small>` : ""}${item.discount !== null ? `<small class="discount">\u0e25\u0e14 \u0e3f${money(item.discount)}</small>` : ""}</td>
        <td class="amount">${money(item.totalPrice)}</td>
      </tr>`).join("")
    : `<tr><td class="empty" colspan="3">\u0e44\u0e21\u0e48\u0e1e\u0e1a\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e43\u0e19\u0e20\u0e32\u0e1e</td></tr>`;
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:#f1f4ed;color:#2c341b;font-family:Prompt,"Noto Sans Thai",Arial,sans-serif}.receipt{max-width:620px;margin:auto;background:#fff;border:1px solid #dfe7da;border-radius:18px;overflow:hidden;box-shadow:0 18px 42px rgba(44,52,27,.12)}header{padding:24px;background:linear-gradient(135deg,#6f8f6d,#849f80);color:#fff}header span{font-size:12px;font-weight:700;opacity:.82}h1{margin:5px 0 2px;font-size:25px}header p{margin:0;font-size:13px;opacity:.9}.meta{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#e7ece3}.meta div{padding:13px 16px;background:#f9faf7}.label{display:block;color:#858b80;font-size:11px;margin-bottom:3px}.value{font-size:13px;font-weight:700;word-break:break-word}.items{padding:18px 16px}h2{font-size:15px;margin:0 0 10px}table{width:100%;border-collapse:collapse}th{padding:8px 6px;border-bottom:2px solid #dfe7da;color:#6f8f6d;font-size:11px;text-align:left}td{padding:11px 6px;border-bottom:1px solid #edf0ea;font-size:12px;vertical-align:top}.index{width:28px;color:#858b80}.amount{text-align:right;white-space:nowrap;font-weight:700}small{display:block;margin-top:3px;color:#858b80;font-weight:400}.discount{color:#6f8f6d;font-weight:700}.empty{text-align:center;color:#858b80;padding:24px}.total{display:flex;align-items:center;justify-content:space-between;margin:0 16px 18px;padding:16px;border-radius:13px;background:#eef3eb}.total span{font-size:13px;font-weight:700}.total strong{font-size:24px}.footer{padding:0 16px 20px;color:#858b80;font-size:10px;text-align:center}@media(max-width:420px){body{padding:0}.receipt{min-height:100vh;border:0;border-radius:0}.meta{grid-template-columns:1fr}}
</style></head><body><article class="receipt">
<header><span>SMARTLIFE OCR RECEIPT</span><h1>${escapeHtml(merchant || "\u0e44\u0e21\u0e48\u0e23\u0e30\u0e1a\u0e38\u0e23\u0e49\u0e32\u0e19\u0e04\u0e49\u0e32")}</h1><p>${escapeHtml(category || "Others")}</p></header>
<section class="meta"><div><span class="label">\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48 / \u0e40\u0e27\u0e25\u0e32</span><span class="value">${escapeHtml([date, time].filter(Boolean).join(" ") || "-")}</span></div><div><span class="label">\u0e23\u0e2b\u0e31\u0e2a\u0e2d\u0e49\u0e32\u0e07\u0e2d\u0e34\u0e07</span><span class="value">${escapeHtml(reference || "-")}</span></div></section>
<section class="items"><h2>\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32</h2><table><thead><tr><th>#</th><th>\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23</th><th class="amount">\u0e23\u0e32\u0e04\u0e32 (\u0e1a\u0e32\u0e17)</th></tr></thead><tbody>${itemRows}</tbody></table></section>
<section class="total"><span>\u0e22\u0e2d\u0e14\u0e23\u0e27\u0e21</span><strong>\u0e3f${money(total)}</strong></section>
<footer class="footer">\u0e2a\u0e23\u0e49\u0e32\u0e07\u0e08\u0e32\u0e01\u0e1c\u0e25 OCR \u0e17\u0e35\u0e48\u0e1c\u0e39\u0e49\u0e43\u0e0a\u0e49\u0e15\u0e23\u0e27\u0e08\u0e2a\u0e2d\u0e1a\u0e41\u0e25\u0e49\u0e27</footer>
</article></body></html>`;
}
