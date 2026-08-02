# Firestore assistant history security audit

Date: 2026-08-02

## Scope and data model

- `users/{uid}/assistantConversations/{conversationId}` stores only persistent chat metadata: `ownerId`, fixed `mode`, bounded title/preview, message count, compact conversation state, and timestamps.
- `users/{uid}/assistantConversations/{conversationId}/messages/{messageId}` stores a bounded user/assistant message and a JSON payload containing UI metadata such as suggestions, feedback, and proposed-action status.
- Temporary chats intentionally never write to Firestore or AsyncStorage.
- Uploaded assistant files use Storage path `users/{uid}/assistant-files/{generatedFileName}`. Firestore does not store public download URLs for these files.

## Client queries and mutations reviewed

- List the signed-in user's conversations, ordered by `updatedAt` descending, limited to 50.
- Load one conversation's messages, ordered by `createdAt` ascending, limited to 180.
- Create or update one conversation metadata document together with one message document.
- Update only a message's `payload` and `updatedAt` for feedback/action-state changes.
- Delete up to 180 child messages, then delete the parent conversation.
- Upload one PDF/TXT/CSV/ICS file, limited to 8 MB, before authenticated callable analysis.

## Authentication and authorization assumptions

- Firebase Authentication is required for every client read/write.
- The path UID must equal `request.auth.uid`; admins may read for support but cannot mutate user chat history through client rules.
- A corresponding `users/{uid}` profile must exist before chat documents can be created.
- Cloud Functions use Admin SDK access only after verifying callable authentication, App Check, the owner path, stored MIME type, extension, and size.

## Validation controls

- Both create and update rules call explicit schema validators.
- Schemas use `hasAll` plus `hasOnly`; unknown fields are rejected.
- `ownerId`, `createdAt`, and immutable fields cannot be changed on update.
- Conversation updates are limited to title, preview, count, state, and `updatedAt`.
- Message updates are limited to payload and `updatedAt`; role and content are immutable.
- String lengths, message counts, enum values, and timestamps are bounded.
- Storage accepts only exact PDF/TXT/CSV/ICS MIME-and-extension pairs and forbids overwrite.
- The Gemini file prompt treats file contents as untrusted data and refuses to follow instructions embedded in a document.

## Devil's-advocate audit

1. Cross-account path substitution: denied because both Firestore and Storage compare the path UID with the authenticated UID; the callable repeats the same ownership check.
2. Forged owner field: denied by validators and immutable owner metadata checks.
3. Adding hidden or oversized fields: denied by `hasOnly` and field-size limits.
4. Editing model/user text after creation: denied because message updates may affect only `payload` and `updatedAt`.
5. Replacing an uploaded file after analysis: denied because Storage `update` is false and filenames are generated.
6. MIME spoofing: reduced by exact extension/MIME pairing on both upload rules and callable metadata validation. File magic-byte inspection is not implemented; Gemini still receives the stored MIME type and malformed files fail analysis.
7. Prompt injection in a document: document text is explicitly delimited as untrusted and the model is instructed not to follow embedded instructions. Model-level defenses are not a substitute for authorization; no privileged tool is exposed to this analysis endpoint.
8. Unbounded reads or writes: list/read limits and 8 MB upload limits are enforced. A single client deletion handles 180 messages, matching the client history cap.
9. Temporary-chat leakage: client persistence paths are skipped while temporary mode is active. Requests still transit the authenticated Cloud Function and Gemini service to produce a response.
10. App Check bypass from an unofficial client: callable endpoints enforce App Check. Direct Firestore/Storage access still requires a valid Firebase Auth session and owner-only rules.

## Residual risk and hardening notes

- A compromised authenticated device can read that same user's persistent history; this is expected owner access, not end-to-end encryption.
- Admin custom claims permit read access for support. Remove admin read access if operational support does not require it.
- Automatic file retention/deletion is not yet scheduled. Add a user-facing file manager or lifecycle policy if long-term retention is undesirable.
- Emulator tests should cover owner access, cross-owner denial, malformed schemas, immutable-field changes, unsupported MIME types, overwrite denial, and temporary-chat non-persistence.

## Assessment

Prototype readiness score: 4/5. The rules are owner-scoped, schema-restricted, size-bounded, and default-deny. Remaining work is primarily exhaustive emulator coverage and an explicit uploaded-file retention policy.
