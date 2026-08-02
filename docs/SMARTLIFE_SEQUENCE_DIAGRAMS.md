# SmartLife Sequence Diagrams

เอกสารนี้สรุปลำดับการทำงานของระบบ SmartLife ตาม Proposal และระบบที่พัฒนาอยู่จริงในแอป Expo/Firebase เพื่อใช้ตรวจงาน นำเสนอ และต่อยอดการพัฒนา

## ขอบเขตระบบ

- Mobile App: Expo / React Native สำหรับผู้ใช้และผู้ดูแลระบบ
- Authentication: Firebase Authentication (Email/Password และ Google Sign-In)
- Database: Cloud Firestore
- File storage: Cloud Storage for Firebase
- Processing: Firebase Cloud Functions (`asia-southeast1`)
- OCR: Google Cloud Vision และ Gemini API สำหรับตรวจทาน/แยกข้อมูลเชิงโครงสร้าง
- Calendar: Google Calendar API แบบเชื่อมและซิงก์ตามสิทธิ์ที่ผู้ใช้อนุญาต
- Time zone หลักของข้อมูลเวลาในแอป: `Asia/Bangkok` (UTC+7)

> หมายเหตุ: API key, Secret, Access token และข้อมูลบัญชีจริงไม่อยู่ในแผนภาพหรือเอกสารนี้

---

## 1. Login และการคงสถานะการเข้าสู่ระบบ

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#6F926E","primaryTextColor":"#26331F","primaryBorderColor":"#6F926E","lineColor":"#587E56","secondaryColor":"#EAF3E8","tertiaryColor":"#F8FBF6","actorBkg":"#FFFFFF","actorBorder":"#6F926E","actorTextColor":"#26331F","signalColor":"#4C744D","signalTextColor":"#26331F","noteBkgColor":"#EAF3E8","noteBorderColor":"#A6C1A2","noteTextColor":"#26331F"}}}%%
sequenceDiagram
    autonumber
    actor User as ผู้ใช้
    participant App as SmartLife Mobile App
    participant Auth as Firebase Authentication
    participant DB as Cloud Firestore
    participant Store as Secure Session Storage

    User->>App: เปิดแอป
    App->>Auth: ตรวจสอบ session ที่คงอยู่
    alt มี session ที่ยังใช้ได้
        Auth-->>App: Firebase user + uid
        App->>DB: อ่าน profiles/{uid}
        DB-->>App: profile และ role
        alt role = admin
            App-->>User: เปิด Admin Dashboard
        else role = user
            App-->>User: เปิด Unified Dashboard
        end
    else ยังไม่มี session
        App-->>User: แสดงหน้า Login
        alt Email / Password
            User->>App: กรอกอีเมลและรหัสผ่าน
            App->>Auth: signInWithEmailAndPassword
        else Google Sign-In
            User->>App: กดเข้าสู่ระบบด้วย Google
            App->>Auth: signInWithCredential(Google credential)
        end
        Auth-->>App: Firebase user + uid
        App->>DB: อ่านหรือสร้าง profiles/{uid}
        DB-->>App: profile และ role
        App->>Store: เก็บ session อย่างปลอดภัย
        App-->>User: เปิดหน้าตาม role
    end

    opt ผู้ใช้กดออกจากระบบ
        User->>App: Logout
        App->>Auth: signOut()
        App->>Store: ล้าง session ในเครื่อง
        App-->>User: Reset navigation ไปหน้า Login
    end
```

---

## 2. Smart Scan: อัปโหลดภาพ, OCR, ตรวจแก้ และบันทึกข้อมูล

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#6F926E","primaryTextColor":"#26331F","primaryBorderColor":"#6F926E","lineColor":"#587E56","secondaryColor":"#EAF3E8","tertiaryColor":"#F8FBF6","actorBkg":"#FFFFFF","actorBorder":"#6F926E","actorTextColor":"#26331F","signalColor":"#4C744D","signalTextColor":"#26331F","noteBkgColor":"#EAF3E8","noteBorderColor":"#A6C1A2","noteTextColor":"#26331F"}}}%%
sequenceDiagram
    autonumber
    actor User as ผู้ใช้
    participant App as Smart Scan
    participant Storage as Cloud Storage
    participant Function as analyzeScan Function
    participant Vision as Cloud Vision OCR
    participant Gemini as Gemini Structured Analysis
    participant DB as Cloud Firestore

    User->>App: กดปุ่ม + และเลือกกล้องหรือคลังรูป
    App->>App: ขอสิทธิ์ Camera / Media Library
    User-->>App: เลือกรูปตารางเรียน, ใบเสร็จ หรือสลิป
    App->>Storage: อัปโหลดรูปที่ scans/{uid}/...
    Storage-->>App: storagePath / download reference
    App->>Function: เรียก analyzeScan(storagePath, metadata)
    Function->>Vision: DOCUMENT_TEXT_DETECTION
    Vision-->>Function: raw OCR text + layout data
    Function->>Gemini: แยกประเภทและสกัด JSON เชิงโครงสร้าง
    Note over Gemini,Function: Schedule: รายวิชา เวลา ห้อง วัน สอบ<br/>Receipt/Slip: ร้านค้า รายการ ยอด วัน เวลา หมวด
    Gemini-->>Function: structured extraction + confidence
    Function-->>App: scanType, parsedData, items, rawText, confidence
    App-->>User: แสดง Preview ที่แก้ไขได้

    alt ผลเป็นตารางเรียน
        User->>App: แก้ชื่อวิชา วัน เวลา ห้อง หรือช่วงเทอม
        User->>App: ยืนยันบันทึกตาราง
        App->>DB: บันทึก schedule series และ recurring events
        DB-->>App: บันทึกสำเร็จ
        App-->>User: Success animation แล้วไป Calendar
    else ผลเป็นใบเสร็จ/สลิป
        User->>App: แก้ร้านค้า รายการ ยอด วัน เวลา หรือหมวด
        User->>App: ยืนยันบันทึกรายจ่าย
        App->>DB: บันทึก transaction และ scan log
        DB-->>App: บันทึกสำเร็จ
        App-->>User: Success animation แล้วไป Finance
    end

    opt สแกนใหม่หรือยกเลิก
        User->>App: กดสแกนใหม่ / ล้างข้อมูล
        App->>App: ล้าง image URI, raw OCR และ parsed state
        App-->>User: พร้อมเริ่มสแกนใหม่
    end
```

---

## 3. ตารางเรียนและ Google Calendar Two-Way Sync

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#6F926E","primaryTextColor":"#26331F","primaryBorderColor":"#6F926E","lineColor":"#587E56","secondaryColor":"#EAF3E8","tertiaryColor":"#F8FBF6","actorBkg":"#FFFFFF","actorBorder":"#6F926E","actorTextColor":"#26331F","signalColor":"#4C744D","signalTextColor":"#26331F","noteBkgColor":"#EAF3E8","noteBorderColor":"#A6C1A2","noteTextColor":"#26331F"}}}%%
sequenceDiagram
    autonumber
    actor User as ผู้ใช้
    participant Calendar as Calendar D/W/M/Y
    participant OAuth as Google OAuth
    participant GCal as Google Calendar API
    participant DB as Cloud Firestore

    User->>Calendar: เปิดหน้าตารางเรียน
    Calendar->>DB: อ่าน schedules ของ uid ตามช่วงวันที่
    DB-->>Calendar: กิจกรรมใน Asia/Bangkok
    Calendar-->>User: แสดง Day / Week / Month / Year และ event indicators

    opt เชื่อม Google Calendar ครั้งแรก
        User->>Calendar: กดเชื่อม Google Calendar
        Calendar->>OAuth: ขอสิทธิ์ profile + calendar.events
        OAuth-->>Calendar: OAuth authorization สำเร็จ
        Calendar->>DB: บันทึกสถานะการเชื่อมของ uid
        Note over Calendar,DB: เก็บสถานะและข้อมูลอ้างอิงที่จำเป็น<br/>ไม่แสดงหรือส่ง token ไปยัง UI
        Calendar-->>User: แสดงสถานะเชื่อมต่อแล้ว
    end

    par Push: ส่งตารางจาก SmartLife ไป Google Calendar
        User->>Calendar: กด Sync up หรือบันทึกตารางจาก OCR
        Calendar->>GCal: สร้าง/อัปเดต recurring events
        GCal-->>Calendar: Google event IDs
        Calendar->>DB: บันทึก sync metadata และเวลา sync ล่าสุด
    and Pull: ดึงกิจกรรมจาก Google Calendar เข้า SmartLife
        User->>Calendar: กด Sync down / Sync อีกครั้ง
        Calendar->>GCal: ดึงกิจกรรมตามช่วงวันที่
        GCal-->>Calendar: upcoming events
        Calendar->>DB: บันทึกหรืออัปเดต imported calendar events
    end

    Calendar-->>User: อัปเดต Calendar และตัวนับการซิงก์

    opt ยกเลิกการเชื่อม
        User->>Calendar: กดยกเลิกการเชื่อม
        Calendar->>DB: ล้างสถานะการเชื่อมของ uid
        Calendar-->>User: กลับสู่ตาราง SmartLife เท่านั้น
    end
```

---

## 4. AI Assistant, Dynamic Prioritization และ Burnout Coach

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#6F926E","primaryTextColor":"#26331F","primaryBorderColor":"#6F926E","lineColor":"#587E56","secondaryColor":"#EAF3E8","tertiaryColor":"#F8FBF6","actorBkg":"#FFFFFF","actorBorder":"#6F926E","actorTextColor":"#26331F","signalColor":"#4C744D","signalTextColor":"#26331F","noteBkgColor":"#EAF3E8","noteBorderColor":"#A6C1A2","noteTextColor":"#26331F"}}}%%
sequenceDiagram
    autonumber
    actor User as ผู้ใช้
    participant Dashboard as Unified Dashboard
    participant Assistant as AI Assistant
    participant DB as Cloud Firestore
    participant Function as AI Cloud Function
    participant Gemini as Gemini API

    Dashboard->>DB: อ่านตาราง, งาน, โน้ต, การเงิน และการแจ้งเตือนของวันนี้
    DB-->>Dashboard: ข้อมูลตาม uid
    Dashboard->>Function: ขอจัดลำดับความสำคัญตามบริบทวัน
    Function->>Gemini: วิเคราะห์ความเร่งด่วนและความเกี่ยวข้อง
    Gemini-->>Function: priority list + explanation
    Function-->>Dashboard: AI จัดลำดับวันนี้
    Dashboard-->>User: ดันสอบ/งานด่วนขึ้นก่อน และย่อข้อมูลรอง

    User->>Assistant: พิมพ์หรือพูดคำถาม
    Note over User,Assistant: ตัวอย่าง: วันนี้มีเรียนกี่โมง?<br/>เหลือเงินกินข้าวเท่าไหร่?
    Assistant->>DB: อ่านเฉพาะข้อมูลของ uid ที่จำเป็นต่อคำถาม
    DB-->>Assistant: schedule, notes, tasks, finance context
    Assistant->>Function: ส่งคำถามพร้อม context ที่อนุญาต
    Function->>Gemini: สร้างคำตอบและคำแนะนำ
    Gemini-->>Function: answer + suggested action
    Function-->>Assistant: คำตอบภาษาไทย
    Assistant-->>User: แสดงคำตอบหรือปุ่มใช้คำแนะนำ

    opt AI Adaptive Scheduling
        Assistant->>DB: อ่านพฤติกรรมเลื่อน/สำเร็จกิจกรรม
        Assistant->>Function: ขอข้อเสนอปรับตาราง
        Function->>Gemini: วิเคราะห์ช่วงเวลาที่เหมาะสม
        Gemini-->>Function: ตารางที่แนะนำ
        Function-->>Assistant: เช่น ย้ายเวลาอ่านไป 14:00
        User->>Assistant: กดใช้ตารางที่ AI ปรับให้
        Assistant->>DB: บันทึกกิจกรรม/การปรับเวลาใหม่
    end

    opt Burnout Predictor & Coach
        Assistant->>DB: อ่านภาระเรียน/งานและรูปแบบการพัก
        Assistant->>Function: ประเมินความเสี่ยง Burnout
        Function->>Gemini: สรุปคำแนะนำเชิงบวก
        Gemini-->>Function: risk level + break suggestion
        Function-->>Assistant: การ์ด Burnout Coach
        Assistant-->>User: แนะนำพักสั้น ๆ และปรับภาระงาน
    end
```

---

## 5. Personal Finance และการเชื่อมข้อมูลกับตารางเวลา

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#6F926E","primaryTextColor":"#26331F","primaryBorderColor":"#6F926E","lineColor":"#587E56","secondaryColor":"#EAF3E8","tertiaryColor":"#F8FBF6","actorBkg":"#FFFFFF","actorBorder":"#6F926E","actorTextColor":"#26331F","signalColor":"#4C744D","signalTextColor":"#26331F","noteBkgColor":"#EAF3E8","noteBorderColor":"#A6C1A2","noteTextColor":"#26331F"}}}%%
sequenceDiagram
    autonumber
    actor User as ผู้ใช้
    participant Finance as Finance D/W/M
    participant DB as Cloud Firestore
    participant Calendar as Schedule Service
    participant Function as Finance Insight Function
    participant Gemini as Gemini API

    User->>Finance: เปิดภาพรวม / รายรับ / รายจ่าย
    Finance->>DB: อ่าน transactions ของ uid ตาม date range
    DB-->>Finance: รายการการเงินพร้อม occurredAt
    Finance->>Finance: จัดกลุ่มตามวัน สัปดาห์ หรือเดือนใน Asia/Bangkok
    Finance-->>User: ยอดรวม หมวดหมู่ และรายการจริง

    opt ผู้ใช้เพิ่มรายการเองหรือบันทึกจาก OCR
        User->>Finance: บันทึกรายรับ/รายจ่าย
        Finance->>DB: เขียน transaction พร้อมวันที่ เวลา หมวด รายการสินค้า
        DB-->>Finance: บันทึกสำเร็จ
        Finance-->>User: แสดง Success animation และอัปเดตยอด
    end

    opt Smart Expense Categorization
        Finance->>Function: ส่ง merchant/items ที่ OCR อ่านได้
        Function->>Gemini: จัดหมวด Food, Groceries, Transport ฯลฯ
        Gemini-->>Function: category + confidence
        Function-->>Finance: หมวดที่แนะนำ
        Finance->>DB: บันทึก category ที่ผู้ใช้ยืนยัน
    end

    opt ตารางเวลาเชื่อมกับการเงิน
        Calendar->>DB: อ่านจำนวนคาบเรียนในวันนี้
        DB-->>Calendar: schedule context
        Calendar->>Function: ขอคำแนะนำงบอาหาร/เดินทาง
        Function->>Gemini: วิเคราะห์กิจกรรมวันนี้และงบคงเหลือ
        Gemini-->>Function: budget recommendation
        Function-->>Finance: เช่น วันนี้มีเรียน 3 คาบ ควรกันงบอาหาร 120 บาท
        Finance-->>User: แสดงคำแนะนำพร้อมยอดคงเหลือ
    end
```

---

## 6. Admin Console: ภาพรวม, ตรวจสอบระบบ และจัดการข้อมูล

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#6F926E","primaryTextColor":"#26331F","primaryBorderColor":"#6F926E","lineColor":"#587E56","secondaryColor":"#EAF3E8","tertiaryColor":"#F8FBF6","actorBkg":"#FFFFFF","actorBorder":"#6F926E","actorTextColor":"#26331F","signalColor":"#4C744D","signalTextColor":"#26331F","noteBkgColor":"#EAF3E8","noteBorderColor":"#A6C1A2","noteTextColor":"#26331F"}}}%%
sequenceDiagram
    autonumber
    actor Admin as ผู้ดูแลระบบ
    participant App as SmartLife Admin App
    participant Auth as Firebase Authentication
    participant Function as Admin Cloud Functions
    participant DB as Cloud Firestore
    participant Services as OCR / AI / Calendar Services

    Admin->>App: เปิด Admin Console
    App->>Auth: ตรวจสอบ Firebase session และ admin role
    Auth-->>App: role / custom claim
    alt ไม่ใช่ admin
        App-->>Admin: ปฏิเสธการเข้าถึง
    else เป็น admin
        App->>Function: ขอข้อมูล Dashboard แบบรวม
        Function->>DB: นับผู้ใช้ ตารางเรียน โน้ต รายการการเงิน และ AI usage
        DB-->>Function: metrics จริงจากระบบ
        Function-->>App: dashboard metrics
        App-->>Admin: แสดงภาพรวมระบบ
    end

    par จัดการผู้ใช้
        Admin->>App: ดูผู้ใช้ / ระงับบัญชี / รีเซ็ตรหัสผ่าน
        App->>Function: admin user operation
        Function->>Auth: ดำเนินการผ่านสิทธิ์ผู้ดูแล
        Function->>DB: อัปเดตสถานะบัญชีหรือ audit log
    and ตรวจสอบ AI และ OCR
        Admin->>App: เปิด AI Knowledge Monitor หรือ OCR/Import Log
        App->>Function: ขอ logs ที่ผ่านการอนุญาต
        Function->>DB: อ่าน ai recommendations และ scan logs
        DB-->>Function: logs พร้อมสถานะ
        Function-->>App: ข้อมูลตรวจสอบ
    and System Health
        Admin->>App: เปิด System Health
        App->>Function: ตรวจสถานะ Cloud Firestore, Functions, OCR และ Calendar Sync
        Function->>Services: health/status checks
        Services-->>Function: ผลการตรวจสอบ
        Function-->>App: สถานะบริการล่าสุด
    end

    opt ประกาศและ Feedback Center
        Admin->>App: สร้างประกาศ หรือดำเนินการ feedback
        App->>Function: บันทึกประกาศ/อัปเดตสถานะ feedback
        Function->>DB: เขียนข้อมูลพร้อม audit metadata
        DB-->>Function: success
        Function-->>App: ผลสำเร็จ
        App-->>Admin: แสดง Success animation
    end
```

---

## ความสัมพันธ์ของข้อมูลหลัก

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#6F926E","primaryTextColor":"#26331F","primaryBorderColor":"#6F926E","lineColor":"#587E56","secondaryColor":"#EAF3E8","tertiaryColor":"#F8FBF6"}}}%%
flowchart LR
    U["Firebase User / uid"] --> P["Profile & role"]
    U --> S["Schedules & recurring series"]
    U --> N["Notes & tasks"]
    U --> T["Finance transactions"]
    U --> L["Scan logs"]
    U --> C["Calendar connection status"]
    S --> A["AI context"]
    N --> A
    T --> A
    A --> D["Dashboard priority & assistant response"]
    L --> O["Admin OCR / Import Log"]
    A --> K["Admin AI Knowledge Monitor"]
    T --> F["Finance D/W/M summary"]
    S --> G["Calendar D/W/M/Y"]
```

## Checklist สำหรับตรวจงาน

- [ ] Diagram 1: ผู้ใช้ใหม่และผู้ใช้เดิมเข้าระบบถูก flow
- [ ] Diagram 2: สแกนแล้วต้องแก้ไขก่อนบันทึกได้ ทั้งตารางและการเงิน
- [ ] Diagram 3: Calendar รองรับ D/W/M/Y และเชื่อม Google Calendar ได้
- [ ] Diagram 4: AI Assistant, Dynamic Prioritization, Adaptive Scheduling และ Burnout Coach มีครบ
- [ ] Diagram 5: การเงินดึงข้อมูลจริงตามวัน/สัปดาห์/เดือน และเชื่อมตารางเวลาได้
- [ ] Diagram 6: Admin ครอบคลุม Dashboard, Users, Categories, AI Monitor, OCR Log, Announcements, Feedback และ System Health
