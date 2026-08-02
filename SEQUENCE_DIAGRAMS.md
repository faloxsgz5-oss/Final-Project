# SmartLife Sequence Diagrams

เอกสารนี้สรุป Sequence Diagram ของระบบ SmartLife ตาม Proposal และระบบที่มีอยู่ในแอปปัจจุบัน ได้แก่ User, Admin, Firebase Authentication, Cloud Firestore, Cloud Storage, Cloud Functions, Google Vision OCR, Gemini API และ Google Calendar

## วิธีเปิดดู

- GitHub จะแสดงแผนภาพ Mermaid อัตโนมัติ
- ใน VS Code เปิด Markdown Preview ด้วย `Ctrl+Shift+V`
- แผนภาพใช้ชื่อระบบจริง แต่ไม่เปิดเผย API key, password หรือ token

## 1. Login, Role และ Session ต่อเนื่อง

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#6d9270','primaryTextColor':'#233020','primaryBorderColor':'#6d9270','lineColor':'#4b614a','actorBkg':'#eff4ec','actorBorder':'#6d9270','actorTextColor':'#233020','signalColor':'#4b614a','signalTextColor':'#233020','noteBkgColor':'#fffdf7','noteBorderColor':'#cbd8c7','noteTextColor':'#425240'}}}%%
sequenceDiagram
    autonumber
    actor User as User / Admin
    participant App as SmartLife Expo App
    participant Auth as Firebase Authentication
    participant DB as Cloud Firestore
    participant Local as Secure Local Session

    User->>App: Open application
    App->>Auth: Restore authenticated session
    alt Existing session is valid
        Auth-->>App: uid and auth state
        App->>DB: Read users/{uid}
        DB-->>App: profile and role
        alt role = admin
            App-->>User: Open Admin Dashboard
        else role = user
            App-->>User: Open User Dashboard
        end
    else No valid session
        App-->>User: Show Login Screen
        User->>App: Email/password or Google sign-in
        App->>Auth: Sign in request
        Auth-->>App: uid and access state
        App->>DB: Create or update users/{uid}
        DB-->>App: user profile and role
        App->>Local: Persist safe session state
        App-->>User: Navigate to the correct dashboard
    end

    User->>App: Logout
    App->>Auth: signOut()
    App->>Local: Clear local session state
    App-->>User: Reset navigation to Login Screen
```

## 2. Unified Smart Scan: ตารางเรียน, ใบเสร็จ และสลิป

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#6d9270','primaryTextColor':'#233020','primaryBorderColor':'#6d9270','lineColor':'#4b614a','actorBkg':'#eff4ec','actorBorder':'#6d9270','actorTextColor':'#233020','signalColor':'#4b614a','signalTextColor':'#233020','noteBkgColor':'#fffdf7','noteBorderColor':'#cbd8c7','noteTextColor':'#425240'}}}%%
sequenceDiagram
    autonumber
    actor User as User
    participant App as SmartLife Expo App
    participant Storage as Cloud Storage
    participant Fn as Cloud Function analyzeScan
    participant Vision as Google Vision OCR
    participant Gemini as Gemini Vision and NLP
    participant DB as Cloud Firestore

    User->>App: Tap central + and choose Camera or Gallery
    App->>App: Request device permission and validate image URI
    App->>Storage: Upload image to users/{uid}/scans
    Storage-->>App: storage path
    App->>Fn: Analyze image with storage path
    Fn->>Vision: DOCUMENT_TEXT_DETECTION Thai and English
    Vision-->>Fn: raw OCR text and document blocks
    Fn->>Gemini: Classify and extract structured data
    Gemini-->>Fn: Receipt, payment slip, or schedule result
    Fn-->>App: detected type, confidence, editable fields, raw text

    alt Schedule detected
        App-->>User: Show editable class cards and term dates
        User->>App: Confirm corrected course, room, day and time
        App->>DB: Save schedules with course seriesId
        App->>DB: Save scanLogs record
        App-->>User: Show success state and open Calendar
    else Receipt or payment slip detected
        App-->>User: Show merchant, items, date, time and total
        User->>App: Confirm corrected finance information
        App->>DB: Save transaction and item list
        App->>DB: Save scanLogs record
        App-->>User: Show success state and open Finance
    end

    Note over Fn,Gemini: Gemini API keys remain in Cloud Functions secrets.<br/>The mobile application never receives them.
```

## 3. Calendar และ Google Calendar Two-Way Sync

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#6d9270','primaryTextColor':'#233020','primaryBorderColor':'#6d9270','lineColor':'#4b614a','actorBkg':'#eff4ec','actorBorder':'#6d9270','actorTextColor':'#233020','signalColor':'#4b614a','signalTextColor':'#233020','noteBkgColor':'#fffdf7','noteBorderColor':'#cbd8c7','noteTextColor':'#425240'}}}%%
sequenceDiagram
    autonumber
    actor User as User
    participant App as SmartLife Expo App
    participant Google as Google OAuth and Calendar API
    participant DB as Cloud Firestore
    participant Fn as Secure Sync Function

    User->>App: Tap Connect Google Calendar
    App->>Google: Request OAuth consent for calendar.events
    Google-->>App: Approved account identity
    App->>DB: Save calendarConnections/{uid} metadata
    App-->>User: Show connected account and sync status

    User->>App: Pull events into SmartLife
    App->>Fn: Request calendar sync down
    Fn->>Google: Fetch calendar events
    Google-->>Fn: Upcoming events
    Fn->>DB: Upsert imported calendar events
    DB-->>App: Real-time updated calendar events
    App-->>User: Render events in Day, Week, Month and Year views

    User->>App: Push scanned schedule
    App->>Fn: Send corrected schedule and term range
    Fn->>Google: Insert recurring event with RRULE
    Google-->>Fn: Google event id
    Fn->>DB: Link schedule with Google event id
    App-->>User: Display successful sync

    User->>App: Disconnect Calendar
    App->>DB: Remove calendar connection metadata
    App-->>User: Keep SmartLife schedules, stop future Google sync
```

## 4. AI Smart Assistant, Prioritization และ Burnout Coach

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#6d9270','primaryTextColor':'#233020','primaryBorderColor':'#6d9270','lineColor':'#4b614a','actorBkg':'#eff4ec','actorBorder':'#6d9270','actorTextColor':'#233020','signalColor':'#4b614a','signalTextColor':'#233020','noteBkgColor':'#fffdf7','noteBorderColor':'#cbd8c7','noteTextColor':'#425240'}}}%%
sequenceDiagram
    autonumber
    actor User as User
    participant App as SmartLife App
    participant Fn as Cloud Function AI Assistant
    participant DB as Cloud Firestore
    participant Gemini as Gemini API

    User->>App: Ask by text or voice
    App->>Fn: Send question and authenticated uid
    Fn->>DB: Read schedules, notes, transactions and profile
    DB-->>Fn: Context for the current user only
    Fn->>Gemini: Prompt with permitted user context
    Gemini-->>Fn: Answer and suggested actions
    Fn->>DB: Write aiRecommendations and AI usage log
    Fn-->>App: Safe response, priority cards and recommendations
    App-->>User: Show answer in AI Assistant

    opt Dynamic Prioritization
        Fn->>DB: Check urgent exams, deadlines and budgets
        Fn-->>App: Rank urgent information first
        App-->>User: Show AI priority card and compact secondary data
    end

    opt Adaptive Scheduling and Burnout Predictor
        Fn->>DB: Analyze activity, study and sleep-related context
        Fn-->>App: Suggest suitable study time or a short break
        App-->>User: Offer Apply AI Schedule action
    end
```

## 5. Finance, NLP Categorization และข้อมูลเชื่อมกัน

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#6d9270','primaryTextColor':'#233020','primaryBorderColor':'#6d9270','lineColor':'#4b614a','actorBkg':'#eff4ec','actorBorder':'#6d9270','actorTextColor':'#233020','signalColor':'#4b614a','signalTextColor':'#233020','noteBkgColor':'#fffdf7','noteBorderColor':'#cbd8c7','noteTextColor':'#425240'}}}%%
sequenceDiagram
    autonumber
    actor User as User
    participant App as SmartLife App
    participant DB as Cloud Firestore
    participant AI as AI Assistant

    User->>App: Add income or expense manually / from scan
    App->>DB: Save transactions/{transactionId}
    DB-->>App: Real-time transaction update
    App->>App: Format date and time in Asia/Bangkok
    App-->>User: Update Finance Day, Week and Month views

    User->>App: Open categorized finance detail
    App->>DB: Query authenticated user's transactions by category and date
    DB-->>App: Matching Food, Groceries, Transport or other records
    App-->>User: Display appropriate category icon and totals

    opt Schedule affects finance
        App->>DB: Read today's schedule count
        App->>AI: Ask for budget insight with schedule context
        AI-->>App: Suggest food or transport budget
        App-->>User: Display linked schedule-finance recommendation
    end
```

## 6. Admin Console: Monitoring และการจัดการระบบ

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#6d9270','primaryTextColor':'#233020','primaryBorderColor':'#6d9270','lineColor':'#4b614a','actorBkg':'#eff4ec','actorBorder':'#6d9270','actorTextColor':'#233020','signalColor':'#4b614a','signalTextColor':'#233020','noteBkgColor':'#fffdf7','noteBorderColor':'#cbd8c7','noteTextColor':'#425240'}}}%%
sequenceDiagram
    autonumber
    actor Admin as System Administrator
    participant Console as SmartLife Admin App
    participant Auth as Firebase Authentication
    participant Fn as Admin Cloud Functions
    participant DB as Cloud Firestore

    Admin->>Console: Open Admin module
    Console->>Auth: Verify authenticated admin role
    Auth-->>Console: Admin authorization result
    alt Authorized admin
        Console->>Fn: Request protected dashboard summary
        Fn->>DB: Aggregate users, schedules, notes, transactions and AI usage
        DB-->>Fn: System data
        Fn-->>Console: Real dashboard statistics
        Console-->>Admin: Display real system overview
    else Not an admin
        Console-->>Admin: Deny access and return to permitted screen
    end

    par System management
        Admin->>Console: Review users and account status
        Console->>Fn: Admin-only user action
        Fn->>Auth: Update account status or reset workflow
    and Content management
        Admin->>Console: Manage categories and announcements
        Console->>DB: Write admin-managed categories or announcements
    and Quality monitoring
        Admin->>Console: View OCR logs, feedback and AI context
        Console->>Fn: Request admin-only monitoring data
        Fn->>DB: Read scanLogs, feedback and aiRecommendations
    end

    Console-->>Admin: Display System Health for Firestore, OCR, AI and Calendar Sync
```

## ความเชื่อมโยงของข้อมูล

```mermaid
flowchart LR
    U[Authenticated User] --> P[Profile]
    U --> S[Schedules]
    U --> N[Notes]
    U --> T[Transactions]
    U --> L[Scan Logs]
    U --> C[Calendar Connection]
    S --> A[AI Recommendations]
    N --> A
    T --> A
    S --> G[Google Calendar]
    L --> O[Admin OCR Monitor]
    F[Feedback] --> O
    A --> O
```

## ขอบเขตที่ครอบคลุมตามโครงงาน

| ฟังก์ชันโครงงาน | แผนภาพที่เกี่ยวข้อง |
| --- | --- |
| Unified Dashboard และ AI Smart Assistant | 1, 4, 5 |
| Smart Schedule Importer และ OCR | 2 |
| Smart Schedule Builder, Adaptive Schedule, Burnout Coach | 3, 4 |
| Personal Finance Tracker และ NLP Categorization | 2, 5 |
| Calendar Syncing | 3 |
| Admin Dashboard, OCR Log, Feedback, System Health | 6 |

> หมายเหตุ: เอกสารนี้ตั้งใจให้ใช้ใน Proposal, รายงาน Development และการพรีเซนต์ได้เลย โดยไม่ใส่ secret, API key, Firebase configuration หรือข้อมูลผู้ใช้จริง
