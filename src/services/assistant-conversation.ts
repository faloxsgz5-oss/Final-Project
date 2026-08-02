import {updateFinancialScenario} from './assistant-financial-scenario.ts';
import type {
  AssistantConversationState,
  AssistantConversationStatePatch,
} from '../types/assistant';

// v3 invalidates conversations created before the context-leak fix. Keeping
// those incorrect assistant turns would let the old 2,000/5-day answer keep
// appearing in RECENT_CONVERSATION even after the parser was corrected.
export const ASSISTANT_CONVERSATION_VERSION = 'context-v3';

export function createAssistantConversationId(now = Date.now(), random = Math.random()) {
  return `conversation-${now.toString(36)}-${random.toString(36).slice(2, 10)}`;
}

export function createAssistantConversationState(conversationId: string): AssistantConversationState {
  return {
    conversationId,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

export function assistantActiveConversationKey(uid: string) {
  return `smartlife:assistant:${ASSISTANT_CONVERSATION_VERSION}:active:${uid}`;
}

export function assistantConversationHistoryKey(uid: string, conversationId: string) {
  return `smartlife:assistant:${ASSISTANT_CONVERSATION_VERSION}:history:${uid}:${conversationId}`;
}

export function assistantConversationStateKey(uid: string, conversationId: string) {
  return `smartlife:assistant:${ASSISTANT_CONVERSATION_VERSION}:state:${uid}:${conversationId}`;
}

function dateReference(message: string): AssistantConversationState['dateReference'] {
  if (/พรุ่งนี้|tomorrow/i.test(message)) return 'tomorrow';
  if (/วันนี้|today/i.test(message)) return 'today';
  if (/สัปดาห์|อาทิตย์นี้|week/i.test(message)) return 'week';
  if (/เดือนนี้|month/i.test(message)) return 'month';
  return undefined;
}

export function updateAssistantConversationState(
  current: AssistantConversationState,
  message: string,
  lastIntent: AssistantConversationState['lastIntent'],
): AssistantConversationState {
  const nextDateReference = dateReference(message);
  const financialScenario = updateFinancialScenario(message, current.financialScenario);
  return {
    ...current,
    ...(nextDateReference ? {dateReference: nextDateReference} : {}),
    ...(financialScenario ? {financialScenario} : {}),
    lastIntent,
    updatedAt: new Date().toISOString(),
  };
}

export function mergeAssistantConversationState(
  current: AssistantConversationState,
  patch?: AssistantConversationStatePatch,
): AssistantConversationState {
  if (!patch) return current;
  return {
    ...current,
    ...patch,
    conversationId: current.conversationId,
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

export function parseAssistantConversationState(
  raw: string | null,
  conversationId: string,
): AssistantConversationState {
  if (!raw) return createAssistantConversationState(conversationId);
  try {
    const parsed = JSON.parse(raw) as Partial<AssistantConversationState>;
    if (parsed.version !== 1 || parsed.conversationId !== conversationId) {
      return createAssistantConversationState(conversationId);
    }
    return {
      ...parsed,
      conversationId,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
      version: 1,
    } as AssistantConversationState;
  } catch {
    return createAssistantConversationState(conversationId);
  }
}
