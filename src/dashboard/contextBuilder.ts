import type {
  BurnoutRiskLevel,
  DashboardContext,
  DashboardContextSummary,
  DashboardItem,
  DashboardItemRepository,
  PartialPriorityScoringConfig,
  PriorityScoringConfig,
} from './types.ts';
import {defaultPriorityScoringConfig, mergePriorityScoringConfig} from './scoringEngine.ts';

const HOUR_MS = 60 * 60 * 1000;

export class InMemoryDashboardItemRepository implements DashboardItemRepository {
  private readonly itemsByUserId: Record<string, DashboardItem[]>;

  constructor(itemsByUserId: Record<string, DashboardItem[]> = {}) {
    this.itemsByUserId = itemsByUserId;
  }

  async listDashboardItems(userId: string) {
    return [...(this.itemsByUserId[userId] ?? [])];
  }
}

export async function buildDashboardContextFromRepository({
  config,
  now,
  repository,
  userId,
}: {
  config?: PartialPriorityScoringConfig;
  now?: Date | string;
  repository: DashboardItemRepository;
  userId: string;
}) {
  const items = await repository.listDashboardItems(userId);
  return {
    context: buildDashboardContext(items, now, config),
    items,
  };
}

export function buildDashboardContext(
  items: DashboardItem[],
  nowInput: Date | string = new Date(),
  configOverride?: PartialPriorityScoringConfig,
): DashboardContext {
  const config = mergePriorityScoringConfig(configOverride);
  const now = typeof nowInput === 'string' ? new Date(nowInput) : nowInput;
  if (Number.isNaN(now.getTime())) {
    throw new Error(`Invalid context date: ${String(nowInput)}`);
  }

  const upcomingExamItemIds = upcomingExamIds(items, now, config);
  const summary = buildDashboardContextSummary(items, upcomingExamItemIds);

  return {
    ...summary,
    generatedAt: now.toISOString(),
    now: now.toISOString(),
    timezone: 'Asia/Bangkok',
    upcomingExamItemIds,
  };
}

export function buildDashboardContextSummary(
  items: DashboardItem[],
  upcomingExamItemIds: string[] = [],
): DashboardContextSummary {
  return {
    burnoutRiskLevel: highestBurnoutRisk(items),
    hasUpcomingExam: upcomingExamItemIds.length > 0,
    overBudgetCategories: items.flatMap((item) =>
      item.type === 'finance_alert' && item.amountRemaining < 0 ? [item.category] : [],
    ),
  };
}

function upcomingExamIds(
  items: DashboardItem[],
  now: Date,
  config: PriorityScoringConfig = defaultPriorityScoringConfig,
) {
  const upcomingWindowMs = config.thresholds.upcomingExamHours * HOUR_MS;
  return items.flatMap((item) => {
    if (item.type !== 'exam') return [];

    const examDate = new Date(item.examDateTime);
    const msRemaining = examDate.getTime() - now.getTime();
    return msRemaining >= 0 && msRemaining <= upcomingWindowMs ? [item.id] : [];
  });
}

function highestBurnoutRisk(items: DashboardItem[]): BurnoutRiskLevel | null {
  const levels: Record<BurnoutRiskLevel, number> = {
    high: 3,
    low: 1,
    medium: 2,
  };
  return items
    .filter((item) => item.type === 'wellbeing_alert')
    .map((item) => item.riskLevel)
    .sort((left, right) => levels[right] - levels[left])[0] ?? null;
}
