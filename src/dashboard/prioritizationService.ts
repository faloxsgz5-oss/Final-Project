import type {
  DashboardItemRepository,
  PartialPriorityScoringConfig,
  PrioritizationResponse,
} from './types.ts';
import {buildDashboardContextFromRepository} from './contextBuilder.ts';
import {prioritizeDashboardItems} from './scoringEngine.ts';

export class DashboardPrioritizationService {
  private readonly repository: DashboardItemRepository;

  constructor(repository: DashboardItemRepository) {
    this.repository = repository;
  }

  async getPrioritizedDashboard({
    config,
    displayCap,
    now,
    userId,
  }: {
    config?: PartialPriorityScoringConfig;
    displayCap?: number;
    now?: Date | string;
    userId: string;
  }): Promise<PrioritizationResponse> {
    if (!userId.trim()) {
      throw new Error('userId is required');
    }

    const mergedConfig = {
      ...config,
      ...(displayCap ? {displayCap} : {}),
    };
    const {context, items} = await buildDashboardContextFromRepository({
      config: mergedConfig,
      now,
      repository: this.repository,
      userId,
    });

    return {
      contextSummary: {
        burnoutRiskLevel: context.burnoutRiskLevel,
        hasUpcomingExam: context.hasUpcomingExam,
        overBudgetCategories: context.overBudgetCategories,
      },
      generatedAt: context.generatedAt,
      items: prioritizeDashboardItems(items, context, mergedConfig),
    };
  }
}
