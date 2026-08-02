import type { Timestamp } from 'firebase/firestore';

export type ActivityStatus = 'planned' | 'in-progress' | 'completed' | 'cancelled';
export type ActivityType = 'activity' | 'task' | 'appointment';
export type NoteCategory = 'study' | 'work' | 'idea' | 'personal';
export type ScanKind = 'schedule' | 'receipt';
export type ScanStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type TransactionType = 'income' | 'expense';

export type OwnedDocument = {
  createdAt: Timestamp;
  ownerId: string;
  updatedAt: Timestamp;
};

export type Schedule = OwnedDocument & {
  color: string;
  courseCode: string;
  courseName?: string;
  endAt: Timestamp;
  googleCalendarId?: string;
  googleEventId?: string;
  location: string;
  seriesId?: string;
  source: 'manual' | 'ocr' | 'google-calendar' | 'university';
  startAt: Timestamp;
  title: string;
};

export type Activity = OwnedDocument & {
  attendees?: string;
  category?: string;
  color: string;
  endAt: Timestamp;
  location: string;
  note?: string;
  priority?: string;
  reminder?: string;
  source: 'manual' | 'ai';
  startAt: Timestamp;
  status: ActivityStatus;
  title: string;
  type: ActivityType;
};

export type Note = OwnedDocument & {
  category: NoteCategory;
  color: string;
  content: string;
  relatedScheduleId: string;
  title: string;
};

export type Transaction = OwnedDocument & {
  amount: number;
  category: string;
  confidence?: number;
  items?: {
    discountAmount: number;
    finalPrice: number;
    name: string;
    quantity: number;
    unitPrice: number | null;
  }[];
  merchant: string;
  note: string;
  occurredAt: Timestamp;
  receiptPath: string;
  reviewedByUser?: boolean;
  scanId?: string;
  status?: 'verified' | 'needs_review';
  type: TransactionType;
};

export type ScanLog = OwnedDocument & {
  characterCount?: number;
  classification?: {
    confidence?: number;
    scores?: {receipt?: number; schedule?: number};
    type?: ScanKind;
  };
  confidence?: number;
  correctedAt?: Timestamp;
  correctedByUser?: boolean;
  correctedParsed?: Record<string, unknown>;
  correctedTransactionId?: string;
  errorMessage: string;
  extractedText: string;
  imagePath: string;
  kind: ScanKind;
  needsReview?: boolean;
  ocrConfidence?: number;
  parsed?: Record<string, unknown>;
  processed?: Record<string, unknown>;
  provider?: 'iapp' | 'iapp-document' | 'google-vision' | 'google-vision-fallback';
  providerConfidence?: Record<string, unknown>;
  providerError?: string;
  rawAiResult?: Record<string, unknown>;
  rawOcr?: string;
  rawProviderResult?: Record<string, unknown>;
  reviewReasons?: string[];
  status: ScanStatus;
  verificationStatus?: 'verified' | 'needs_review';
};

export type Notification = OwnedDocument & {
  kind: 'urgent' | 'ai' | 'finance' | 'schedule' | 'system';
  message: string;
  read: boolean;
  title: string;
};

export type AiRecommendation = OwnedDocument & {
  action: Record<string, unknown>;
  contextSources: ('schedule' | 'note' | 'finance' | 'behavior')[];
  explanation: string;
  kind: 'priority' | 'schedule' | 'burnout' | 'finance' | 'note';
  status: 'new' | 'accepted' | 'dismissed';
  title: string;
};

export type Feedback = OwnedDocument & {
  message: string;
  status: 'new';
  type: 'ai' | 'schedule-scan' | 'expense-category' | 'other';
};

export type WithId<T> = T & { id: string };

export type Category = {
  active: boolean;
  color: string;
  createdAt: Timestamp;
  domain: 'note' | 'expense' | 'activity';
  icon: string;
  labelEn: string;
  labelTh: string;
  sortOrder: number;
  updatedAt: Timestamp;
};

export type Announcement = {
  active: boolean;
  createdAt: Timestamp;
  createdBy: string;
  endAt: Timestamp;
  kind: 'update' | 'maintenance' | 'feature' | 'urgent';
  message: string;
  startAt: Timestamp;
  title: string;
  updatedAt: Timestamp;
};

export type SystemStatus = {
  checkedAt: Timestamp;
  detail: string;
  latencyMs: number;
  name: string;
  status: 'operational' | 'degraded' | 'outage';
};
