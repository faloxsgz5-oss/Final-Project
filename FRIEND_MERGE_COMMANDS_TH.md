# คำสั่งสำหรับเพื่อน: รวมงาน KIM เข้าโปรเจกต์ SmartLife

ไฟล์นี้ทำไว้ให้เพื่อนหรือ AI ของเพื่อนใช้หลัง `git clone` เพื่อดึงส่วนที่ KIM แก้ไว้ เช่น AI Dynamic, AI Assistant context, LINE/Bank finance import, Firebase Functions และ rules โดยไม่ push ทับ repo ของเพื่อนโดยตรง

## สรุป branch ที่ต้องใช้

- repo เพื่อน: `https://github.com/faloxsgz5-oss/Final-Project.git`
- repo KIM: `https://github.com/konpong2006-pixel/Final-Project-KIKIM.git`
- branch รวมงานที่พร้อมใช้: `codex/merge-kim-updates-into-friend`
- commit merge ล่าสุด: `11ddbe2`

## วิธีที่ง่ายที่สุด: clone แล้ว checkout branch รวมงาน

เปิด CMD หรือ PowerShell แล้วรัน:

```powershell
git clone https://github.com/faloxsgz5-oss/Final-Project.git
cd Final-Project
git remote add kim https://github.com/konpong2006-pixel/Final-Project-KIKIM.git
git fetch kim codex/merge-kim-updates-into-friend
git switch -c test-kim-merged kim/codex/merge-kim-updates-into-friend
npm install
npm --prefix functions install
npm run typecheck
npm --prefix functions run build
npm run test:line-import
```

ถ้าทุกอย่างผ่าน เพื่อนจะอยู่บน branch `test-kim-merged` ที่มีทั้งงานของเพื่อนและงานของ KIM รวมไว้แล้ว

## ถ้าต้องการ merge เข้ากับ branch งานของเพื่อน

ให้ทำหลังจาก clone และ fetch remote `kim` แล้ว:

```powershell
git switch agent/sync-complete-smartlife-system
git merge --no-ff kim/codex/merge-kim-updates-into-friend
npm run typecheck
npm --prefix functions run build
npm run test:line-import
```

ถ้าผ่านแล้วค่อย push เป็น branch ใหม่ของเพื่อน เช่น:

```powershell
git switch -c final-with-kim-updates
git push origin final-with-kim-updates
```

ห้ามใช้คำสั่งนี้ถ้ายังไม่ได้ตกลงกัน เพราะจะเสี่ยงทับงานหลัก:

```powershell
git push origin main
git push origin master
git push --force
```

## มีไฟล์อะไรจากฝั่ง KIM ที่สำคัญบ้าง

- `src/services/dynamic-insights.ts` — คำนวณ AI Dynamic เช่น burnout และ finance budget insight
- `src/services/assistant-tools.ts` — ส่ง dynamic context ให้ AI Assistant และตอบคำถาม burnout/งบรายเดือน
- `functions/src/line-import.ts` — Firebase Functions สำหรับ LINE/Bank finance import
- `src/services/line-import-service.ts` — ฝั่งแอปสำหรับรับแจ้งเตือน LINE/ธนาคารและ sync ไป Firebase
- `modules/smartlife-line-listener/` — native module Android สำหรับอ่าน notification/share จาก LINE
- `firestore.rules` — เพิ่ม rules สำหรับ LINE transaction/pending review/profile consent
- `docs/line-bank-import.md` — อธิบาย flow ระบบนำเข้าธุรกรรมจาก LINE/ธนาคาร
- `scripts/test-line-bank-parser.mjs` — test parser ของ LINE/Bank notification

## สถานะที่ KIM ทดสอบแล้ว

ตอนรวม branch นี้ผ่านแล้ว:

```powershell
npm run typecheck
npm --prefix functions run build
npm run test:line-import
```

ผล test LINE parser: `11 checks passed`

## ถ้าเจอ Firebase permission denied

ให้ตรวจ 3 จุดนี้ก่อน:

1. login อยู่ใน Firebase project `smartlife-budget` หรือยัง
2. deploy `firestore.rules` และ `functions` ล่าสุดหรือยัง
3. App Check debug token ของเครื่องนั้นถูกเพิ่มใน Firebase หรือยัง

คำสั่ง deploy เฉพาะส่วนที่เกี่ยวกับ KIM:

```powershell
npx firebase deploy --only firestore:rules --project smartlife-budget
npx firebase deploy --only functions --project smartlife-budget
```

ควร deploy เฉพาะเมื่อมีสิทธิ์ใน Firebase project และทีมตกลงกันแล้ว

