import type {
  AssignmentDashboardItem,
  BurnoutRiskLevel,
  DashboardContext,
  DashboardItem,
  DashboardItemType,
  DashboardVisibility,
  FinanceAlertDashboardItem,
  PartialPriorityScoringConfig,
  PrioritizedItem,
  PriorityScoringConfig,
} from './types.ts';

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export const defaultPriorityScoringConfig: PriorityScoringConfig = {
  displayCap: 5,
  overrides: {
    highWellbeingScore: 100,
    relatedAssignmentScoreFloor: 88,
    upcomingExamScoreFloor: 94,
  },
  pinnedCap: 2,
  scoreClamp: {
    max: 100,
    min: 0,
  },
  thresholds: {
    criticalHours: 3,
    lowFinanceRemainingRatio: 0.05,
    overBudgetRatio: 0,
    pastGraceMinutes: 15,
    upcomingExamHours: 24,
    urgentHours: 24,
  },
  timezoneOffsetMinutes: 7 * 60,
  weights: {
    baseUrgency: 0.35,
    examDayRelatedAssignment: 20,
    financeSeverity: 26,
    pastItemPenalty: 70,
    timeUrgency: 34,
    typeSeverity: {
      assignment: 22,
      class_schedule: 12,
      exam: 34,
      finance_alert: 18,
      note_reminder: 8,
      wellbeing_alert: 26,
    },
    wellbeingSeverity: {
      high: 100,
      low: 8,
      medium: 34,
    },
  },
};

export function mergePriorityScoringConfig(
  override?: PartialPriorityScoringConfig,
): PriorityScoringConfig {
  if (!override) return defaultPriorityScoringConfig;

  return {
    ...defaultPriorityScoringConfig,
    ...override,
    overrides: {
      ...defaultPriorityScoringConfig.overrides,
      ...override.overrides,
    },
    scoreClamp: {
      ...defaultPriorityScoringConfig.scoreClamp,
      ...override.scoreClamp,
    },
    thresholds: {
      ...defaultPriorityScoringConfig.thresholds,
      ...override.thresholds,
    },
    weights: {
      ...defaultPriorityScoringConfig.weights,
      ...override.weights,
      typeSeverity: {
        ...defaultPriorityScoringConfig.weights.typeSeverity,
        ...override.weights?.typeSeverity,
      },
      wellbeingSeverity: {
        ...defaultPriorityScoringConfig.weights.wellbeingSeverity,
        ...override.weights?.wellbeingSeverity,
      },
    },
  };
}

export function prioritizeDashboardItems(
  items: DashboardItem[],
  context: DashboardContext,
  configOverride?: PartialPriorityScoringConfig,
): PrioritizedItem[] {
  const config = mergePriorityScoringConfig(configOverride);
  const now = parseDate(context.now);
  const scored = items.map((item) => scoreDashboardItem(item, items, context, now, config));
  const sorted = scored.sort((left, right) =>
    right.score - left.score ||
    eventTime(left.raw).getTime() - eventTime(right.raw).getTime() ||
    parseDate(left.raw.createdAt).getTime() - parseDate(right.raw.createdAt).getTime(),
  );

  return assignVisibility(sorted, context, config);
}

export function scoreDashboardItem(
  item: DashboardItem,
  allItems: DashboardItem[],
  context: DashboardContext,
  now: Date,
  config: PriorityScoringConfig = defaultPriorityScoringConfig,
): PrioritizedItem {
  const isPast = isPastItem(item, now, config);
  const scoreParts = [
    clampNumber(item.baseUrgencyScore, 0, 100) * config.weights.baseUrgency,
    config.weights.typeSeverity[item.type],
    timeUrgencyScore(item, now, config),
    financeSeverityScore(item, config),
    wellbeingSeverityScore(item, config),
    examDayBoost(item, allItems, context, config),
    isPast ? -config.weights.pastItemPenalty : 0,
  ];
  const score = normalizeScore(scoreParts.reduce((sum, value) => sum + value, 0), config);
  const overrideScore = overrideScoreFor(item, context, config);
  const relatedAssignmentFloor = isRelatedAssignmentToUpcomingExam(item, allItems, context)
    ? config.overrides.relatedAssignmentScoreFloor
    : null;
  const finalScore = Math.max(
    score,
    overrideScore ?? config.scoreClamp.min,
    relatedAssignmentFloor ?? config.scoreClamp.min,
  );

  return {
    id: item.id,
    raw: item,
    reason: buildReason(item, now, context, isPast),
    score: normalizeScore(finalScore, config),
    type: item.type,
    visibility: 'hidden',
  };
}

function assignVisibility(
  sortedItems: PrioritizedItem[],
  context: DashboardContext,
  config: PriorityScoringConfig,
) {
  let visibleCount = 0;
  let pinnedCount = 0;

  return sortedItems.map((item) => {
    if (shouldForceHide(item, context, config) || isPastItem(item.raw, parseDate(context.now), config)) {
      return {...item, visibility: 'hidden' as DashboardVisibility};
    }

    const shouldPin = shouldPinItem(item, context) && pinnedCount < config.pinnedCap;
    if (shouldPin && visibleCount < config.displayCap) {
      pinnedCount += 1;
      visibleCount += 1;
      return {...item, visibility: 'pinned' as DashboardVisibility};
    }

    if (visibleCount < config.displayCap) {
      visibleCount += 1;
      return {...item, visibility: 'visible' as DashboardVisibility};
    }

    return {...item, visibility: 'hidden' as DashboardVisibility};
  });
}

function shouldPinItem(item: PrioritizedItem, context: DashboardContext) {
  return (
    (item.type === 'wellbeing_alert' && (item.raw as {riskLevel?: BurnoutRiskLevel}).riskLevel === 'high') ||
    context.upcomingExamItemIds.includes(item.id)
  );
}

function shouldForceHide(
  item: PrioritizedItem,
  context: DashboardContext,
  config: PriorityScoringConfig,
) {
  if (!context.hasUpcomingExam) return false;
  if (item.type === 'note_reminder' && item.score < config.overrides.relatedAssignmentScoreFloor) return true;
  if (item.type !== 'finance_alert') return false;

  const finance = item.raw as FinanceAlertDashboardItem;
  const remainingRatio = finance.budgetLimit > 0 ? finance.amountRemaining / finance.budgetLimit : 1;
  return finance.amountRemaining >= 0 && remainingRatio > config.thresholds.lowFinanceRemainingRatio;
}

function overrideScoreFor(
  item: DashboardItem,
  context: DashboardContext,
  config: PriorityScoringConfig,
) {
  if (item.type === 'wellbeing_alert' && item.riskLevel === 'high') {
    return config.overrides.highWellbeingScore;
  }
  if (context.upcomingExamItemIds.includes(item.id)) {
    return config.overrides.upcomingExamScoreFloor;
  }
  return null;
}

function timeUrgencyScore(item: DashboardItem, now: Date, config: PriorityScoringConfig) {
  const target = targetDateForItem(item);
  if (!target) return 0;

  const hoursRemaining = (target.getTime() - now.getTime()) / HOUR_MS;
  if (hoursRemaining < -config.thresholds.pastGraceMinutes / 60) return 0;
  if (hoursRemaining <= config.thresholds.criticalHours) return config.weights.timeUrgency;
  if (hoursRemaining <= config.thresholds.urgentHours) return config.weights.timeUrgency * 0.78;

  const decay = Math.exp(-(hoursRemaining - config.thresholds.urgentHours) / 72);
  return config.weights.timeUrgency * 0.5 * decay;
}

function financeSeverityScore(item: DashboardItem, config: PriorityScoringConfig) {
  if (item.type !== 'finance_alert') return 0;
  if (item.budgetLimit <= 0) return 0;

  const remainingRatio = item.amountRemaining / item.budgetLimit;
  if (remainingRatio < config.thresholds.overBudgetRatio) {
    return config.weights.financeSeverity;
  }
  if (remainingRatio <= config.thresholds.lowFinanceRemainingRatio) {
    return config.weights.financeSeverity * 0.65;
  }
  return config.weights.financeSeverity * Math.max(0, 1 - remainingRatio) * 0.35;
}

function wellbeingSeverityScore(item: DashboardItem, config: PriorityScoringConfig) {
  if (item.type !== 'wellbeing_alert') return 0;
  return config.weights.wellbeingSeverity[item.riskLevel];
}

function examDayBoost(
  item: DashboardItem,
  allItems: DashboardItem[],
  context: DashboardContext,
  config: PriorityScoringConfig,
) {
  if (!context.hasUpcomingExam) return 0;
  if (context.upcomingExamItemIds.includes(item.id)) return config.weights.examDayRelatedAssignment;
  if (item.type !== 'assignment') return 0;
  return isRelatedAssignmentToUpcomingExam(item, allItems, context)
    ? config.weights.examDayRelatedAssignment
    : 0;
}

function isRelatedAssignmentToUpcomingExam(
  item: DashboardItem,
  allItems: DashboardItem[],
  context: DashboardContext,
) {
  if (item.type !== 'assignment') return false;

  const assignment = item as AssignmentDashboardItem;
  const normalizedSubject = normalizeSubject(assignment.subject ?? assignment.title);
  return allItems.some((candidate) => {
    if (candidate.type !== 'exam' || !context.upcomingExamItemIds.includes(candidate.id)) return false;

    const examSubject = normalizeSubject(candidate.subject);
    return Boolean(
      examSubject &&
        (normalizedSubject.includes(examSubject) || examSubject.includes(normalizedSubject)),
    );
  });
}

function buildReason(
  item: DashboardItem,
  now: Date,
  context: DashboardContext,
  isPast: boolean,
) {
  if (isPast) return 'Already passed';
  if (item.type === 'wellbeing_alert' && item.riskLevel === 'high') return 'High burnout risk needs attention now';
  if (context.upcomingExamItemIds.includes(item.id)) return `Exam ${relativeTimeText(targetDateForItem(item), now)}`;

  switch (item.type) {
    case 'exam':
      return `Exam ${relativeTimeText(parseDate(item.examDateTime), now)}`;
    case 'assignment':
      return `Assignment due ${relativeTimeText(parseDate(item.dueDateTime), now)}`;
    case 'class_schedule':
      return `Class starts ${relativeTimeText(parseDate(item.startTime), now)}`;
    case 'finance_alert':
      return item.amountRemaining < 0
        ? `Over budget in ${item.category}`
        : `${Math.round((item.amountRemaining / Math.max(item.budgetLimit, 1)) * 100)}% budget remaining in ${item.category}`;
    case 'note_reminder':
      return `Reminder ${relativeTimeText(parseDate(item.remindAt), now)}`;
    case 'wellbeing_alert':
      return `${capitalize(item.riskLevel)} burnout risk`;
  }
}

function isPastItem(item: DashboardItem, now: Date, config: PriorityScoringConfig) {
  const end = endDateForItem(item);
  if (!end) return false;
  return now.getTime() - end.getTime() > config.thresholds.pastGraceMinutes * MINUTE_MS;
}

function targetDateForItem(item: DashboardItem) {
  switch (item.type) {
    case 'assignment':
      return parseDate(item.dueDateTime);
    case 'class_schedule':
      return parseDate(item.startTime);
    case 'exam':
      return parseDate(item.examDateTime);
    case 'note_reminder':
      return parseDate(item.remindAt);
    case 'finance_alert':
    case 'wellbeing_alert':
      return null;
  }
}

function endDateForItem(item: DashboardItem) {
  switch (item.type) {
    case 'assignment':
      return parseDate(item.dueDateTime);
    case 'class_schedule':
      return parseDate(item.endTime);
    case 'exam':
      return parseDate(item.examDateTime);
    case 'note_reminder':
      return parseDate(item.remindAt);
    case 'finance_alert':
    case 'wellbeing_alert':
      return null;
  }
}

function eventTime(item: DashboardItem) {
  return targetDateForItem(item) ?? parseDate(item.createdAt);
}

function normalizeScore(value: number, config: PriorityScoringConfig) {
  return Math.round(clampNumber(value, config.scoreClamp.min, config.scoreClamp.max) * 100) / 100;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO date: ${value}`);
  }
  return date;
}

function relativeTimeText(target: Date | null, now: Date) {
  if (!target) return 'now';
  const minutes = Math.round((target.getTime() - now.getTime()) / MINUTE_MS);
  if (minutes < 0) return 'already passed';
  if (minutes < 60) return `in ${minutes} minutes`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  if (hours < 48) return `in ${hours} hours`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `in ${days} days`;
}

function normalizeSubject(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
