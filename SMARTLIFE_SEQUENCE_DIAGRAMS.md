# SmartLife - Sequence Diagrams

เอกสารนี้สรุปลำดับการทำงานจริงของระบบ SmartLife จาก Proposal และฟังก์ชันในแอป เพื่อใช้ประกอบการนำเสนอและพัฒนาต่อร่วมกัน

## 1. Login, Role และ Session

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#eef4eb','primaryTextColor':'#26351f','primaryBorderColor':'#4f794c','lineColor':'#6f8f6d','actorBkg':'#ffffff','actorBorder':'#4f794c','signalColor':'#4f794c','signalTextColor':'#26351f'}}}%%
sequenceDiagram
    autonumber
    actor U as User / Admin
    participant A as SmartLife Expo App
    participant AU as Firebase Authentication
    participant FS as Cloud Firestore
    participant AS as Secure Session Storage

    U->>A: เปิดแอป
    A->>AU: ตรวจสอบ session เดิม
    AU-->>A: currentUser หรือ null
    alt มี session
        A->>FS: อ่าน users/{uid}
        FS-->>A: profile + role
        A->>AS: เก็บสถานะ session อย่างปลอดภัย
        alt role = admin
            A-->>U: เปิด Admin Dashboard
        else role = user
            A-->>U: เปิด Unified Dashboard
        end
    else ยังไม่เข้าสู่ระบบ
        U->>A: Email/Password หรือ Google Login
        A->>AU: signIn / signInWithCredential
        AU-->>A: uid และ session
        A->>FS: สร้างหรืออัปเดต users/{uid}
        FS-->>A: profile + role เริ่มต้น
        A-->>U: เปิด Unified Dashboard
    end
    U->>A: Logout
    A->>AU: signOut()
    A->>AS: ล้างข้อมูล local session
    A-->>U: กลับหน้า Login
```

## 2. Unified Smart Scan: ตารางเรียน, ใบเสร็จ และสลิป

```mermaid
sequenceDiagram
    autonumber
    actor U as ผู้ใช้
    participant A as Expo App
    participant ST as Firebase Storage
    participant CF as Cloud Function analyzeScan
    participant V as Google Cloud Vision OCR
    participant G as Gemini API
    participant FS as Cloud Firestore

    U->>A: กดปุ่ม + และเลือกกล้อง/คลังรูป
    A->>A: ขอสิทธิ์ Camera / Media Library
    A->>ST: อัปโหลดรูปที่ scans/{uid}/...
    ST-->>A: storagePath + download URL
    A->>CF: analyzeScan(storagePath, scanType)
    CF->>V: DOCUMENT_TEXT_DETECTION (Thai + English)
    V-->>CF: raw OCR text + layout data
    CF->>G: จัดประเภท + สกัดข้อมูลแบบ JSON
    G-->>CF: receipt/slip หรือ schedule + confidence
    CF->>FS: บันทึก scanLogs/{scanId}
    CF-->>A: ผล OCR แบบแก้ไขได้
    A-->>U: Preview พร้อมแก้ข้อมูลก่อนบันทึก
    alt ตารางเรียน
        U->>A: ยืนยันบันทึกตาราง
        A->>FS: เขียน schedules พร้อม seriesId/semester
        A-->>U: ไปหน้า Calendar
    else ใบเสร็จ/สลิป
        U->>A: ยืนยันบันทึกรายจ่าย
        A->>FS: เขียน transactions พร้อม items/category
        A-->>U: ไปหน้า Finance
    end
```

## 3. ตารางเรียนและ Google Calendar Two-Way Sync

```mermaid
sequenceDiagram
    autonumber
    actor U as ผู้ใช้
    participant A as SmartLife Calendar
    participant GO as Google OAuth
    participant GC as Google Calendar API
    participant FS as Cloud Firestore

    U->>A: กดเชื่อม Google Calendar
    A->>GO: เริ่ม OAuth พร้อม calendar.events scope
    GO-->>A: authorization code / access token
    A->>FS: บันทึกสถานะ integration ของ uid
    A-->>U: แสดงว่าเชื่อมต่อแล้ว

    U->>A: กด Sync ลงจาก Google
    A->>GC: events.list(timeMin, timeMax)
    GC-->>A: รายการกิจกรรม Google
    A->>FS: อัปเดต synced events ของผู้ใช้
    A-->>U: แสดงกิจกรรมใน Day / Week / Month / Year

    U->>A: บันทึกตารางจาก OCR
    A->>A: สร้าง recurrence รายสัปดาห์ตาม semester
    A->>FS: บันทึก schedules + seriesId
    A->>GC: events.insert(RRULE:FREQ=WEEKLY)
    GC-->>A: googleEventId
    A->>FS: ผูก googleEventId กับ schedule

    U->>A: ยกเลิกการเชื่อมต่อ
    A->>FS: ล้าง calendar integration status
    A-->>U: หยุด Sync โดยไม่ลบบัญชี Firebase
```

## 4. AI Assistant, Dynamic Prioritization และ Burnout Coach

```mermaid
sequenceDiagram
    autonumber
    actor U as ผู้ใช้
    participant A as Unified Dashboard / AI Assistant
    participant CF as Cloud Function AI Gateway
    participant FS as Cloud Firestore
    participant G as Gemini API

    U->>A: พิมพ์หรือพูดคำถาม
    A->>CF: ส่ง prompt + uid + context ที่จำเป็น
    CF->>FS: อ่าน schedules, notes, transactions, activities
    FS-->>CF: ข้อมูลตามสิทธิ์ของผู้ใช้
    CF->>G: สร้างคำตอบและจัดลำดับความสำคัญ
    G-->>CF: answer + priorities + recommendations
    CF->>FS: บันทึก aiRecommendations / ai usage log
    CF-->>A: คำตอบและการ์ด Dynamic Prioritization
    A-->>U: แสดงงานด่วน, งบวันนี้ และคำแนะนำพัก

    Note over A,G: Burnout Predictor ใช้สัดส่วนเรียน งาน พักผ่อน และพฤติกรรมเลื่อนกิจกรรม
```

## 5. Finance: OCR, NLP Categorization และมุมมอง D/W/M

```mermaid
sequenceDiagram
    autonumber
    actor U as ผู้ใช้
    participant A as Finance Screen
    participant FS as Cloud Firestore
    participant AI as OCR / NLP Result

    U->>A: สแกนใบเสร็จหรือเพิ่มรายจ่ายเอง
    A->>AI: ส่งผล OCR ที่แก้ไขแล้ว
    AI-->>A: merchant, items, total, date/time, category
    A->>A: ตรวจยอดรวมจากรายการสินค้า
    U->>A: เลือกวัน/เวลาและยืนยัน
    A->>FS: บันทึก transactions/{id} พร้อม occurredAt timestamp
    FS-->>A: บันทึกสำเร็จ
    A->>FS: query ตามช่วงเวลา Day / Week / Month
    FS-->>A: รายการและยอดรวมจริง
    A-->>U: อัปเดตภาพรวม รายรับ รายจ่าย และหมวดหมู่

    Note over A,FS: ตารางเรียนสามารถส่งบริบทเพื่อแนะนำงบอาหาร/เดินทางรายวัน
```

## 6. Notes เชื่อมกับตารางเวลา

```mermaid
sequenceDiagram
    autonumber
    actor U as ผู้ใช้
    participant C as Calendar
    participant N as Notes
    participant FS as Cloud Firestore
    participant AI as SmartLife AI

    U->>C: เปิดวันที่มี Quiz / Class
    C->>FS: อ่าน schedules ของวันนั้น
    FS-->>C: courseCode และหัวข้อเรียน
    C->>FS: ค้น notes ตาม courseCode/category
    FS-->>C: โน้ตที่เกี่ยวข้อง
    C-->>U: แนะนำ "อ่าน Linked List ก่อนควิซ"
    U->>N: เปิดหรือแก้โน้ต
    N->>FS: บันทึก note พร้อม tag/subject
    U->>AI: ขอให้สรุปโน้ตหรือสร้าง checklist
    AI-->>U: เนื้อหาสรุปและรายการเตรียมตัว
```

## 7. Admin Console และการตรวจสอบระบบ

```mermaid
sequenceDiagram
    autonumber
    actor AD as Admin
    participant AA as Admin Expo App
    participant AU as Firebase Authentication
    participant CF as Admin Cloud Functions
    participant FS as Cloud Firestore
    participant ST as Firebase Storage

    AD->>AA: เข้าสู่ระบบผู้ดูแล
    AA->>AU: ยืนยันตัวตนและ role admin
    AU-->>AA: Admin session
    AA->>CF: ขอ Admin dashboard summary
    CF->>FS: aggregate users/schedules/notes/transactions/AI logs
    FS-->>CF: ข้อมูลรวมของระบบ
    CF-->>AA: สถิติจริงและ System Health
    AA-->>AD: Dashboard ภาพรวมระบบ

    AD->>AA: ตรวจ OCR / Import Log
    AA->>FS: อ่าน scanLogs ตามสิทธิ์ admin
    FS-->>AA: ประวัติการสแกนและผลลัพธ์
    AD->>AA: ส่งประกาศหรือจัดการ category
    AA->>FS: เขียน announcements / categories
    AD->>AA: ดู Feedback Center
    AA->>FS: อ่าน feedback ของผู้ใช้
    FS-->>AA: รายการ feedback เพื่อปรับปรุงระบบ
    AA->>ST: ตรวจสถานะไฟล์รูปที่อัปโหลด
```

## โครงสร้างข้อมูลหลัก

```mermaid
flowchart TB
    U[users / uid] --> S[schedules]
    U --> N[notes]
    U --> T[transactions]
    U --> L[scanLogs]
    U --> I[integrations/googleCalendar]
    U --> R[aiRecommendations]
    U --> F[feedback]
    S -. courseCode / subject .-> N
    S -. daily context .-> T
    L -. schedule result .-> S
    L -. receipt/slip result .-> T
    T -. day/week/month aggregate .-> D[Finance Dashboard]
    S -. priority / workload .-> A[AI Assistant]
    N -. study context .-> A
    T -. budget context .-> A
    F --> AD[Admin Console]
    L --> AD
    T --> AD
    S --> AD
```

## ความสอดคล้องกับ Proposal

| Proposal Feature | Diagram ที่อธิบาย |
| --- | --- |
| Unified Dashboard, Voice/Text AI, Dynamic Prioritization | 1, 4 |
| Smart Schedule Importer, OCR, Google Calendar Sync | 2, 3 |
| Adaptive Scheduling และ Burnout Coach | 4 |
| Personal Finance Tracker และ Smart Expense Categorization | 2, 5 |
| ตารางเวลาเชื่อม Notes และ Finance | 5, 6 |
| ระบบ Admin, OCR Logs, Feedback, System Health | 7 |
