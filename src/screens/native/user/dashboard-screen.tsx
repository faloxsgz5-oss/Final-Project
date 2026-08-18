/* eslint-disable react-hooks/set-state-in-effect */
import {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {ResponsiveSafeArea} from '@/components/layout/responsive-safe-area';
import AiActivityRecommendationCard from '@/components/ai-activity-recommendation-card';
import {LinearGradient} from 'expo-linear-gradient';
import {Timestamp} from 'firebase/firestore';

import {loadLegacyPageData, runLegacyDataAction} from '@/services/legacy-data';
import {activities as activitiesStore, notes as notesStore} from '@/services/firestore';
import {MaterialIcon, UserGradientBackdrop, UserTabBar} from './user-ui';

type Props = {onNavigate: (page: string) => void; uid: string};
type Item = Record<string, unknown>;

const colors = {pine: '#2c341b', sage: '#6f8f6d', sageDark: '#5f835f', sageSoft: '#dfe7dc', mist: '#f4f5ef', paper: '#ffffff', muted: '#8b9085', finance: '#9297bb', financeSoft: '#eceef7', note: '#bb9293', noteSoft: '#f3e8e8'};
const showDevTools = __DEV__ || process.env.EXPO_PUBLIC_SMARTLIFE_SHOW_DEV_TOOLS === 'true';
const importantWords = ['quiz', 'สอบ', 'ส่ง', 'deadline', 'ด่วน', 'ต้องทำ', 'ประชุม', 'นำเสนอ', 'รายงาน', 'โปรเจค', 'project', 'assignment', 'homework'];

function items(value: unknown) { return Array.isArray(value) ? value.filter((item): item is Item => Boolean(item) && typeof item === 'object') : []; }
function string(item: Item, key: string, fallback = '-') { const value = item[key]; return typeof value === 'string' && value.trim() ? value : fallback; }
function time(value: unknown) { const date = new Date(String(value ?? '')); return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('th-TH', {hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok'}).format(date); }
function money(value: number) { return `฿${value.toLocaleString('th-TH')}`; }
function millis(item: Item) { const date = new Date(String(item.startAt ?? item.dueAt ?? item.createdAt ?? '')); return Number.isNaN(date.getTime()) ? Number.POSITIVE_INFINITY : date.getTime(); }
function itemText(item: Item) { return `${string(item, 'title', '')} ${string(item, 'note', '')} ${string(item, 'details', '')} ${string(item, 'category', '')}`.toLowerCase(); }
function priorityScore(item: Item) {
  const text = itemText(item);
  const type = string(item, 'type', string(item, 'category', ''));
  let score = 0;
  if (/task|งาน|assignment|homework/i.test(type)) score += 40;
  if (/appointment|นัด|ประชุม/i.test(type)) score += 28;
  if (/activity|class|เรียน/i.test(type)) score += 18;
  if (/urgent|high|important|ด่วน|สูง|สำคัญ/i.test(string(item, 'priority', ''))) score += 24;
  importantWords.forEach((word) => { if (text.includes(word.toLowerCase())) score += 10; });
  const hoursUntil = (millis(item) - Date.now()) / 36e5;
  if (hoursUntil <= 0) score += 34;
  else if (hoursUntil <= 24) score += 30;
  else if (hoursUntil <= 72) score += 18;
  else if (hoursUntil <= 168) score += 8;
  return score;
}
function priorityReasons(item: Item) {
  const reasons: string[] = [];
  const text = itemText(item);
  const type = string(item, 'type', string(item, 'category', ''));
  const hoursUntil = (millis(item) - Date.now()) / 36e5;
  if (/task|งาน|assignment|homework/i.test(type)) reasons.push('เป็นงานที่ต้องทำ');
  if (/appointment|นัด|ประชุม/i.test(type)) reasons.push('เป็นนัดหมาย/ประชุม');
  if (/urgent|high|important|ด่วน|สูง|สำคัญ/i.test(string(item, 'priority', ''))) reasons.push('ตั้งความสำคัญไว้สูง');
  if (hoursUntil <= 0) reasons.push('เลยกำหนดหรือถึงเวลาแล้ว');
  else if (hoursUntil <= 24) reasons.push('กำหนดภายในวันนี้');
  else if (hoursUntil <= 72) reasons.push('ใกล้ deadline');
  const matched = importantWords.find((word) => text.includes(word.toLowerCase()));
  if (matched) reasons.push(`พบคำสำคัญ: ${matched}`);
  return reasons.slice(0, 3);
}

function SoftPress({children, onPress, style}: {children: React.ReactNode; onPress: () => void; style?: object}) {
  return <Pressable onPress={onPress} style={({pressed}) => [style, pressed && styles.pressed]}>{children}</Pressable>;
}

function StatCard({icon, value, label, tint = colors.sageSoft}: {icon: string; value: string | number; label: string; tint?: string}) {
  return <View style={styles.statCard}><View style={[styles.statIcon, {backgroundColor: tint}]}><MaterialIcon color={colors.sageDark} name={icon} size={18} /></View><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

export default function DashboardScreen({onNavigate, uid}: Props) {
  const [data, setData] = useState<Item | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [completingId, setCompletingId] = useState('');
  const load = useCallback(async () => setData(await loadLegacyPageData(uid, 'user/index') as Item), [uid]);
  useEffect(() => { load().catch(() => setData({})); }, [load]);
  const refresh = useCallback(async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }, [load]);
  const seedAiDynamicData = useCallback(async () => {
    setSeeding(true);
    try {
      const result = await runLegacyDataAction(uid, 'user/index', {action: 'seed-ai-dynamic-test-data'});
      await load();
      const summary = result && typeof result === 'object' ? Object.entries(result).map(([key, value]) => `${key}: ${value}`).join('\n') : '';
      Alert.alert('เพิ่มข้อมูลสำเร็จ', summary || 'เพิ่มข้อมูลทดสอบเรียบร้อยแล้ว');
    } catch (error) {
      Alert.alert('เพิ่มข้อมูลไม่สำเร็จ', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง');
    } finally {
      setSeeding(false);
    }
  }, [load, uid]);

  const profile = (data?.profile ?? {}) as Item;
  const schedules = useMemo(() => items(data?.schedules).sort((a, b) => new Date(String(a.startAt)).getTime() - new Date(String(b.startAt)).getTime()), [data]);
  const activities = useMemo(() => items(data?.activities), [data]);
  const notes = useMemo(() => items(data?.notes), [data]);
  const transactions = useMemo(() => items(data?.transactions), [data]);
  const notifications = useMemo(() => items(data?.notifications), [data]);
  const workNotes = notes.filter((item) => item.status !== 'completed' && /งาน|task|assignment|homework/i.test(string(item, 'category', '')));
  const pending = [
    ...activities.filter((item) => item.status !== 'completed').map((item): Item => ({...item, __entity: 'activity'})),
    ...workNotes.map((item): Item => ({...item, __entity: 'note'})),
  ];
  const expense = transactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const income = transactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const balance = Math.max(income - expense, 0);
  const unread = notifications.filter((item) => item.read !== true).length;
  const urgent = [...pending].sort((a, b) => priorityScore(b) - priorityScore(a) || millis(a) - millis(b)).slice(0, 2);
  const markComplete = useCallback(async (item: Item) => {
    const id = string(item, 'id', '');
    const entity = string(item, '__entity', 'activity');
    if (!id || completingId) return;
    setCompletingId(id);
    const key = entity === 'note' ? 'notes' : 'activities';
    setData((current) => current ? {...current, [key]: items(current[key]).map((entry) => string(entry, 'id', '') === id ? {...entry, completedAt: new Date().toISOString(), status: 'completed'} : entry)} : current);
    try {
      if (entity === 'note') await notesStore.update(uid, id, {completedAt: Timestamp.fromDate(new Date()), status: 'completed'});
      else await activitiesStore.update(uid, id, {status: 'completed'});
    } catch (error) {
      await load().catch(() => undefined);
      Alert.alert('อัปเดตงานไม่สำเร็จ', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง');
    } finally {
      setCompletingId('');
    }
  }, [completingId, load, uid]);

  return <ResponsiveSafeArea style={styles.safe}><View style={styles.screen}><UserGradientBackdrop />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.sage} />} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <SoftPress onPress={() => onNavigate('smartlife_profile')} style={styles.profileRow}><View style={styles.avatar}><View style={styles.avatarGlow} /><Text style={styles.avatarText}>{string(profile, 'displayName', 'SL').slice(0, 2).toUpperCase()}</Text></View><View><Text style={styles.hello}>สวัสดีตอนเช้า</Text><Text style={styles.name}>{string(profile, 'displayName', 'เพื่อน')}</Text></View></SoftPress>
        <SoftPress onPress={() => onNavigate('smartlife_notifications')} style={styles.bell}><MaterialIcon name="notifications" size={24} />{unread > 0 ? <View style={styles.unread}><Text style={styles.unreadText}>{Math.min(unread, 9)}</Text></View> : null}</SoftPress>
      </View>

      {!data ? <View style={styles.loading}><ActivityIndicator color={colors.sage} size="large" /><Text style={styles.muted}>กำลังโหลดข้อมูลจาก Firebase</Text></View> : <>
        <SoftPress onPress={() => onNavigate('smartlife_ai_assistant')} style={styles.aiCard}><LinearGradient colors={['#769674', '#8fa69a', '#a8b7aa']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={StyleSheet.absoluteFill} />
          <View style={styles.aiTop}><View style={styles.aiHeading}><MaterialIcon color="#fff" name="smart_toy" size={21} /><Text style={styles.aiTitle}>AI Assistant</Text></View><View style={styles.mic}><MaterialIcon name="mic" size={21} /></View></View>
          <View style={styles.prompt}><Text numberOfLines={1} style={styles.promptText}>“วันนี้ฉันมีเรียนกี่โมง?”</Text><MaterialIcon color="#fff" name="chevron_right" size={22} /></View>
          <View style={styles.quickAnswer}><Text style={styles.quickQuestion}>“เหลือเงินกินข้าวเท่าไหร่?”</Text><Text style={styles.quickValue}>ตอบทันที: {money(balance)}</Text></View>
        </SoftPress>
        <View style={{marginBottom: 15}}><AiActivityRecommendationCard onNavigate={onNavigate} uid={uid} /></View>

        {showDevTools && pending.length === 0 && transactions.length === 0 ? <Pressable disabled={seeding} onPress={seedAiDynamicData} style={({pressed}) => [styles.seedCard, pressed && styles.pressed, seeding && {opacity: .6}]}><View style={styles.seedIcon}><MaterialIcon color={colors.sageDark} name="database" size={20} /></View><View style={{flex: 1}}><Text style={styles.seedTitle}>เติมข้อมูลทดสอบ AI Dynamic</Text><Text style={styles.seedSub}>เพิ่มตาราง งาน โน้ต และการเงินเข้า Firebase ของบัญชีนี้</Text></View><Text style={styles.seedAction}>{seeding ? 'กำลังเพิ่ม...' : 'เพิ่มเลย'}</Text></Pressable> : null}

        <View style={[styles.priorityCard, {overflow: 'hidden'}]}><LinearGradient colors={['rgba(255,255,255,.98)', '#eef4ea']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={StyleSheet.absoluteFill} />
          <View style={styles.priorityHeader}><View style={styles.priorityTitleRow}><MaterialIcon color={colors.sageDark} name="auto_awesome" size={18} /><Text style={styles.priorityTitle}>AI จัดลำดับวันนี้</Text></View><View style={styles.dynamicBadge}><Text style={styles.dynamicText}>Dynamic</Text></View></View>
          <Text style={styles.priorityCaption}>ระบบดันสอบและงานด่วนขึ้นก่อนตามบริบทของวัน</Text>
          {urgent.length ? urgent.map((item, index) => <View key={string(item, 'id', String(index))} style={styles.priorityItem}><View style={[styles.rank, index === 1 && styles.rankSoft]}><Text style={styles.rankText}>{index + 1}</Text></View><View style={styles.priorityCopy}><Text numberOfLines={1} style={styles.priorityItemTitle}>{string(item, 'title')}</Text><Text style={styles.priorityItemSub}>{time(item.startAt)} · {string(item, 'type', 'งานสำคัญ')} · คะแนน {priorityScore(item)}</Text><View style={styles.reasonWrap}>{priorityReasons(item).map((reason) => <View key={reason} style={styles.reasonChip}><Text style={styles.reasonText}>{reason}</Text></View>)}</View></View><View style={styles.priorityActions}><View style={styles.urgency}><Text style={styles.urgencyText}>{index === 0 ? 'ด่วน' : 'สำคัญ'}</Text></View><Pressable accessibilityLabel={`ทำ ${string(item, 'title')} ให้เสร็จ`} disabled={Boolean(completingId)} onPress={() => void markComplete(item)} style={({pressed}) => [styles.doneButton, pressed && styles.pressed]}>{completingId === string(item, 'id', '') ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcon color="#fff" name="check" size={15} />}<Text style={styles.doneText}>เสร็จ</Text></Pressable></View></View>) : <View style={styles.priorityItem}><View style={styles.rank}><MaterialIcon color="#fff" name="check" size={15} /></View><View style={styles.priorityCopy}><Text style={styles.priorityItemTitle}>วันนี้ไม่มีงานด่วน</Text><Text style={styles.priorityItemSub}>AI จะอัปเดตเมื่อมีรายการใหม่</Text></View></View>}
          <View style={styles.collapsed}><MaterialIcon color="#7e8979" name="inventory_2" size={15} /><Text style={styles.collapsedText}>ข้อมูลรองถูกย่อไว้ชั่วคราว: งบอาหาร โน้ตทั่วไป และรายการไม่เร่งด่วน</Text></View>
        </View>

        <View style={styles.stats}><StatCard icon="calendar_today" label="คลาสเรียน" value={schedules.length} /><StatCard icon="task_alt" label="งานที่ต้องทำ" tint={colors.noteSoft} value={pending.length} /><StatCard icon="account_balance_wallet" label="งบวันนี้" tint={colors.financeSoft} value={money(balance)} /></View>

        <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>ตารางวันนี้</Text><SoftPress onPress={() => onNavigate('smartlife_calendar_day')}><Text style={styles.seeAll}>ดูทั้งหมด</Text></SoftPress></View>
        <View style={styles.scheduleCard}>{schedules.length ? schedules.slice(0, 3).map((item, index) => <View key={string(item, 'id', String(index))} style={[styles.classRow, index > 0 && styles.classBorder]}><View style={styles.timePill}><Text style={styles.classTime}>{time(item.startAt)}</Text></View><View style={[styles.courseLine, {backgroundColor: string(item, 'color', index % 2 ? colors.finance : colors.sage)}]} /><View style={styles.courseCopy}><Text style={styles.courseTitle}>{string(item, 'title')}</Text><View style={styles.roomRow}><MaterialIcon color="#899284" name="location_on" size={14} /><Text style={styles.roomText}>{string(item, 'location', string(item, 'courseCode'))}</Text></View></View></View>) : <View style={styles.empty}><MaterialIcon color="#a4ada0" name="event_available" size={30} /><Text style={styles.emptyText}>วันนี้ยังไม่มีคลาสเรียน</Text></View>}</View>

        <Text style={styles.sectionTitle}>โฟกัสวันนี้</Text>
        <View style={styles.focusGrid}>
          <SoftPress onPress={() => onNavigate('smartlife_add_task')} style={styles.focusCard}><View style={styles.panelHeading}><MaterialIcon color={colors.note} name="check_box" size={17} /><Text style={styles.panelTitle}>โฟกัสวันนี้</Text></View>{pending.length ? pending.slice(0, 2).map((item, index) => <View key={string(item, 'id', String(index))} style={styles.taskRow}><View style={styles.taskCheck}><MaterialIcon color="#fff" name="check" size={11} /></View><View style={{flex: 1}}><Text numberOfLines={1} style={styles.taskTitle}>{string(item, 'title')}</Text><Text style={styles.taskTime}>{time(item.startAt)}</Text></View></View>) : <Text style={styles.panelEmpty}>ยังไม่มีงานที่ต้องทำ</Text>}</SoftPress>
          <SoftPress onPress={() => onNavigate('smartlife_finance_day')} style={styles.focusCard}><View style={styles.panelHeading}><MaterialIcon color={colors.finance} name="account_balance_wallet" size={17} /><Text style={styles.panelTitle}>งบคงเหลือ</Text></View><View style={styles.budgetLine}><Text style={styles.budgetValue}>{money(balance)}</Text><Text style={styles.budgetUnit}>/ วันนี้</Text></View><View style={styles.progress}><View style={[styles.progressFill, {width: `${Math.min(balance / Math.max(income, 1) * 100, 100)}%`}]} /></View><View style={styles.tagWrap}>{transactions.filter((item) => item.type === 'expense').slice(0, 3).map((item, index) => <View key={string(item, 'id', String(index))} style={styles.tag}><Text numberOfLines={1} style={styles.tagText}>{string(item, 'category', 'ทั่วไป')} {money(Number(item.amount ?? 0))}</Text></View>)}</View></SoftPress>
        </View>

        {notes[0] ? <SoftPress onPress={() => onNavigate('smartlife_notes_study')} style={styles.noteLink}><View style={styles.noteIcon}><MaterialIcon color={colors.note} name="note_alt" size={20} /></View><View style={{flex: 1}}><Text style={styles.noteEyebrow}>โน้ตที่เชื่อมกับตารางวันนี้</Text><Text numberOfLines={1} style={styles.noteTitle}>{string(notes[0], 'title')}</Text></View><MaterialIcon color={colors.sageDark} name="chevron_right" size={23} /></SoftPress> : null}
      </>}
    </ScrollView>
    <UserTabBar active="index" onNavigate={onNavigate} />
  </View></ResponsiveSafeArea>;
}

const shadow = {shadowColor: colors.pine, shadowOffset: {height: 10, width: 0}, shadowOpacity: .08, shadowRadius: 22};
const font = {regular: 'Prompt_400Regular', medium: 'Prompt_500Medium', semibold: 'Prompt_600SemiBold', bold: 'Prompt_700Bold', extra: 'Prompt_800ExtraBold'};
const styles = StyleSheet.create({
  seedAction: {color: colors.sageDark, fontFamily: font.bold, fontSize: 10},
  seedCard: {...shadow, alignItems: 'center', backgroundColor: '#fff', borderColor: 'rgba(111,143,109,.18)', borderRadius: 17, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 15, padding: 13},
  seedIcon: {alignItems: 'center', backgroundColor: colors.sageSoft, borderRadius: 13, height: 40, justifyContent: 'center', width: 40},
  seedSub: {color: colors.muted, fontFamily: font.regular, fontSize: 9, marginTop: 1},
  seedTitle: {color: colors.pine, fontFamily: font.bold, fontSize: 12},
  aiCard: {...shadow, backgroundColor: '#88a188', borderRadius: 18, marginBottom: 15, minHeight: 142, overflow: 'hidden', padding: 16},
  aiHeading: {alignItems: 'center', flexDirection: 'row', gap: 10},
  aiTitle: {color: '#fff', fontFamily: font.bold, fontSize: 17},
  aiTop: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  avatar: {...shadow, alignItems: 'center', backgroundColor: '#834b51', borderColor: '#fff', borderRadius: 25, borderWidth: 2, height: 50, justifyContent: 'center', overflow: 'hidden', width: 50},
  avatarGlow: {backgroundColor: '#d8b3a5', borderRadius: 22, height: 32, opacity: .34, position: 'absolute', right: -8, top: -6, width: 32},
  avatarText: {color: '#fff', fontFamily: font.bold, fontSize: 15},
  bell: {...shadow, alignItems: 'center', backgroundColor: '#fff', borderRadius: 25, height: 50, justifyContent: 'center', width: 50},
  budgetLine: {alignItems: 'baseline', flexDirection: 'row', marginTop: 11},
  budgetUnit: {color: colors.muted, fontFamily: font.regular, fontSize: 10, marginLeft: 4},
  budgetValue: {color: colors.pine, fontFamily: font.extra, fontSize: 24},
  classBorder: {borderTopColor: 'rgba(44,52,27,.08)', borderTopWidth: 1},
  classRow: {alignItems: 'center', flexDirection: 'row', minHeight: 70, paddingHorizontal: 13},
  classTime: {color: colors.sageDark, fontFamily: font.bold, fontSize: 11},
  collapsed: {alignItems: 'center', backgroundColor: '#eef2e9', borderRadius: 11, flexDirection: 'row', gap: 8, marginTop: 10, paddingHorizontal: 11, paddingVertical: 9},
  collapsedText: {color: '#7b8476', flex: 1, fontFamily: font.regular, fontSize: 9, lineHeight: 14},
  content: {padding: 22, paddingBottom: 28},
  courseCopy: {flex: 1},
  courseLine: {borderRadius: 3, height: 38, marginHorizontal: 11, width: 4},
  courseTitle: {color: colors.pine, fontFamily: font.semibold, fontSize: 13},
  dynamicBadge: {backgroundColor: '#e8f0e4', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5},
  dynamicText: {color: colors.sageDark, fontFamily: font.semibold, fontSize: 8},
  doneButton: {alignItems: 'center', backgroundColor: colors.sageDark, borderRadius: 10, flexDirection: 'row', gap: 2, minHeight: 29, paddingHorizontal: 7},
  doneText: {color: '#fff', fontFamily: font.bold, fontSize: 7},
  empty: {alignItems: 'center', gap: 8, paddingVertical: 22},
  emptyText: {color: colors.muted, fontFamily: font.regular, fontSize: 11},
  focusCard: {...shadow, backgroundColor: '#fff', borderRadius: 17, flex: 1, minHeight: 154, padding: 13},
  focusGrid: {flexDirection: 'row', gap: 11, marginBottom: 15, marginTop: 11},
  hello: {color: '#8a9282', fontFamily: font.regular, fontSize: 12},
  loading: {alignItems: 'center', gap: 12, paddingVertical: 100},
  mic: {alignItems: 'center', backgroundColor: 'rgba(255,255,255,.95)', borderColor: 'rgba(255,255,255,.55)', borderRadius: 22, borderWidth: 5, height: 44, justifyContent: 'center', width: 44},
  muted: {color: colors.muted, fontFamily: font.regular, fontSize: 11},
  name: {color: colors.pine, fontFamily: font.extra, fontSize: 19, marginTop: -1},
  noteEyebrow: {color: colors.note, fontFamily: font.semibold, fontSize: 9},
  noteIcon: {alignItems: 'center', backgroundColor: colors.noteSoft, borderRadius: 12, height: 39, justifyContent: 'center', width: 39},
  noteLink: {...shadow, alignItems: 'center', backgroundColor: '#fff', borderRadius: 17, flexDirection: 'row', gap: 11, marginBottom: 4, padding: 13},
  noteTitle: {color: colors.pine, fontFamily: font.semibold, fontSize: 12, marginTop: 1},
  panelEmpty: {color: colors.muted, fontFamily: font.regular, fontSize: 10, marginTop: 16},
  panelHeading: {alignItems: 'center', flexDirection: 'row', gap: 6},
  panelTitle: {color: colors.pine, fontFamily: font.bold, fontSize: 11},
  pressed: {opacity: .85, transform: [{scale: .985}]},
  priorityCaption: {color: colors.muted, fontFamily: font.regular, fontSize: 9, marginBottom: 8, marginTop: 3},
  priorityCard: {...shadow, backgroundColor: '#fff', borderRadius: 18, marginBottom: 15, padding: 14},
  priorityCopy: {flex: 1},
  priorityHeader: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  priorityItem: {alignItems: 'center', backgroundColor: '#f6f8f3', borderColor: 'rgba(44,52,27,.06)', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 9, marginTop: 7, padding: 9},
  priorityActions: {alignItems: 'flex-end', gap: 6},
  priorityItemSub: {color: colors.muted, fontFamily: font.regular, fontSize: 9, marginTop: 1},
  priorityItemTitle: {color: colors.pine, fontFamily: font.semibold, fontSize: 11},
  priorityTitle: {color: colors.pine, fontFamily: font.bold, fontSize: 14},
  priorityTitleRow: {alignItems: 'center', flexDirection: 'row', gap: 7},
  progress: {backgroundColor: '#e6e6ec', borderRadius: 99, height: 6, marginTop: 9, overflow: 'hidden'},
  progressFill: {backgroundColor: colors.finance, borderRadius: 99, height: 6},
  profileRow: {alignItems: 'center', flexDirection: 'row', gap: 12},
  prompt: {alignItems: 'center', backgroundColor: 'rgba(72,105,72,.24)', borderColor: 'rgba(44,52,27,.08)', borderRadius: 14, borderWidth: 1, flexDirection: 'row', height: 41, justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 13},
  promptText: {color: '#fff', flex: 1, fontFamily: font.regular, fontSize: 12},
  quickAnswer: {alignItems: 'center', backgroundColor: 'rgba(255,255,255,.45)', borderRadius: 11, flexDirection: 'row', justifyContent: 'space-between', marginTop: 7, paddingHorizontal: 11, paddingVertical: 7},
  quickQuestion: {color: colors.pine, fontFamily: font.regular, fontSize: 9},
  quickValue: {color: colors.pine, fontFamily: font.bold, fontSize: 9},
  rank: {alignItems: 'center', backgroundColor: colors.pine, borderRadius: 9, height: 26, justifyContent: 'center', width: 26},
  rankSoft: {backgroundColor: colors.sage},
  rankText: {color: '#fff', fontFamily: font.bold, fontSize: 10},
  reasonChip: {backgroundColor: '#edf3ea', borderRadius: 99, paddingHorizontal: 7, paddingVertical: 3},
  reasonText: {color: colors.sageDark, fontFamily: font.semibold, fontSize: 7},
  reasonWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 5},
  roomRow: {alignItems: 'center', flexDirection: 'row', marginTop: 3},
  roomText: {color: '#899284', fontFamily: font.regular, fontSize: 9},
  safe: {backgroundColor: '#eef1e9', flex: 1},
  scheduleCard: {...shadow, backgroundColor: '#fff', borderRadius: 18, marginBottom: 16, overflow: 'hidden'},
  screen: {backgroundColor: colors.mist, flex: 1},
  sectionHeading: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10},
  sectionTitle: {color: colors.pine, fontFamily: font.bold, fontSize: 15},
  seeAll: {color: colors.sageDark, fontFamily: font.semibold, fontSize: 10},
  statCard: {...shadow, alignItems: 'center', backgroundColor: '#fff', borderRadius: 17, flex: 1, height: 101, justifyContent: 'center'},
  statIcon: {alignItems: 'center', borderRadius: 17, height: 34, justifyContent: 'center', width: 34},
  statLabel: {color: colors.muted, fontFamily: font.regular, fontSize: 9, marginTop: 1, textAlign: 'center'},
  statValue: {color: colors.pine, fontFamily: font.extra, fontSize: 19, marginTop: 4},
  stats: {flexDirection: 'row', gap: 10, marginBottom: 17},
  tag: {backgroundColor: colors.financeSoft, borderRadius: 99, maxWidth: '100%', paddingHorizontal: 7, paddingVertical: 3},
  tagText: {color: '#73799f', fontFamily: font.medium, fontSize: 7},
  tagWrap: {flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 9},
  taskCheck: {alignItems: 'center', backgroundColor: colors.note, borderRadius: 7, height: 20, justifyContent: 'center', width: 20},
  taskRow: {alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 11},
  taskTime: {color: colors.muted, fontFamily: font.regular, fontSize: 8},
  taskTitle: {color: colors.pine, fontFamily: font.semibold, fontSize: 9},
  timePill: {alignItems: 'center', backgroundColor: '#edf3ea', borderRadius: 10, minWidth: 48, paddingHorizontal: 7, paddingVertical: 6},
  topRow: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15},
  unread: {alignItems: 'center', backgroundColor: '#f35659', borderColor: '#fff', borderRadius: 8, borderWidth: 2, height: 16, justifyContent: 'center', minWidth: 16, position: 'absolute', right: 4, top: 4},
  unreadText: {color: '#fff', fontFamily: font.bold, fontSize: 7},
  urgency: {backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4},
  urgencyText: {color: colors.note, fontFamily: font.semibold, fontSize: 8},
});
