import {useEffect, useMemo, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ActivityIndicator, Alert, KeyboardAvoidingView, Modal, NativeModules, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';

import {buildAssistantReply, confirmAssistantAction, recordAssistantTelemetry, type AssistantReply} from '@/services/assistant-tools';
import {
  assistantActiveConversationKey,
  assistantConversationHistoryKey,
  assistantConversationStateKey,
  createAssistantConversationId,
  createAssistantConversationState,
  mergeAssistantConversationState,
  parseAssistantConversationState,
  updateAssistantConversationState,
} from '@/services/assistant-conversation';
import {classifyAssistantIntent} from '@/services/assistant-intent';
import {uploadAndAnalyzeAssistantFile} from '@/services/assistant-file';
import {
  deleteAssistantConversation,
  listAssistantConversations,
  loadAssistantConversation,
  saveAssistantMessage,
  updateAssistantMessagePayload,
  type AssistantConversationSummary,
} from '@/services/assistant-history';
import {loadLegacyPageData} from '@/services/legacy-data';
import type {AssistantChatMessage, AssistantConversationState, AssistantFeedbackRating, AssistantProposedAction, ProposedActionStatus} from '@/types/assistant';
import {Card, MaterialIcon, PrimaryButton, UserShell, type UserNavigate, userStyles} from './user-ui';

function nowIso() {
  return new Date().toISOString();
}

function messageId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const MAX_STORED_CHAT_MESSAGES = 180;
const THAI_TIME_ZONE = 'Asia/Bangkok';

function assistantIntroMessage(): AssistantChatMessage {
  return {
    content: 'ถามฉันได้เลยนะ จะดูตาราง เงิน หรือให้ช่วยจด/เพิ่มรายการก็ได้ ถ้าจะให้ฉันเพิ่มข้อมูล ฉันจะทำเป็นการ์ดให้ยืนยันก่อนเสมอ',
    id: 'assistant-intro',
    role: 'assistant',
    timestamp: nowIso(),
  };
}

function assistantBriefingKey(uid: string) {
  return `smartlife:assistant:last-briefing-date:${uid}`;
}

function thailandDateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {day: '2-digit', month: '2-digit', timeZone: THAI_TIME_ZONE, year: 'numeric'}).format(value);
}

function trimChatHistory(messages: AssistantChatMessage[]) {
  return messages.slice(-MAX_STORED_CHAT_MESSAGES);
}

function parseStoredMessages(raw: string | null): AssistantChatMessage[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((message) => {
      return message
        && typeof message.id === 'string'
        && (message.role === 'assistant' || message.role === 'user')
        && typeof message.content === 'string'
        && typeof message.timestamp === 'string';
    }).slice(-MAX_STORED_CHAT_MESSAGES);
  } catch {
    return [];
  }
}

async function requestMicrophonePermission() {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    buttonNegative: 'ยกเลิก',
    buttonPositive: 'อนุญาต',
    message: 'SmartLife ต้องใช้ไมโครโฟนเพื่อแปลงเสียงพูดเป็นข้อความในช่องแชท',
    title: 'อนุญาตใช้ไมโครโฟน',
  });
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('th-TH', {dateStyle: 'medium', timeStyle: 'short', timeZone: THAI_TIME_ZONE}).format(new Date(value));
}

function actionDetails(action: AssistantProposedAction) {
  if (action.entity === 'memory') {
    return [
      ['การตั้งค่า', action.payload.key === 'dailyBudget' ? 'งบต่อวัน' : 'ช่วงโฟกัสเรียน'],
      ['ค่าใหม่', action.payload.key === 'dailyBudget' ? `${action.payload.value.toLocaleString('th-TH')} บาท` : `${action.payload.value.toLocaleString('th-TH')} นาที`],
      ['บันทึกที่', 'เครื่องนี้เท่านั้น'],
    ];
  }
  if (action.entity === 'checklist') {
    return [
      ['หัวข้องาน', action.payload.title],
      ['งานย่อย', `${action.payload.items.length} ข้อ`],
      ['รายการ', action.payload.items.map((item, index) => `${index + 1}. ${item}`).join('\n')],
    ];
  }
  if (action.entity === 'finance') {
    return [
      ['ประเภท', action.payload.type === 'income' ? 'รายรับ' : 'รายจ่าย'],
      ['จำนวน', `${action.payload.amount.toLocaleString('th-TH')} บาท`],
      ['หมวด', action.payload.category],
      ['บันทึก', action.payload.note || '-'],
    ];
  }
  if (action.entity === 'note') {
    return [
      ['หัวข้อ', action.payload.title],
      ['แท็ก', action.payload.tag],
      ['เนื้อหา', action.payload.body],
    ];
  }
  return [
    ['ประเภท', action.payload.type === 'class' ? 'คลาสเรียน' : action.payload.type === 'task' ? 'งาน' : 'นัดหมาย'],
    ['หัวข้อ', action.payload.title],
    ['เวลาเริ่ม', formatDate(action.payload.startAt)],
    ['เวลาจบ', action.payload.endAt ? formatDate(action.payload.endAt) : '-'],
    ['สถานที่', action.payload.location || '-'],
  ];
}

function MessageBubble({
  message,
  onAsk,
  onConfirm,
  onFeedback,
  onReject,
  busy,
}: {
  busy: boolean;
  message: AssistantChatMessage;
  onAsk: (message: string) => void;
  onConfirm: (messageIdValue: string, action: AssistantProposedAction) => void;
  onFeedback: (message: AssistantChatMessage, rating: AssistantFeedbackRating) => void;
  onReject: (messageIdValue: string, action: AssistantProposedAction) => void;
}) {
  const isUser = message.role === 'user';
  return (
    <View style={[local.messageRow, isUser && local.messageRowUser]}>
      <View style={[local.bubble, isUser ? local.userBubble : local.assistantBubble]}>
        <Text style={[local.bubbleText, isUser && local.userBubbleText]}>{message.content}</Text>
        {/* Refactored UI: structured assistant results stay inside the AI response bubble. */}
        {!isUser && message.proposedAction ? (
          <ActionCard
            action={message.proposedAction}
            busy={busy}
            onConfirm={() => onConfirm(message.id, message.proposedAction as AssistantProposedAction)}
            onReject={() => onReject(message.id, message.proposedAction as AssistantProposedAction)}
          />
        ) : null}
        {!isUser && message.suggestions?.length ? (
          <View style={local.suggestionList}>
            {message.suggestions.map((suggestion) => (
              <Pressable
                accessibilityLabel={`ถามต่อ: ${suggestion}`}
                disabled={busy}
                key={suggestion}
                onPress={() => onAsk(suggestion)}
                style={({pressed}) => [local.suggestionChip, pressed && local.pressed, busy && local.disabled]}>
                <Text style={local.suggestionText}>{suggestion}</Text>
                <MaterialIcon color="#668166" name="arrow_forward" size={14} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {!isUser && message.id !== 'assistant-intro' ? (
          <View style={local.feedbackRow}>
            <Text style={local.feedbackPrompt}>คำตอบนี้ช่วยได้ไหม</Text>
            <Pressable
              accessibilityLabel="คำตอบมีประโยชน์"
              onPress={() => onFeedback(message, 'helpful')}
              style={[local.feedbackButton, message.feedback === 'helpful' && local.feedbackButtonActive]}>
              <MaterialIcon color={message.feedback === 'helpful' ? '#ffffff' : '#668166'} name="thumb_up" size={15} />
            </Pressable>
            <Pressable
              accessibilityLabel="คำตอบยังไม่ตรง"
              onPress={() => onFeedback(message, 'not_helpful')}
              style={[local.feedbackButton, message.feedback === 'not_helpful' && local.feedbackButtonNegative]}>
              <MaterialIcon color={message.feedback === 'not_helpful' ? '#ffffff' : '#9a6666'} name="thumb_down" size={15} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ActionCard({
  action,
  busy,
  onConfirm,
  onReject,
}: {
  action: AssistantProposedAction;
  busy: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const rows = actionDetails(action);
  const done = action.status !== 'pending';
  const icon = action.entity === 'finance' ? 'payments' : action.entity === 'note' ? 'note_alt' : action.entity === 'memory' ? 'psychology' : action.entity === 'checklist' ? 'checklist' : 'event';
  return (
    <Card colors={['#ffffff', '#f6faf3']} style={local.actionCard}>
      <View style={local.actionHeader}>
        <View style={local.actionIcon}>
          <MaterialIcon color="#5d8059" name={icon} size={20} />
        </View>
        <View style={{flex: 1}}>
          <Text style={userStyles.cardTitle}>ยืนยันก่อนบันทึก</Text>
          <Text style={userStyles.bodyText}>{action.summary}</Text>
        </View>
      </View>
      <View style={local.detailBox}>
        {rows.map(([label, value]) => (
          <View key={label} style={local.detailRow}>
            <Text style={local.detailLabel}>{label}</Text>
            <Text style={local.detailValue}>{value}</Text>
          </View>
        ))}
      </View>
      {done ? <StatusPill status={action.status} /> : (
        <View style={local.confirmRow}>
          <Pressable disabled={busy} onPress={onReject} style={[local.secondaryButton, busy && local.disabled]}>
            <Text style={local.secondaryButtonText}>ไม่บันทึก</Text>
          </Pressable>
          <View style={{flex: 1}}>
            <PrimaryButton disabled={busy} label="ยืนยันบันทึก" onPress={onConfirm} />
          </View>
        </View>
      )}
    </Card>
  );
}

function StatusPill({status}: {status: ProposedActionStatus}) {
  const confirmed = status === 'confirmed';
  return (
    <View style={[local.statusPill, confirmed ? local.statusConfirmed : local.statusRejected]}>
      <MaterialIcon color={confirmed ? '#4f754b' : '#8a5b5b'} name={confirmed ? 'check_circle' : 'block'} size={16} />
      <Text style={[local.statusText, confirmed ? local.statusTextConfirmed : local.statusTextRejected]}>
        {confirmed ? 'บันทึกแล้ว' : 'ยกเลิกแล้ว'}
      </Text>
    </View>
  );
}

type InsightItem = {icon: string; subtitle: string; title: string};
type WeeklyInsightData = {activities?: unknown; schedules?: unknown};

function insightRecords(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
}

function insightTitle(item: Record<string, unknown>) {
  const title = item.title ?? item.courseName ?? item.courseCode;
  return typeof title === 'string' && title.trim() ? title : 'รายการในตาราง';
}

function insightDate(item: Record<string, unknown>) {
  const value = item.startAt;
  const date = new Date(typeof value === 'string' ? value : '');
  return Number.isNaN(date.getTime()) ? null : date;
}

// Added for AI Assistant insights: present seven-day workload, behavior, and focus using existing calendar data only.
function AssistantInsights({data, onAsk}: {data: WeeklyInsightData | null; onAsk: (prompt: string) => void}) {
  const insight = useMemo(() => {
    const schedules = insightRecords(data?.schedules);
    const activities = insightRecords(data?.activities);
    const all = [
      ...schedules.map((item) => ({date: insightDate(item), icon: 'calendar_month', kind: 'ตารางเรียน', title: insightTitle(item)})),
      ...activities.map((item) => ({date: insightDate(item), icon: 'task_alt', kind: 'กิจกรรม', title: insightTitle(item)})),
    ].sort((first, second) => (first.date?.getTime() ?? Number.MAX_SAFE_INTEGER) - (second.date?.getTime() ?? Number.MAX_SAFE_INTEGER));
    const morning = all.filter((item) => item.date && item.date.getHours() < 12).length;
    const afternoon = all.filter((item) => item.date && item.date.getHours() >= 12 && item.date.getHours() < 17).length;
    const evening = all.filter((item) => item.date && item.date.getHours() >= 17).length;
    const preferred = morning >= afternoon && morning >= evening ? 'ช่วงเช้า' : afternoon >= evening ? 'ช่วงบ่าย' : 'ช่วงเย็น';
    const workload = all.length;
    const risk = workload >= 10 ? 'สูง' : workload >= 6 ? 'ปานกลาง' : 'ต่ำ';
    const riskCopy = workload >= 10
      ? 'สัปดาห์นี้มีรายการค่อนข้างแน่น ลองเว้นช่วงพักสั้น ๆ ระหว่างงานสำคัญ'
      : workload >= 6
        ? 'ตารางมีหลายรายการ กระจายงานยากไว้ก่อนช่วงที่คุณมีสมาธิ'
        : 'ตารางยังมีพื้นที่พัก ลองกันเวลาสำหรับงานสำคัญไว้ล่วงหน้า';
    const focus: InsightItem[] = all.slice(0, 3).map((item) => ({icon: item.icon, subtitle: item.kind, title: item.title}));
    if (!focus.length) focus.push(
      {icon: 'calendar_month', subtitle: 'เริ่มจากข้อมูลที่มี', title: 'เพิ่มตารางของสัปดาห์นี้'},
      {icon: 'task_alt', subtitle: 'ช่วยจัดลำดับให้ได้', title: 'บันทึกงานที่ต้องส่ง'},
      {icon: 'savings', subtitle: 'วางแผนง่ายขึ้น', title: 'กำหนดงบสำหรับสัปดาห์นี้'},
    );
    return {focus, preferred, risk, riskCopy, workload};
  }, [data]);

  return <View style={local.insightSection}>
    <View style={local.insightHeader}><Text style={local.insightHeading}>วิเคราะห์ข้อมูล 7 วันที่ผ่านมา</Text><Text style={local.insightCount}>{insight.workload} รายการ</Text></View>
    <View style={local.insightDivider} />
    <View style={local.burnoutPanel}><View style={local.burnoutIcon}><MaterialIcon color="#8a8050" name="warning_amber" size={18} /></View><View style={{flex: 1}}><Text style={local.burnoutTitle}>ความเสี่ยงสภาวะหมดไฟ: {insight.risk}</Text><Text style={local.burnoutText}>{insight.riskCopy}</Text></View></View>
    <View style={local.behaviorPanel}><View style={local.behaviorHeading}><View style={local.behaviorIcon}><MaterialIcon color="#668d65" name="schedule" size={18} /></View><View style={{flex: 1}}><Text style={local.behaviorTitle}>AI เรียนรู้พฤติกรรม</Text><Text style={local.behaviorText}>ระบบดูรูปแบบตารางเพื่อช่วยเลือกเวลาที่เหมาะกับคุณ</Text></View></View><View style={local.behaviorTiming}><View style={local.timingTile}><Text style={local.timingLabel}>ช่วงที่พบมาก</Text><Text style={local.timingValue}>{insight.preferred}</Text></View><View style={local.timingTile}><Text style={local.timingLabel}>คำแนะนำ</Text><Text style={local.timingValue}>โฟกัส 35 นาที</Text></View></View><Pressable onPress={() => onAsk('ช่วยจัดช่วงโฟกัสให้เหมาะกับตารางของฉัน')} style={local.behaviorAction}><MaterialIcon color="#fff" name="check" size={17} /><Text style={local.behaviorActionText}>ใช้แผนที่ AI แนะนำ</Text></Pressable></View>
    <View style={local.focusHeader}><Text style={local.focusHeading}>AI แนะนำให้โฟกัส</Text><Text style={local.focusCount}>{insight.focus.length} รายการ</Text></View>
    <View style={local.focusList}>{insight.focus.map((item, index) => <Pressable key={`${item.title}-${index}`} onPress={() => onAsk(`ช่วยวางแผน ${item.title}`)} style={local.focusItem}><View style={local.focusIcon}><MaterialIcon color="#678266" name={item.icon} size={17} /></View><View style={{flex: 1}}><Text numberOfLines={1} style={local.focusItemTitle}>{item.title}</Text><Text numberOfLines={1} style={local.focusText}>{item.subtitle}</Text></View><MaterialIcon color="#95a18f" name="chevron_right" size={18} /></Pressable>)}</View>
  </View>;
}

// Refactored UI: derive focus suggestions from existing proposed actions, without new data sources.
function FocusSuggestions({messages}: {messages: AssistantChatMessage[]}) {
  const suggestions = messages.filter((message) => message.role === 'assistant' && message.proposedAction && ['activity', 'checklist'].includes(message.proposedAction.entity));
  if (!suggestions.length) return null;
  return <View style={local.focusSection}>
    <Text style={local.focusHeading}>AI แนะนำให้โฟกัส</Text>
    {suggestions.map((message) => <View key={`focus-${message.id}`} style={local.focusItem}><View style={local.focusIcon}><MaterialIcon color="#678266" name="task_alt" size={17} /></View><Text numberOfLines={2} style={local.focusText}>{message.proposedAction?.summary}</Text></View>)}
  </View>;
}

const shortcuts = [
  ['calendar_month', 'ตารางวันนี้', 'ดูงานเรียงลำดับ', 'smartlife_notifications_schedule'],
  ['check_box', 'งานค้าง', 'เรียงความสำคัญ', 'smartlife_notifications_urgent'],
  ['account_balance_wallet', 'งบวันนี้', 'เช็กเงินคงเหลือ', 'smartlife_notifications_finance'],
  ['schedule', 'เวลาว่าง', 'หา AI ช่วยจัดช่วง', 'smartlife_notifications_ai'],
];

type QuickAddCategoryId = 'finance' | 'note' | 'ocr' | 'task' | 'time';
type QuickAddSuggestion = {detail: string; icon: string; prompt: string; title: string};

const defaultOcrShortcuts: QuickAddSuggestion[] = [
  {detail: 'ดูข้อมูลจากสลิปหรือใบเสร็จล่าสุด', icon: 'receipt_long', prompt: 'สรุปข้อมูลจาก OCR ล่าสุดให้หน่อย', title: 'ดู OCR ล่าสุด'},
  {detail: 'แยกปี พ.ศ. และ ค.ศ. ให้ถูกต้อง', icon: 'event_available', prompt: 'ตรวจวันและปีจาก OCR ว่าเป็น พ.ศ. หรือ ค.ศ.', title: 'ตรวจวันและปี'},
  {detail: 'ค้นจากข้อมูล OCR ช่วงล่าสุด ไม่จำกัดวันเดียว', icon: 'history', prompt: 'แสดงข้อมูล OCR ที่บันทึกไว้ช่วงล่าสุด', title: 'ดู OCR ช่วงล่าสุด'},
  {detail: 'ชี้ข้อมูลที่ไม่แน่ใจเพื่อให้ตรวจแก้', icon: 'fact_check', prompt: 'ตรวจข้อมูล OCR ที่ยังไม่แน่ใจและบอกจุดที่ควรแก้', title: 'ตรวจจุดไม่แน่ใจ'},
];

function ocrShortcutsKey(uid: string) {
  return `smartlife:assistant:ocr-shortcuts:${uid}`;
}

function parseOcrShortcuts(raw: string | null): QuickAddSuggestion[] {
  if (!raw) return defaultOcrShortcuts;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultOcrShortcuts;
    const shortcuts = parsed.slice(0, 4).flatMap((item): QuickAddSuggestion[] => {
      if (!item || typeof item !== 'object') return [];
      const title = String(item.title ?? '').trim().slice(0, 40);
      const prompt = String(item.prompt ?? '').trim().slice(0, 240);
      if (!title || !prompt) return [];
      return [{detail: String(item.detail ?? prompt).trim().slice(0, 90), icon: 'document_scanner', prompt, title}];
    });
    return shortcuts.length ? shortcuts : defaultOcrShortcuts;
  } catch {
    return defaultOcrShortcuts;
  }
}

const quickAddCategories: {
  createLabel: string;
  createPrompt: string;
  detail: string;
  icon: string;
  id: QuickAddCategoryId;
  suggestions: QuickAddSuggestion[];
  title: string;
}[] = [
  {
    createLabel: 'เพิ่มกิจกรรมหรือนัดหมายใหม่',
    createPrompt: 'เพิ่มนัดหมาย ',
    detail: 'ตารางเรียน สอบ นัดหมาย และเวลาว่าง',
    icon: 'event',
    id: 'time',
    suggestions: [
      {detail: 'ตรวจจากตารางของวันนี้', icon: 'school', prompt: 'วันนี้มีเรียนกี่โมงบ้าง', title: 'วันนี้เรียนกี่โมง'},
      {detail: 'ดูวันสอบทั้งหมดที่บันทึกไว้', icon: 'quiz', prompt: 'ฉันมีสอบวันไหนบ้าง', title: 'สอบวันไหน'},
      {detail: 'ค้นหาช่วงว่างจากตารางจริง', icon: 'schedule', prompt: 'วันนี้ฉันว่างช่วงไหนบ้าง', title: 'วันนี้ว่างตอนไหน'},
      {detail: 'แนะนำวันและเวลาที่เหมาะสม', icon: 'menu_book', prompt: 'ควรอ่านหนังสือวันไหนและกี่โมง', title: 'ควรอ่านหนังสือเมื่อไหร่'},
    ],
    title: 'เวลา',
  },
  {
    createLabel: 'เพิ่มงานใหม่',
    createPrompt: 'เพิ่มงาน ',
    detail: 'งานค้าง กำหนดส่ง และการจัดลำดับ',
    icon: 'checklist',
    id: 'task',
    suggestions: [
      {detail: 'แสดงงานที่ยังไม่เสร็จ', icon: 'pending_actions', prompt: 'ตอนนี้มีงานค้างอะไรบ้าง', title: 'งานค้างมีอะไรบ้าง'},
      {detail: 'เรียงจากความสำคัญและกำหนดส่ง', icon: 'low_priority', prompt: 'ควรทำงานอะไรก่อน', title: 'ควรทำอะไรก่อน'},
      {detail: 'ตรวจงานที่ใกล้ถึงกำหนด', icon: 'event_upcoming', prompt: 'งานไหนใกล้ถึงกำหนดส่งที่สุด', title: 'งานไหนใกล้ส่ง'},
      {detail: 'ช่วยแบ่งงานเป็นช่วงที่ทำได้จริง', icon: 'view_timeline', prompt: 'ช่วยวางแผนงานของสัปดาห์นี้', title: 'วางแผนงานสัปดาห์นี้'},
    ],
    title: 'งาน',
  },
  {
    createLabel: 'เพิ่มรายรับหรือรายจ่าย',
    createPrompt: 'จ่าย ',
    detail: 'ยอดคงเหลือ งบประมาณ และรายการเงิน',
    icon: 'payments',
    id: 'finance',
    suggestions: [
      {detail: 'ดูจากรายการของเดือนนี้', icon: 'account_balance_wallet', prompt: 'เดือนนี้ฉันเหลือเงินเท่าไหร่', title: 'เงินเหลือเท่าไหร่'},
      {detail: 'สรุปรายรับและรายจ่ายวันนี้', icon: 'today', prompt: 'สรุปงบวันนี้ให้หน่อย', title: 'งบวันนี้เป็นอย่างไร'},
      {detail: 'คำนวณวงเงินที่เหมาะสมต่อวัน', icon: 'savings', prompt: 'ควรแบ่งใช้เงินที่เหลือยังไง', title: 'ควรแบ่งเงินยังไง'},
      {detail: 'แนะนำจากงบและจำนวนวันที่เหลือ', icon: 'restaurant', prompt: 'วันนี้ควรตั้งงบค่าอาหารเท่าไหร่', title: 'ค่าอาหารควรเท่าไหร่'},
    ],
    title: 'การเงิน',
  },
  {
    createLabel: 'จดโน้ตใหม่',
    createPrompt: 'จดโน้ต ',
    detail: 'โน้ตการเรียน งาน ไอเดีย และบันทึก',
    icon: 'note_add',
    id: 'note',
    suggestions: [
      {detail: 'แสดงโน้ตที่บันทึกล่าสุด', icon: 'notes', prompt: 'ฉันมีโน้ตอะไรบ้าง', title: 'มีโน้ตอะไรบ้าง'},
      {detail: 'ค้นหาเฉพาะหมวดการเรียน', icon: 'school', prompt: 'มีโน้ตการเรียนอะไรบ้าง', title: 'ดูโน้ตการเรียน'},
      {detail: 'ค้นหาเฉพาะหมวดงาน', icon: 'task', prompt: 'มีโน้ตงานอะไรบ้าง', title: 'ดูโน้ตงาน'},
      {detail: 'ให้ AI ช่วยเลือกสิ่งที่ควรทบทวน', icon: 'auto_awesome', prompt: 'จากโน้ตควรทบทวนเรื่องอะไรก่อน', title: 'ควรทบทวนอะไร'},
    ],
    title: 'โน้ต',
  },
  {
    createLabel: 'ตั้งค่าคำถามลัด OCR',
    createPrompt: '',
    detail: 'สลิป ใบเสร็จ วันเวลา และข้อมูลสแกนล่าสุด',
    icon: 'document_scanner',
    id: 'ocr',
    suggestions: defaultOcrShortcuts,
    title: 'OCR',
  },
];

// Refactored UI: these use the existing message pipeline instead of adding a second data flow.
const shortcutPrompts: Record<string, string> = {
  smartlife_notifications_ai: 'ช่วยแนะนำเวลาอ่านหนังสือวันนี้',
  smartlife_notifications_finance: 'สรุปงบวันนี้ให้หน่อย',
  smartlife_notifications_schedule: 'วันนี้มีตารางอะไรบ้าง',
  smartlife_notifications_urgent: 'มีงานค้างอะไรบ้าง',
};

export default function AssistantScreen({uid, onNavigate}: {page: string; uid: string; onNavigate: UserNavigate}) {
  const autoScrollPendingRef = useRef(true);
  const chatScrollRef = useRef<ScrollView>(null);
  const cloudWriteQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const scrollToBottomVisibleRef = useRef(false);
  const speechBaseInputRef = useRef('');
  const temporaryChatRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [chatHistory, setChatHistory] = useState<AssistantConversationSummary[]>([]);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [conversationId, setConversationId] = useState(() => createAssistantConversationId());
  const [conversationState, setConversationState] = useState<AssistantConversationState>(() => createAssistantConversationState(conversationId));
  const [historyReady, setHistoryReady] = useState(false);
  const [historyOwnerUid, setHistoryOwnerUid] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [newChatMenuOpen, setNewChatMenuOpen] = useState(false);
  const [ocrShortcutDrafts, setOcrShortcutDrafts] = useState<QuickAddSuggestion[]>(defaultOcrShortcuts);
  const [ocrShortcutEditorOpen, setOcrShortcutEditorOpen] = useState(false);
  const [ocrShortcuts, setOcrShortcuts] = useState<QuickAddSuggestion[]>(defaultOcrShortcuts);
  const [quickAddCategory, setQuickAddCategory] = useState<QuickAddCategoryId | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [temporaryChat, setTemporaryChat] = useState(false);
  const [weeklyInsights, setWeeklyInsights] = useState<WeeklyInsightData | null>(null);
  const [messages, setMessages] = useState<AssistantChatMessage[]>(() => [assistantIntroMessage()]);
  // Refactored UI: the clean state remains visible until the user starts a conversation.
  const hasConversation = messages.some((message) => message.role === 'user');
  const visibleMessages = hasConversation ? messages.filter((message) => message.id !== 'assistant-intro') : [];
  const baseSelectedQuickAddCategory = quickAddCategories.find((category) => category.id === quickAddCategory) ?? null;
  const selectedQuickAddCategory = baseSelectedQuickAddCategory?.id === 'ocr'
    ? {...baseSelectedQuickAddCategory, suggestions: ocrShortcuts}
    : baseSelectedQuickAddCategory;

  useEffect(() => {
    temporaryChatRef.current = temporaryChat;
  }, [temporaryChat]);

  useEffect(() => {
    AsyncStorage.getItem(ocrShortcutsKey(uid))
      .then((value) => setOcrShortcuts(parseOcrShortcuts(value)))
      .catch(() => setOcrShortcuts(defaultOcrShortcuts));
  }, [uid]);

  useEffect(() => {
    let active = true;
    const today = thailandDateKey();

    async function loadHistoryAndBriefing() {
      setHistoryReady(false);
      setHistoryOwnerUid(null);
      setTemporaryChat(false);
      const [storedConversationId, lastBriefingDate] = await Promise.all([
        AsyncStorage.getItem(assistantActiveConversationKey(uid)),
        AsyncStorage.getItem(assistantBriefingKey(uid)),
      ]);
      const activeConversationId = storedConversationId?.startsWith('conversation-') && storedConversationId.length <= 80
        ? storedConversationId
        : createAssistantConversationId();
      const [storedMessages, storedState] = await Promise.all([
        AsyncStorage.getItem(assistantConversationHistoryKey(uid, activeConversationId)),
        AsyncStorage.getItem(assistantConversationStateKey(uid, activeConversationId)),
      ]);
      if (!active) return;

      const history = parseStoredMessages(storedMessages);
      const restoredState = parseAssistantConversationState(storedState, activeConversationId);
      setConversationId(activeConversationId);
      setConversationState(restoredState);
      autoScrollPendingRef.current = true;
      setMessages(history.length ? history : [assistantIntroMessage()]);
      setHistoryOwnerUid(uid);
      setHistoryReady(true);
      await AsyncStorage.setItem(assistantActiveConversationKey(uid), activeConversationId);

      if (lastBriefingDate === today) return;
      try {
        const reply = await buildAssistantReply(uid, 'สรุปวันนี้', [], {
          conversationId: activeConversationId,
          conversationState: restoredState,
        });
        if (!active) return;
        const briefingMessage: AssistantChatMessage = {
          content: reply.content,
          id: `briefing-${today}`,
          role: 'assistant',
          timestamp: nowIso(),
        };
        setMessages((current) => {
          if (current.some((message) => message.id === briefingMessage.id)) return current;
          return trimChatHistory([...current, briefingMessage]);
        });
        await AsyncStorage.setItem(assistantBriefingKey(uid), today);
      } catch {
        // Daily summary is helpful but should never block normal chat history.
      }
    }

    loadHistoryAndBriefing().catch(() => {
      if (!active) return;
      const fallbackConversationId = createAssistantConversationId();
      setConversationId(fallbackConversationId);
      setConversationState(createAssistantConversationState(fallbackConversationId));
      setMessages([assistantIntroMessage()]);
      setHistoryOwnerUid(uid);
      setHistoryReady(true);
    });
    return () => { active = false; };
  }, [uid]);

  useEffect(() => {
    let active = true;
    loadLegacyPageData(uid, 'user/smartlife_calendar_week')
      .then((data) => { if (active) setWeeklyInsights(data as WeeklyInsightData); })
      .catch(() => { if (active) setWeeklyInsights({}); });
    return () => { active = false; };
  }, [uid]);

  useEffect(() => {
    if (!historyReady || historyOwnerUid !== uid || temporaryChat) return;
    AsyncStorage.multiSet([
      [assistantActiveConversationKey(uid), conversationId],
      [assistantConversationHistoryKey(uid, conversationId), JSON.stringify(trimChatHistory(messages))],
      [assistantConversationStateKey(uid, conversationId), JSON.stringify(conversationState)],
    ]).catch(() => undefined);
  }, [conversationId, conversationState, historyOwnerUid, historyReady, messages, temporaryChat, uid]);

  useEffect(() => {
    return () => {
      if (!NativeModules.Voice) return;
      import('@react-native-voice/voice').then((module) => {
        module.default.destroy().catch(() => undefined);
        module.default.removeAllListeners();
      }).catch(() => undefined);
    };
  }, []);

  const persistMessage = (message: AssistantChatMessage, state: AssistantConversationState) => {
    if (temporaryChatRef.current || message.id === 'assistant-intro') return;
    cloudWriteQueueRef.current = cloudWriteQueueRef.current
      .then(() => saveAssistantMessage({conversationId, message, state, uid}))
      .catch((error) => console.warn('[SmartLife AI] Chat history save failed.', error));
  };

  const persistMessagePayload = (message: AssistantChatMessage) => {
    if (temporaryChatRef.current || message.id === 'assistant-intro') return;
    cloudWriteQueueRef.current = cloudWriteQueueRef.current
      .then(() => updateAssistantMessagePayload(uid, conversationId, message))
      .catch((error) => console.warn('[SmartLife AI] Chat message update failed.', error));
  };

  const scrollToLatest = (animated = true) => {
    autoScrollPendingRef.current = false;
    chatScrollRef.current?.scrollToEnd({animated});
    if (scrollToBottomVisibleRef.current) {
      scrollToBottomVisibleRef.current = false;
      setShowScrollToBottom(false);
    }
  };

  const queueScrollToLatest = () => {
    autoScrollPendingRef.current = true;
    requestAnimationFrame(() => chatScrollRef.current?.scrollToEnd({animated: true}));
  };

  const appendAssistant = (
    content: string,
    proposedAction?: AssistantProposedAction,
    metadata: Partial<Pick<AssistantReply, 'errorKind' | 'intent' | 'latencyMs' | 'source' | 'suggestions'>> = {},
    id = messageId('assistant'),
    state = conversationState,
  ) => {
    const nextMessage: AssistantChatMessage = {
      content,
      id,
      proposedAction,
      role: 'assistant',
      timestamp: nowIso(),
      ...metadata,
    };
    setMessages((current) => trimChatHistory([...current, nextMessage]));
    persistMessage(nextMessage, state);
    queueScrollToLatest();
  };

  const appendUser = (content: string, state = conversationState) => {
    const nextMessage: AssistantChatMessage = {content, id: messageId('user'), role: 'user', timestamp: nowIso()};
    setMessages((current) => trimChatHistory([...current, nextMessage]));
    persistMessage(nextMessage, state);
    queueScrollToLatest();
  };

  const updateActionStatus = (targetMessageId: string, status: ProposedActionStatus) => {
    setMessages((current) => current.map((message) => {
      if (message.id !== targetMessageId || !message.proposedAction) return message;
      const updated = {...message, proposedAction: {...message.proposedAction, status}};
      persistMessagePayload(updated);
      return updated;
    }));
  };

  const rateAssistant = (target: AssistantChatMessage, rating: AssistantFeedbackRating) => {
    setMessages((current) => current.map((message) => {
      if (message.id !== target.id) return message;
      const updated = {...message, feedback: rating};
      persistMessagePayload(updated);
      return updated;
    }));
    recordAssistantTelemetry({
      errorKind: target.errorKind,
      helpful: rating,
      intent: target.intent ?? 'unknown',
      interactionId: target.id,
      latencyMs: target.latencyMs ?? 0,
      source: target.source ?? 'fallback',
    }).catch(() => undefined);
  };

  const startNewConversation = async (mode: 'persistent' | 'temporary') => {
    if (busy || !historyReady) return;
    const nextConversationId = createAssistantConversationId();
    const nextState = createAssistantConversationState(nextConversationId);
    temporaryChatRef.current = mode === 'temporary';
    setTemporaryChat(mode === 'temporary');
    setConversationId(nextConversationId);
    setConversationState(nextState);
    setInput('');
    autoScrollPendingRef.current = true;
    setMessages([assistantIntroMessage()]);
    setNewChatMenuOpen(false);
    setQuickAddCategory(null);
    setQuickAddOpen(false);
    if (mode === 'persistent') await AsyncStorage.setItem(assistantActiveConversationKey(uid), nextConversationId);
  };

  const openChatHistory = async () => {
    if (!historyReady) return;
    setChatHistoryOpen(true);
    setChatHistoryLoading(true);
    try {
      setChatHistory(await listAssistantConversations(uid));
    } catch {
      Alert.alert('เปิดประวัติไม่สำเร็จ', 'กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง');
    } finally {
      setChatHistoryLoading(false);
    }
  };

  const selectHistoryConversation = async (conversation: AssistantConversationSummary) => {
    if (busy) return;
    setChatHistoryLoading(true);
    try {
      const restored = await loadAssistantConversation(uid, conversation);
      temporaryChatRef.current = false;
      setTemporaryChat(false);
      setConversationId(conversation.id);
      setConversationState(restored.state);
      autoScrollPendingRef.current = true;
      setMessages(restored.messages.length ? restored.messages : [assistantIntroMessage()]);
      setChatHistoryOpen(false);
      await AsyncStorage.setItem(assistantActiveConversationKey(uid), conversation.id);
    } catch {
      Alert.alert('เปิดแชทไม่สำเร็จ', 'ไม่สามารถโหลดข้อความของแชทนี้ได้');
    } finally {
      setChatHistoryLoading(false);
    }
  };

  const askDeleteHistoryConversation = (conversation: AssistantConversationSummary) => {
    Alert.alert('ลบแชทนี้?', 'ข้อความในแชทนี้จะถูกลบออกจากบัญชีของคุณ', [
      {style: 'cancel', text: 'ยกเลิก'},
      {style: 'destructive', text: 'ลบ', onPress: () => {
        deleteAssistantConversation(uid, conversation.id)
          .then(() => setChatHistory((current) => current.filter((item) => item.id !== conversation.id)))
          .catch(() => Alert.alert('ลบไม่สำเร็จ', 'กรุณาลองใหม่อีกครั้ง'));
      }},
    ]);
  };

  const sendMessage = async (message?: string) => {
    const text = (message ?? input).trim();
    if (!text || busy || !historyReady) return;
    const conversation = messages.slice(-12);
    const nextIntent = classifyAssistantIntent(text, conversationState.lastIntent);
    const nextConversationState = updateAssistantConversationState(conversationState, text, nextIntent);
    setQuickAddOpen(false);
    setQuickAddCategory(null);
    setInput('');
    setBusy(true);
    setConversationState(nextConversationState);
    appendUser(text, nextConversationState);
    try {
      const reply = await buildAssistantReply(uid, text, conversation, {
        conversationId,
        conversationState: nextConversationState,
      });
      const interactionId = messageId('assistant');
      const responseState = mergeAssistantConversationState(nextConversationState, reply.statePatch);
      appendAssistant(reply.content, reply.proposedAction, reply, interactionId, responseState);
      setConversationState(responseState);
      recordAssistantTelemetry({
        errorKind: reply.errorKind,
        intent: reply.intent,
        interactionId,
        latencyMs: reply.latencyMs,
        source: reply.source,
      }).catch(() => undefined);
    } catch {
      appendAssistant('ตอนนี้อ่านข้อมูลไม่ได้ ลองใหม่อีกครั้งนะ ถ้า Firebase หลุดเดี๋ยวเราค่อยไล่ดูต่อด้วยกัน');
    } finally {
      setBusy(false);
    }
  };

  const confirmAction = async (targetMessageId: string, action: AssistantProposedAction) => {
    if (busy || action.status !== 'pending') return;
    setBusy(true);
    try {
      const result = await confirmAssistantAction(uid, action);
      updateActionStatus(targetMessageId, 'confirmed');
      appendAssistant(action.entity === 'memory' ? 'จำการตั้งค่านี้ไว้ในเครื่องแล้วนะ ฉันจะนำไปใช้ตอนช่วยวางแผนครั้งถัดไป' : 'บันทึกลง Firebase แล้วนะ เปิดหน้าที่เกี่ยวข้องต่อได้เลย');
      if (action.entity !== 'memory') onNavigate(result.page);
    } catch {
      appendAssistant('ยังบันทึกไม่สำเร็จนะ ข้อมูลยังไม่ถูกเขียนลง Firebase เดี๋ยวลองใหม่หรือเช็กสิทธิ์ Firestore กัน');
    } finally {
      setBusy(false);
    }
  };

  const rejectAction = (targetMessageId: string, action: AssistantProposedAction) => {
    if (busy || action.status !== 'pending') return;
    updateActionStatus(targetMessageId, 'rejected');
    appendAssistant('โอเค ไม่บันทึกรายการนี้นะ');
  };

  const chooseQuickAdd = (prompt: string) => {
    setInput(prompt);
    setQuickAddOpen(false);
    setQuickAddCategory(null);
  };

  const openOcrShortcutEditor = () => {
    setOcrShortcutDrafts(ocrShortcuts.map((shortcut) => ({...shortcut})));
    setOcrShortcutEditorOpen(true);
  };

  const saveOcrShortcutEditor = async () => {
    const validShortcuts = ocrShortcutDrafts.slice(0, 4).flatMap((item): QuickAddSuggestion[] => {
      const title = item.title.trim().slice(0, 40);
      const prompt = item.prompt.trim().slice(0, 240);
      if (!title || !prompt) return [];
      return [{detail: prompt.slice(0, 90), icon: 'document_scanner', prompt, title}];
    });
    if (!validShortcuts.length) {
      Alert.alert('ยังบันทึกไม่ได้', 'กรุณาใส่ชื่อและคำถามอย่างน้อย 1 รายการ');
      return;
    }
    setOcrShortcuts(validShortcuts);
    setOcrShortcutEditorOpen(false);
    await AsyncStorage.setItem(ocrShortcutsKey(uid), JSON.stringify(validShortcuts));
  };

  const stopVoiceInput = async () => {
    if (!NativeModules.Voice) {
      setListening(false);
      return;
    }
    try {
      const Voice = (await import('@react-native-voice/voice')).default;
      await Voice.stop();
    } catch {
      // Stopping can fail if the recognizer already ended. The UI should still reset.
    } finally {
      setListening(false);
    }
  };

  const startVoiceInput = async () => {
    if (busy) return;
    setQuickAddOpen(false);
    setQuickAddCategory(null);
    if (!NativeModules.Voice) {
      appendAssistant('ปุ่มไมค์พร้อมในหน้าแชทแล้ว แต่ต้อง rebuild Development Build ใหม่ก่อน เพราะแอปใน MuMu ยังไม่มี native module สำหรับแปลงเสียงเป็นข้อความ\n\nหลัง rebuild แล้ว กดไมค์ พูด แล้วข้อความจะถูกเติมในช่องพิมพ์ให้ตรวจแก้ก่อนส่ง');
      return;
    }
    const granted = await requestMicrophonePermission();
    if (!granted) {
      appendAssistant('ยังไม่ได้รับสิทธิ์ไมโครโฟน เลยฟังเสียงไม่ได้ตอนนี้นะ เปิด permission ไมโครโฟนให้ SmartLife แล้วลองกดไมค์อีกครั้ง');
      return;
    }
    try {
      const Voice = (await import('@react-native-voice/voice')).default;
      speechBaseInputRef.current = input.trimEnd();
      Voice.onSpeechPartialResults = (event) => {
        const spoken = event.value?.[0]?.trim();
        if (!spoken) return;
        setInput([speechBaseInputRef.current, spoken].filter(Boolean).join(' '));
      };
      Voice.onSpeechResults = (event) => {
        const spoken = event.value?.[0]?.trim();
        if (!spoken) return;
        setInput([speechBaseInputRef.current, spoken].filter(Boolean).join(' '));
      };
      Voice.onSpeechError = () => {
        setListening(false);
        appendAssistant('ฟังเสียงไม่สำเร็จนะ ลองกดไมค์แล้วพูดใหม่อีกครั้ง หรือพิมพ์ต่อเองได้เลย');
      };
      Voice.onSpeechEnd = () => setListening(false);
      setListening(true);
      await Voice.start('th-TH');
    } catch (error) {
      setListening(false);
      const message = error instanceof Error ? error.message : '';
      if (/native module|Voice|Cannot find/i.test(message)) {
        appendAssistant('ปุ่มไมค์ต้อง rebuild Development Build ใหม่ก่อนนะ เพราะ native voice module ยังไม่อยู่ในแอปที่เปิดอยู่ใน MuMu');
        return;
      }
      appendAssistant('เริ่มฟังเสียงไม่ได้ตอนนี้นะ ลองใหม่อีกครั้ง หรือพิมพ์ข้อความเองก่อนก็ได้');
    }
  };

  const toggleVoiceInput = () => {
    if (listening) {
      stopVoiceInput().catch(() => setListening(false));
      return;
    }
    startVoiceInput().catch(() => setListening(false));
  };

  const pickImportFile = async () => {
    if (busy) return;
    setQuickAddOpen(false);
    setQuickAddCategory(null);
    setBusy(true);
    try {
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/pdf', 'text/plain', 'text/csv', 'text/calendar', 'text/*'],
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 8 * 1024 * 1024) {
        appendAssistant('ไฟล์นี้มีขนาดเกิน 8 MB กรุณาเลือกไฟล์ที่เล็กลง');
        return;
      }
      appendUser(`อัปโหลดไฟล์: ${asset.name}`);
      const analysis = await uploadAndAnalyzeAssistantFile({
        contentType: asset.mimeType,
        name: asset.name,
        uid,
        uri: asset.uri,
      });
      appendAssistant(analysis.content, undefined, {suggestions: analysis.suggestions});
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/ExpoDocumentPicker|native module|Cannot find native module/i.test(message)) {
        appendAssistant('เปิดตัวเลือกไฟล์ไม่สำเร็จ กรุณาปิดแล้วเปิด SmartLife ใหม่และลองอีกครั้ง หากยังเกิดซ้ำจึงค่อยติดตั้ง Development Build รุ่นล่าสุด');
        return;
      }
      if (/รองรับเฉพาะ|ชนิดไฟล์|8 MB|too large/i.test(message)) {
        appendAssistant(message);
        return;
      }
      appendAssistant('อัปโหลดหรือวิเคราะห์ไฟล์ไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองเลือกไฟล์ PDF, TXT, CSV หรือ ICS อีกครั้ง');
    } finally {
      setBusy(false);
    }
  };

  return (
    <UserShell active="smartlife_ai_assistant" edgeToEdge onNavigate={onNavigate} scroll={false}>
      {/* Refactored UI: keep the floating composer above the software keyboard. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={local.keyboardAvoiding}>
      <View style={local.shell}>
        <ScrollView
          decelerationRate="normal"
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          onContentSizeChange={() => {
            if (!autoScrollPendingRef.current) return;
            requestAnimationFrame(() => scrollToLatest(false));
          }}
          onScroll={(event) => {
            const {contentOffset, contentSize, layoutMeasurement} = event.nativeEvent;
            const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
            const shouldShow = hasConversation && distanceFromBottom > 180;
            if (scrollToBottomVisibleRef.current !== shouldShow) {
              scrollToBottomVisibleRef.current = shouldShow;
              setShowScrollToBottom(shouldShow);
            }
          }}
          ref={chatScrollRef}
          removeClippedSubviews={Platform.OS === 'android'}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={local.chatContent}
        >
          <View style={local.topBar}>
            <Pressable onPress={() => onNavigate('index')} style={local.circleButton}>
              <MaterialIcon color="#26321f" name="chevron_left" size={22} />
            </Pressable>
            <View style={local.topTitle}>
              <Text style={local.miniBrand}>SmartLife</Text>
              <View style={local.titleRow}>
                <Text style={local.screenTitle}>AI Assistant</Text>
                {temporaryChat ? <View style={local.temporaryBadge}><MaterialIcon color="#5d8059" name="timer" size={12} /><Text style={local.temporaryBadgeText}>ชั่วคราว</Text></View> : null}
              </View>
            </View>
            <View style={local.topActions}>
              <Pressable accessibilityLabel="เริ่มแชทใหม่" disabled={busy || !historyReady} onPress={() => setNewChatMenuOpen(true)} style={[local.circleButton, (busy || !historyReady) && local.disabled]}>
                <MaterialIcon color="#26321f" name="add_comment" size={19} />
              </Pressable>
              <Pressable accessibilityLabel="ย้อนดูประวัติแชท" onPress={openChatHistory} style={local.circleButton}>
                <MaterialIcon color="#26321f" name="history" size={20} />
              </Pressable>
            </View>
          </View>

          {/* Refactored UI: clean greeting banner for the initial assistant state. */}
          <LinearGradient colors={['#749279', '#87a48d']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={local.heroCard}>
            <View style={local.heroCopy}>
              <Text style={local.heroTitle}>วันนี้อยากให้ช่วยอะไรดีให้ดีขึ้น?</Text>
              <Text style={local.heroText}>ถามเรื่องตารางเรียน งานที่ต้องส่ง งบวันนี้ หรือให้ช่วยแปลงข้อความเป็นรายการบันทึกได้เลย</Text>
            </View>
            <MaterialIcon color="rgba(255,255,255,.72)" name="kid_star" size={48} />
          </LinearGradient>

          <View style={local.shortcutGrid}>
            {shortcuts.map(([icon, title, subtitle, target]) => (
              <Pressable disabled={busy} key={title} onPress={() => sendMessage(shortcutPrompts[target] ?? title)} style={[local.shortcutCard, busy && local.disabled]}>
                <View style={local.shortcutIcon}><MaterialIcon color="#64835f" name={icon} size={17} /></View>
                <View style={{flex: 1}}>
                  <Text style={local.shortcutTitle}>{title}</Text>
                  <Text numberOfLines={1} style={local.shortcutSubtitle}>{subtitle}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          {/* Added for AI Assistant: keep insights visible before and during a conversation. */}
          <AssistantInsights data={weeklyInsights} onAsk={sendMessage} />

          {hasConversation ? <View style={local.chatStack}>
            {/* Refactored UI: conversations appear only after the first user interaction. */}
            {visibleMessages.map((message) => (
              <MessageBubble busy={busy} key={message.id} message={message} onAsk={sendMessage} onConfirm={confirmAction} onFeedback={rateAssistant} onReject={rejectAction} />
            ))}
            {busy ? (
              <View style={local.thinking}>
                <ActivityIndicator color="#668d65" />
                <Text style={userStyles.muted}>กำลังดูข้อมูลจริงในระบบ...</Text>
              </View>
            ) : null}
            <FocusSuggestions messages={visibleMessages} />
          </View> : null}
        </ScrollView>
        {showScrollToBottom && !quickAddOpen ? (
          <Pressable accessibilityLabel="เลื่อนไปข้อความล่าสุด" onPress={() => scrollToLatest(true)} style={({pressed}) => [local.scrollToBottomButton, pressed && local.pressed]}>
            <MaterialIcon color="#4e6f4d" name="keyboard_arrow_down" size={26} />
          </Pressable>
        ) : null}
        {/* Refactored UI: a soft fade keeps scrolling content legible behind the floating composer. */}
        <LinearGradient colors={['rgba(241,244,240,0)', '#f1f4f0']} end={{x: 0, y: 1}} pointerEvents="none" start={{x: 0, y: 0}} style={local.inputFade} />
        <View style={local.composerWrap}>
          {quickAddOpen ? <LinearGradient colors={['rgba(255,255,255,.99)', '#f5f8f1']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={local.quickAddMenu}>
            <View style={local.quickAddHeader}>
              {selectedQuickAddCategory ? (
                <View style={local.quickAddCategoryHeader}>
                  <Pressable accessibilityLabel="กลับไปเลือกหมวด" onPress={() => setQuickAddCategory(null)} style={local.quickAddBack}>
                    <MaterialIcon color="#5d8059" name="arrow_back" size={18} />
                  </Pressable>
                  <View style={{flex: 1}}>
                    <Text style={local.quickAddTitle}>คำถามลัด: {selectedQuickAddCategory.title}</Text>
                    <Text style={local.quickAddHint}>แตะคำถามเพื่อถาม AI ได้ทันที</Text>
                  </View>
                  {selectedQuickAddCategory.id === 'ocr' ? <Pressable accessibilityLabel="ตั้งค่าคำถามลัด OCR" onPress={openOcrShortcutEditor} style={local.quickAddBack}><MaterialIcon color="#5d8059" name="settings" size={18} /></Pressable> : null}
                </View>
              ) : (
                <>
                  <Text style={local.quickAddTitle}>คำถามลัดและเพิ่มข้อมูล</Text>
                  <Text style={local.quickAddHint}>เลือกหมวดเพื่อดูคำถามที่ใช้บ่อย</Text>
                </>
              )}
            </View>
            <View style={local.quickAddGrid}>
              {selectedQuickAddCategory ? (
                <>
                  {selectedQuickAddCategory.suggestions.map((item) => (
                    <Pressable disabled={busy} key={item.title} onPress={() => sendMessage(item.prompt)} style={({pressed}) => [local.quickAddOption, pressed && local.pressed, busy && local.disabled]}>
                      <View style={local.quickAddIcon}><MaterialIcon color="#5d8059" name={item.icon} size={19} /></View>
                      <View style={local.quickAddCopy}>
                        <Text style={local.quickAddOptionTitle}>{item.title}</Text>
                        <Text numberOfLines={1} style={local.quickAddDetail}>{item.detail}</Text>
                      </View>
                      <MaterialIcon color="#9aa595" name="arrow_forward_ios" size={14} />
                    </Pressable>
                  ))}
                  <Pressable disabled={busy} onPress={() => selectedQuickAddCategory.id === 'ocr' ? openOcrShortcutEditor() : chooseQuickAdd(selectedQuickAddCategory.createPrompt)} style={({pressed}) => [local.quickAddCreate, pressed && local.pressed, busy && local.disabled]}>
                    <MaterialIcon color="#ffffff" name={selectedQuickAddCategory.id === 'ocr' ? 'settings' : 'add'} size={19} />
                    <Text style={local.quickAddCreateText}>{selectedQuickAddCategory.createLabel}</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  {quickAddCategories.map((item) => (
                    <Pressable disabled={busy} key={item.id} onPress={() => setQuickAddCategory(item.id)} style={({pressed}) => [local.quickAddOption, pressed && local.pressed, busy && local.disabled]}>
                      <View style={local.quickAddIcon}><MaterialIcon color="#5d8059" name={item.icon} size={19} /></View>
                      <View style={local.quickAddCopy}>
                        <Text style={local.quickAddOptionTitle}>{item.title}</Text>
                        <Text numberOfLines={1} style={local.quickAddDetail}>{item.detail}</Text>
                      </View>
                      <MaterialIcon color="#9aa595" name="chevron_right" size={18} />
                    </Pressable>
                  ))}
                  <Pressable disabled={busy} onPress={pickImportFile} style={({pressed}) => [local.quickAddOption, pressed && local.pressed, busy && local.disabled]}>
                    <View style={local.quickAddIcon}><MaterialIcon color="#5d8059" name="upload_file" size={19} /></View>
                    <View style={local.quickAddCopy}>
                      <Text style={local.quickAddOptionTitle}>อัปโหลดไฟล์</Text>
                      <Text numberOfLines={1} style={local.quickAddDetail}>PDF, TXT, CSV ตารางเรียนหรืองาน</Text>
                    </View>
                  </Pressable>
                </>
              )}
            </View>
          </LinearGradient> : null}
          <View style={local.composer}>
            <Pressable accessibilityLabel="เปิดคำถามลัดและเมนูเพิ่มข้อมูล" disabled={busy} onPress={() => {
              if (quickAddOpen) setQuickAddCategory(null);
              setQuickAddOpen((value) => !value);
            }} style={[local.attachButton, quickAddOpen && local.attachButtonActive, busy && local.disabled]}>
              <MaterialIcon color={quickAddOpen ? '#ffffff' : '#5d8059'} name={quickAddOpen ? 'close' : 'add'} size={24} />
            </Pressable>
            <TextInput
              multiline
              onChangeText={setInput}
              onFocus={() => requestAnimationFrame(() => chatScrollRef.current?.scrollToEnd({animated: true}))}
              onSubmitEditing={() => sendMessage()}
              placeholder="เช่น วันนี้มีเรียนอะไร / จ่ายกาแฟ 65 บาท / จดโน้ต..."
              placeholderTextColor="#8d9689"
              returnKeyType="send"
              style={local.input}
              value={input}
            />
            <Pressable accessibilityLabel={listening ? 'หยุดฟังเสียง' : 'พูดเพื่อพิมพ์'} disabled={busy} onPress={toggleVoiceInput} style={[local.voiceButton, listening && local.voiceButtonActive, busy && local.disabled]}>
              <MaterialIcon color={listening ? '#ffffff' : '#5d8059'} name={listening ? 'graphic_eq' : 'mic'} size={22} />
            </Pressable>
            <Pressable disabled={busy || !input.trim()} onPress={() => sendMessage()} style={[local.sendButton, (busy || !input.trim()) && local.disabled]}>
              <MaterialIcon color="#fff" name="send" size={22} />
            </Pressable>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
      <Modal animationType="fade" onRequestClose={() => setNewChatMenuOpen(false)} transparent visible={newChatMenuOpen}>
        <Pressable onPress={() => setNewChatMenuOpen(false)} style={local.modalOverlay}>
          <Pressable onPress={(event) => event.stopPropagation()} style={local.modalSheet}>
            <View style={local.modalHandle} />
            <Text style={local.modalTitle}>เริ่มแชทใหม่</Text>
            <Text style={local.modalHint}>เลือกว่าจะเก็บบทสนทนานี้ไว้ในประวัติหรือไม่</Text>
            <Pressable onPress={() => startNewConversation('persistent')} style={local.modalOption}>
              <View style={local.modalOptionIcon}><MaterialIcon color="#5d8059" name="add_comment" size={21} /></View>
              <View style={{flex: 1}}><Text style={local.modalOptionTitle}>แชทใหม่</Text><Text style={local.modalOptionText}>บันทึกข้อความไว้ในประวัติของบัญชีนี้</Text></View>
              <MaterialIcon color="#9aa595" name="chevron_right" size={20} />
            </Pressable>
            <Pressable onPress={() => startNewConversation('temporary')} style={local.modalOption}>
              <View style={local.modalOptionIcon}><MaterialIcon color="#5d8059" name="timer" size={21} /></View>
              <View style={{flex: 1}}><Text style={local.modalOptionTitle}>แชทชั่วคราว</Text><Text style={local.modalOptionText}>ไม่บันทึกข้อความไว้ในประวัติหรือในเครื่อง</Text></View>
              <MaterialIcon color="#9aa595" name="chevron_right" size={20} />
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setChatHistoryOpen(false)} transparent visible={chatHistoryOpen}>
        <Pressable onPress={() => setChatHistoryOpen(false)} style={local.modalOverlay}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[local.modalSheet, local.historySheet]}>
            <View style={local.modalHandle} />
            <View style={local.modalHeaderRow}>
              <View style={{flex: 1}}><Text style={local.modalTitle}>ประวัติแชท</Text><Text style={local.modalHint}>แตะเพื่อเปิดต่อ หรือลบรายการที่ไม่ต้องการ</Text></View>
              <Pressable onPress={() => setChatHistoryOpen(false)} style={local.modalClose}><MaterialIcon color="#5d6658" name="close" size={20} /></Pressable>
            </View>
            {chatHistoryLoading ? <ActivityIndicator color="#668d65" style={{marginVertical: 30}} /> : (
              <ScrollView contentContainerStyle={local.historyList} showsVerticalScrollIndicator={false}>
                {chatHistory.map((conversation) => (
                  <Pressable key={conversation.id} onPress={() => selectHistoryConversation(conversation)} style={local.historyItem}>
                    <View style={local.historyIcon}><MaterialIcon color="#5d8059" name="chat_bubble_outline" size={19} /></View>
                    <View style={{flex: 1}}>
                      <Text numberOfLines={1} style={local.historyTitle}>{conversation.title}</Text>
                      <Text numberOfLines={1} style={local.historyPreview}>{conversation.lastMessagePreview || `${conversation.messageCount} ข้อความ`}</Text>
                      <Text style={local.historyDate}>{formatDate(conversation.updatedAt.toISOString())}</Text>
                    </View>
                    <Pressable accessibilityLabel="ลบแชท" hitSlop={8} onPress={(event) => {event.stopPropagation(); askDeleteHistoryConversation(conversation);}} style={local.historyDelete}><MaterialIcon color="#9a6b6b" name="delete_outline" size={19} /></Pressable>
                  </Pressable>
                ))}
                {!chatHistory.length ? <View style={local.emptyHistory}><MaterialIcon color="#91a08d" name="history" size={34} /><Text style={local.modalOptionText}>ยังไม่มีแชทที่บันทึกไว้</Text></View> : null}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setOcrShortcutEditorOpen(false)} transparent visible={ocrShortcutEditorOpen}>
        <Pressable onPress={() => setOcrShortcutEditorOpen(false)} style={local.modalOverlay}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[local.modalSheet, local.historySheet]}>
            <View style={local.modalHandle} />
            <View style={local.modalHeaderRow}>
              <View style={{flex: 1}}><Text style={local.modalTitle}>ตั้งค่าคำถามลัด OCR</Text><Text style={local.modalHint}>สร้างได้สูงสุด 4 รายการในหมวด OCR</Text></View>
              <Pressable onPress={() => setOcrShortcutEditorOpen(false)} style={local.modalClose}><MaterialIcon color="#5d6658" name="close" size={20} /></Pressable>
            </View>
            <ScrollView contentContainerStyle={local.shortcutEditorList} keyboardShouldPersistTaps="handled">
              {ocrShortcutDrafts.map((shortcut, index) => (
                <View key={`ocr-draft-${index}`} style={local.shortcutEditorCard}>
                  <View style={local.shortcutEditorHeader}><Text style={local.shortcutEditorNumber}>คำถามลัด {index + 1}</Text><Pressable onPress={() => setOcrShortcutDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))}><MaterialIcon color="#9a6b6b" name="delete_outline" size={19} /></Pressable></View>
                  <TextInput maxLength={40} onChangeText={(title) => setOcrShortcutDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, title} : item))} placeholder="ชื่อปุ่ม เช่น ตรวจวันและปี" placeholderTextColor="#929b8f" style={local.shortcutEditorInput} value={shortcut.title} />
                  <TextInput maxLength={240} multiline onChangeText={(prompt) => setOcrShortcutDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? {...item, prompt} : item))} placeholder="คำถามที่จะส่งให้ AI" placeholderTextColor="#929b8f" style={[local.shortcutEditorInput, local.shortcutEditorPrompt]} value={shortcut.prompt} />
                </View>
              ))}
              {ocrShortcutDrafts.length < 4 ? <Pressable onPress={() => setOcrShortcutDrafts((current) => [...current, {detail: '', icon: 'document_scanner', prompt: '', title: ''}])} style={local.addShortcutButton}><MaterialIcon color="#5d8059" name="add" size={19} /><Text style={local.addShortcutText}>เพิ่มคำถามลัด</Text></Pressable> : null}
            </ScrollView>
            <Pressable onPress={saveOcrShortcutEditor} style={local.saveShortcutButton}><MaterialIcon color="#fff" name="check" size={19} /><Text style={local.quickAddCreateText}>บันทึกคำถามลัด</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </UserShell>
  );
}

const local = StyleSheet.create({
  addShortcutButton: {alignItems: 'center', borderColor: '#cddac9', borderRadius: 14, borderStyle: 'dashed', borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 46},
  addShortcutText: {color: '#5d8059', fontFamily: 'Prompt_700Bold', fontSize: 12},
  actionCard: {alignSelf: 'stretch', marginTop: 8, padding: 14},
  actionHeader: {alignItems: 'center', flexDirection: 'row', gap: 10},
  actionIcon: {alignItems: 'center', backgroundColor: '#e8f1e5', borderRadius: 18, height: 36, justifyContent: 'center', width: 36},
  assistantBubble: {backgroundColor: '#ffffff', borderColor: '#e4eadf', borderTopLeftRadius: 8, borderWidth: 1, boxShadow: '0 5px 14px rgba(45,58,49,.08)'},
  attachButton: {alignItems: 'center', backgroundColor: '#edf5ec', borderRadius: 22, height: 42, justifyContent: 'center', width: 42},
  attachButtonActive: {backgroundColor: '#5d8059'},
  bubble: {borderRadius: 24, maxWidth: '88%', paddingHorizontal: 15, paddingVertical: 12},
  bubbleText: {color: '#2d3a31', fontFamily: 'Prompt_400Regular', fontSize: 14, lineHeight: 21},
  behaviorAction: {alignItems: 'center', backgroundColor: '#2b3916', borderRadius: 14, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 12, minHeight: 43},
  behaviorActionText: {color: '#fff', fontFamily: 'Prompt_700Bold', fontSize: 11},
  behaviorHeading: {alignItems: 'center', flexDirection: 'row', gap: 9},
  behaviorIcon: {alignItems: 'center', backgroundColor: '#e4eee3', borderRadius: 13, height: 34, justifyContent: 'center', width: 34},
  behaviorPanel: {backgroundColor: '#ffffff', borderRadius: 20, marginTop: 10, padding: 14},
  behaviorText: {color: '#7c8979', fontFamily: 'Prompt_400Regular', fontSize: 9, lineHeight: 14, marginTop: 2},
  behaviorTiming: {flexDirection: 'row', gap: 8, marginTop: 11},
  behaviorTitle: {color: '#2d3a31', fontFamily: 'Prompt_800ExtraBold', fontSize: 13},
  burnoutIcon: {alignItems: 'center', backgroundColor: '#e8e9cc', borderRadius: 13, height: 34, justifyContent: 'center', width: 34},
  burnoutPanel: {alignItems: 'center', backgroundColor: '#f0f1dc', borderColor: '#d9dcad', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 9, marginTop: 12, padding: 13},
  burnoutText: {color: '#727560', fontFamily: 'Prompt_400Regular', fontSize: 10, lineHeight: 15, marginTop: 2},
  burnoutTitle: {color: '#35402d', fontFamily: 'Prompt_700Bold', fontSize: 11},
  chatContent: {gap: 14, paddingBottom: 138, paddingHorizontal: 18, paddingTop: 18},
  chatStack: {gap: 10},
  circleButton: {alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, height: 34, justifyContent: 'center', width: 34},
  composer: {alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#dfe7db', borderRadius: 30, borderWidth: 1, boxShadow: '0 8px 22px rgba(45,58,49,.12)', flexDirection: 'row', gap: 5, padding: 6},
  composerWrap: {bottom: 18, gap: 8, left: 18, position: 'absolute', right: 18, zIndex: 20},
  confirmRow: {alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 12},
  detailBox: {backgroundColor: '#f7f9f4', borderRadius: 14, gap: 8, marginTop: 12, padding: 12},
  detailLabel: {color: '#7d8779', fontFamily: 'Prompt_500Medium', fontSize: 11, width: 72},
  detailRow: {alignItems: 'flex-start', flexDirection: 'row', gap: 8},
  detailValue: {color: '#33412e', flex: 1, fontFamily: 'Prompt_500Medium', fontSize: 12, lineHeight: 18},
  disabled: {opacity: .5},
  emptyHistory: {alignItems: 'center', gap: 10, paddingVertical: 36},
  focusHeading: {color: '#2d3a31', fontFamily: 'Prompt_800ExtraBold', fontSize: 14, marginBottom: 8},
  focusCount: {color: '#668d65', fontFamily: 'Prompt_700Bold', fontSize: 9},
  focusHeader: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 18},
  focusIcon: {alignItems: 'center', backgroundColor: '#e4eee3', borderRadius: 12, height: 30, justifyContent: 'center', width: 30},
  focusItem: {alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 16, flexDirection: 'row', gap: 9, padding: 10},
  focusItemTitle: {color: '#2d3a31', fontFamily: 'Prompt_700Bold', fontSize: 11},
  focusList: {gap: 8},
  focusSection: {marginTop: 10},
  focusText: {color: '#4b584e', flex: 1, fontFamily: 'Prompt_500Medium', fontSize: 11, lineHeight: 16},
  feedbackButton: {alignItems: 'center', backgroundColor: '#eef3eb', borderRadius: 14, height: 28, justifyContent: 'center', width: 30},
  feedbackButtonActive: {backgroundColor: '#668166'},
  feedbackButtonNegative: {backgroundColor: '#a66e6e'},
  feedbackPrompt: {color: '#849080', flex: 1, fontFamily: 'Prompt_400Regular', fontSize: 9},
  feedbackRow: {alignItems: 'center', borderTopColor: '#edf0ea', borderTopWidth: 1, flexDirection: 'row', gap: 6, marginTop: 10, paddingTop: 8},
  heroCard: {alignItems: 'center', borderRadius: 24, flexDirection: 'row', gap: 12, minHeight: 122, overflow: 'hidden', padding: 17},
  heroCopy: {flex: 1, gap: 7},
  heroText: {color: 'rgba(255,255,255,.82)', fontFamily: 'Prompt_400Regular', fontSize: 11, lineHeight: 17},
  heroTitle: {color: '#ffffff', fontFamily: 'Prompt_800ExtraBold', fontSize: 21, lineHeight: 26},
  input: {color: '#2d3a31', flex: 1, fontFamily: 'Prompt_400Regular', fontSize: 14, maxHeight: 100, minHeight: 42, paddingHorizontal: 5, paddingVertical: 8},
  inputFade: {bottom: 0, height: 145, left: 0, position: 'absolute', right: 0},
  historyDate: {color: '#9aa296', fontFamily: 'Prompt_400Regular', fontSize: 9, marginTop: 3},
  historyDelete: {alignItems: 'center', backgroundColor: '#f7eeee', borderRadius: 15, height: 32, justifyContent: 'center', width: 32},
  historyIcon: {alignItems: 'center', backgroundColor: '#eaf2e7', borderRadius: 15, height: 40, justifyContent: 'center', width: 40},
  historyItem: {alignItems: 'center', borderBottomColor: '#e9eee5', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingVertical: 12},
  historyList: {paddingBottom: 16},
  historyPreview: {color: '#778274', fontFamily: 'Prompt_400Regular', fontSize: 10, marginTop: 2},
  historySheet: {maxHeight: '82%', minHeight: 360},
  historyTitle: {color: '#2d3a31', fontFamily: 'Prompt_700Bold', fontSize: 13},
  insightCount: {color: '#668d65', fontFamily: 'Prompt_700Bold', fontSize: 9},
  insightDivider: {backgroundColor: '#d9e0d3', borderRadius: 99, height: 5, marginTop: 8, width: '100%'},
  insightHeader: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  insightHeading: {color: '#2d3a31', fontFamily: 'Prompt_800ExtraBold', fontSize: 14},
  insightSection: {marginTop: 16},
  keyboardAvoiding: {flex: 1},
  messageRow: {alignItems: 'flex-start'},
  messageRowUser: {alignItems: 'flex-end'},
  miniBrand: {color: '#668d65', fontFamily: 'Prompt_700Bold', fontSize: 8, lineHeight: 10},
  modalClose: {alignItems: 'center', backgroundColor: '#eef2eb', borderRadius: 16, height: 34, justifyContent: 'center', width: 34},
  modalHandle: {alignSelf: 'center', backgroundColor: '#d4ddd0', borderRadius: 99, height: 4, marginBottom: 14, width: 42},
  modalHeaderRow: {alignItems: 'center', flexDirection: 'row', gap: 10},
  modalHint: {color: '#778274', fontFamily: 'Prompt_400Regular', fontSize: 11, lineHeight: 17, marginBottom: 12, marginTop: 2},
  modalOption: {alignItems: 'center', backgroundColor: '#f8faf6', borderColor: '#e3eadf', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 11, marginTop: 8, minHeight: 68, padding: 11},
  modalOptionIcon: {alignItems: 'center', backgroundColor: '#e7f0e4', borderRadius: 16, height: 42, justifyContent: 'center', width: 42},
  modalOptionText: {color: '#7b8577', fontFamily: 'Prompt_400Regular', fontSize: 10, lineHeight: 15, marginTop: 2},
  modalOptionTitle: {color: '#2d3a31', fontFamily: 'Prompt_700Bold', fontSize: 13},
  modalOverlay: {backgroundColor: 'rgba(31,38,29,.42)', flex: 1, justifyContent: 'flex-end'},
  modalSheet: {backgroundColor: '#ffffff', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingBottom: 24, paddingHorizontal: 18, paddingTop: 10},
  modalTitle: {color: '#26321f', fontFamily: 'Prompt_800ExtraBold', fontSize: 18},
  pressed: {opacity: .7, transform: [{translateY: -1}]},
  quickAddCopy: {flex: 1, minWidth: 0},
  quickAddBack: {alignItems: 'center', backgroundColor: '#edf4ea', borderRadius: 14, height: 36, justifyContent: 'center', width: 36},
  quickAddCategoryHeader: {alignItems: 'center', flexDirection: 'row', gap: 9},
  quickAddCreate: {alignItems: 'center', backgroundColor: '#5d8059', borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 46, paddingHorizontal: 12},
  quickAddCreateText: {color: '#ffffff', fontFamily: 'Prompt_700Bold', fontSize: 12},
  quickAddDetail: {color: '#7d8878', fontFamily: 'Prompt_400Regular', fontSize: 10, marginTop: 2},
  quickAddGrid: {gap: 8, marginTop: 10},
  quickAddHeader: {gap: 1},
  quickAddHint: {color: '#7b8876', fontFamily: 'Prompt_400Regular', fontSize: 11},
  quickAddIcon: {alignItems: 'center', backgroundColor: '#e9f2e6', borderRadius: 13, height: 38, justifyContent: 'center', width: 38},
  quickAddMenu: {borderColor: '#e1e8dc', borderRadius: 18, borderWidth: 1, boxShadow: '0 -8px 24px rgba(44, 52, 27, 0.11)', padding: 12},
  quickAddOption: {alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e5eadf', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 54, padding: 8},
  quickAddOptionTitle: {color: '#29351f', fontFamily: 'Prompt_700Bold', fontSize: 13},
  quickAddTitle: {color: '#29351f', fontFamily: 'Prompt_800ExtraBold', fontSize: 14},
  screenTitle: {color: '#26321f', fontFamily: 'Prompt_800ExtraBold', fontSize: 19, lineHeight: 23},
  saveShortcutButton: {alignItems: 'center', backgroundColor: '#5d8059', borderRadius: 15, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48, marginTop: 10},
  scrollToBottomButton: {alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#dce6d8', borderRadius: 22, borderWidth: 1, bottom: 94, boxShadow: '0 5px 16px rgba(45,58,49,.18)', height: 44, justifyContent: 'center', position: 'absolute', right: 24, width: 44, zIndex: 19},
  secondaryButton: {alignItems: 'center', backgroundColor: '#eef1eb', borderRadius: 14, justifyContent: 'center', marginTop: 15, minHeight: 50, paddingHorizontal: 15},
  secondaryButtonText: {color: '#66735f', fontFamily: 'Prompt_700Bold', fontSize: 14},
  sendButton: {alignItems: 'center', backgroundColor: '#749279', borderRadius: 22, height: 42, justifyContent: 'center', width: 42},
  // Refactored UI: a single seamless surface fills the entire screen without an outer frame.
  shell: {backgroundColor: '#f4f7f4', flex: 1},
  shortcutCard: {alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 24, flexDirection: 'row', gap: 9, minHeight: 74, padding: 12, width: '48.5%'},
  shortcutGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 9},
  shortcutEditorCard: {backgroundColor: '#f7faf5', borderColor: '#e2e9de', borderRadius: 16, borderWidth: 1, gap: 8, padding: 11},
  shortcutEditorHeader: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  shortcutEditorInput: {backgroundColor: '#ffffff', borderColor: '#dfe7db', borderRadius: 12, borderWidth: 1, color: '#2d3a31', fontFamily: 'Prompt_400Regular', fontSize: 12, minHeight: 42, paddingHorizontal: 11, paddingVertical: 8},
  shortcutEditorList: {gap: 10, paddingBottom: 8},
  shortcutEditorNumber: {color: '#4d634a', fontFamily: 'Prompt_700Bold', fontSize: 11},
  shortcutEditorPrompt: {minHeight: 66, textAlignVertical: 'top'},
  shortcutIcon: {alignItems: 'center', backgroundColor: '#eef5ed', borderRadius: 10, height: 31, justifyContent: 'center', width: 31},
  shortcutSubtitle: {color: '#8a9585', fontFamily: 'Prompt_400Regular', fontSize: 9, marginTop: 2},
  shortcutTitle: {color: '#26321f', fontFamily: 'Prompt_800ExtraBold', fontSize: 12},
  statusConfirmed: {backgroundColor: '#e8f1e5'},
  statusPill: {alignItems: 'center', alignSelf: 'flex-start', borderRadius: 99, flexDirection: 'row', gap: 6, marginTop: 12, paddingHorizontal: 10, paddingVertical: 6},
  statusRejected: {backgroundColor: '#f4e9e9'},
  statusText: {fontFamily: 'Prompt_700Bold', fontSize: 12},
  statusTextConfirmed: {color: '#4f754b'},
  statusTextRejected: {color: '#8a5b5b'},
  suggestionChip: {alignItems: 'center', alignSelf: 'stretch', backgroundColor: '#f1f6ef', borderColor: '#dce8d8', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'space-between', minHeight: 40, paddingHorizontal: 12, paddingVertical: 8},
  suggestionList: {gap: 7, marginTop: 10},
  suggestionText: {color: '#52664f', flex: 1, fontFamily: 'Prompt_500Medium', fontSize: 11, lineHeight: 16},
  thinking: {alignItems: 'center', flexDirection: 'row', gap: 8, padding: 10},
  timingLabel: {color: '#7e8b7a', fontFamily: 'Prompt_500Medium', fontSize: 8},
  timingTile: {backgroundColor: '#f1f5ef', borderRadius: 14, flex: 1, padding: 10},
  timingValue: {color: '#34412e', fontFamily: 'Prompt_700Bold', fontSize: 11, marginTop: 2},
  temporaryBadge: {alignItems: 'center', backgroundColor: '#e8f1e5', borderRadius: 99, flexDirection: 'row', gap: 3, paddingHorizontal: 7, paddingVertical: 3},
  temporaryBadgeText: {color: '#5d8059', fontFamily: 'Prompt_700Bold', fontSize: 8},
  titleRow: {alignItems: 'center', flexDirection: 'row', gap: 7},
  topBar: {alignItems: 'center', flexDirection: 'row', gap: 9},
  topActions: {alignItems: 'center', flexDirection: 'row', gap: 6},
  topTitle: {flex: 1},
  userBubble: {backgroundColor: '#749279', borderBottomRightRadius: 8},
  userBubbleText: {color: '#ffffff'},
  voiceButton: {alignItems: 'center', backgroundColor: '#edf5ec', borderRadius: 22, height: 42, justifyContent: 'center', width: 42},
  voiceButtonActive: {backgroundColor: '#5d8059'},
});
