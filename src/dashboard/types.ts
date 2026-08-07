export type DashboardItemType =
  | 'exam'
  | 'assignment'
  | 'class_schedule'
  | 'finance_alert'
  | 'wellbeing_alert'
  | 'note_reminder';

export type DashboardVisibility = 'pinned' | 'visible' | 'hidden';
export type BurnoutRiskLevel = 'low' | 'medium' | 'high';

export interface DashboardItemBase {
  id: string;
  type: DashboardItemType;
  createdAt: string;
  baseUrgencyScore: number;
}

export interface ExamDashboardItem extends DashboardItemBase {
  type: 'exam';
  subject: string;
  examDateTime: string;
  location: string;
}

export interface AssignmentDashboardItem extends DashboardItemBase {
  type: 'assignment';
  title: string;
  dueDateTime: string;
  estimatedEffortMinutes: number;
  subject?: string;
}

export interface ClassScheduleDashboardItem extends DashboardItemBase {
  type: 'class_schedule';
  subject: string;
  startTime: string;
  endTime: string;
  room: string;
}

export interface FinanceAlertDashboardItem extends DashboardItemBase {
  type: 'finance_alert';
  category: string;
  amountRemaining: number;
  budgetLimit: number;
}

export interface WellbeingAlertDashboardItem extends DashboardItemBase {
  type: 'wellbeing_alert';
  riskLevel: BurnoutRiskLevel;
  suggestedAction: string;
}

export interface NoteReminderDashboardItem extends DashboardItemBase {
  type: 'note_reminder';
  title: string;
  remindAt: string;
  subject?: string;
}

export type DashboardItem =
  | ExamDashboardItem
  | AssignmentDashboardItem
  | ClassScheduleDashboardItem
  | FinanceAlertDashboardItem
  | WellbeingAlertDashboardItem
  | NoteReminderDashboardItem;

export interface PrioritizedItem {
  id: string;
  type: DashboardItemType;
  score: number;
  visibility: DashboardVisibility;
  reason: string;
  raw: DashboardItem;
}

export interface DashboardContextSummary {
  hasUpcomingExam: boolean;
  burnoutRiskLevel: BurnoutRiskLevel | null;
  overBudgetCategories: string[];
}

export interface DashboardContext extends DashboardContextSummary {
  generatedAt: string;
  now: string;
  timezone: 'Asia/Bangkok';
  upcomingExamItemIds: string[];
}

export interface PrioritizationResponse {
  generatedAt: string;
  contextSummary: DashboardContextSummary;
  items: PrioritizedItem[];
}

export interface PriorityScoringConfig {
  displayCap: number;
  pinnedCap: number;
  timezoneOffsetMinutes: number;
  scoreClamp: {
    min: number;
    max: number;
  };
  weights: {
    baseUrgency: number;
    typeSeverity: Record<DashboardItemType, number>;
    timeUrgency: number;
    financeSeverity: number;
    wellbeingSeverity: Record<BurnoutRiskLevel, number>;
    examDayRelatedAssignment: number;
    pastItemPenalty: number;
  };
  thresholds: {
    upcomingExamHours: number;
    criticalHours: number;
    urgentHours: number;
    pastGraceMinutes: number;
    lowFinanceRemainingRatio: number;
    overBudgetRatio: number;
  };
  overrides: {
    highWellbeingScore: number;
    upcomingExamScoreFloor: number;
    relatedAssignmentScoreFloor: number;
  };
}

export interface PrioritizeDashboardOptions {
  config?: PartialPriorityScoringConfig;
  now?: Date | string;
}

export type PartialPriorityScoringConfig = {
  displayCap?: number;
  pinnedCap?: number;
  timezoneOffsetMinutes?: number;
  scoreClamp?: Partial<PriorityScoringConfig['scoreClamp']>;
  weights?: Partial<{
    baseUrgency: number;
    typeSeverity: Partial<Record<DashboardItemType, number>>;
    timeUrgency: number;
    financeSeverity: number;
    wellbeingSeverity: Partial<Record<BurnoutRiskLevel, number>>;
    examDayRelatedAssignment: number;
    pastItemPenalty: number;
  }>;
  thresholds?: Partial<PriorityScoringConfig['thresholds']>;
  overrides?: Partial<PriorityScoringConfig['overrides']>;
};

export interface DashboardItemRepository {
  listDashboardItems(userId: string): Promise<DashboardItem[]>;
}

export interface PrioritizationRequest {
  userId: string;
  now?: string;
  displayCap?: number;
}
