# SmartLife Sequence Diagrams

ชุด Sequence Diagram ของ SmartLife สำหรับใช้ตรวจงาน นำเสนอ และใส่ในเอกสารโครงงาน

แผนภาพชุดนี้อ้างอิงจากข้อกำหนดใน Proposal และระบบที่อยู่ใน `SmartLifeExpo`:

- Expo / React Native mobile application
- Firebase Authentication, Cloud Firestore, Cloud Storage และ Cloud Functions
- Google Cloud Vision และ Gemini API สำหรับ OCR / AI
- Google Calendar two-way sync
- User workspace และ Admin workspace

## Diagram Index

| File | Flow ที่อธิบาย |
| --- | --- |
| [01 Authentication and Session](./01-authentication-session.md) | Email/Password, Google login, session persistence และ logout |
| [02 Unified OCR Scan](./02-unified-ocr-scan.md) | สแกนตารางเรียน / ใบเสร็จ / สลิป ตั้งแต่เลือกรูปจนบันทึกจริง |
| [03 Calendar and Google Sync](./03-calendar-google-sync.md) | Calendar D/W/M/Y, Google Calendar sync down / sync up / disconnect |
| [04 AI Assistant and Prioritization](./04-ai-assistant-prioritization.md) | AI Assistant, Dynamic Prioritization, Adaptive Scheduling และ Burnout Coach |
| [05 Finance Tracking](./05-finance-tracking.md) | เพิ่มรายรับรายจ่าย, OCR receipt, การจัดหมวด, มุมมองวัน/สัปดาห์/เดือน |
| [06 Admin Operations](./06-admin-operations.md) | Dashboard, users, categories, OCR logs, AI monitor, feedback และ health |

## ขอบเขตข้อมูล

- เวลาและวันที่ที่แสดงในแอปใช้เขตเวลา `Asia/Bangkok` (UTC+7)
- ผู้ใช้เข้าถึงข้อมูลของตนเองเท่านั้นตาม Firebase Security Rules
- ฝั่ง Admin เรียกข้อมูลรวมผ่าน protected Cloud Function แทนการเปิดให้ client อ่านข้อมูลทุกคนโดยตรง
- Gemini API keys อยู่ใน Firebase Secret Manager เท่านั้น และไม่ส่งไปยังมือถือ
- การยืนยันข้อมูล OCR ต้องผ่านหน้าตรวจแก้ก่อนเขียนข้อมูลจริงลง Firestore

## การเปิดดู

1. เปิดไฟล์ Markdown ใน VS Code แล้วเลือก Markdown Preview
2. เปิดไฟล์เดียวกันบน GitHub เพื่อดู Mermaid render ได้ทันที
3. หาก VS Code เครื่องใดไม่แสดงแผนภาพ ให้ติดตั้งส่วนเสริม Mermaid Markdown Syntax Highlighting หรือ Mermaid Preview
