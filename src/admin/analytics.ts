/**
 * Pure analytics for the SmartLife admin dashboard.
 *
 * This module intentionally has no React, Firebase, or `@/` path-alias imports
 * so it can be executed directly by `node --experimental-strip-types`, the same
 * way `src/dashboard` is tested. Everything here is a pure function over plain
 * data; the screen layer adapts Firestore documents into these shapes.
 */

/** Bangkok is UTC+7 with no daylight saving, so a fixed offset is exact. */
export const THAILAND_OFFSET_MINUTES = 7 * 60;

export type AdminUserInput = {
  createdAt?: string | null;
  disabled?: boolean;
  displayName?: string | null;
  email?: string | null;
  lastSignInAt?: string | null;
  uid: string;
};

export type AdminNoteInput = {
  category?: string | null;
  content?: string | null;
  id: string;
  priority?: string | null;
  status?: string | null;
  title?: string | null;
  updatedAtMs?: number | null;
};

export type AdminTransactionInput = {
  amount?: number | null;
  category?: string | null;
  id: string;
  merchant?: string | null;
  occurredAtMs?: number | null;
  scanId?: string | null;
  source?: string | null;
  status?: string | null;
  type?: string | null;
};

export type AdminEventInput = {
  color?: string | null;
  endAtMs?: number | null;
  entity: 'activity' | 'schedule';
  id: string;
  location?: string | null;
  note?: string | null;
  startAtMs?: number | null;
  status?: string | null;
  title?: string | null;
  type?: string | null;
};

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function finite(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trimmed(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

/* ------------------------------------------------------------------ users */

/**
 * Case-insensitive substring match across display name, email, and UID.
 * An empty query returns the list unchanged (same order, new array).
 */
export function filterUsers(users: AdminUserInput[], search: string): AdminUserInput[] {
  const needle = trimmed(search).toLowerCase();
  if (!needle) return [...users];
  return users.filter((user) => {
    const haystack = [user.displayName, user.email, user.uid]
      .map((value) => trimmed(value).toLowerCase())
      .join(' ');
    return haystack.includes(needle);
  });
}

/** Active accounts first, then most-recently-signed-in, then name. */
export function sortUsers(users: AdminUserInput[]): AdminUserInput[] {
  return [...users].sort((first, second) => {
    if (Boolean(first.disabled) !== Boolean(second.disabled)) return first.disabled ? 1 : -1;
    const firstSeen = Date.parse(trimmed(first.lastSignInAt)) || 0;
    const secondSeen = Date.parse(trimmed(second.lastSignInAt)) || 0;
    if (firstSeen !== secondSeen) return secondSeen - firstSeen;
    return trimmed(first.displayName || first.email).localeCompare(trimmed(second.displayName || second.email));
  });
}

/* ------------------------------------------------------------------ notes */

export const NOTE_CATEGORY_LABELS: Record<string, string> = {
  idea: 'ไอเดีย',
  personal: 'ส่วนตัว',
  study: 'การเรียน',
  uncategorized: 'ไม่ระบุหมวด',
  work: 'งาน',
};

const NOTE_CATEGORY_ORDER = ['study', 'work', 'idea', 'personal', 'uncategorized'];

export type NoteCategoryBreakdown = {
  count: number;
  key: string;
  label: string;
  share: number;
};

export type NoteProfile = {
  averageLength: number;
  breakdown: NoteCategoryBreakdown[];
  completed: number;
  dominant: NoteCategoryBreakdown | null;
  open: number;
  priority: {important: number; normal: number; urgent: number};
  summary: string;
  total: number;
};

/**
 * Describes *what kind* of notes a user writes, not just how many.
 * Categories outside the known set fold into `uncategorized`, so the shares
 * always add up to 1.
 */
export function summarizeNotes(notes: AdminNoteInput[]): NoteProfile {
  const total = notes.length;
  const counts = new Map<string, number>();
  const priority = {important: 0, normal: 0, urgent: 0};
  let completed = 0;
  let lengthTotal = 0;

  notes.forEach((note) => {
    const raw = trimmed(note.category).toLowerCase();
    const key = raw && raw !== 'uncategorized' && NOTE_CATEGORY_ORDER.includes(raw) ? raw : 'uncategorized';
    counts.set(key, (counts.get(key) ?? 0) + 1);

    const level = trimmed(note.priority).toLowerCase();
    if (level === 'urgent') priority.urgent += 1;
    else if (level === 'important') priority.important += 1;
    else priority.normal += 1;

    if (trimmed(note.status).toLowerCase() === 'completed') completed += 1;
    lengthTotal += trimmed(note.content).length;
  });

  const breakdown = [...counts.entries()]
    .map(([key, count]) => ({
      count,
      key,
      label: NOTE_CATEGORY_LABELS[key] ?? key,
      share: total ? round(count / total, 3) : 0,
    }))
    .sort((first, second) => second.count - first.count
      || NOTE_CATEGORY_ORDER.indexOf(first.key) - NOTE_CATEGORY_ORDER.indexOf(second.key));

  const dominant = breakdown[0] ?? null;
  const dominantShare = Math.round((dominant?.share ?? 0) * 100);
  const summary = !total
    ? 'ยังไม่มีโน้ต'
    : dominant && dominant.share >= 0.5
      ? `ส่วนใหญ่เป็นโน้ต${dominant.label} (${dominantShare}%)`
      : `เขียนหลากหลายหมวด เด่นที่สุดคือ${dominant ? dominant.label : '-'} (${dominantShare}%)`;

  return {
    averageLength: total ? Math.round(lengthTotal / total) : 0,
    breakdown,
    completed,
    dominant,
    open: total - completed,
    priority,
    summary,
    total,
  };
}

/* ---------------------------------------------------------------- finance */

export type ExpenseCategoryShare = {
  amount: number;
  category: string;
  count: number;
  share: number;
};

export type FinanceSummary = {
  expense: number;
  fromOcr: number;
  income: number;
  needsReview: number;
  net: number;
  savingsRate: number;
  topExpenseCategories: ExpenseCategoryShare[];
  transactionCount: number;
};

/**
 * Income, expense, and derived savings for one user over one period.
 *
 * `net` is the savings figure: SmartLife stores no savings balance anywhere,
 * so it can only ever be income minus expense over the selected range.
 */
export function summarizeFinance(
  transactions: AdminTransactionInput[],
  topCategoryLimit = 5,
): FinanceSummary {
  let income = 0;
  let expense = 0;
  let needsReview = 0;
  let fromOcr = 0;
  const expenseByCategory = new Map<string, {amount: number; count: number}>();

  transactions.forEach((item) => {
    const amount = Math.abs(finite(item.amount));
    const type = trimmed(item.type).toLowerCase();
    if (type === 'income') income += amount;
    else if (type === 'expense') {
      expense += amount;
      const category = trimmed(item.category) || 'ไม่ระบุหมวด';
      const bucket = expenseByCategory.get(category) ?? {amount: 0, count: 0};
      expenseByCategory.set(category, {amount: bucket.amount + amount, count: bucket.count + 1});
    }

    if (trimmed(item.status).toLowerCase() === 'needs_review') needsReview += 1;
    if (trimmed(item.source).toLowerCase() === 'receipt_scan' || trimmed(item.scanId)) fromOcr += 1;
  });

  income = round(income, 2);
  expense = round(expense, 2);
  const net = round(income - expense, 2);

  const topExpenseCategories = [...expenseByCategory.entries()]
    .map(([category, bucket]) => ({
      amount: round(bucket.amount, 2),
      category,
      count: bucket.count,
      share: expense ? round(bucket.amount / expense, 3) : 0,
    }))
    .sort((first, second) => second.amount - first.amount || first.category.localeCompare(second.category))
    .slice(0, Math.max(0, topCategoryLimit));

  return {
    expense,
    fromOcr,
    income,
    needsReview,
    net,
    savingsRate: income > 0 ? round(net / income, 3) : 0,
    topExpenseCategories,
    transactionCount: transactions.length,
  };
}

/* ---------------------------------------------------------- calendar time */

/** `YYYY-MM-DD` for the Bangkok calendar day containing `millis`. */
export function dayKeyFromMillis(millis: number, offsetMinutes = THAILAND_OFFSET_MINUTES) {
  const shifted = new Date(millis + offsetMinutes * 60_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** `YYYY-MM` for the Bangkok calendar month containing `millis`. */
export function monthKeyFromMillis(millis: number, offsetMinutes = THAILAND_OFFSET_MINUTES) {
  return dayKeyFromMillis(millis, offsetMinutes).slice(0, 7);
}

/** Half-open UTC instants `[from, to)` covering one Bangkok month. */
export function monthRange(monthKey: string, offsetMinutes = THAILAND_OFFSET_MINUTES) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error(`Invalid month key: ${monthKey}`);
  }
  const offsetMs = offsetMinutes * 60_000;
  return {
    from: new Date(Date.UTC(year, month - 1, 1) - offsetMs),
    to: new Date(Date.UTC(year, month, 1) - offsetMs),
  };
}

/** Moves a `YYYY-MM` key by whole months, wrapping the year correctly. */
export function shiftMonth(monthKey: string, delta: number) {
  const [year, month] = monthKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

/**
 * Buckets events into Bangkok calendar days, earliest start first.
 * Events without a usable start time are dropped rather than silently
 * collapsing onto the epoch.
 */
export function groupEventsByDay(
  events: AdminEventInput[],
  offsetMinutes = THAILAND_OFFSET_MINUTES,
): Record<string, AdminEventInput[]> {
  const grouped: Record<string, AdminEventInput[]> = {};
  events.forEach((event) => {
    const start = event.startAtMs;
    if (typeof start !== 'number' || !Number.isFinite(start)) return;
    const key = dayKeyFromMillis(start, offsetMinutes);
    (grouped[key] ??= []).push(event);
  });
  Object.values(grouped).forEach((list) => {
    list.sort((first, second) => (first.startAtMs ?? 0) - (second.startAtMs ?? 0));
  });
  return grouped;
}

export type ActivitySummary = {
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  completionRate: number;
  scheduleCount: number;
  total: number;
};

/** Class schedules are counted separately: they have no lifecycle status. */
export function summarizeActivities(events: AdminEventInput[]): ActivitySummary {
  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let scheduleCount = 0;
  let completed = 0;

  events.forEach((event) => {
    if (event.entity === 'schedule') {
      scheduleCount += 1;
      byType.schedule = (byType.schedule ?? 0) + 1;
      return;
    }
    const status = trimmed(event.status).toLowerCase() || 'planned';
    const type = trimmed(event.type).toLowerCase() || 'activity';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    byType[type] = (byType[type] ?? 0) + 1;
    if (status === 'completed') completed += 1;
  });

  const activityTotal = events.length - scheduleCount;
  return {
    byStatus,
    byType,
    completionRate: activityTotal ? round(completed / activityTotal, 3) : 0,
    scheduleCount,
    total: events.length,
  };
}

/* ------------------------------------------------------- per-user series */

export type UserSeriesPoint = {
  count: number;
  label: string;
  ratio: number;
  uid: string;
};

export type UserSeries = {
  hiddenCount: number;
  hiddenUsers: number;
  max: number;
  points: UserSeriesPoint[];
  total: number;
};

/**
 * Ranks users by a single count and normalises each to the largest value, so a
 * bar chart can size itself without knowing the domain.
 *
 * Users beyond `limit` are folded into `hiddenUsers`/`hiddenCount` rather than
 * dropped silently, so the chart can admit what it is not showing.
 */
export function buildUserSeries(
  entries: {count: number; label: string; uid: string}[],
  limit = 8,
): UserSeries {
  const sorted = [...entries]
    .map((entry) => ({...entry, count: Math.max(0, finite(entry.count))}))
    .sort((first, second) => second.count - first.count || first.label.localeCompare(second.label));

  const visible = limit > 0 ? sorted.slice(0, limit) : sorted;
  const hidden = limit > 0 ? sorted.slice(limit) : [];
  const max = visible.reduce((highest, entry) => Math.max(highest, entry.count), 0);

  return {
    hiddenCount: hidden.reduce((sum, entry) => sum + entry.count, 0),
    hiddenUsers: hidden.length,
    max,
    points: visible.map((entry) => ({
      count: entry.count,
      label: entry.label,
      ratio: max > 0 ? round(entry.count / max, 3) : 0,
      uid: entry.uid,
    })),
    total: sorted.reduce((sum, entry) => sum + entry.count, 0),
  };
}

/**
 * Lifecycle states an AI recommendation can report.
 *
 * `seen` and `expired` are declared here because the admin monitor renders the
 * whole vocabulary, but nothing in SmartLife writes them yet — see
 * `summarizeRecommendations`, which reports coverage rather than guessing.
 */
export const RECOMMENDATION_STATUSES = ['new', 'seen', 'accepted', 'dismissed', 'expired'] as const;

export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

/**
 * Tags seen on `aiRecommendations.contextSources` in production.
 *
 * `activity` is not in the `AiRecommendation` TypeScript union but real
 * documents carry it, so it is treated as a first-class source rather than
 * being written off as untagged.
 */
export const RECOMMENDATION_SOURCES = ['schedule', 'activity', 'finance', 'note', 'behavior'] as const;

export type RecommendationSource = (typeof RECOMMENDATION_SOURCES)[number];

export type AdminRecommendationInput = {
  contextSources?: unknown;
  createdAt?: string | null;
  id: string;
  kind?: string | null;
  /** `read` exists on some documents; absent means the app never recorded it. */
  read?: unknown;
  status?: string | null;
  title?: string | null;
};

export type RecommendationSummary = {
  /**
   * Share of decided recommendations that were accepted, or `null` when no
   * recommendation has ever been accepted or dismissed. `null` means "not
   * measurable", and the UI must say that instead of rendering 0%.
   */
  acceptanceRate: number | null;
  /** Recommendations carrying a decided status (accepted or dismissed). */
  decidedCount: number;
  dismissalRate: number | null;
  /**
   * Documents with no readable `status` field at all. These are NOT folded
   * into `new`, because assuming a lifecycle state the writer never set is
   * exactly the kind of invented status this page must avoid.
   */
  missingStatusCount: number;
  /** Real `read` flag coverage, the only per-user signal present today. */
  readCoverage: {missing: number; read: number; unread: number};
  /** Counts per `contextSources` tag; one item can add to several buckets. */
  sourceCounts: Record<RecommendationSource, number>;
  statusCounts: Record<RecommendationStatus, number>;
  /** Statuses that never appear in the data, so the UI can flag the gap. */
  statusesWithoutData: RecommendationStatus[];
  total: number;
  /** Items whose `contextSources` is empty or unrecognised. */
  untaggedCount: number;
};

function normalizeStatus(value: unknown): RecommendationStatus | null {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (RECOMMENDATION_STATUSES as readonly string[]).includes(candidate)
    ? candidate as RecommendationStatus
    : null;
}

/**
 * Counts active recommendations by context source and lifecycle status.
 *
 * Anything unrecognised is counted separately rather than silently folded into
 * a real bucket, so the admin can tell a genuinely empty source apart from
 * schema drift, and an absent status apart from a deliberate `new`.
 */
export function summarizeRecommendations(
  recommendations: AdminRecommendationInput[],
): RecommendationSummary {
  const sourceCounts = Object.fromEntries(
    RECOMMENDATION_SOURCES.map((source) => [source, 0]),
  ) as Record<RecommendationSource, number>;
  const statusCounts = Object.fromEntries(
    RECOMMENDATION_STATUSES.map((status) => [status, 0]),
  ) as Record<RecommendationStatus, number>;
  const readCoverage = {missing: 0, read: 0, unread: 0};
  let missingStatusCount = 0;
  let untaggedCount = 0;

  recommendations.forEach((item) => {
    const tags = Array.isArray(item.contextSources)
      ? item.contextSources.filter((tag): tag is string => typeof tag === 'string')
      : [];
    const known = tags.filter(
      (tag): tag is RecommendationSource =>
        (RECOMMENDATION_SOURCES as readonly string[]).includes(tag),
    );
    if (!known.length) untaggedCount += 1;
    // A single recommendation can cite several sources, so it counts once per
    // distinct tag it actually carries.
    [...new Set(known)].forEach((tag) => { sourceCounts[tag] += 1; });

    const status = normalizeStatus(item.status);
    if (status) statusCounts[status] += 1;
    else missingStatusCount += 1;

    if (item.read === true) readCoverage.read += 1;
    else if (item.read === false) readCoverage.unread += 1;
    else readCoverage.missing += 1;
  });

  const accepted = statusCounts.accepted;
  const dismissed = statusCounts.dismissed;
  const decidedCount = accepted + dismissed;

  return {
    acceptanceRate: decidedCount > 0 ? round(accepted / decidedCount, 3) : null,
    decidedCount,
    dismissalRate: decidedCount > 0 ? round(dismissed / decidedCount, 3) : null,
    missingStatusCount,
    readCoverage,
    sourceCounts,
    statusCounts,
    statusesWithoutData: RECOMMENDATION_STATUSES.filter((status) => statusCounts[status] === 0),
    total: recommendations.length,
    untaggedCount,
  };
}
