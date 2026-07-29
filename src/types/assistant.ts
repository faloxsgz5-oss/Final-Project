export type AssistantEntity = 'checklist' | 'finance' | 'memory' | 'note' | 'schedule';
export type AssistantMutation = 'create' | 'delete' | 'update';
export type ProposedActionStatus = 'confirmed' | 'pending' | 'rejected';
export type AssistantReplySource = 'deterministic' | 'fallback' | 'gemini';
export type AssistantErrorKind =
  | 'app_check'
  | 'authentication'
  | 'config'
  | 'firebase'
  | 'gemini'
  | 'network'
  | 'quota'
  | 'unknown';
export type AssistantFeedbackRating = 'helpful' | 'not_helpful';

export type SchedulePayload = {
  endAt?: string;
  location?: string;
  reminderMinutesBefore?: number;
  startAt: string;
  title: string;
  type: 'appointment' | 'class' | 'task';
};

export type FinancePayload = {
  amount: number;
  category: string;
  date: string;
  note?: string;
  type: 'expense' | 'income';
};

export type NotePayload = {
  body: string;
  linkedScheduleId?: string;
  tag: 'all' | 'class' | 'idea' | 'task';
  title: string;
};

export type ChecklistPayload = {
  items: string[];
  startAt: string;
  title: string;
};

export type AssistantMemoryPayload = {
  key: 'dailyBudget' | 'studyMinutes';
  value: number;
};

export type AssistantProposedAction =
  | {
      entity: 'checklist';
      id: string;
      payload: ChecklistPayload;
      status: ProposedActionStatus;
      summary: string;
      type: 'create';
    }
  | {
      entity: 'memory';
      id: string;
      payload: AssistantMemoryPayload;
      status: ProposedActionStatus;
      summary: string;
      type: 'create';
    }
  | {
      entity: 'schedule';
      id: string;
      payload: SchedulePayload;
      status: ProposedActionStatus;
      summary: string;
      type: 'create';
    }
  | {
      entity: 'finance';
      id: string;
      payload: FinancePayload;
      status: ProposedActionStatus;
      summary: string;
      type: 'create';
    }
  | {
      entity: 'note';
      id: string;
      payload: NotePayload;
      status: ProposedActionStatus;
      summary: string;
      type: 'create';
    };

export type AssistantChatMessage = {
  content: string;
  errorKind?: AssistantErrorKind;
  feedback?: AssistantFeedbackRating;
  id: string;
  intent?: 'finance' | 'schedule' | 'task_note' | 'unknown';
  latencyMs?: number;
  proposedAction?: AssistantProposedAction;
  role: 'assistant' | 'system' | 'user';
  source?: AssistantReplySource;
  timestamp: string;
};

export type AssistantToolName =
  | 'add_event'
  | 'add_note'
  | 'add_transaction'
  | 'delete_schedule_item'
  | 'get_financial_summary'
  | 'get_pending_tasks'
  | 'get_user_notes'
  | 'get_user_schedule'
  | 'save_preference'
  | 'update_note'
  | 'update_schedule_item';

export type AssistantToolSchema = {
  description: string;
  mutates: boolean;
  name: AssistantToolName;
  parameters: Record<string, unknown>;
};
