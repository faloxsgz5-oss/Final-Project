export type BankNotificationParsed = {
  type: 'income' | 'expense';
  amount: number;
  bank: string;
  accountPartial: string | null;
  description: string;
  occurredAt: string;
  confidence: number;
  rawText: string;
  deduplicationHash: string;
};

// Simple string hash function for deduplication
function generateHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
}

export function parseLineBankNotification(text: string): BankNotificationParsed | null {
  // Normalize text
  // Identify bank
  let bank = 'Unknown';
  if (text.match(/SCB|ไทยพาณิชย์|แม่มณี/i)) bank = 'SCB';
  else if (text.match(/KBANK|KBank|กสิกร|K PLUS/i)) bank = 'KBANK';
  else if (text.match(/KTB|กรุงไทย/i)) bank = 'KTB';
  else if (text.match(/BBL|กรุงเทพ/i)) bank = 'BBL';
  else if (text.match(/TTB|ทหารไทยธนชาต/i)) bank = 'TTB';

  // Identify type
  let type: 'income' | 'expense' | null = null;
  if (text.match(/เงินเข้า|รับเงิน|โอนเข้า|ได้รับเงิน/)) type = 'income';
  else if (text.match(/เงินออก|ถอน|โอนออก|ชำระ|จ่าย|โอนเงินสำเร็จ/)) type = 'expense';

  // Extract amount
  // Matches "1,234.56 บาท", "จำนวน 500.00", "5,000.00 THB"
  let amount = 0;
  const amountMatch = text.match(/(?:จำนวนเงิน|จำนวน|ยอดเงิน|Amount)?\\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{2})?)\\s*(?:บาท|THB)/i)
    || text.match(/([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{2})?)/);

  if (amountMatch && amountMatch[1]) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  }

  if (!type && !amount) return null; // No financial pattern detected

  // Extract account
  let accountPartial: string | null = null;
  const accMatch = text.match(/บัญชี(?:ออมทรัพย์)?\s*([xX\*\-\d]+)/)
    || text.match(/([xX\*]{2,}\d{3,4})/);
  if (accMatch && accMatch[1]) {
    accountPartial = accMatch[1];
  }

  // Extract date/time
  let occurredAt = new Date().toISOString();
  // We'll use current time as default if not parseable, but try to find it
  // Thai formats often look like 07/08/69 14:30 หรือ 07 ส.ค. 69 14:30
  const dateMatch = text.match(/(\d{1,2}\s*(?:\/|-|\.)\s*\d{1,2}\s*(?:\/|-|\.)\s*\d{2,4}\s*\d{1,2}:\d{2})/);
  if (dateMatch) {
    // If we could parse Thai date, we'd do it here. For now, keep current time for safety
    // or try standard parse if it's ISO like
  }

  // Calculate confidence
  let confidence = 0;
  if (type && amount > 0 && bank !== 'Unknown') confidence = 1.0;
  else if (type && amount > 0) confidence = 0.8;
  else if (amount > 0) confidence = 0.5;

  // If no type identified but we have an amount, guess based on keywords or default to income for safety (maybe unhandled)
  if (!type) type = 'income';

  // Generate hash
  const hashString = `${bank}-${type}-${amount}-${occurredAt.split('T')[0]}`;
  const deduplicationHash = generateHash(hashString);

  return {
    type,
    amount,
    bank,
    accountPartial,
    description: `LINE: ${bank} - ${type === 'income' ? 'เงินเข้า' : 'เงินออก'}`,
    occurredAt,
    confidence,
    rawText: text,
    deduplicationHash
  };
}
