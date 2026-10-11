import {getApps, initializeApp} from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  Timestamp,
} from "firebase-admin/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";

if (!getApps().length) initializeApp();

const db = getFirestore();
const region = "asia-southeast1";

const CONSENT_VERSION = 1;
const AUTO_SAVE_CONFIDENCE = 0.85;
const MAX_RAW_TEXT_LENGTH = 12_000;
const PENDING_RETENTION_DAYS = 7;
const LINE_SOURCES = [
  "bank_auto_listener",
  "line_auto_listener",
  "line_paste",
  "line_share",
] as const;
const BANKS = [
  "bbl",
  "gsb",
  "kbank",
  "krungsri",
  "ktb",
  "scb",
  "ttb",
  "unknown",
] as const;

type ConsentTier = "line_auto_sync" | "manual_only";
type LineSource = typeof LINE_SOURCES[number];
type TransactionType = "expense" | "income";

type ParsedDraft = {
  accountLast4: string | null;
  amount: number;
  balanceAfterReported: number | null;
  bank: typeof BANKS[number];
  category: string;
  confidence: number;
  merchant: string;
  needsReview: boolean;
  note: string;
  occurredAt: string;
  parserMode: "generic" | "llm" | "regex";
  type: TransactionType;
  warnings: string[];
};

function requireUid(request: {auth?: {uid: string}}) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in before importing transactions.");
  }
  return request.auth.uid;
}

function stringValue(value: unknown, field: string, maximum: number) {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const result = value.trim();
  if (result.length > maximum) {
    throw new HttpsError("invalid-argument", `${field} is too long.`);
  }
  return result;
}

function optionalString(
  value: unknown,
  field: string,
  maximum: number,
): string {
  if (value === null || value === undefined) return "";
  return stringValue(value, field, maximum);
}

function finiteNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return value;
}

function optionalNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
) {
  if (value === null || value === undefined) return null;
  return finiteNumber(value, field, minimum, maximum);
}

function isoDate(value: unknown, field: string) {
  const text = stringValue(value, field, 40);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    throw new HttpsError("invalid-argument", `${field} must be an ISO date.`);
  }
  return date;
}

function transactionType(value: unknown): TransactionType {
  if (value !== "expense" && value !== "income") {
    throw new HttpsError("invalid-argument", "type is invalid.");
  }
  return value;
}

function bankCode(value: unknown): typeof BANKS[number] {
  if (!BANKS.includes(value as typeof BANKS[number])) return "unknown";
  return value as typeof BANKS[number];
}

function warnings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 8);
}

function sanitizeDraft(value: unknown): ParsedDraft {
  if (!value || typeof value !== "object") {
    throw new HttpsError("invalid-argument", "parsedDraft is required.");
  }
  const data = value as Record<string, unknown>;
  const accountLast4 = optionalString(
    data.accountLast4,
    "accountLast4",
    4,
  ).replace(/\D/g, "").slice(-4);
  const parserMode = data.parserMode === "regex" ||
    data.parserMode === "llm" ||
    data.parserMode === "generic" ?
    data.parserMode :
    "generic";
  return {
    accountLast4: accountLast4 || null,
    amount: finiteNumber(data.amount, "amount", 0.01, 1_000_000_000),
    balanceAfterReported: optionalNumber(
      data.balanceAfterReported,
      "balanceAfterReported",
      0,
      1_000_000_000_000,
    ),
    bank: bankCode(data.bank),
    category: stringValue(data.category, "category", 80) || "Others",
    confidence: finiteNumber(data.confidence, "confidence", 0, 1),
    merchant: stringValue(data.merchant, "merchant", 160),
    needsReview: data.needsReview !== false,
    note: optionalString(data.note, "note", 1_000),
    occurredAt: isoDate(data.occurredAt, "occurredAt").toISOString(),
    parserMode,
    type: transactionType(data.type),
    warnings: warnings(data.warnings),
  };
}

function fingerprint(value: unknown) {
  const result = stringValue(value, "fingerprint", 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(result)) {
    throw new HttpsError("invalid-argument", "fingerprint is invalid.");
  }
  return result;
}

function hasMoneySignal(value: string) {
  return /(?:[๐-๙\d][๐-๙\d,]*(?:\.[๐-๙\d]{1,2})?\s*(?:บาท|THB)|฿\s*[๐-๙\d])/i
    .test(value);
}

function shouldAutoSaveLineDraft(draft: ParsedDraft) {
  return (
    draft.confidence >= AUTO_SAVE_CONFIDENCE &&
    draft.needsReview === false &&
    draft.amount > 0 &&
    draft.merchant.trim().length > 0 &&
    draft.warnings.length === 0
  );
}

function amountSatang(value: number) {
  return Math.round(value * 100);
}

function semanticTimeBucket(occurredAt: string) {
  const millis = new Date(occurredAt).getTime();
  const fiveMinutes = 5 * 60 * 1_000;
  return Math.floor(millis / fiveMinutes);
}

function semanticDuplicateBase(draft: ParsedDraft) {
  const bank = draft.bank || "unknown";
  const account = draft.accountLast4 || "noacct";
  const balance = draft.balanceAfterReported === null ?
    "nobal" :
    amountSatang(draft.balanceAfterReported);
  return [
    bank,
    account,
    draft.type,
    amountSatang(draft.amount),
    balance,
  ].join("|");
}

function semanticDuplicateKeys(draft: ParsedDraft) {
  const base = semanticDuplicateBase(draft);
  const bucket = semanticTimeBucket(draft.occurredAt);
  return [bucket - 1, bucket, bucket + 1]
    .map((item) => `${base}|t${item}`);
}

/*
 * Duplicate detection (FN-001).
 *
 * There is no LINE webhook in this system: an Android notification listener
 * reads LINE and bank-app notifications and the app forwards them here. The
 * duplicates that really happen are:
 *   1. the same notification posted again by Android, or a queued item re-sent
 *      after a sync that did not finish -- identical text, and from current
 *      clients the same `captureId` (the device queue's id for that capture);
 *   2. one transfer reported twice, by LINE and by the bank's own app --
 *      different text from two sources, same amount, minutes apart.
 * The old check keyed only on bank|account|type|amount|balance in a 5-minute
 * bucket, so with no balance or account in the text it treated two different
 * purchases of the same amount as one and silently dropped the second.
 *
 * Now:
 *   - same capture id                                   -> the same notice: ignore
 *   - identical normalised text within SAME_TEXT_WINDOW -> a re-post: ignore
 *   - identical text further apart                      -> possible duplicate
 *   - different text, same amount and type within SEMANTIC_WINDOW:
 *       both carry a balance: equal -> same transfer (ignore), else different;
 *       different accounts or banks                     -> different;
 *       same source (both LINE, both one bank app)      -> different notices;
 *       otherwise (two sources, nothing to tell them apart) -> possible duplicate
 * A possible duplicate is never dropped: it waits in pendingReview with a Thai
 * warning, and confirming it saves it.
 */
export const SAME_TEXT_WINDOW_MS = 10 * 60 * 1_000;
export const SEMANTIC_WINDOW_MS = 10 * 60 * 1_000;

type DuplicateCandidate = {
  accountLast4: string | null;
  amount: number;
  balanceAfterReported: number | null;
  bank: string;
  captureId: string;
  fingerprint: string;
  occurredAtMs: number;
  source: string;
  type: TransactionType;
};

type DuplicateVerdict = {
  kind: "possible" | "same";
  snapshot: FirebaseFirestore.DocumentSnapshot;
};

function captureKey(captureId: string) {
  return `capture:${captureId}`;
}

/** The device queue's id for one captured notification, when a client sends it. */
function optionalCaptureId(value: unknown) {
  const text = optionalString(value, "captureId", 128);
  if (text && !/^[A-Za-z0-9_-]{1,128}$/.test(text)) {
    throw new HttpsError("invalid-argument", "captureId is invalid.");
  }
  return text;
}

function timestampMillis(value: unknown) {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "string") {
    const millis = Date.parse(value);
    return Number.isNaN(millis) ? null : millis;
  }
  return null;
}

/** What a stored transaction or pending draft says about itself. */
function comparableOf(snapshot: FirebaseFirestore.DocumentSnapshot): Omit<DuplicateCandidate, "captureId"> | null {
  const data = snapshot.data();
  if (!data) return null;
  const draft = (data.parsedDraft ?? data) as Record<string, unknown>;
  const occurredAtMs = timestampMillis(draft.occurredAt);
  const amount = Number(draft.amount);
  if (occurredAtMs === null || !Number.isFinite(amount)) return null;
  const balance = draft.balanceAfterReported;
  return {
    accountLast4: typeof draft.accountLast4 === "string" && draft.accountLast4 ? draft.accountLast4 : null,
    amount,
    balanceAfterReported: typeof balance === "number" && Number.isFinite(balance) ? balance : null,
    bank: typeof draft.bank === "string" ? draft.bank : "unknown",
    fingerprint: typeof data.fingerprint === "string" ? data.fingerprint : "",
    occurredAtMs,
    source: typeof data.source === "string" ? data.source : "manual_entry",
    type: draft.type === "income" ? "income" : "expense",
  };
}

/** How `existing` relates to the incoming notice. */
export function duplicateRelation(
  candidate: Omit<DuplicateCandidate, "captureId">,
  existing: Omit<DuplicateCandidate, "captureId">,
): "different" | "possible" | "same" {
  const apart = Math.abs(candidate.occurredAtMs - existing.occurredAtMs);
  if (candidate.fingerprint && candidate.fingerprint === existing.fingerprint) {
    return apart <= SAME_TEXT_WINDOW_MS ? "same" : "possible";
  }
  if (candidate.type !== existing.type) return "different";
  if (amountSatang(candidate.amount) !== amountSatang(existing.amount)) return "different";
  if (apart > SEMANTIC_WINDOW_MS) return "different";
  if (candidate.balanceAfterReported !== null && existing.balanceAfterReported !== null) {
    return amountSatang(candidate.balanceAfterReported) === amountSatang(existing.balanceAfterReported) ?
      "same" :
      "different";
  }
  if (candidate.accountLast4 && existing.accountLast4 && candidate.accountLast4 !== existing.accountLast4) {
    return "different";
  }
  const knownBank = (bank: string) => bank && bank !== "unknown";
  if (knownBank(candidate.bank) && knownBank(existing.bank) && candidate.bank !== existing.bank) return "different";
  if (candidate.source === existing.source) return "different";
  return "possible";
}

/**
 * Looks for an earlier record of the same notice among the user's
 * transactions and pending drafts. All reads happen inside `transaction`, so
 * two deliveries of one notice cannot both pass the check.
 */
async function findLineDuplicate(
  transaction: FirebaseFirestore.Transaction,
  uid: string,
  candidate: DuplicateCandidate,
  ignorePendingId = "",
): Promise<DuplicateVerdict | null> {
  const user = db.collection("users").doc(uid);
  const transactions = user.collection("transactions");
  const pending = user.collection("pendingReview");
  const window = SEMANTIC_WINDOW_MS + SAME_TEXT_WINDOW_MS;
  const from = Timestamp.fromMillis(candidate.occurredAtMs - window);
  const to = Timestamp.fromMillis(candidate.occurredAtMs + window);

  const reads: Promise<FirebaseFirestore.QuerySnapshot>[] = [
    transaction.get(transactions.where("fingerprint", "==", candidate.fingerprint).limit(20)),
    transaction.get(transactions.where("occurredAt", ">=", from).where("occurredAt", "<=", to).limit(100)),
    transaction.get(pending.where("fingerprint", "==", candidate.fingerprint).limit(20)),
    // Pending drafts keep `occurredAt` as text inside `parsedDraft`; the
    // capture time sits close enough to it to narrow the search.
    transaction.get(pending
      .where("capturedAt", ">=", Timestamp.fromMillis(candidate.occurredAtMs - window - 60 * 60 * 1_000))
      .where("capturedAt", "<=", Timestamp.fromMillis(candidate.occurredAtMs + window + 60 * 60 * 1_000))
      .limit(100)),
  ];
  if (candidate.captureId) {
    reads.push(transaction.get(transactions.where("dedupeKeys", "array-contains", captureKey(candidate.captureId)).limit(1)));
    reads.push(transaction.get(pending.where("captureId", "==", candidate.captureId).limit(1)));
  }
  const snapshots = await Promise.all(reads);
  // The same capture id means the same notice, however much later it arrives
  // (the pending draft being confirmed is, of course, not its own duplicate).
  const sameCapture = snapshots.slice(4).flatMap((snapshot) => snapshot.docs).find((item) => item.id !== ignorePendingId);
  if (sameCapture) return {kind: "same", snapshot: sameCapture};

  const seen = new Set<string>();
  let possible: DuplicateVerdict | null = null;
  for (const snapshot of snapshots.slice(0, 4)) {
    for (const item of snapshot.docs) {
      if (seen.has(item.ref.path) || item.id === ignorePendingId) continue;
      seen.add(item.ref.path);
      const existing = comparableOf(item);
      if (!existing) continue;
      const relation = duplicateRelation(candidate, existing);
      if (relation === "same") return {kind: "same", snapshot: item};
      if (relation === "possible" && !possible) possible = {kind: "possible", snapshot: item};
    }
  }
  return possible;
}

function bangkokTime(millis: number) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric", hour: "2-digit", minute: "2-digit", month: "short", timeZone: "Asia/Bangkok",
  }).format(new Date(millis));
}

/** The Thai warning a flagged draft carries into the review list. */
function possibleDuplicateWarning(existing: FirebaseFirestore.DocumentSnapshot) {
  const facts = comparableOf(existing);
  const draft = (existing.get("parsedDraft") ?? existing.data() ?? {}) as Record<string, unknown>;
  const merchant = typeof draft.merchant === "string" && draft.merchant ? ` ${draft.merchant.slice(0, 40)}` : "";
  const when = facts ? ` เมื่อ ${bangkokTime(facts.occurredAtMs)}` : "";
  const amount = facts ? ` ฿${facts.amount.toLocaleString("th-TH", {maximumFractionDigits: 2})}` : "";
  return `อาจซ้ำกับรายการที่มีอยู่แล้ว${amount}${merchant}${when} ถ้าเป็นคนละรายการ กดยืนยันเพื่อบันทึก`.slice(0, 240);
}

function createLineTransactionPayload(
  uid: string,
  draft: ParsedDraft,
  draftFingerprint: string,
  source: LineSource,
  status: "needs_review" | "verified",
  confirmationMethod: "auto_verified_line_notification" | "explicit_user_confirm",
  captureId = "",
) {
  return {
    accountLast4: draft.accountLast4 || null,
    amount: draft.amount,
    balanceAfterReported: draft.balanceAfterReported,
    bank: draft.bank || "unknown",
    category: draft.category || "Others",
    confidence: draft.confidence,
    confirmationMethod,
    createdAt: FieldValue.serverTimestamp(),
    // The capture id rides in the existing key list, so a late re-send of the
    // same notice is recognised without a new field on the transaction.
    dedupeKeys: [...semanticDuplicateKeys(draft), ...(captureId ? [captureKey(captureId)] : [])],
    fingerprint: draftFingerprint,
    merchant: draft.merchant,
    note: draft.note,
    occurredAt: Timestamp.fromDate(new Date(draft.occurredAt)),
    ownerId: uid,
    rawTextRetained: false,
    receiptPath: "",
    reviewedAt: confirmationMethod === "explicit_user_confirm" ?
      FieldValue.serverTimestamp() :
      null,
    reviewedByUser: confirmationMethod === "explicit_user_confirm",
    source,
    status,
    type: draft.type,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export const updateLineConsent = onCall({region}, async (request) => {
  const uid = requireUid(request);
  const tier = request.data?.tier as ConsentTier;
  if (tier !== "manual_only" && tier !== "line_auto_sync") {
    throw new HttpsError("invalid-argument", "Consent tier is invalid.");
  }
  const method = request.data?.method === "onboarding" ?
    "onboarding" :
    "settings";
  const profile = db.collection("users").doc(uid);
  const listenerStatus = tier === "line_auto_sync" ?
    "permission_revoked" :
    "not_applicable";

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(profile);
    if (!snapshot.exists) {
      throw new HttpsError("failed-precondition", "User profile does not exist.");
    }
    const history = Array.isArray(snapshot.get("consentHistory")) ?
      snapshot.get("consentHistory").slice(-49) :
      [];
    transaction.update(profile, {
      consentHistory: [
        ...history,
        {changedAt: Timestamp.now(), method, tier},
      ],
      consentTier: tier,
      lineConsentUpdatedAt: FieldValue.serverTimestamp(),
      lineConsentVersion: CONSENT_VERSION,
      lineListenerStatus: listenerStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return {lineListenerStatus: listenerStatus, tier};
});

export const reportLineListenerStatus = onCall({region}, async (request) => {
  const uid = requireUid(request);
  const status = request.data?.status;
  if (
    status !== "active" &&
    status !== "permission_revoked" &&
    status !== "not_applicable"
  ) {
    throw new HttpsError("invalid-argument", "Listener status is invalid.");
  }
  const profile = db.collection("users").doc(uid);
  const snapshot = await profile.get();
  if (!snapshot.exists) {
    throw new HttpsError("failed-precondition", "User profile does not exist.");
  }
  const tier = snapshot.get("consentTier") ?? "manual_only";
  const safeStatus = tier === "line_auto_sync" ? status : "not_applicable";
  await profile.update({
    lineListenerStatus: safeStatus,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return {status: safeStatus};
});

export const enqueueLinePendingReview = onCall({region}, async (request) => {
  const uid = requireUid(request);
  const rawText = stringValue(
    request.data?.rawText,
    "rawText",
    MAX_RAW_TEXT_LENGTH,
  );
  if (!rawText || !hasMoneySignal(rawText)) {
    throw new HttpsError("invalid-argument", "No financial amount was detected.");
  }
  const draftFingerprint = fingerprint(request.data?.fingerprint);
  const parsedDraft = sanitizeDraft(request.data?.parsedDraft);
  const capturedAt = isoDate(request.data?.capturedAt, "capturedAt");
  const source = request.data?.source === "bank_auto_listener" ?
    "bank_auto_listener" :
    "line_auto_listener";
  const profile = await db.collection("users").doc(uid).get();
  if (profile.get("consentTier") !== "line_auto_sync") {
    throw new HttpsError(
      "permission-denied",
      "Automatic LINE import consent is not active.",
    );
  }

  // Optional and additive: older apps do not send it and are matched on content.
  const captureId = optionalCaptureId(request.data?.captureId);

  const pendingReviews = db.collection("users").doc(uid)
    .collection("pendingReview");
  const transactionRef = db.collection("users").doc(uid)
    .collection("transactions").doc();
  const dedupeKeys = semanticDuplicateKeys(parsedDraft);
  const candidate: DuplicateCandidate = {
    accountLast4: parsedDraft.accountLast4,
    amount: parsedDraft.amount,
    balanceAfterReported: parsedDraft.balanceAfterReported,
    bank: parsedDraft.bank,
    captureId,
    fingerprint: draftFingerprint,
    occurredAtMs: Date.parse(parsedDraft.occurredAt),
    source,
    type: parsedDraft.type,
  };
  const result = await db.runTransaction(async (transaction) => {
    const duplicate = await findLineDuplicate(transaction, uid, candidate);
    const fingerprintIdTaken = (await transaction.get(pendingReviews.doc(draftFingerprint))).exists;
    if (duplicate?.kind === "same") {
      return {autoSaved: false, created: false, draftId: draftFingerprint};
    }
    if (!duplicate && shouldAutoSaveLineDraft(parsedDraft)) {
      transaction.create(transactionRef, createLineTransactionPayload(
        uid,
        parsedDraft,
        draftFingerprint,
        source,
        "verified",
        "auto_verified_line_notification",
        captureId,
      ));
      return {
        autoSaved: true,
        created: true,
        draftId: draftFingerprint,
        transactionId: transactionRef.id,
      };
    }
    // A possible duplicate is never auto-saved and never dropped: it waits for
    // the user with a warning that says what it may repeat. Its id cannot be
    // the fingerprint, which an identical earlier draft may already use.
    const draftRef = duplicate || fingerprintIdTaken ? pendingReviews.doc() : pendingReviews.doc(draftFingerprint);
    const draftToStore = duplicate ?
      {...parsedDraft, needsReview: true, warnings: [possibleDuplicateWarning(duplicate.snapshot), ...parsedDraft.warnings].slice(0, 8)} :
      parsedDraft;
    const createdAt = Timestamp.now();
    transaction.create(draftRef, {
      capturedAt: Timestamp.fromDate(capturedAt),
      ...(captureId ? {captureId} : {}),
      createdAt,
      expiresAt: Timestamp.fromMillis(
        createdAt.toMillis() + PENDING_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
      ),
      fingerprint: draftFingerprint,
      dedupeKeys,
      ownerId: uid,
      parsedDraft: draftToStore,
      ...(duplicate ? {possibleDuplicateOf: duplicate.snapshot.ref.path} : {}),
      rawText,
      source,
      status: "pending",
      updatedAt: createdAt,
    });
    return {
      autoSaved: false,
      created: true,
      draftId: draftRef.id,
      ...(duplicate ? {possibleDuplicate: true} : {}),
    };
  });
  return result;
});

export const confirmLineTransaction = onCall({region}, async (request) => {
  const uid = requireUid(request);
  const source = request.data?.source as LineSource;
  if (!LINE_SOURCES.includes(source)) {
    throw new HttpsError("invalid-argument", "Import source is invalid.");
  }
  const inputFingerprint = fingerprint(request.data?.fingerprint);
  const draftId = optionalString(request.data?.draftId, "draftId", 128);
  const duplicateAction = request.data?.duplicateAction ?? undefined;
  if (
    duplicateAction !== undefined &&
    duplicateAction !== "skip" &&
    duplicateAction !== "update_note"
  ) {
    throw new HttpsError("invalid-argument", "Duplicate action is invalid.");
  }
  const accountLast4 = optionalString(
    request.data?.accountLast4,
    "accountLast4",
    4,
  ).replace(/\D/g, "").slice(-4);
  const amount = finiteNumber(
    request.data?.amount,
    "amount",
    0.01,
    1_000_000_000,
  );
  const balanceAfterReported = optionalNumber(
    request.data?.balanceAfterReported,
    "balanceAfterReported",
    0,
    1_000_000_000_000,
  );
  const bank = optionalString(request.data?.bank, "bank", 40);
  const category = stringValue(request.data?.category, "category", 80);
  const confidence = finiteNumber(
    request.data?.confidence,
    "confidence",
    0,
    1,
  );
  const merchant = stringValue(request.data?.merchant, "merchant", 160);
  const note = optionalString(request.data?.note, "note", 1_000);
  const occurredAt = isoDate(request.data?.occurredAt, "occurredAt");
  const type = transactionType(request.data?.type);
  const needsReview = request.data?.needsReview === true;

  const result = await db.runTransaction(async (transaction) => {
    let pendingRef: FirebaseFirestore.DocumentReference | null = null;
    let finalFingerprint = inputFingerprint;
    let pendingSource = source;
    let pendingCaptureId = "";
    let flaggedAsPossibleDuplicate = false;
    // A bank-app draft is a pending review too; with its id it is looked up and
    // cleared exactly like a LINE one (it used to be left behind after saving).
    if (source === "line_auto_listener" || (source === "bank_auto_listener" && draftId)) {
      if (!draftId) {
        throw new HttpsError("failed-precondition", "Pending draft is required.");
      }
      pendingRef = db.collection("users").doc(uid)
        .collection("pendingReview").doc(draftId);
      const pending = await transaction.get(pendingRef);
      if (
        !pending.exists ||
        pending.get("ownerId") !== uid ||
        pending.get("status") !== "pending"
      ) {
        throw new HttpsError("not-found", "Pending review was not found.");
      }
      finalFingerprint = pending.get("fingerprint");
      pendingSource = pending.get("source") ?? source;
      pendingCaptureId = typeof pending.get("captureId") === "string" ? pending.get("captureId") : "";
      flaggedAsPossibleDuplicate = typeof pending.get("possibleDuplicateOf") === "string";
    }

    const transactions = db.collection("users").doc(uid)
      .collection("transactions");
    const verdict = await findLineDuplicate(transaction, uid, {
      accountLast4: accountLast4 || null,
      amount,
      balanceAfterReported,
      bank: bankCode(bank),
      captureId: pendingCaptureId,
      fingerprint: finalFingerprint,
      occurredAtMs: occurredAt.getTime(),
      source: pendingSource,
      type,
    }, pendingRef?.id ?? "");
    // The user has already been shown that this draft might repeat an earlier
    // record and confirmed it anyway: that is the decision, so save it.
    const duplicateSnapshot = verdict && !(flaggedAsPossibleDuplicate && verdict.kind === "possible") ?
      verdict.snapshot :
      null;
    if (duplicateSnapshot) {
      const existing = duplicateSnapshot;
      if (duplicateAction === "skip") {
        if (pendingRef) transaction.delete(pendingRef);
        return {duplicate: true, skipped: true};
      }
      if (duplicateAction === "update_note") {
        transaction.update(existing.ref, {
          note,
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (pendingRef) transaction.delete(pendingRef);
        return {
          duplicate: true,
          existingTransactionId: existing.id,
          updatedNote: true,
        };
      }
      return {
        duplicate: true,
        existingNote: existing.get("note") ?? "",
        existingTransactionId: existing.id,
      };
    }

    const reference = transactions.doc();
    transaction.create(reference, {
      accountLast4: accountLast4 || null,
      amount,
      balanceAfterReported,
      bank: bank || "unknown",
      category: category || "Others",
      confidence,
      confirmationMethod: "explicit_user_confirm",
      createdAt: FieldValue.serverTimestamp(),
      dedupeKeys: semanticDuplicateKeys({
        accountLast4: accountLast4 || null,
        amount,
        balanceAfterReported,
        bank: bankCode(bank),
        category,
        confidence,
        merchant,
        needsReview,
        note,
        occurredAt: occurredAt.toISOString(),
        parserMode: "generic",
        type,
        warnings: [],
      }).concat(pendingCaptureId ? [captureKey(pendingCaptureId)] : []),
      fingerprint: finalFingerprint,
      merchant,
      note,
      occurredAt: Timestamp.fromDate(occurredAt),
      ownerId: uid,
      rawTextRetained: false,
      receiptPath: "",
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedByUser: true,
      source: pendingSource,
      status: needsReview ? "needs_review" : "verified",
      type,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (pendingRef) transaction.delete(pendingRef);
    return {saved: true, transactionId: reference.id};
  });
  return result;
});

export const rejectLinePendingReview = onCall({region}, async (request) => {
  const uid = requireUid(request);
  const draftId = stringValue(request.data?.draftId, "draftId", 128);
  const reference = db.collection("users").doc(uid)
    .collection("pendingReview").doc(draftId);
  const snapshot = await reference.get();
  if (!snapshot.exists) return {deleted: false};
  if (snapshot.get("ownerId") !== uid) {
    throw new HttpsError("permission-denied", "This draft belongs to another user.");
  }
  await reference.delete();
  return {deleted: true};
});

export const parseLineBankMessage = onCall(
  {
    enforceAppCheck: true,
    region,
    timeoutSeconds: 30,
  },
  async () => {
    // Anthropic fallback is intentionally disabled until the production
    // project has a real ANTHROPIC_API_KEY secret. The client still has the
    // deterministic parser and treats this callable failure as non-fatal.
    throw new HttpsError(
      "failed-precondition",
      "AI parser is not configured.",
    );
  },
);

/*
async function parseLineBankMessageWithAnthropic(request: {
  auth?: {uid: string};
  data?: {maskedText?: unknown; capturedAt?: unknown};
}) {
    requireUid(request);
    const maskedText = maskAccounts(
      stringValue(request.data?.maskedText, "maskedText", 4_000),
    );
    if (!hasMoneySignal(maskedText)) return {draft: null};
    const capturedAt = isoDate(request.data?.capturedAt, "capturedAt");
    const apiKey = anthropicApiKey.value();
    if (!apiKey) {
      throw new HttpsError(
        "failed-precondition",
        "AI parser is not configured.",
      );
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      body: JSON.stringify({
        max_tokens: 700,
        messages: [{
          content: [
            "Extract one Thai bank transaction from the notification below.",
            `Capture time: ${capturedAt.toISOString()}`,
            "Return JSON only with fields: accountLast4, amount, balanceAfterReported, bank, category, confidence, merchant, needsReview, note, occurredAt, parserMode, type, warnings.",
            "bank must be bbl|gsb|kbank|krungsri|ktb|scb|ttb|unknown.",
            "type must be income|expense. parserMode must be llm.",
            "Never invent an unknown value. Use null, empty string, or a warning.",
            "Confidence must not exceed 0.72 because the user must review.",
            "Notification:",
            maskedText,
          ].join("\n"),
          role: "user",
        }],
        model: anthropicModel.value(),
        system: "You are a strict financial notification parser. Output valid JSON only.",
      }),
      headers: {
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      method: "POST",
    });
    if (!response.ok) {
      throw new HttpsError("unavailable", "AI parser is temporarily unavailable.");
    }
    const payload = await response.json() as {
      content?: {text?: string; type?: string}[];
    };
    const text = payload.content?.find((item) => item.type === "text")?.text;
    if (!text) return {draft: null};
    try {
      const draft = parseClaudeJson(text);
      return {
        draft: {
          ...draft,
          confidence: Math.min(0.72, draft.confidence),
          needsReview: true,
          parserMode: "llm",
        },
      };
    } catch {
      return {draft: null};
    }
}
*/

export const cleanupExpiredLinePendingReviews = onSchedule(
  {
    region,
    schedule: "every day 03:20",
    timeZone: "Asia/Bangkok",
  },
  async () => {
    const snapshot = await db.collectionGroup("pendingReview")
      .where("expiresAt", "<=", Timestamp.now())
      .limit(400)
      .get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach((item) => batch.delete(item.ref));
    await batch.commit();
  },
);
