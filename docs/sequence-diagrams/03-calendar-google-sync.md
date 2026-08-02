# 03. Calendar and Google Calendar Sync

แผนภาพนี้ครอบคลุม Calendar แบบ Day / Week / Month / Year, การเชื่อม Google Calendar, การดึงข้อมูลเข้า และการส่งตารางเรียนซ้ำรายสัปดาห์ออกไป

```mermaid
%%{init: {'theme':'base','themeVariables':{'fontFamily':'Arial, Tahoma, sans-serif','primaryColor':'#6F926E','primaryTextColor':'#26331F','primaryBorderColor':'#6F926E','lineColor':'#6F926E','secondaryColor':'#EAF3E8','tertiaryColor':'#FFFFFF','actorBkg':'#F7FAF5','actorBorder':'#6F926E','actorTextColor':'#26331F','signalColor':'#537651','signalTextColor':'#26331F','noteBkgColor':'#EAF3E8','noteBorderColor':'#A7BFA4','noteTextColor':'#334032'}}}%%
sequenceDiagram
    autonumber
    actor User as User
    participant App as SmartLife Calendar
    participant DB as Cloud Firestore
    participant GoogleAuth as Google Sign-In / OAuth
    participant GoogleCal as Google Calendar API

    User->>App: Open Calendar and choose D / W / M / Y
    App->>DB: Read own schedules and activities for selected period
    DB-->>App: Events with date-time data
    App->>App: Format and filter in Asia/Bangkok (UTC+7)
    App-->>User: Render calendar with event indicators

    alt Google Calendar is not connected
        User->>App: Tap Sync with Google Calendar
        App->>GoogleAuth: Request calendar authorization scope
        GoogleAuth-->>App: Authorized account session
        App->>DB: Save connection metadata for users/{uid}
        Note over App,DB: Store connection status and account metadata only.<br/>Do not store raw access tokens in Firestore.
    else Google Calendar is already connected
        App->>DB: Read connection metadata
        DB-->>App: Connected account status
    end

    par Sync down from Google
        User->>App: Tap Sync now
        App->>GoogleCal: Fetch upcoming Google events
        GoogleCal-->>App: Google event list
        App->>DB: Save external event references for own uid
        App-->>User: Show imported events in calendar
    and Sync up from SmartLife
        User->>App: Choose course series to sync
        App->>GoogleCal: Insert recurring event with RRULE<br/>for semester date range
        GoogleCal-->>App: Google event id
        App->>DB: Save sync mapping on course series
        App-->>User: Show successful sync state
    end

    opt Disconnect Google Calendar
        User->>App: Tap Disconnect
        App->>DB: Remove calendar connection metadata and mappings
        App-->>User: Keep SmartLife schedules; stop future sync
    end

    Note over App,GoogleAuth: Native Google Sign-In requires the SmartLife development build<br/>or production build, not Expo Go.
```
