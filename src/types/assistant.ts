export type AssistantEntity = 'checklist' | 'finance' | 'memory' | 'note' | 'schedule';
export type AssistantMutation = 'create' | 'delete' | 'update';
export type ProposedActionStatus = 'confirmed' | 'pending' | 'rejected';

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
  id: string;
  proposedAction?: AssistantProposedAction;
  role: 'assistant' | 'system' | 'user';
  timestamp: string;
};

export type AssistantToolName =
  | 'create_note'
  | 'create_schedule_item'
  | 'delete_schedule_item'
  | 'get_finance_summary'
  | 'get_notes'
  | 'get_schedule'
  | 'log_expense'
  | 'log_income'
  | 'save_preference'
  | 'update_note'
  | 'update_schedule_item';

export type AssistantToolSchema = {
  description: string;
  mutates: boolean;
  name: AssistantToolName;
  parameters: Record<string, unknown>;
};
