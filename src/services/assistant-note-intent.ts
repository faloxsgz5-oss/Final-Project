export function isNoteLookupIntent(message: string) {
  const normalized = message.normalize('NFC').trim();
  const explicitlyCreatesNote =
    /^(?:ช่วย)?\s*(?:(?:เพิ่ม|สร้าง|บันทึก|จด)\s*(?:โน้ต|โน๊ต|note|บันทึก)?|(?:โน้ต|โน๊ต)\s*ไว้)(?:\s*(?:ให้|ว่า|เรื่อง|หน่อย|ที))*\s*.+/i
      .test(normalized);
  if (explicitlyCreatesNote) return false;
  return /(?:(?:มี|ดู|เช็ก|ตรวจ|ค้น|หา|เปิด|ทวน|อ่าน|สรุป|บอก).*(?:โน้ต|โน๊ต|บันทึก)|(?:โน้ต|โน๊ต|บันทึก).*(?:อะไรบ้าง|ล่าสุด|เรื่อง|เกี่ยวกับ|คืออะไร|เขียนว่า|ว่าอะไร|ที่จด|เมื่อวาน|วันนี้|เนื้อหา))/i
    .test(message);
}

export function noteLookupTerms(message: string) {
  const cleaned = message
    .normalize('NFC')
    .toLowerCase()
    .replace(/[?？!！.,]/g, ' ')
    .replace(/(?:ช่วย|ขอ|อยาก|ฉัน|ผม|เรา|ให้|หน่อย|ที|ครับ|ค่ะ|คับ|ทีนะ)/g, ' ')
    .replace(/(?:มี|ดู|เช็ก|เช็ค|ตรวจ|ค้นหา|ค้น|หา|เปิด|ทวน|อ่าน|สรุป|บอก)/g, ' ')
    .replace(/(?:โน้ต|โน๊ต|note|notes|บันทึก|ที่จดไว้|จดไว้)/gi, ' ')
    .replace(/(?:อะไรบ้าง|ล่าสุด|เกี่ยวกับ|เรื่อง|คืออะไร|เขียนว่าอะไร|เขียนว่า|ว่าอะไร|เนื้อหา|ของ)/g, ' ')
    .replace(/(?:การเรียน|ไอเดีย|ส่วนตัว|หมวดงาน|งาน)/g, ' ')
    .replace(/(?:เมื่อวาน|วันนี้|เมื่อกี้|ก่อนหน้านี้)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...new Set(cleaned.split(' ').filter((term) => term.length >= 2))].slice(0, 5);
}
