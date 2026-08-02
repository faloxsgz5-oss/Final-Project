# Firestore OCR security audit

Date: 2026-08-02

## Data and operations reviewed

- User-owned documents live under `users/{uid}` and the subcollections `schedules`, `activities`, `notes`, `transactions`, `notifications`, `scanLogs`, `aiRecommendations`, `assistantInteractions`, `feedback`, and `integrations`.
- Shared collections are `categories`, `announcements`, and `systemStatus`.
- The mobile app reads and writes through `src/services/firestore.ts`; authentication profile writes are in `src/services/auth.ts`; Google Calendar integration writes are in `src/services/google-calendar.ts`.
- Cloud Functions use the Admin SDK for OCR scan processing, assistant context retrieval, telemetry, administration, and the reviewed-receipt save path.
- The receipt save callable reads `users/{uid}/scanLogs/{scanId}`, creates `users/{uid}/transactions/{transactionId}`, and updates only the matching scan log.

## Access-control findings

- All user subcollection reads are scoped to the authenticated UID or to the trusted `admin` custom claim.
- User profile role and email cannot be changed by a normal client, preventing client-side privilege escalation.
- OCR scan log updates are denied to clients. OCR processing and user-confirmed corrections are written by trusted Cloud Functions.
- The reviewed-receipt callable checks Firebase Authentication, App Check, scan ownership, scan type, the exact storage path, field lengths, numeric ranges, item limits, and transaction date range before an atomic write.
- The save is idempotent: a scan with `correctedTransactionId` returns the existing transaction instead of creating a duplicate.
- Transaction and schedule client rules validate ownership, required fields, allowed fields, timestamps, string sizes, date ordering, enums, and receipt path ownership.
- Unmatched document paths are denied by the recursive default rule.

## Devil's-advocate attack review

1. Cross-user scan ID: rejected because the callable resolves the scan only below the authenticated UID and verifies `ownerId`.
2. Reusing another user's Storage path: rejected because the path must begin with `users/{uid}/` and equal the scan log's `imagePath`.
3. Forged receipt payload: rejected for missing merchant/category, non-positive amount, invalid confidence, invalid date, oversized item list, invalid item names, quantities, or prices.
4. Duplicate save/replay: does not create another transaction after the scan log has a `correctedTransactionId`.
5. Direct client mutation of OCR extraction or corrected fields: denied by `allow update: if false` on `scanLogs`.
6. Client attempts to set an admin role: rejected by the fixed `role == 'user'` profile validator and immutable role on update.
7. Collection-group enumeration by a normal user: no collection-group rule grants it; user access is restricted to paths under their UID.
8. Unknown collections or fields: rejected by `hasOnly` validators and the recursive default deny.

## Residual considerations

- Firestore Rules can bound the receipt `items` list but cannot conveniently validate every arbitrary list element. The trusted receipt callable performs the deep item validation before writing.
- Admin SDK code bypasses Firestore Rules by design, so callable validation and App Check remain part of the security boundary and must be covered by deployment tests.
- Rules and callable code should be re-audited when the transaction or OCR schema changes.
