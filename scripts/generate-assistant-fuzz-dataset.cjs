const fs = require('node:fs');
const path = require('node:path');

// Adapted from the user's data_generator_script.js. The original random
// generator was made deterministic and expanded with savings/investment
// language so regressions can be reproduced.
const intents = {
  schedule: {
    prefix: ['พรุ่งนี้', 'วันนี้', 'วันจันทร์', 'อาทิตย์หน้า', 'พน.', 'วน.', 'วีคหน้า'],
    action: ['มีเรียน', 'มีสอบ', 'อาจารย์นัด', 'หยุดป่าว', 'ตารางว่าง', 'มีกิจกรรม', 'จารย์ปล่อย'],
    suffix: ['กี่โมง', 'ไหม', 'ป่าววะ', 'วิชาอะไร', 'ตึกไหน', 'ช่วยเช็กหน่อย', 'ลืมไปแล้ว'],
    followUps: ['แล้วตอนบ่ายล่ะ', 'ถัดจากนั้นมีอะไรอีก', 'แล้ววันพรุ่งนี้ล่ะ'],
  },
  finance: {
    prefix: ['วันนี้', 'เดือนนี้', 'สัปดาห์นี้', 'วน.', 'เป๋าตัง', 'ตอนนี้'],
    action: ['เหลือเงิน', 'ใช้เงินไป', 'บันทึกค่าข้าว', 'งบหมด', 'เกินงบ', 'อยากเก็บเงิน', 'เริ่มลงทุน'],
    suffix: ['เท่าไหร่', 'กี่บาท', '50 บาท', 'สรุปให้ดูที', 'ยังไงดี', 'ให้ได้ 2000 บาท', 'เสี่ยงแค่ไหน'],
    followUps: ['แล้วเงินเก็บล่ะ', 'ถ้าใช้สามวันล่ะ', 'แล้วลงทุนได้ไหม'],
  },
  task_note: {
    prefix: ['สัปดาห์นี้', 'พรุ่งนี้', 'พน.', 'วีคนี้', 'จากโน้ต'],
    action: ['มีงานค้าง', 'ต้องส่งการบ้าน', 'จดโน้ตว่า', 'เตือนความจำ', 'เดดไลน์', 'งานกลุ่ม', 'ควรทบทวน'],
    suffix: ['วิชาอะไร', 'กี่ชิ้น', 'เสร็จยังวะ', 'ด่วนป่าว', 'ช่วยสรุปหน่อย', 'วันไหนนะ', 'เรื่องอะไรก่อน'],
    followUps: ['แล้วงานที่เหลือล่ะ', 'แล้วโน้ตล่าสุดล่ะ', 'ต่อจากเมื่อกี้ต้องทำอะไร'],
  },
};

const variations = ['perfect_thai', 'slang_and_abbreviations', 'typos', 'no_spaces', 'follow_up'];
let seed = 0x534d4152;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}
function pick(items) {
  return items[Math.floor(random() * items.length)];
}
function makeTypo(text) {
  const typoMap = {'ก': 'ด', 'ด': 'ร', 'น': 'ม', 'ม': 'น', 'ร': 'ด', 'เ': 'แ', 'ไ': 'ใ', 'ำ': 'า'};
  const chars = [...text];
  for (let index = 0; index < chars.length; index += 1) {
    if (typoMap[chars[index]]) {
      chars[index] = typoMap[chars[index]];
      break;
    }
  }
  return chars.join('');
}

function generateDataset(targetCount = 300) {
  const keys = Object.keys(intents);
  return Array.from({length: targetCount}, (_, index) => {
    const expectedIntent = keys[index % keys.length];
    const templates = intents[expectedIntent];
    const variation = variations[Math.floor(index / keys.length) % variations.length];
    const prefix = pick(templates.prefix);
    const action = pick(templates.action);
    const suffix = pick(templates.suffix);
    let text = `${prefix} ${action} ${suffix}`;
    if (variation === 'perfect_thai') text = `${text}ครับ`;
    if (variation === 'slang_and_abbreviations') text = `${prefix}${action}${suffix}อะ`;
    if (variation === 'typos') text = makeTypo(text);
    if (variation === 'no_spaces') text = text.replace(/\s+/g, '');
    if (variation === 'follow_up') text = pick(templates.followUps);
    return {expected_intent: expectedIntent, text: text.trim(), variation_type: variation};
  });
}

module.exports = {generateDataset};

if (require.main === module) {
  const output = path.join(__dirname, 'generated-assistant-fuzz.json');
  const dataset = generateDataset(300);
  fs.writeFileSync(output, JSON.stringify(dataset, null, 2), 'utf8');
  console.log(`Generated ${dataset.length} deterministic SmartLife language cases at ${output}`);
}
