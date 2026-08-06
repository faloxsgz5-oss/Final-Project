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

async function findDuplicateTransaction(
  transaction: FirebaseFirestore.Transaction,
  transactions: FirebaseFirestore.CollectionReference,
  fingerprintValue: string,
  dedupeKeys: string[],
) {
  const fingerprintQuery = transactions
    .where("fingerprint", "==", fingerprintValue)
    .limit(1);
  const fingerprintSnapshot = await transaction.get(fingerprintQuery);
  if (!fingerprintSnapshot.empty) return fingerprintSnapshot.docs[0];

  for (const dedupeKey of dedupeKeys) {
    const semanticSnapshot = await transaction.get(
      transactions
        .where("dedupeKeys", "array-contains", dedupeKey)
        .limit(1),
    );
    if (!semanticSnapshot.empty) return semanticSnapshot.docs[0];
  }
  return null;
}

async function findDuplicatePendingReview(
  transaction: FirebaseFirestore.Transaction,
  pendingReviews: FirebaseFirestore.CollectionReference,
  fingerprintValue: string,
  dedupeKeys: string[],
) {
  const exact = await transaction.get(pendingReviews.doc(fingerprintValue));
  if (exact.exists) return exact;

  for (const dedupeKey of dedupeKeys) {
    const semanticSnapshot = await transaction.get(
      pendingReviews
        .where("dedupeKeys", "array-contains", dedupeKey)
        .limit(1),
    );
    if (!semanticSnapshot.empty) return semanticSnapshot.docs[0];
  }
  return null;
}

function createLineTransactionPayload(
  uid: string,
  draft: ParsedDraft,
  draftFingerprint: string,
  source: LineSource,
  status: "needs_review" | "verified",
  confirmationMethod: "auto_verified_line_notification" | "explicit_user_confirm",
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
    dedupeKeys: semanticDuplicateKeys(draft),
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

  const pendingReviews = db.collection("users").doc(uid)
    .collection("pendingReview");
  const draftRef = pendingReviews.doc(draftFingerprint);
  const transactionRef = db.collection("users").doc(uid)
    .collection("transactions").doc();
  const transactions = db.collection("users").doc(uid)
    .collection("transactions");
  const dedupeKeys = semanticDuplicateKeys(parsedDraft);
  const result = await db.runTransaction(async (transaction) => {
    const existingDraft = await findDuplicatePendingReview(
      transaction,
      pendingReviews,
      draftFingerprint,
      dedupeKeys,
    );
    const existingTransaction = await findDuplicateTransaction(
      transaction,
      transactions,
      draftFingerprint,
      dedupeKeys,
    );
    if (existingDraft?.exists || existingTransaction) {
      return {autoSaved: false, created: false, draftId: draftFingerprint};
    }
    if (shouldAutoSaveLineDraft(parsedDraft)) {
      transaction.create(transactionRef, createLineTransactionPayload(
        uid,
        parsedDraft,
        draftFingerprint,
        source,
        "verified",
        "auto_verified_line_notification",
      ));
      return {
        autoSaved: true,
        created: true,
        draftId: draftFingerprint,
        transactionId: transactionRef.id,
      };
    }
    const createdAt = Timestamp.now();
    transaction.create(draftRef, {
      capturedAt: Timestamp.fromDate(capturedAt),
      createdAt,
      expiresAt: Timestamp.fromMillis(
        createdAt.toMillis() + PENDING_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
      ),
      fingerprint: draftFingerprint,
      dedupeKeys,
      ownerId: uid,
      parsedDraft,
      rawText,
      source,
      status: "pending",
      updatedAt: createdAt,
    });
    return {autoSaved: false, created: true, draftId: draftFingerprint};
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
    if (source === "line_auto_listener") {
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
    }

    const transactions = db.collection("users").doc(uid)
      .collection("transactions");
    const duplicateSnapshot = await findDuplicateTransaction(
      transaction,
      transactions,
      finalFingerprint,
      semanticDuplicateKeys({
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
      }),
    );
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
      }),
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
