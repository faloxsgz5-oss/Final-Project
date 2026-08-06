# SmartLife Handoff README

README นี้เขียนไว้สำหรับส่งไม้ต่อให้ Codex หรือผู้พัฒนาคนถัดไปทำงานต่อได้ทันที โดยเฉพาะกรณีต้องเปลี่ยน email ใน Codex หรือ context เดิมหายไป

## สถานะล่าสุดแบบสั้น

- โปรเจกต์อยู่ที่ `C:\Users\konpo\Downloads\Final-Project`
- แอปเป็น Expo SDK 57 + React Native + Firebase
- Firebase จริงที่ใช้คือ `smartlife-budget`
- Android package คือ `com.smartlife.student`
- branch ปัจจุบันคือ `codex/smartlife-updates`
- ห้าม push ไป `origin` เพราะเป็น GitHub ของเพื่อน
- ให้ push ไป remote `personal` เท่านั้น
- APK ล่าสุดอยู่ที่ `C:\Users\konpo\Downloads\Final-Project\SmartLife-latest.apk`
- APK ล่าสุดถูกติดตั้งเข้า MuMu แล้วเมื่อ `2026-08-01 03:26:35`
- SHA256 ของ APK ล่าสุดคือ `E82BBF1934D74DBB6055F5A12E9C271201F05F34232B2DBE49B18361A9A49081`

## GitHub ที่ต้องระวังมาก

Remote ตอนนี้มี 2 ตัว:

```powershell
origin   https://github.com/faloxsgz5-oss/Final-Project.git
personal https://github.com/konpong2006-pixel/Final-Project-KIKIM.git
```

`origin` คือ repo ของเพื่อน ห้าม push ทับ

ถ้าจะอัปเดต GitHub ของผู้ใช้ ให้ใช้:

```powershell
git push personal codex/smartlife-updates
```

อย่าใช้:

```powershell
git push origin ...
```

ก่อน push ให้เช็คทุกครั้ง:

```powershell
git remote -v
git branch --show-current
git status --short
```

## วิธีเปิดโปรเจกต์

```powershell
cd C:\Users\konpo\Downloads\Final-Project
npm install
npm --prefix functions install
npm start
```

ถ้าใช้ development build:

```powershell
npm run android
```

ถ้าต้องเปิดผ่าน tunnel:

```powershell
npm run start:tunnel
```

Expo Go ใช้ทดสอบได้จำกัด เพราะโปรเจกต์มี native modules เช่น Google Sign-In, voice, notification listener และ LINE listener

## Environment

ใช้ `.env.local` สำหรับ config จริง

ไฟล์ `.env.local` มีค่า Firebase ของโปรเจกต์ `smartlife-budget` อยู่แล้วในเครื่องนี้ อย่า commit ไฟล์นี้ขึ้น Git

ค่าหลักที่ต้องมี:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=smartlife-budget.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=smartlife-budget
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=smartlife-budget.firebasestorage.app
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=302211453614
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID=...
EXPO_PUBLIC_SMARTLIFE_DEMO=false
```

แอปนี้เป็นแอปจริง ไม่ใช่ demo

## คำสั่งทดสอบสำคัญ

```powershell
npm run typecheck
npm run test:line-import
npm run test:dashboard-prioritization
npm --prefix functions run build
```

สถานะล่าสุด:

- `npm run typecheck` ผ่าน
- `npm run test:line-import` ผ่าน 10 checks
- `npm --prefix functions run build` ผ่าน

## วิธี build APK

Build release APK ด้วย Gradle:

```powershell
cd C:\Users\konpo\Downloads\Final-Project\android
.\gradlew.bat assembleRelease
```

APK ที่ build ได้จะอยู่ที่:

```text
C:\Users\konpo\Downloads\Final-Project\android\app\build\outputs\apk\release\app-release.apk
```

หลัง build ให้ copy มาเป็นไฟล์หลัก:

```powershell
Copy-Item -LiteralPath "C:\Users\konpo\Downloads\Final-Project\android\app\build\outputs\apk\release\app-release.apk" -Destination "C:\Users\konpo\Downloads\Final-Project\SmartLife-latest.apk" -Force
```

เช็ค hash:

```powershell
Get-FileHash -Algorithm SHA256 "C:\Users\konpo\Downloads\Final-Project\SmartLife-latest.apk"
```

## วิธีติดตั้ง APK เข้า MuMu

MuMu adb อยู่ที่:

```text
C:\Program Files\Netease\MuMuPlayer\nx_device\12.0\shell\adb.exe
```

เชื่อม MuMu:

```powershell
& "C:\Program Files\Netease\MuMuPlayer\nx_device\12.0\shell\adb.exe" connect 127.0.0.1:16384
```

ติดตั้งทับตัวเดิม:

```powershell
& "C:\Program Files\Netease\MuMuPlayer\nx_device\12.0\shell\adb.exe" -s 127.0.0.1:16384 install -r "C:\Users\konpo\Downloads\Final-Project\SmartLife-latest.apk"
```

เปิดแอป:

```powershell
& "C:\Program Files\Netease\MuMuPlayer\nx_device\12.0\shell\adb.exe" -s 127.0.0.1:16384 shell monkey -p com.smartlife.student -c android.intent.category.LAUNCHER 1
```

เช็คว่าแอปติดตั้งล่าสุด:

```powershell
& "C:\Program Files\Netease\MuMuPlayer\nx_device\12.0\shell\adb.exe" -s 127.0.0.1:16384 shell dumpsys package com.smartlife.student | Select-String -Pattern "versionCode|versionName|lastUpdateTime"
```

## สถานะ Firebase ที่สำคัญ

Firebase project จริงคือ:

```text
smartlife-budget
```

Cloud Functions region:

```text
asia-southeast1
```

ระบบ LINE import ฝั่งแอปทำแล้ว แต่ backend production ยังต้อง deploy Functions/rules/indexes ขึ้น Firebase จริง

ถ้ายังไม่ deploy จะเกิดอาการ:

```text
Firebase callable not-found
```

โดยเฉพาะ function:

```text
updateLineConsent
```

APK ล่าสุดแก้แล้วไม่ให้ popup ดิบ ๆ เป็น `not-found` แต่จะแจ้งว่าเปิดสิทธิ์ในเครื่องแล้ว แต่ Firebase Functions ยังรอ deploy

## คำสั่ง deploy Firebase สำหรับ LINE import

การ deploy นี้เป็นการเปลี่ยน backend จริงและ Firestore security rules จริง ต้องได้รับอนุญาตจากผู้ใช้ก่อนเสมอ

คำสั่ง deploy เฉพาะระบบ LINE:

```powershell
npx.cmd -y firebase-tools@latest deploy --project smartlife-budget --only functions:updateLineConsent,functions:reportLineListenerStatus,functions:enqueueLinePendingReview,functions:confirmLineTransaction,functions:rejectLinePendingReview,functions:cleanupExpiredLinePendingReviews,firestore:rules,firestore:indexes
```

ถ้าต้องใช้ Claude fallback สำหรับอ่านข้อความธนาคารแบบที่ parser deterministic อ่านไม่ได้ ให้ตั้ง secret นี้ด้วย:

```powershell
npx.cmd -y firebase-tools@latest functions:secrets:set ANTHROPIC_API_KEY --project smartlife-budget
```

ถ้าไม่มี `ANTHROPIC_API_KEY` ระบบ parser หลักยังทำงานได้ แต่ fallback AI จะยังใช้ไม่ได้

## LINE Bank Import ทำงานยังไง

ไฟล์หลัก:

```text
src/screens/native/user/line-import-screen.tsx
src/services/line-import-service.ts
src/services/line-transaction-parser-core.ts
src/services/line-transaction-parser.ts
functions/src/line-import.ts
modules/smartlife-line-listener
docs/line-bank-import.md
```

Flow หลัก:

1. ผู้ใช้เปิดโหมดรับแจ้งเตือน LINE ในหน้า LINE การเงิน
2. Android บังคับให้ผู้ใช้กดอนุญาต Notification Access เอง
3. native module อ่านเฉพาะ notification จาก package `jp.naver.line.android`
4. ระบบกรองเฉพาะข้อความที่มีสัญญาณจำนวนเงิน
5. ข้อความถูกเก็บชั่วคราวในเครื่องแบบ encrypted queue
6. แอป parse เป็นรายการรอตรวจ
7. ผู้ใช้ต้องกดยืนยันเองก่อนบันทึกลงการเงินจริง
8. ข้อความดิบไม่ถูกเก็บใน transaction หลังยืนยัน

ข้อจำกัด:

- Android ไม่อนุญาตให้แอปเปิด Notification Access ให้เองแบบเงียบ ๆ
- LINE ต้องแสดง preview ข้อความใน notification
- ถ้าผู้ใช้ซ่อนเนื้อหาแจ้งเตือน ระบบอ่านจำนวนเงินไม่ได้
- iOS ใช้ auto notification listener แบบนี้ไม่ได้

## สิ่งที่แก้ล่าสุดในระบบ LINE

1. หน้า “นำเข้าจาก LINE” ถูกปรับให้ไม่เหมือนผู้ใช้ต้องสอนระบบเอง
2. หน้าแรกเปลี่ยนเป็นแนว “รับเงินจาก LINE” และชู auto mode เป็นหลัก
3. ช่องวางข้อความถูกลดบทบาทเป็นทางเลือกสำรอง
4. ถ้า Firebase Functions ยังไม่ deploy แอปจะไม่โชว์ error ดิบ `not-found`
5. APK ใหม่ถูก build และติดตั้งเข้า MuMu แล้ว

## AI Dynamic ทำงานยังไง

ไฟล์ที่เกี่ยวข้องหลัก:

```text
src/dashboard/scoringEngine.ts
src/services/smartlife-recommendations.ts
src/screens/native/user/dashboard-screen.tsx
src/screens/native/user/activity-form-screen.tsx
src/screens/native/user/note-form-screen.tsx
scripts/test-line-bank-parser.mjs
src/dashboard/__tests__/run-dashboard-tests.mjs
```

AI Dynamic ในแอปตอนนี้เป็น scoring/recommendation engine ที่ใช้ข้อมูลจริงใน Firebase ของผู้ใช้ เช่น:

- ตารางเรียน
- งาน/กิจกรรม
- โน้ตที่เป็นหมวดงานหรือเรียน
- วันครบกำหนด
- ความเร่งด่วน
- เวลาว่างในวันนั้น
- ข้อมูลการเงินของวัน/เดือน

แนวคิดการจัดความสำคัญ:

- ใกล้ deadline มากขึ้น คะแนนสูงขึ้น
- งานที่ถูกเลือกความสำคัญสูง คะแนนสูงขึ้น
- งานที่เลยกำหนดหรือควรเริ่มแล้ว ถูกดันขึ้นก่อน
- สิ่งที่อยู่ในหมวดงานต้องถูกนับเป็นงาน ไม่ว่าจะมาจาก note หรือ activity
- ตารางเรียนใช้สร้างบริบทว่าวันว่างตอนไหน
- เงินและงบใช้ช่วยเตือนสถานะการเงิน ไม่ใช่ตัวตัดสินงานหลัก

สิ่งที่เคยปรับ:

- ปรับให้โน้ตหมวดงานถูกนับเป็นงานใน AI Assistant/Dashboard
- เพิ่มข้อมูลจำลองเพื่อทดสอบ AI Dynamic
- เพิ่มคำอธิบายการ test แบบคนใช้งานจริง
- เพิ่มระบบแจ้งเตือน deadline/ใกล้กำหนด
- ปรับบาง input สำคัญให้ใช้การกดเลือกแทนการพิมพ์ เช่น วันที่และความสำคัญ

## วิธี test AI Dynamic แบบไม่ต้องเขียนโค้ด

ใช้บัญชีจริงใน MuMu หรือมือถือจริง แล้วเพิ่มข้อมูลเองในแอป:

1. เพิ่มตารางเรียนวันนี้ 2-3 วิชา
2. เพิ่มงานที่ครบกำหนดวันนี้ 1 งาน
3. เพิ่มงานที่ครบกำหนดพรุ่งนี้ 1 งาน
4. เพิ่มโน้ตหมวด “งาน” แล้วใส่รายละเอียดเหมือนเป็น assignment
5. เพิ่มโน้ตหมวด “เรียน” เช่น สรุปบทเรียน
6. เพิ่มรายจ่ายวันนี้ เช่น BTS, อาหาร, เอกสาร
7. กลับหน้าแรกแล้วดู “AI จัดลำดับวันนี้”
8. ถาม AI Assistant ว่า “วันนี้มีงานไหม”
9. เช็คว่างานจาก note หมวดงานต้องขึ้นด้วย
10. เช็คว่างานใกล้กำหนดต้องมาก่อนงานทั่วไป

ผลที่ควรเห็น:

- Dashboard ไม่ควรบอกว่าวันนี้ไม่มีงานถ้ามี note/activity ที่เป็นหมวดงาน
- งานด่วนควรอยู่บนสุด
- รายการเรียนควรแสดงในตารางวันนี้
- การเงินควรคำนวณจาก transaction จริงใน Firebase

## ข้อมูลจำลองที่ใช้ทดสอบได้

ตัวอย่าง schedule:

- `DATABASE QUIZ`, เวลา 13:00, สถานที่ Lab 3
- `IST201506 HOLISTIC HEALTH`, เวลา 15:00, สถานที่ห้องเรียนรวม
- `PROJECT IN DIGITAL TECHNOLOGY I`, เวลา 15:00, สถานที่ B4101

ตัวอย่าง task/activity:

- `อ่านหนังสือเตรียม Quiz`, เวลา 12:00, ความสำคัญ ด่วน
- `ประชุมกลุ่มโปรเจค`, เวลา 19:00, ความสำคัญ สำคัญ
- `ส่งสรุปบทที่ 4`, deadline วันนี้ 17:00

ตัวอย่าง note:

- title: `สรุปบทที่ 4`
- category: `work` หรือ `study` ตามที่ต้องการ test
- content: `หัวข้อที่ต้องอ่าน recursion, stack, tree และโจทย์ที่ผิดบ่อย`

ตัวอย่าง transaction:

- Income: `เงินโอนจากบ้าน`, 1500 บาท
- Expense: `BTS`, 40 บาท, Transport
- Expense: `McDonald's`, 189 บาท, Food
- Expense: `ร้านถ่ายเอกสาร`, 120 บาท, Education
- Expense: `Cafe Amazon`, 65 บาท, Drink

## การเงินในแอปคำนวณยังไง

หน้าการเงินคำนวณจาก transaction ในช่วงที่เลือก:

```text
ยอดคงเหลือ = รายรับ - รายจ่าย
```

ถ้าเลือก “วัน” จะนับเฉพาะรายการวันนั้น

ถ้าเลือก “เดือน” จะนับทั้งเดือน

งบรายเดือนแยกจากยอดคงเหลือ:

- รายรับเดือนนี้ คือเงินเข้าทั้งเดือน
- ใช้ไปแล้ว คือรายจ่ายทั้งเดือน
- งบที่ยังใช้ได้ คือ monthly budget - รายจ่าย

ถ้าผู้ใช้เห็นยอดวันเป็น 0 แต่ยอดเดือนมีเงิน เป็นเรื่องปกติถ้าวันนั้นไม่มีรายรับ

## ระบบแจ้งเตือน

ไฟล์หลัก:

```text
src/services/deadline-notifications.ts
src/app/_layout.tsx
src/screens/native/user/notifications-screen.tsx
```

ระบบจะ sync notification จากงาน/กิจกรรมที่ใกล้กำหนดหรือเลยกำหนด

ข้อควร test:

- Android notification permission ต้องเปิด
- งานวันนี้ต้องมีแจ้งเตือน
- งานใกล้ deadline ต้องมีข้อความเตือน
- แตะแจ้งเตือนแล้วควรกลับเข้าแอปได้

## จุดที่ยังต้องทำต่อ

1. Deploy Firebase Functions/rules/indexes ของ LINE import ไป `smartlife-budget`
2. ทดสอบ LINE notification จริงใน MuMu หรือมือถือ Android จริง
3. ถ้าต้องใช้ AI fallback จริง ให้ตั้ง `ANTHROPIC_API_KEY`
4. Push งานขึ้น `personal` ไม่ใช่ `origin`
5. ถ้าจะให้มือถือจริงอัปเดตอัตโนมัติ ต้องทำ release channel/OTA หรือ distribution flow แยก ไม่ใช่แค่ส่ง APK ไฟล์เดี่ยว

## หมายเหตุเรื่อง APK และการอัปเดตมือถือจริง

ถ้าแจกเป็น APK ไฟล์เดี่ยว ผู้ใช้ต้องติดตั้ง APK ใหม่เองทุกครั้ง หรือกดติดตั้งทับ

ถ้าต้องการอัปเดตเหมือนแอปจริง:

- Android แบบง่าย: ใช้ Google Play internal testing หรือ Play Store
- Expo OTA: ใช้ EAS Update สำหรับอัปเดต JS/asset ที่ไม่แตะ native code
- ถ้ามี native module เปลี่ยน เช่น LINE listener ต้อง build APK/AAB ใหม่

ตอนนี้โปรเจกต์มี native module แล้ว ดังนั้นการเปลี่ยน native ฝั่ง Android ต้อง build APK ใหม่เสมอ

## โครงสร้างโปรเจกต์

```text
src/app/                 Expo Router routes
src/screens/             หน้าจอ User/Admin/Login/native UI
src/services/            Firebase, parser, notification, recommendation services
src/dashboard/           AI Dynamic scoring engine
src/providers/           Auth provider
src/types/               TypeScript shared types
functions/src/           Firebase Cloud Functions
modules/                 Native Expo modules
docs/                    เอกสารเสริม
android/                 Android native project
firestore.rules          Firestore security rules
firestore.indexes.json   Firestore indexes
storage.rules            Firebase Storage rules
```

## Checklist ให้ Codex ตัวใหม่อ่านก่อนทำงาน

1. อยู่ใน `C:\Users\konpo\Downloads\Final-Project`
2. อ่าน `AGENTS.md`
3. ถ้าจะเขียนโค้ด Expo ให้เช็คเอกสาร Expo SDK 57 ก่อน
4. เช็ค `git remote -v` และจำว่า push ไป `personal`
5. ห้ามแก้/ลบ `.env.local`
6. ก่อน build ให้รัน `npm run typecheck`
7. หลังแก้ LINE parser ให้รัน `npm run test:line-import`
8. หลังแก้ AI Dynamic ให้รัน `npm run test:dashboard-prioritization`
9. ถ้า build APK ให้ copy เป็น `SmartLife-latest.apk`
10. ถ้าติดตั้ง MuMu ใช้ adb path ของ MuMu ที่ระบุด้านบน

