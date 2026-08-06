import * as Crypto from 'expo-crypto';
import {getFunctions, httpsCallable} from 'firebase/functions';

import {ensureAppCheckReady} from '@/lib/app-check';
import {firebaseApp} from '@/lib/firebase';
import {
  maskAccountNumbers,
  normalizeLineText,
  parseLineMessageLocally,
  splitLineMessageBatch,
  type LineTransactionType,
  type ParsedLineTransaction,
  type SupportedBank,
} from '@/services/line-transaction-parser-core';

export type ParsedLineImportDraft = ParsedLineTransaction & {
  fingerprint: string;
  rawText: string;
  type: LineTransactionType;
};

type LlmDraftResponse = {
  draft?: {
    accountLast4?: string | null;
    amount?: number;
    balanceAfterReported?: number | null;
    bank?: SupportedBank;
    category?: string;
    confidence?: number;
    merchant?: string;
    note?: string;
    occurredAt?: string;
    type?: LineTransactionType;
    warnings?: string[];
  } | null;
};

const functions = getFunctions(firebaseApp, 'asia-southeast1');
const LINE_LLM_FALLBACK_ENABLED = false;
const parseWithLlmCall = httpsCallable<
  {capturedAt: string; maskedText: string},
  LlmDraftResponse
>(functions, 'parseLineBankMessage');

export async function fingerprintLineText(rawText: string) {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    normalizeLineText(rawText),
  );
}

function validDateIso(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mergeLlmDraft(
  local: ParsedLineTransaction,
  llm: LlmDraftResponse['draft'],
) {
  if (!llm || typeof llm.amount !== 'number' || llm.amount <= 0) return local;
  const warnings = Array.isArray(llm.warnings)
    ? llm.warnings.filter((value): value is string => typeof value === 'string').slice(0, 8)
    : [];
  const confidence = Math.min(
    0.72,
    Math.max(0.35, typeof llm.confidence === 'number' ? llm.confidence : 0.55),
  );
  return {
    ...local,
    accountLast4: typeof llm.accountLast4 === 'string' ? llm.accountLast4.slice(-4) : local.accountLast4,
    amount: llm.amount,
    balanceAfterReported: typeof llm.balanceAfterReported === 'number'
      ? llm.balanceAfterReported
      : local.balanceAfterReported,
    bank: llm.bank ?? local.bank,
    category: typeof llm.category === 'string' ? llm.category.slice(0, 80) : local.category,
    confidence: Number(confidence.toFixed(2)),
    merchant: typeof llm.merchant === 'string' ? llm.merchant.slice(0, 160) : local.merchant,
    needsReview: true,
    note: typeof llm.note === 'string' ? llm.note.slice(0, 1000) : local.note,
    occurredAt: validDateIso(llm.occurredAt) ?? local.occurredAt,
    parserMode: 'llm' as const,
    type: llm.type === 'income' || llm.type === 'expense' ? llm.type : local.type,
    warnings: [...warnings, 'ข้อมูลนี้ใช้ AI ช่วยแยก กรุณาตรวจสอบก่อนบันทึก'].slice(0, 8),
  };
}

async function tryLlmFallback(
  local: ParsedLineTransaction,
  rawText: string,
  capturedAt: Date,
) {
  if (!LINE_LLM_FALLBACK_ENABLED) return local;
  if (local.bank !== 'unknown' && local.confidence >= 0.65) return local;
  try {
    await ensureAppCheckReady();
    const response = await parseWithLlmCall({
      capturedAt: capturedAt.toISOString(),
      maskedText: maskAccountNumbers(rawText).slice(0, 4_000),
    });
    return mergeLlmDraft(local, response.data.draft);
  } catch {
    return local;
  }
}

export async function parseLineImportMessage(rawText: string, capturedAt = new Date()): Promise<ParsedLineImportDraft | null> {
  const local = parseLineMessageLocally(rawText, capturedAt);
  if (!local) return null;
  const parsed = await tryLlmFallback(local, rawText, capturedAt);
  return {
    ...parsed,
    fingerprint: await fingerprintLineText(rawText),
    rawText,
  };
}

export async function parseLineImportBatch(rawText: string, capturedAt = new Date()) {
  const messages = splitLineMessageBatch(rawText);
  const results: ParsedLineImportDraft[] = [];
  for (const message of messages) {
    const parsed = await parseLineImportMessage(message, capturedAt);
    if (parsed) results.push(parsed);
  }
  return results;
}

export {
  isPotentialFinancialLineMessage,
  maskAccountNumbers,
  normalizeLineText,
  parseLineMessageLocally,
  splitLineMessageBatch,
} from '@/services/line-transaction-parser-core';
