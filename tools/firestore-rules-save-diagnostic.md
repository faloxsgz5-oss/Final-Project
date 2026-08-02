# Firestore save diagnostic

This file records the codebase findings used for the Smart Scan save repair. It is intentionally untracked.

## Database and auth

- Firestore edition: Standard, native mode, `(default)` database.
- Firebase project: `smartlife-budget`.
- Client authentication: Firebase Auth email/password, Google, and Facebook. Admin access comes only from the trusted `admin` custom claim.
- User-owned data is stored below `users/{uid}`. Client writes add `ownerId`, `createdAt`, and `updatedAt`; rules bind the path and `ownerId` to `request.auth.uid`.

## Client paths and operations

- `users/{uid}`: create/read/update profile; role, uid, email, and created timestamp are immutable after creation.
- `users/{uid}/schedules/{id}`: owned CRUD; queries by `startAt`, `seriesId`, and `courseCode`.
- `users/{uid}/activities/{id}`: owned CRUD; range queries by `startAt`.
- `users/{uid}/notes/{id}`: owned CRUD; optional category filter and `updatedAt` ordering.
- `users/{uid}/transactions/{id}`: owned CRUD; optional type filter, `occurredAt` range, descending ordering.
- `users/{uid}/scanLogs/{id}`: owned reads/deletes; trusted OCR function creates and updates logs with Admin SDK.
- `users/{uid}/notifications/{id}`: owned reads/deletes and read-state update only; trusted functions create.
- `users/{uid}/aiRecommendations/{id}` and `assistantInteractions/{id}`: owned/admin reads; trusted functions write.
- `users/{uid}/feedback/{id}`: owned create/read; trusted admin monitoring reads collection groups.
- `users/{uid}/integrations/google-calendar`: owned CRUD with fixed provider and immutable connection metadata.
- `categories`, `announcements`: authenticated/public-active reads as specified; admin-claim writes only.
- `systemStatus`: admin read and trusted function write only.

## Save failure evidence

- Smart Scan receipt save writes `confidence`, `items`, `reviewedByUser`, `scanId`, and `status` in addition to the base transaction schema.
- Dedicated finance scans upload to `users/{uid}/receipts/...`.
- Automatic document scans upload to `users/{uid}/scans/...`; OCR can classify one as a receipt, but the prior transaction validator accepted only `/receipts/...`.
- Owned subcollection creates require the parent `users/{uid}` profile. Existing email accounts can sign in without creating a missing profile because the prior email sign-in path did not backfill it.

## Repair scope

- Keep strict owner-path checks and default-deny behavior.
- Accept only the current user's `/receipts` or `/scans` path for a transaction receipt.
- Backfill a missing valid user profile on email sign-in and restored authenticated sessions.
- Deploy the current transaction schema rules so OCR metadata is accepted.
