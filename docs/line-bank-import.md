# SmartLife LINE bank transaction import

## Safety model

SmartLife uses a two-tier consent model.

1. `manual_only` is the default. The user pastes or shares a LINE bank notification into SmartLife.
2. `line_auto_sync` is an Android-only opt-in. The user must first consent inside SmartLife and then grant Android Notification Access manually.

Neither mode writes a transaction automatically. Every candidate remains editable and requires an explicit confirmation tap.

## Data flow

### Manual paste/share

1. The user pastes text or shares `text/plain` to SmartLife.
2. The local deterministic parser identifies bank, direction, amount, date, sender/merchant, account suffix, balance and category.
3. If the bank format is unknown or confidence is low, the client may call `parseLineBankMessage`.
4. The client masks account numbers before invoking the callable Claude fallback.
5. The user reviews and edits the draft.
6. `confirmLineTransaction` checks authentication and duplicate fingerprint, then writes the confirmed transaction without raw text.

### Android automatic listener

1. `SmartLifeLineNotificationService` immediately rejects every package except `jp.naver.line.android`.
2. It reads only the notification title and text and keeps messages that contain a monetary signal.
3. The temporary native queue is encrypted with Android Keystore AES-GCM and pruned after seven days.
4. The app parses the queue and sends candidate drafts to `users/{uid}/pendingReview/{fingerprint}`.
5. The user confirms or rejects each draft.
6. Confirmation deletes the pending raw message in the same Firestore transaction. Rejection also deletes it.
7. `cleanupExpiredLinePendingReviews` removes unreviewed cloud drafts after seven days.

## Duplicate handling

The fingerprint is SHA-256 of the normalized complete notification text. A matching transaction does not create a second record. The user can:

- skip the duplicate; or
- update the note on the existing transaction.

The fingerprint includes the sender/merchant text, so equal amounts from different senders remain separate.

## AI fallback

The primary parser is deterministic and includes templates for SCB, KBank, Bangkok Bank, Krungsri, GSB and ttb. Claude is an optional server-side fallback, not the primary source of truth.

- The Anthropic key exists only as the Functions secret `ANTHROPIC_API_KEY`.
- Full account numbers are masked before the request.
- Claude confidence is capped at `0.72`.
- Claude output always remains `needsReview`.
- If the key is absent or the request fails, local parsing and manual review continue to work.

Optional model configuration uses `ANTHROPIC_MODEL`; the default is `claude-sonnet-4-20250514`.

## Required deployment

```powershell
firebase functions:secrets:set ANTHROPIC_API_KEY --project smartlife-budget
firebase deploy --only functions,firestore:rules,firestore:indexes --project smartlife-budget
```

The secret is optional if Claude fallback is not required. The callable Functions, Firestore rules and indexes are required for saving LINE imports.

## Known limitations

- Android cannot grant Notification Access silently. The user must approve it in system settings.
- LINE must display notification previews. Hidden notification content cannot be parsed.
- Android battery optimization may stop background delivery on some vendors.
- LINE package filtering cannot prove that arbitrary pasted text truly came from a bank.
- Banks can change message templates; low-confidence results must be corrected by the user.
- Automatic notification import is unavailable on iOS. Manual paste remains available.
- This feature reads LINE notifications, not bank accounts or historical LINE chat.
