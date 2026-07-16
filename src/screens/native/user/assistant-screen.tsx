import {useEffect, useRef, useState} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {ActivityIndicator, NativeModules, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {LinearGradient} from 'expo-linear-gradient';

import {buildAssistantReply, confirmAssistantAction} from '@/services/assistant-tools';
import type {AssistantChatMessage, AssistantProposedAction, ProposedActionStatus} from '@/types/assistant';
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
  onReject,
  busy,
}: {
  busy: boolean;
  message: AssistantChatMessage;
  onConfirm: (messageIdValue: string, action: AssistantProposedAction) => void;
  onReject: (messageIdValue: string, action: AssistantProposedAction) => void;
}) {
  const isUser = message.role === 'user';
  return (
    <View style={[local.messageRow, isUser && local.messageRowUser]}>
      <View style={[local.bubble, isUser ? local.userBubble : local.assistantBubble]}>
        <Text style={[local.bubbleText, isUser && local.userBubbleText]}>{message.content}</Text>
      </View>
      {message.proposedAction ? (
        <ActionCard
          action={message.proposedAction}
          busy={busy}
          onConfirm={() => onConfirm(message.id, message.proposedAction as AssistantProposedAction)}
          onReject={() => onReject(message.id, message.proposedAction as AssistantProposedAction)}
        />
      ) : null}
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

const shortcuts = [
  ['calendar_month', 'ตารางวันนี้', 'ดูงานเรียงลำดับ', 'smartlife_notifications_schedule'],
  ['check_box', 'งานค้าง', 'เรียงความสำคัญ', 'smartlife_notifications_urgent'],
  ['account_balance_wallet', 'งบวันนี้', 'เช็กเงินคงเหลือ', 'smartlife_notifications_finance'],
  ['schedule', 'เวลาว่าง', 'หา AI ช่วยจัดช่วง', 'smartlife_notifications_ai'],
];

const quickAddOptions = [
  {detail: 'นัดหมาย คลาส หรือช่วงเวลา', icon: 'event', prompt: 'เพิ่มนัดหมาย ', title: 'เวลา'},
  {detail: 'สิ่งที่ต้องทำหรือ deadline', icon: 'checklist', prompt: 'เพิ่มงาน ', title: 'งาน'},
  {detail: 'รายรับ รายจ่าย หรือหมวดเงิน', icon: 'payments', prompt: 'จ่าย ', title: 'การเงิน'},
  {detail: 'ข้อความ บทเรียน หรือไอเดีย', icon: 'note_add', prompt: 'จดโน้ต ', title: 'โน้ต'},
  {action: 'file' as const, detail: 'PDF, TXT, CSV ตารางเรียนหรืองาน', icon: 'upload_file', title: 'อัปโหลดไฟล์'},
];

export default function AssistantScreen({uid, onNavigate}: {page: string; uid: string; onNavigate: UserNavigate}) {
  const chatScrollRef = useRef<ScrollView>(null);
  const speechBaseInputRef = useRef('');
  const [busy, setBusy] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantChatMessage[]>(() => [assistantIntroMessage()]);

  useEffect(() => {
    let active = true;
    const today = thailandDateKey();
    setHistoryReady(false);
    setMessages([assistantIntroMessage()]);

    async function loadHistoryAndBriefing() {
      const [storedMessages, lastBriefingDate] = await Promise.all([
        AsyncStorage.getItem(assistantHistoryKey(uid)),
        AsyncStorage.getItem(assistantBriefingKey(uid)),
      ]);
      if (!active) return;

      const history = parseStoredMessages(storedMessages);
      setMessages(history.length ? history : [assistantIntroMessage()]);
      setHistoryReady(true);

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
      setHistoryReady(true);
    });
    return () => { active = false; };
  }, [uid]);

  useEffect(() => {
    if (!historyReady) return;
    AsyncStorage.setItem(assistantHistoryKey(uid), JSON.stringify(trimChatHistory(messages))).catch(() => undefined);
  }, [historyReady, messages, uid]);

  useEffect(() => {
    return () => {
      if (!NativeModules.Voice) return;
      import('@react-native-voice/voice').then((module) => {
        module.default.destroy().catch(() => undefined);
        module.default.removeAllListeners();
      }).catch(() => undefined);
    };
  }, []);

  const appendAssistant = (content: string, proposedAction?: AssistantProposedAction) => {
    setMessages((current) => trimChatHistory([...current, {content, id: messageId('assistant'), proposedAction, role: 'assistant', timestamp: nowIso()}]));
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

  const sendMessage = async (message?: string) => {
    const text = (message ?? input).trim();
    if (!text || busy) return;
    setQuickAddOpen(false);
    setInput('');
    setBusy(true);
    setMessages((current) => trimChatHistory([...current, {content: text, id: messageId('user'), role: 'user', timestamp: nowIso()}]));
    try {
      const reply = await buildAssistantReply(uid, text);
      appendAssistant(reply.content, reply.proposedAction);
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
    <UserShell active="smartlife_ai_assistant" onNavigate={onNavigate} scroll={false}>
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

          <LinearGradient colors={['#6f8f6d', '#b8caba']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={local.heroCard}>
            <View style={local.heroCopy}>
              <Text style={local.heroTitle}>วันนี้อยากให้ช่วยอะไรดีให้ดีขึ้น?</Text>
              <Text style={local.heroText}>ถามเรื่องตารางเรียน งานที่ต้องส่ง งบวันนี้ หรือให้ช่วยแปลงข้อความเป็นรายการบันทึกได้เลย</Text>
            </View>
            <MaterialIcon color="rgba(255,255,255,.72)" name="kid_star" size={48} />
          </LinearGradient>

          <View style={local.shortcutGrid}>
            {shortcuts.map(([icon, title, subtitle, target]) => (
              <Pressable disabled={busy} key={title} onPress={() => onNavigate(target)} style={[local.shortcutCard, busy && local.disabled]}>
                <View style={local.shortcutIcon}><MaterialIcon color="#64835f" name={icon} size={17} /></View>
                <View style={{flex: 1}}>
                  <Text style={local.shortcutTitle}>{title}</Text>
                  <Text numberOfLines={1} style={local.shortcutSubtitle}>{subtitle}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          <View style={local.chatStack}>
            {messages.map((message) => (
              <MessageBubble busy={busy} key={message.id} message={message} onConfirm={confirmAction} onReject={rejectAction} />
            ))}
            {busy ? (
              <View style={local.thinking}>
                <ActivityIndicator color="#668d65" />
                <Text style={userStyles.muted}>กำลังดูข้อมูลจริงในระบบ...</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
        <View style={local.composerWrap}>
          {quickAddOpen ? <LinearGradient colors={['rgba(255,255,255,.99)', '#f5f8f1']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={local.quickAddMenu}>
            <View style={local.quickAddHeader}>
              <Text style={local.quickAddTitle}>เพิ่มข้อมูลผ่าน AI</Text>
              <Text style={local.quickAddHint}>เลือกประเภท แล้วเติมรายละเอียดก่อนส่ง</Text>
            </View>
            <View style={local.quickAddGrid}>
              {quickAddOptions.map((item) => <Pressable disabled={busy} key={item.title} onPress={() => item.action === 'file' ? pickImportFile() : chooseQuickAdd(item.prompt)} style={({pressed}) => [local.quickAddOption, pressed && local.pressed, busy && local.disabled]}>
                <View style={local.quickAddIcon}><MaterialIcon color="#5d8059" name={item.icon} size={19} /></View>
                <View style={local.quickAddCopy}>
                  <Text style={local.quickAddOptionTitle}>{item.title}</Text>
                  <Text numberOfLines={1} style={local.quickAddDetail}>{item.detail}</Text>
                </View>
              </Pressable>)}
            </View>
          </LinearGradient> : null}
          <View style={local.composer}>
            <Pressable accessibilityLabel="เลือกประเภทข้อมูลที่จะเพิ่ม" disabled={busy} onPress={() => setQuickAddOpen((value) => !value)} style={[local.attachButton, quickAddOpen && local.attachButtonActive, busy && local.disabled]}>
              <MaterialIcon color={quickAddOpen ? '#ffffff' : '#5d8059'} name={quickAddOpen ? 'close' : 'add'} size={24} />
            </Pressable>
            <TextInput
              multiline
              onChangeText={setInput}
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
    </UserShell>
  );
}

const local = StyleSheet.create({
  actionCard: {alignSelf: 'stretch', marginTop: 8, padding: 14},
  actionHeader: {alignItems: 'center', flexDirection: 'row', gap: 10},
  actionIcon: {alignItems: 'center', backgroundColor: '#e8f1e5', borderRadius: 18, height: 36, justifyContent: 'center', width: 36},
  assistantBubble: {backgroundColor: '#ffffff', borderColor: '#e4eadf', borderWidth: 1},
  attachButton: {alignItems: 'center', backgroundColor: '#edf5ec', borderRadius: 15, height: 46, justifyContent: 'center', width: 46},
  attachButtonActive: {backgroundColor: '#5d8059'},
  bubble: {borderRadius: 16, maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 11},
  bubbleText: {color: '#384231', fontFamily: 'Prompt_400Regular', fontSize: 14, lineHeight: 21},
  chatContent: {gap: 12, paddingBottom: 14},
  chatStack: {gap: 10},
  circleButton: {alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, height: 34, justifyContent: 'center', width: 34},
  composer: {alignItems: 'flex-end', backgroundColor: 'rgba(255,255,255,.92)', borderColor: '#dfe7db', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 8},
  composerWrap: {gap: 8},
  confirmRow: {alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 12},
  detailBox: {backgroundColor: '#f7f9f4', borderRadius: 14, gap: 8, marginTop: 12, padding: 12},
  detailLabel: {color: '#7d8779', fontFamily: 'Prompt_500Medium', fontSize: 11, width: 72},
  detailRow: {alignItems: 'flex-start', flexDirection: 'row', gap: 8},
  detailValue: {color: '#33412e', flex: 1, fontFamily: 'Prompt_500Medium', fontSize: 12, lineHeight: 18},
  disabled: {opacity: .5},
  heroCard: {alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 12, minHeight: 128, overflow: 'hidden', padding: 16},
  heroCopy: {flex: 1, gap: 7},
  heroText: {color: 'rgba(38,50,31,.78)', fontFamily: 'Prompt_400Regular', fontSize: 11, lineHeight: 17},
  heroTitle: {color: '#26321f', fontFamily: 'Prompt_800ExtraBold', fontSize: 21, lineHeight: 25},
  input: {color: '#33412e', flex: 1, fontFamily: 'Prompt_400Regular', fontSize: 14, maxHeight: 110, minHeight: 42, paddingHorizontal: 8, paddingVertical: 9},
  messageRow: {alignItems: 'flex-start'},
  messageRowUser: {alignItems: 'flex-end'},
  miniBrand: {color: '#668d65', fontFamily: 'Prompt_700Bold', fontSize: 8, lineHeight: 10},
  pressed: {opacity: .7, transform: [{translateY: -1}]},
  quickAddCopy: {flex: 1, minWidth: 0},
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
  sendButton: {alignItems: 'center', backgroundColor: '#9ab49b', borderRadius: 15, height: 46, justifyContent: 'center', width: 46},
  shell: {flex: 1, gap: 10, paddingHorizontal: 18, paddingTop: 18},
  shortcutCard: {alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, flexDirection: 'row', gap: 9, minHeight: 70, padding: 12, width: '48.5%'},
  shortcutGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
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
  topBar: {alignItems: 'center', flexDirection: 'row', gap: 9},
  topTitle: {flex: 1},
  userBubble: {backgroundColor: '#789a75'},
  userBubbleText: {color: '#ffffff'},
  voiceButton: {alignItems: 'center', backgroundColor: '#edf5ec', borderRadius: 15, height: 46, justifyContent: 'center', width: 46},
  voiceButtonActive: {backgroundColor: '#5d8059'},
});
