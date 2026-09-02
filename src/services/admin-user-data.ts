import {doc, getDoc} from 'firebase/firestore';

import {db} from '@/lib/firebase';
import {isDemoMode} from '@/lib/demo-mode';
import {activities, notes, scanLogs, schedules, transactions} from '@/services/firestore';
import type {Activity, Note, ScanLog, Schedule, Transaction, WithId} from '@/types/smartlife';
import type {AdminEventInput, AdminNoteInput, AdminTransactionInput} from '@/admin/analytics';

/**
 * Reads one selected user's own data on behalf of an administrator.
 *
 * These are deliberately path-scoped reads (`users/{uid}/...`). `firestore.rules`
 * already grants `isAdmin()` read access on every one of these paths, so no new
 * Cloud Function or index is required. Cross-user aggregates cannot go through
 * here: there is no `match /{path=**}` rule, so client-side collection-group
 * queries are denied for everyone and must use an admin callable instead.
 */

export type AdminUserProfile = {
  avatarUrl: string;
  displayName: string;
  email: string;
  id: string;
  role: string;
};

/** Firestore `Timestamp` | `Date` | ISO string -> epoch millis, or null. */
export function toMillis(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toMillis' in value
    && typeof (value as {toMillis?: unknown}).toMillis === 'function') {
    return (value as {toMillis: () => number}).toMillis();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function str(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function toEventInput(item: WithId<Activity> | WithId<Schedule>, entity: 'activity' | 'schedule'): AdminEventInput {
  const activity = item as WithId<Activity>;
  return {
    color: str(item.color, '#6f8f6d'),
    endAtMs: toMillis(item.endAt),
    entity,
    id: item.id,
    location: str(item.location),
    note: entity === 'activity' ? str(activity.note) : str((item as WithId<Schedule>).courseCode),
    startAtMs: toMillis(item.startAt),
    status: entity === 'activity' ? str(activity.status, 'planned') : null,
    title: str(item.title, entity === 'schedule' ? 'คาบเรียน' : 'กิจกรรม'),
    type: entity === 'activity' ? str(activity.type, 'activity') : 'schedule',
  };
}

export function toNoteInput(item: WithId<Note>): AdminNoteInput {
  return {
    category: str(item.category),
    content: str(item.content),
    id: item.id,
    priority: str(item.priority, 'normal'),
    status: str(item.status, 'pending'),
    title: str(item.title, 'ไม่มีหัวข้อ'),
    updatedAtMs: toMillis(item.updatedAt),
  };
}

export function toTransactionInput(item: WithId<Transaction>): AdminTransactionInput {
  return {
    amount: typeof item.amount === 'number' ? item.amount : Number(item.amount),
    category: str(item.category),
    id: item.id,
    merchant: str(item.merchant),
    occurredAtMs: toMillis(item.occurredAt),
    scanId: str(item.scanId),
    source: str(item.source),
    status: str(item.status),
    type: str(item.type),
  };
}

export async function adminUserProfile(uid: string): Promise<AdminUserProfile | null> {
  if (isDemoMode) return {avatarUrl: '', displayName: 'Demo User', email: 'demo@smartlife.local', id: uid, role: 'user'};
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (!snapshot.exists()) return null;
  const data = snapshot.data() as Record<string, unknown>;
  return {
    avatarUrl: str(data.avatarUrl),
    displayName: str(data.displayName),
    email: str(data.email),
    id: snapshot.id,
    role: str(data.role, 'user'),
  };
}

/**
 * Every dated item on one user's calendar for `[from, to)`.
 * Activities and class schedules live in separate collections and are merged
 * here, matching what the user themselves sees on their own calendar.
 */
export async function adminUserCalendar(uid: string, from: Date, to: Date): Promise<AdminEventInput[]> {
  const [activityItems, scheduleItems] = await Promise.all([
    activities.between(uid, from, to),
    schedules.between(uid, from, to),
  ]);
  return [
    ...activityItems.map((item) => toEventInput(item, 'activity')),
    ...scheduleItems.map((item) => toEventInput(item, 'schedule')),
  ];
}

export async function adminUserNotes(uid: string): Promise<AdminNoteInput[]> {
  return (await notes.list(uid)).map(toNoteInput);
}

export async function adminUserTransactions(uid: string, from: Date, to: Date): Promise<AdminTransactionInput[]> {
  return (await transactions.between(uid, from, to)).map(toTransactionInput);
}

export type AdminScanRecord = {
  confidence: number | null;
  createdAtMs: number | null;
  id: string;
  imagePath: string;
  kind: string;
  needsReview: boolean;
  provider: string;
  status: string;
};

function toScanRecord(item: WithId<ScanLog>): AdminScanRecord {
  const confidence = typeof item.ocrConfidence === 'number' ? item.ocrConfidence
    : typeof item.confidence === 'number' ? item.confidence : null;
  return {
    confidence,
    createdAtMs: toMillis(item.createdAt),
    id: item.id,
    imagePath: str(item.imagePath),
    kind: str(item.kind, 'receipt'),
    needsReview: item.needsReview === true || item.verificationStatus === 'needs_review',
    provider: str(item.provider, 'unknown'),
    status: str(item.status, 'pending'),
  };
}

/** Read-only OCR history for one user, newest first. */
export async function adminUserScans(uid: string): Promise<AdminScanRecord[]> {
  return (await scanLogs.list(uid)).map(toScanRecord);
}
