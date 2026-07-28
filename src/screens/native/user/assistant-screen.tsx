import {useEffect, useMemo, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ActivityIndicator, KeyboardAvoidingView, NativeModules, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {LinearGradient} from 'expo-linear-gradient';

import {buildAssistantReply, confirmAssistantAction, recordAssistantTelemetry, type AssistantReply} from '@/services/assistant-tools';
import {loadLegacyPageData} from '@/services/legacy-data';
import type {AssistantChatMessage, AssistantFeedbackRating, AssistantProposedAction, ProposedActionStatus} from '@/types/assistant';
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

function assistantHistoryKey(uid: string) {
  return `smartlife:assistant:chat-history:${uid}`;
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

type ImportAsset = {
  mimeType?: string;
  name: string;
  size?: number;
  uri: string;
};

function formatFileSize(size?: number) {
  if (!size || size <= 0) return 'ไม่ทราบขนาด';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function isTextImport(asset: ImportAsset) {
  const ext = extensionOf(asset.name);
  return asset.mimeType?.startsWith('text/') || ['csv', 'ics', 'txt'].includes(ext);
}

function isPdfImport(asset: ImportAsset) {
  return asset.mimeType === 'application/pdf' || extensionOf(asset.name) === 'pdf';
}

function classifyFileName(name: string) {
  if (/tqf|มคอ|course|syllabus|class|lesson|ตารางเรียน|รายวิชา/i.test(name)) return 'ไฟล์การเรียน';
  if (/schedule|calendar|meeting|appointment|แผนงาน|นัด|ประชุม|ตารางงาน/i.test(name)) return 'ไฟล์ตารางงาน';
  if (/budget|finance|expense|income|เงิน|รายจ่าย|รายรับ/i.test(name)) return 'ไฟล์การเงิน';
  return 'ไฟล์ทั่วไป';
}

function previewImportedText(name: string, text: string) {
  const compactText = text.replace(/\u0000/g, '').replace(/[ \t]+/g, ' ').trim();
  const kind = /(มคอ|แผนการเรียนการสอน|รายวิชา|หน่วยกิต|อาจารย์|quiz|สอบ|lecture|course)/i.test(compactText)
    ? 'ไฟล์การเรียน'
    : /(นัด|ประชุม|กำหนดการ|deadline|ส่งงาน|เวลา|วันที่|schedule|meeting|project)/i.test(compactText)
      ? 'ไฟล์ตารางงาน/แผนงาน'
      : /(รายรับ|รายจ่าย|งบ|บาท|expense|income|budget)/i.test(compactText)
        ? 'ไฟล์การเงิน'
        : 'ไม่รองรับ';

  if (kind === 'ไม่รองรับ') {
    return `รับไฟล์ "${name}" แล้ว แต่เนื้อหาไม่เหมือนตารางเรียน นัดหมาย แผนงาน หรือข้อมูลการเงินที่ระบบอ่านได้ตอนนี้\n\nไฟล์นี้ยังไม่ถูกบันทึกลง Firebase นะ`;
  }

  const courseMatch = compactText.match(/(?:รายวิชา|course)\s*([0-9]{6,})?\s*([^.\n\r]{8,80})/i);
  const dateLike = Array.from(compactText.matchAll(/(?:วัน)?(?:จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์|Mon|Tue|Wed|Thu|Fri|Sat|Sun).{0,40}?\d{1,2}[.:]\d{2}.{0,20}?(?:\d{1,2}[.:]\d{2})?/gi)).slice(0, 4).map((match) => match[0].trim());
  const topicLike = Array.from(compactText.matchAll(/(?:Quiz|สอบ|ส่ง|นำเสนอ|Project|รายงาน)[^.\n\r]{0,60}/gi)).slice(0, 5).map((match) => match[0].trim());

  const lines = [
    `อ่านไฟล์ "${name}" ได้แล้ว`,
    `ประเภทที่เดาได้: ${kind}`,
    courseMatch ? `รายวิชา/หัวข้อ: ${[courseMatch[1], courseMatch[2]].filter(Boolean).join(' ')}` : '',
    dateLike.length ? `เวลาที่พบ:\n${dateLike.map((item) => `• ${item}`).join('\n')}` : '',
    topicLike.length ? `จุดสำคัญที่พบ:\n${topicLike.map((item) => `• ${item}`).join('\n')}` : '',
    '',
    'รอบนี้ฉันยังไม่บันทึกอัตโนมัติ เพื่อให้คุณตรวจข้อมูลก่อนเสมอ ขั้นต่อไปควรทำหน้าพรีวิวให้เลือกว่าจะเพิ่มเป็นตารางเรียน งาน นัดหมาย หรือการเงิน',
  ].filter(Boolean);

  return lines.join('\n');
}

function previewImportedPdf(asset: ImportAsset) {
  const kind = classifyFileName(asset.name);
  const supportedContext = kind !== 'ไฟล์ทั่วไป';
  if (!supportedContext) {
    return `รับไฟล์ "${asset.name}" แล้ว (${formatFileSize(asset.size)})\n\nแต่ชื่อไฟล์ยังไม่บอกว่าเป็นตารางเรียน นัดหมาย แผนงาน หรือข้อมูลการเงิน ระบบเลยยังไม่อ่านต่อและยังไม่บันทึกลง Firebase นะ`;
  }
  return `รับไฟล์ "${asset.name}" แล้ว (${formatFileSize(asset.size)})\n\nระบบเดาว่าเป็น${kind} และปุ่มอัปโหลดใช้งานได้แล้ว แต่ PDF ต้องมีตัวดึงข้อความ PDF เพิ่มก่อนถึงจะแยกวัน เวลา หัวข้อ และสอบออกมาเป็นรายการได้โดยไม่ใช้ OCR/LLM\n\nตอนนี้ยังไม่บันทึกลง Firebase ถ้าคัดลอกข้อความจาก PDF มาวางในแชท ฉันจะแยกข้อมูลให้ตรวจได้ทันที`;
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
  onConfirm,
  onFeedback,
  onReject,
  busy,
}: {
  busy: boolean;
  message: AssistantChatMessage;
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

type QuickAddCategoryId = 'finance' | 'note' | 'task' | 'time';

const quickAddCategories: {
  createLabel: string;
  createPrompt: string;
  detail: string;
  icon: string;
  id: QuickAddCategoryId;
  suggestions: {detail: string; icon: string; prompt: string; title: string}[];
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
];

// Refactored UI: these use the existing message pipeline instead of adding a second data flow.
const shortcutPrompts: Record<string, string> = {
  smartlife_notifications_ai: 'ช่วยแนะนำเวลาอ่านหนังสือวันนี้',
  smartlife_notifications_finance: 'สรุปงบวันนี้ให้หน่อย',
  smartlife_notifications_schedule: 'วันนี้มีตารางอะไรบ้าง',
  smartlife_notifications_urgent: 'มีงานค้างอะไรบ้าง',
};

export default function AssistantScreen({uid, onNavigate}: {page: string; uid: string; onNavigate: UserNavigate}) {
  const chatScrollRef = useRef<ScrollView>(null);
  const speechBaseInputRef = useRef('');
  const [busy, setBusy] = useState(false);
  const [historyOwnerUid, setHistoryOwnerUid] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [quickAddCategory, setQuickAddCategory] = useState<QuickAddCategoryId | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [weeklyInsights, setWeeklyInsights] = useState<WeeklyInsightData | null>(null);
  const [messages, setMessages] = useState<AssistantChatMessage[]>(() => [assistantIntroMessage()]);
  // Refactored UI: the clean state remains visible until the user starts a conversation.
  const hasConversation = messages.some((message) => message.role === 'user');
  const visibleMessages = hasConversation ? messages.filter((message) => message.id !== 'assistant-intro') : [];
  const selectedQuickAddCategory = quickAddCategories.find((category) => category.id === quickAddCategory) ?? null;

  useEffect(() => {
    let active = true;
    const today = thailandDateKey();

    async function loadHistoryAndBriefing() {
      const [storedMessages, lastBriefingDate] = await Promise.all([
        AsyncStorage.getItem(assistantHistoryKey(uid)),
        AsyncStorage.getItem(assistantBriefingKey(uid)),
      ]);
      if (!active) return;

      const history = parseStoredMessages(storedMessages);
      setMessages(history.length ? history : [assistantIntroMessage()]);
      setHistoryOwnerUid(uid);

      if (lastBriefingDate === today) return;
      try {
        const reply = await buildAssistantReply(uid, 'สรุปวันนี้');
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
      setMessages([assistantIntroMessage()]);
      setHistoryOwnerUid(uid);
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
    if (historyOwnerUid !== uid) return;
    AsyncStorage.setItem(assistantHistoryKey(uid), JSON.stringify(trimChatHistory(messages))).catch(() => undefined);
  }, [historyOwnerUid, messages, uid]);

  useEffect(() => {
    return () => {
      if (!NativeModules.Voice) return;
      import('@react-native-voice/voice').then((module) => {
        module.default.destroy().catch(() => undefined);
        module.default.removeAllListeners();
      }).catch(() => undefined);
    };
  }, []);

  const appendAssistant = (
    content: string,
    proposedAction?: AssistantProposedAction,
    metadata: Partial<Pick<AssistantReply, 'errorKind' | 'intent' | 'latencyMs' | 'source'>> = {},
    id = messageId('assistant'),
  ) => {
    setMessages((current) => trimChatHistory([...current, {
      content,
      id,
      proposedAction,
      role: 'assistant',
      timestamp: nowIso(),
      ...metadata,
    }]));
  };

  const appendUser = (content: string) => {
    setMessages((current) => trimChatHistory([...current, {content, id: messageId('user'), role: 'user', timestamp: nowIso()}]));
  };

  const updateActionStatus = (targetMessageId: string, status: ProposedActionStatus) => {
    setMessages((current) => current.map((message) => {
      if (message.id !== targetMessageId || !message.proposedAction) return message;
      return {...message, proposedAction: {...message.proposedAction, status}};
    }));
  };

  const rateAssistant = (target: AssistantChatMessage, rating: AssistantFeedbackRating) => {
    setMessages((current) => current.map((message) =>
      message.id === target.id ? {...message, feedback: rating} : message,
    ));
    recordAssistantTelemetry({
      errorKind: target.errorKind,
      helpful: rating,
      intent: target.intent ?? 'unknown',
      interactionId: target.id,
      latencyMs: target.latencyMs ?? 0,
      source: target.source ?? 'fallback',
    }).catch(() => undefined);
  };

  const sendMessage = async (message?: string) => {
    const text = (message ?? input).trim();
    if (!text || busy) return;
    const conversation = messages.slice(-12);
    setQuickAddOpen(false);
    setQuickAddCategory(null);
    setInput('');
    setBusy(true);
    setMessages((current) => trimChatHistory([...current, {content: text, id: messageId('user'), role: 'user', timestamp: nowIso()}]));
    try {
      const reply = await buildAssistantReply(uid, text, conversation);
      const interactionId = messageId('assistant');
      appendAssistant(reply.content, reply.proposedAction, reply, interactionId);
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
      if (!NativeModules.ExpoDocumentPicker) {
        appendAssistant('หน้า AI ใช้งานได้ปกติ แต่ปุ่มอัปโหลดไฟล์ต้อง rebuild Development Build ใหม่ก่อน เพราะแอปใน MuMu ยังไม่มี native module ของ DocumentPicker\n\nตอนนี้เพิ่มข้อมูลผ่านแชทได้ก่อน เช่น “เพิ่มนัดหมาย...” “จ่าย...” หรือ “จดโน้ต...” ส่วนอัปโหลดไฟล์ให้รัน build Android ใหม่หนึ่งครั้ง');
        return;
      }
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ['application/pdf', 'text/plain', 'text/csv', 'text/calendar', 'text/*'],
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      appendUser(`อัปโหลดไฟล์: ${asset.name}`);

      if (isTextImport(asset)) {
        const text = await FileSystem.readAsStringAsync(asset.uri);
        appendAssistant(previewImportedText(asset.name, text.slice(0, 80_000)));
        return;
      }

      if (isPdfImport(asset)) {
        appendAssistant(previewImportedPdf(asset));
        return;
      }

      appendAssistant(`รับไฟล์ "${asset.name}" แล้ว แต่ชนิดไฟล์นี้ยังไม่รองรับ\n\nตอนนี้ระบบรับ PDF/TXT/CSV/ICS ที่เกี่ยวกับตารางเรียน นัดหมาย แผนงาน หรือข้อมูลการเงินก่อน และยังไม่บันทึกไฟล์นี้ลง Firebase`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/ExpoDocumentPicker|native module|Cannot find native module/i.test(message)) {
        appendAssistant('หน้า AI ใช้งานได้ปกติแล้ว แต่ปุ่มอัปโหลดไฟล์ต้อง rebuild Development Build ใหม่ก่อน เพราะแอปใน MuMu ยังไม่มี native module ของ DocumentPicker\n\nตอนนี้ใช้แชทกับปุ่มเพิ่มข้อมูลอื่น ๆ ได้ก่อน และถ้าจะเปิดอัปโหลดไฟล์จริงให้รัน build Android ใหม่หนึ่งครั้ง');
        return;
      }
      appendAssistant('เปิดตัวเลือกไฟล์หรืออ่านไฟล์ไม่สำเร็จนะ ลองเลือกไฟล์ PDF/TXT/CSV ที่อยู่ในเครื่องอีกครั้ง');
    } finally {
      setBusy(false);
    }
  };

  return (
    <UserShell active="smartlife_ai_assistant" edgeToEdge onNavigate={onNavigate} scroll={false}>
      {/* Refactored UI: keep the floating composer above the software keyboard. */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={local.keyboardAvoiding}>
      <View style={local.shell}>
        <ScrollView ref={chatScrollRef} contentContainerStyle={local.chatContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={local.topBar}>
            <Pressable onPress={() => onNavigate('index')} style={local.circleButton}>
              <MaterialIcon color="#26321f" name="chevron_left" size={22} />
            </Pressable>
            <View style={local.topTitle}>
              <Text style={local.miniBrand}>SmartLife</Text>
              <Text style={local.screenTitle}>AI Assistant</Text>
            </View>
            <Pressable accessibilityLabel="ย้อนดูประวัติแชท" onPress={() => chatScrollRef.current?.scrollTo({animated: true, y: 0})} style={local.circleButton}>
              <MaterialIcon color="#26321f" name="history" size={20} />
            </Pressable>
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
              <MessageBubble busy={busy} key={message.id} message={message} onConfirm={confirmAction} onFeedback={rateAssistant} onReject={rejectAction} />
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
                  <Pressable disabled={busy} onPress={() => chooseQuickAdd(selectedQuickAddCategory.createPrompt)} style={({pressed}) => [local.quickAddCreate, pressed && local.pressed, busy && local.disabled]}>
                    <MaterialIcon color="#ffffff" name="add" size={19} />
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
    </UserShell>
  );
}

const local = StyleSheet.create({
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
  insightCount: {color: '#668d65', fontFamily: 'Prompt_700Bold', fontSize: 9},
  insightDivider: {backgroundColor: '#d9e0d3', borderRadius: 99, height: 5, marginTop: 8, width: '100%'},
  insightHeader: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  insightHeading: {color: '#2d3a31', fontFamily: 'Prompt_800ExtraBold', fontSize: 14},
  insightSection: {marginTop: 16},
  keyboardAvoiding: {flex: 1},
  messageRow: {alignItems: 'flex-start'},
  messageRowUser: {alignItems: 'flex-end'},
  miniBrand: {color: '#668d65', fontFamily: 'Prompt_700Bold', fontSize: 8, lineHeight: 10},
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
  secondaryButton: {alignItems: 'center', backgroundColor: '#eef1eb', borderRadius: 14, justifyContent: 'center', marginTop: 15, minHeight: 50, paddingHorizontal: 15},
  secondaryButtonText: {color: '#66735f', fontFamily: 'Prompt_700Bold', fontSize: 14},
  sendButton: {alignItems: 'center', backgroundColor: '#749279', borderRadius: 22, height: 42, justifyContent: 'center', width: 42},
  // Refactored UI: a single seamless surface fills the entire screen without an outer frame.
  shell: {backgroundColor: '#f4f7f4', flex: 1},
  shortcutCard: {alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 24, flexDirection: 'row', gap: 9, minHeight: 74, padding: 12, width: '48.5%'},
  shortcutGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 9},
  shortcutIcon: {alignItems: 'center', backgroundColor: '#eef5ed', borderRadius: 10, height: 31, justifyContent: 'center', width: 31},
  shortcutSubtitle: {color: '#8a9585', fontFamily: 'Prompt_400Regular', fontSize: 9, marginTop: 2},
  shortcutTitle: {color: '#26321f', fontFamily: 'Prompt_800ExtraBold', fontSize: 12},
  statusConfirmed: {backgroundColor: '#e8f1e5'},
  statusPill: {alignItems: 'center', alignSelf: 'flex-start', borderRadius: 99, flexDirection: 'row', gap: 6, marginTop: 12, paddingHorizontal: 10, paddingVertical: 6},
  statusRejected: {backgroundColor: '#f4e9e9'},
  statusText: {fontFamily: 'Prompt_700Bold', fontSize: 12},
  statusTextConfirmed: {color: '#4f754b'},
  statusTextRejected: {color: '#8a5b5b'},
  thinking: {alignItems: 'center', flexDirection: 'row', gap: 8, padding: 10},
  timingLabel: {color: '#7e8b7a', fontFamily: 'Prompt_500Medium', fontSize: 8},
  timingTile: {backgroundColor: '#f1f5ef', borderRadius: 14, flex: 1, padding: 10},
  timingValue: {color: '#34412e', fontFamily: 'Prompt_700Bold', fontSize: 11, marginTop: 2},
  topBar: {alignItems: 'center', flexDirection: 'row', gap: 9},
  topTitle: {flex: 1},
  userBubble: {backgroundColor: '#749279', borderBottomRightRadius: 8},
  userBubbleText: {color: '#ffffff'},
  voiceButton: {alignItems: 'center', backgroundColor: '#edf5ec', borderRadius: 22, height: 42, justifyContent: 'center', width: 42},
  voiceButtonActive: {backgroundColor: '#5d8059'},
});
