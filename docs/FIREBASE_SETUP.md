# SmartLife Firebase Setup

## พร้อมใช้งานแล้ว

- Firebase project: `smartlife-budget`
- Authentication: Email/Password
- Cloud Firestore Standard `(default)`
- Region: `asia-southeast1` (Singapore)
- Firestore delete protection
- Cloud Storage และ Storage Security Rules
- Firestore Security Rules และ composite indexes
- Expo client configuration ผ่าน `.env.local`

## Data model

ข้อมูลส่วนตัวทุกชุดแยกตาม UID:

```text
users/{uid}
users/{uid}/schedules/{id}
users/{uid}/activities/{id}
users/{uid}/notes/{id}
users/{uid}/transactions/{id}
users/{uid}/scanLogs/{id}
users/{uid}/notifications/{id}
users/{uid}/aiRecommendations/{id}
users/{uid}/feedback/{id}
```

ข้อมูลส่วนกลางสำหรับระบบ Admin:

```text
categories/{id}
announcements/{id}
systemStatus/{serviceId}
```

ไฟล์ใน Storage:

```text
users/{uid}/avatars/{fileName}
users/{uid}/receipts/{fileName}
users/{uid}/schedules/{fileName}
```

## ต้องเปิดเพิ่มก่อนทำ Backend Automation

### 1. Billing

เปลี่ยน Firebase project เป็นแผน Blaze ก่อน deploy Cloud Functions, Cloud Vision,
scheduled jobs และ Secret Manager การพัฒนาปกติยังควบคุมงบได้ด้วย budget alerts.

### 2. Google Cloud APIs

เปิด API ต่อไปนี้ใน Google Cloud project เดียวกับ Firebase:

- Cloud Functions API
- Cloud Build API
- Artifact Registry API
- Eventarc API
- Secret Manager API
- Cloud Vision API
- Cloud Scheduler API
- Firebase Cloud Messaging API
- Google Calendar API

### 3. Authentication

- Email/Password เปิดแล้ว
- เปิด Google provider เมื่อเริ่ม Google Calendar Sync
- เพิ่ม OAuth consent screen และ scope `calendar.events`
- Admin role ต้องมาจาก Firebase custom claim เท่านั้น

### 4. App Check

เปิดหลังเปลี่ยนจาก Expo Go ไป Development Build:

- Android: Play Integrity
- Web: reCAPTCHA Enterprise

เริ่มแบบ monitor ก่อน แล้วค่อย enforce หลังยืนยันว่า production build ส่ง token ได้.

## Cloud Functions ที่ SmartLife ต้องมี

ให้ Functions อยู่ region `asia-southeast1` เพื่ออยู่ใกล้ Firestore.

### OCR schedule

1. ผู้ใช้อัปโหลดรูปไป `users/{uid}/schedules/`.
2. Client สร้าง `scanLogs` สถานะ `pending`.
3. Storage trigger เรียก Cloud Vision OCR.
4. Function แปลงรหัสวิชา เวลา ห้องเรียน และเขียนผลลง `scanLogs`.
5. ผู้ใช้ตรวจตัวอย่างและยืนยันก่อนสร้าง schedule จริง.

### OCR receipt

1. ผู้ใช้อัปโหลดรูปไป `users/{uid}/receipts/`.
2. Cloud Vision อ่านร้านค้า ยอดรวม วันและเวลา.
3. Gemini/NLP จัดหมวด เช่น McDonald's เป็น Food / อาหาร.
4. Function เขียนผลรอการยืนยันลง `scanLogs`.
5. ผู้ใช้ยืนยันก่อนสร้าง transaction.

### AI knowledge and recommendations

Function อ่านเฉพาะข้อมูลของเจ้าของบัญชี:

- ตารางเวลา
- โน้ตที่เชื่อมกับวิชา
- รายรับรายจ่ายและงบ
- ประวัติการเลื่อนกิจกรรม

ผลลัพธ์เขียนลง `aiRecommendations` พร้อม `contextSources` เพื่อให้ Admin ตรวจว่า
AI ใช้ข้อมูลอะไร และไม่เปิดเผยข้อมูลข้ามผู้ใช้.

### Cross-feature sync

- Quiz ใน schedule -> ค้น note ที่เกี่ยวข้อง -> notification เตือนอ่าน
- วันเรียนหลายคาบ -> คำนวณงบอาหาร/เดินทาง -> finance recommendation
- พฤติกรรมเลื่อนอ่านตอนเช้า -> adaptive schedule ช่วงบ่าย
- เรียน/งานหนักและพักน้อย -> burnout recommendation

### Notifications

- Firestore เก็บ inbox ภายในแอป
- Expo Notifications/FCM ส่ง push notification
- Scheduled Function สร้าง daily summary และแจ้งเตือนก่อนกิจกรรม
- Admin announcement กระจายเป็น notification โดย Function

### Admin operations

- Callable Function สำหรับระงับผู้ใช้และรีเซ็ตรหัสผ่าน
- Callable Function สำหรับ grant/revoke custom claim `admin`
- OCR/import logs ผ่าน collection-group query
- Scheduled health check เขียน `systemStatus`
- ทุก admin action ต้องมี audit log

## ลำดับพัฒนาที่แนะนำ

1. เชื่อมฟอร์ม Login/Register กับ Firebase Auth
2. เชื่อม CRUD ตารางเวลา โน้ต และการเงินกับ Firestore services
3. เชื่อมอัปโหลดรูปกับ Storage
4. เปิด Blaze และ deploy Functions foundation
5. ทำ OCR ตารางเรียนและใบเสร็จ
6. ทำ notification และ cross-feature sync
7. ทำ AI recommendation และ Admin monitor
8. เปิด App Check, Crashlytics และ production monitoring
