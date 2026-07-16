# Firestore OCR fix analysis

- Database: `(default)`, Standard edition.
- User OCR path: `users/{uid}/scanLogs/{scanId}`.
- History reads: listen to the signed-in user's `scanLogs` subcollection and sort at the client so older logs without `createdAt` remain visible.
- OCR log deletion: owner-only `deleteDoc` at the same nested path.
- Calendar deletion: owner-only deletion from `users/{uid}/schedules/{id}` or `users/{uid}/activities/{id}`.
- Finance writes: `users/{uid}/transactions/{id}` with a positive numeric `amount` after client normalization.
- Authentication authority: Firebase Auth UID from `request.auth.uid`; document data is not used to grant ownership.
- Queries involved: schedule/activity range queries ordered by their start timestamp; transaction range query; direct scan log collection listener.
