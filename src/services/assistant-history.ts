import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import {db} from '@/lib/firebase';
import type {AssistantChatMessage, AssistantConversationState} from '@/types/assistant';

export type AssistantConversationSummary = {
  createdAt: Date;
  id: string;
  lastMessagePreview: string;
  messageCount: number;
  state: AssistantConversationState;
  title: string;
  updatedAt: Date;
};

const MAX_CLOUD_MESSAGES = 180;

function conversationRef(uid: string, conversationId: string) {
  return doc(db, 'users', uid, 'assistantConversations', conversationId);
}

function messageRef(uid: string, conversationId: string, messageId: string) {
  return doc(db, 'users', uid, 'assistantConversations', conversationId, 'messages', messageId);
}

function messagePayload(message: AssistantChatMessage) {
  const {content: _content, id: _id, role: _role, timestamp: _timestamp, ...metadata} = message;
  return JSON.stringify(metadata).slice(0, 20_000);
}

function parseMessagePayload(raw: unknown) {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function timestampDate(value: unknown) {
  return value instanceof Timestamp ? value.toDate() : new Date(0);
}

function parseConversationState(value: unknown, conversationId: string): AssistantConversationState {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as Partial<AssistantConversationState>;
      if (parsed.version === 1 && parsed.conversationId === conversationId) {
        return parsed as AssistantConversationState;
      }
    } catch {
      // A malformed state is replaced by a safe empty state below.
    }
  }
  return {conversationId, updatedAt: new Date().toISOString(), version: 1};
}

export async function saveAssistantMessage({
  conversationId,
  message,
  state,
  uid,
}: {
  conversationId: string;
  message: AssistantChatMessage;
  state: AssistantConversationState;
  uid: string;
}) {
  if (message.role !== 'assistant' && message.role !== 'user') return;
  const parentRef = conversationRef(uid, conversationId);
  const childRef = messageRef(uid, conversationId, message.id);
  const [parentSnapshot, messageSnapshot] = await Promise.all([
    getDoc(parentRef),
    getDoc(childRef),
  ]);
  const batch = writeBatch(db);
    const previous = parentSnapshot.data();
    const firstUserTitle = message.role === 'user' ? message.content.trim().slice(0, 100) : '';
    const messageCount = Math.min(10_000, Number(previous?.messageCount ?? 0) + (messageSnapshot.exists() ? 0 : 1));
    const parentData = {
      lastMessagePreview: message.content.trim().slice(0, 300),
      messageCount,
      mode: 'persistent',
      ownerId: uid,
      stateJson: JSON.stringify(state).slice(0, 5000),
      title: String(previous?.title || firstUserTitle || 'บทสนทนาใหม่').slice(0, 100),
      updatedAt: serverTimestamp(),
    };
    if (parentSnapshot.exists()) batch.update(parentRef, parentData);
    else batch.set(parentRef, {...parentData, createdAt: serverTimestamp()});

    const childData = {
      content: message.content.slice(0, 8000),
      ownerId: uid,
      payload: messagePayload(message),
      role: message.role,
      updatedAt: serverTimestamp(),
    };
    if (messageSnapshot.exists()) batch.update(childRef, {
      payload: childData.payload,
      updatedAt: childData.updatedAt,
    });
    else batch.set(childRef, {...childData, createdAt: serverTimestamp()});
  await batch.commit();
}

export async function updateAssistantMessagePayload(
  uid: string,
  conversationId: string,
  message: AssistantChatMessage,
) {
  await updateDoc(messageRef(uid, conversationId, message.id), {
    payload: messagePayload(message),
    updatedAt: serverTimestamp(),
  });
}

export async function listAssistantConversations(uid: string) {
  const snapshot = await getDocs(query(
    collection(db, 'users', uid, 'assistantConversations'),
    orderBy('updatedAt', 'desc'),
    limit(50),
  ));
  return snapshot.docs.map((item): AssistantConversationSummary => {
    const data = item.data();
    return {
      createdAt: timestampDate(data.createdAt),
      id: item.id,
      lastMessagePreview: String(data.lastMessagePreview ?? ''),
      messageCount: Number(data.messageCount ?? 0),
      state: parseConversationState(data.stateJson, item.id),
      title: String(data.title ?? 'บทสนทนาใหม่'),
      updatedAt: timestampDate(data.updatedAt),
    };
  });
}

export async function loadAssistantConversation(uid: string, conversation: AssistantConversationSummary) {
  const snapshot = await getDocs(query(
    collection(db, 'users', uid, 'assistantConversations', conversation.id, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(MAX_CLOUD_MESSAGES),
  ));
  const messages = snapshot.docs.flatMap((item): AssistantChatMessage[] => {
    const data = item.data();
    if ((data.role !== 'assistant' && data.role !== 'user') || typeof data.content !== 'string') return [];
    return [{
      ...parseMessagePayload(data.payload),
      content: data.content,
      id: item.id,
      role: data.role,
      timestamp: timestampDate(data.createdAt).toISOString(),
    } as AssistantChatMessage];
  });
  return {messages, state: conversation.state};
}

export async function deleteAssistantConversation(uid: string, conversationId: string) {
  const messages = await getDocs(query(
    collection(db, 'users', uid, 'assistantConversations', conversationId, 'messages'),
    limit(MAX_CLOUD_MESSAGES),
  ));
  const batch = writeBatch(db);
  messages.docs.forEach((item) => batch.delete(item.ref));
  batch.delete(conversationRef(uid, conversationId));
  await batch.commit();
}
