# Firestore rules audit — 2026-08-15

Scope: all Firestore paths referenced by the Expo client and Cloud Functions, with focused review of the new note-completion fields.

## Result

- No critical or high-severity cross-user access paths found.
- User documents and subcollections are isolated by authenticated UID; admin reads require a trusted custom claim.
- Server-owned adaptive, recommendation, pending-review, push-token, interaction, and system-status records remain client-write denied.
- The default recursive rule denies every unmatched document path.
- Note completion accepts only `pending`/`completed`; a completed note requires a timestamp. Ownership, immutable creation metadata, and server-time update metadata remain enforced.

## Adversarial checks

- Anonymous and cross-user reads of private adaptive data: denied.
- Cross-user note creation/update: denied.
- Note schema pollution and invalid priority/status: denied.
- Completing a note without `completedAt`: denied.
- Owner completing a note with `completedAt` and server-time `updatedAt`: allowed.
- Client forging server-owned adaptive fields or collections: denied.

Automated emulator coverage: `tests/firestore-adaptive-scheduling.rules.test.cjs`.
