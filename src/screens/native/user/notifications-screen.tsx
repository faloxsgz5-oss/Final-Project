/* eslint-disable react-hooks/set-state-in-effect */
import {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';

import {aiRecommendations, notifications} from '@/services/firestore';
import type {AiRecommendation, Notification, WithId} from '@/types/smartlife';
import {MaterialIcon, UserShell, type UserNavigate} from './user-ui';

type Page = 'smartlife_notifications' | 'smartlife_notifications_urgent' | 'smartlife_notifications_ai' | 'smartlife_notifications_finance' | 'smartlife_notifications_schedule';

type ViewModel = {
  ai: WithId<AiRecommendation>[];
  all: WithId<Notification>[];
  items: WithId<Notification>[];
};

const tabs: {label: string; page: Page}[] = [
  {label: 'ทั้งหมด', page: 'smartlife_notifications'},
  {label: 'ด่วน', page: 'smartlife_notifications_urgent'},
  {label: 'AI', page: 'smartlife_notifications_ai'},
  {label: 'การเงิน', page: 'smartlife_notifications_finance'},
  {label: 'ตารางเรียน', page: 'smartlife_notifications_schedule'},
];

const pageMeta: Record<Page, {eyebrow: string; title: string; heroSubtitle: string; sectionTitle: string; sideLabel: string}> = {
  smartlife_notifications: {
    eyebrow: 'SmartLife Alert',
    title: 'การแจ้งเตือน',
    heroSubtitle: 'AI เตือนเรื่องเรียนและชีวิตประจำวันที่ควรดูตอนนี้',
    sectionTitle: 'ตอนตอนนี้',
    sideLabel: 'ต้องจัดการก่อน',
  },
  smartlife_notifications_urgent: {
    eyebrow: 'Priority Alert',
    title: 'แจ้งเตือนด่วน',
    heroSubtitle: 'งานและคิวที่ต้องจัดการก่อนหายไปในวันนี้',
    sectionTitle: 'ด่วนตอนนี้',
    sideLabel: 'ต้องจัดการก่อน',
  },
  smartlife_notifications_ai: {
    eyebrow: 'AI Insight',
    title: 'AI แจ้งเตือน',
    heroSubtitle: 'ระบบวิเคราะห์พฤติกรรมและสุขภาพการเรียนของคุณ',
    sectionTitle: 'AI แจ้งเตือน',
    sideLabel: 'แนะนำจากพฤติกรรม',
  },
  smartlife_notifications_finance: {
    eyebrow: 'Money Alert',
    title: 'แจ้งเตือนการเงิน',
    heroSubtitle: 'ติดตามงบประมาณและรายจ่ายที่อาจเกินเงื่อนไข',
    sectionTitle: 'การเงิน',
    sideLabel: 'งบและรายจ่าย',
  },
  smartlife_notifications_schedule: {
    eyebrow: 'Schedule Alert',
    title: 'แจ้งเตือนตารางเรียน',
    heroSubtitle: 'รวมงานและคลาสที่ต้องเตรียมตัวในวันนี้',
    sectionTitle: 'ตารางเรียนวันนี้',
    sideLabel: 'ต้องเตรียมตัวก่อน',
  },
};

function kindForPage(page: Page): Notification['kind'] | undefined {
  if (page === 'smartlife_notifications_urgent') return 'urgent';
  if (page === 'smartlife_notifications_ai') return 'ai';
  if (page === 'smartlife_notifications_finance') return 'finance';
  if (page === 'smartlife_notifications_schedule') return 'schedule';
  return undefined;
}

function fmtTime(value?: unknown) {
  const date = value && typeof value === 'object' && 'toDate' in value && typeof (value as {toDate?: unknown}).toDate === 'function'
    ? (value as {toDate: () => Date}).toDate()
    : null;
  if (!date) return '';
  return new Intl.DateTimeFormat('th-TH', {hour: '2-digit', hour12: false, minute: '2-digit', timeZone: 'Asia/Bangkok'}).format(date);
}

function toneFor(kind: Notification['kind']) {
  if (kind === 'urgent') return {bg: '#fff1ef', fg: '#d9675f', icon: 'schedule'};
  if (kind === 'finance') return {bg: '#eef5ed', fg: '#6f8f6d', icon: 'account_balance_wallet'};
  if (kind === 'schedule') return {bg: '#edf6ea', fg: '#6f8f6d', icon: 'calendar_month'};
  if (kind === 'ai') return {bg: '#f2f3ff', fg: '#8d91c5', icon: 'auto_awesome'};
  return {bg: '#eef5ed', fg: '#6f8f6d', icon: 'notifications'};
}

function Header({onNavigate, meta}: {meta: typeof pageMeta[Page]; onNavigate: UserNavigate}) {
  return (
    <View style={styles.header}>
      <Pressable onPress={() => onNavigate('smartlife_ai_assistant')} style={styles.headerButton}>
        <MaterialIcon color="#26321f" name="chevron_left" size={22} />
      </Pressable>
      <View style={styles.headerTitle}>
        <Text style={styles.eyebrow}>{meta.eyebrow}</Text>
        <Text style={styles.title}>{meta.title}</Text>
      </View>
      <Pressable style={styles.headerButton}>
        <MaterialIcon color="#26321f" name="check" size={20} />
      </Pressable>
    </View>
  );
}

function pageCount(page: Page, model: ViewModel) {
  if (page === 'smartlife_notifications') return model.all.length + model.ai.length;
  if (page === 'smartlife_notifications_ai') return model.all.filter((item) => item.kind === 'ai').length + model.ai.length;
  const kind = kindForPage(page);
  return kind ? model.all.filter((item) => item.kind === kind).length : model.all.length;
}

function heroTitleFor(page: Page, count: number) {
  if (count === 0) {
    if (page === 'smartlife_notifications') return 'ยังไม่มีการแจ้งเตือน';
    if (page === 'smartlife_notifications_ai') return 'ยังไม่มีคำแนะนำจาก AI';
    if (page === 'smartlife_notifications_finance') return 'ยังไม่มีแจ้งเตือนการเงิน';
    if (page === 'smartlife_notifications_schedule') return 'ยังไม่มีแจ้งเตือนตารางเรียน';
    return 'ยังไม่มีรายการด่วน';
  }
  if (page === 'smartlife_notifications') return `มีเรื่องสำคัญ ${count} รายการ`;
  if (page === 'smartlife_notifications_ai') return `คำแนะนำจาก AI ${count} รายการ`;
  if (page === 'smartlife_notifications_finance') return `การเงินวันนี้ ${count} รายการ`;
  if (page === 'smartlife_notifications_schedule') return `ตารางเรียนวันนี้ ${count} รายการ`;
  return `รายการด่วน ${count} รายการ`;
}

function Hero({meta, model, page}: {meta: typeof pageMeta[Page]; model: ViewModel; page: Page}) {
  const urgent = model.all.filter((item) => item.kind === 'urgent').length;
  const ai = model.ai.length + model.all.filter((item) => item.kind === 'ai').length;
  const today = model.all.length + model.ai.length;
  const current = pageCount(page, model);
  return (
    <LinearGradient colors={['#6f966f', '#8fac94']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={{flex: 1}}>
          <Text style={styles.heroTitle}>{heroTitleFor(page, current)}</Text>
          <Text style={styles.heroSubtitle}>{meta.heroSubtitle}</Text>
        </View>
        <View style={styles.heroBell}><MaterialIcon color="#ffffff" name="notifications" size={24} /></View>
      </View>
      <View style={styles.metricGrid}>
        <Metric label="ด่วน" value={urgent} />
        <Metric label="AI" value={ai} />
        <Metric label="วันนี้" value={today} />
      </View>
    </LinearGradient>
  );
}

function Metric({label, value}: {label: string; value: number}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function Tabs({page, onNavigate}: {onNavigate: UserNavigate; page: Page}) {
  return (
    <View style={styles.tabs}>
      {tabs.map((tab) => {
        const active = tab.page === page;
        return (
          <Pressable key={tab.page} onPress={() => onNavigate(tab.page)} style={[styles.tab, active && styles.tabActive]}>
            <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function SectionHeader({meta}: {meta: typeof pageMeta[Page]}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{meta.sectionTitle}</Text>
      <Text style={styles.sectionSide}>{meta.sideLabel}</Text>
    </View>
  );
}

function NotificationCard({item, onPress}: {item: WithId<Notification>; onPress: () => void}) {
  const tone = toneFor(item.kind);
  const time = fmtTime(item.createdAt);
  return (
    <Pressable onPress={onPress} style={[styles.itemCard, {borderColor: item.kind === 'urgent' ? '#f2d7d2' : '#e7ece2'}]}>
      <View style={[styles.itemIcon, {backgroundColor: tone.bg}]}>
        <MaterialIcon color={tone.fg} name={tone.icon} size={18} />
      </View>
      <View style={{flex: 1}}>
        <Text numberOfLines={1} style={styles.itemTitle}>{item.title || 'การแจ้งเตือน SmartLife'}{time ? ` ${time}` : ''}</Text>
        <Text numberOfLines={2} style={styles.itemText}>{item.message || 'ไม่มีรายละเอียด'}</Text>
        <View style={styles.chips}>
          <Chip tone={item.kind === 'urgent' ? 'red' : 'green'}>{item.kind === 'urgent' ? 'ด่วน' : item.kind === 'finance' ? 'การเงิน' : item.kind === 'schedule' ? 'เรียน' : 'AI'}</Chip>
          {!item.read ? <Chip tone="green">ใหม่</Chip> : null}
        </View>
      </View>
    </Pressable>
  );
}

function AiCard({item}: {item: WithId<AiRecommendation>}) {
  return (
    <View style={styles.itemCard}>
      <View style={[styles.itemIcon, {backgroundColor: '#f2f3ff'}]}>
        <MaterialIcon color="#8d91c5" name="auto_awesome" size={18} />
      </View>
      <View style={{flex: 1}}>
        <Text numberOfLines={1} style={styles.itemTitle}>{item.title}</Text>
        <Text numberOfLines={2} style={styles.itemText}>{item.explanation}</Text>
        <View style={styles.chips}>
          <Chip tone="purple">AI</Chip>
          {item.contextSources.slice(0, 2).map((source) => <Chip key={source} tone="green">{source}</Chip>)}
        </View>
      </View>
    </View>
  );
}

function Chip({children, tone}: {children: string; tone: 'green' | 'purple' | 'red'}) {
  const style = tone === 'red' ? styles.chipRed : tone === 'purple' ? styles.chipPurple : styles.chipGreen;
  return <Text style={[styles.chip, style]}>{children}</Text>;
}

export default function NotificationsScreen({page, uid, onNavigate}: {page: Page; uid: string; onNavigate: UserNavigate}) {
  const [model, setModel] = useState<ViewModel | null>(null);
  const meta = pageMeta[page];

  const load = useCallback(async () => {
    const kind = kindForPage(page);
    const [all, items, ai] = await Promise.all([
      notifications.list(uid),
      notifications.list(uid, kind),
      page === 'smartlife_notifications_ai' || page === 'smartlife_notifications' ? aiRecommendations.list(uid) : Promise.resolve([]),
    ]);
    setModel({ai, all, items: kind ? items : all});
  }, [page, uid]);

  useEffect(() => {
    load().catch(() => setModel({ai: [], all: [], items: []}));
  }, [load]);

  const visibleAi = useMemo(() => model?.ai.slice(0, page === 'smartlife_notifications_ai' ? 4 : 2) ?? [], [model?.ai, page]);
  const visibleItems = useMemo(() => model?.items.slice(0, page === 'smartlife_notifications' ? 3 : 5) ?? [], [model?.items, page]);

  const markRead = async (id: string) => {
    await notifications.markRead(uid, id);
    setModel((current) => current ? {
      ai: current.ai,
      all: current.all.map((item) => item.id === id ? {...item, read: true} : item),
      items: current.items.map((item) => item.id === id ? {...item, read: true} : item),
    } : current);
  };

  return (
    <UserShell active="index" onNavigate={onNavigate}>
      <Header meta={meta} onNavigate={onNavigate} />
      {model === null ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#6f966f" size="large" />
          <Text style={styles.emptyText}>กำลังโหลดการแจ้งเตือน...</Text>
        </View>
      ) : (
        <>
          <Hero meta={meta} model={model} page={page} />
          <Tabs onNavigate={onNavigate} page={page} />
          <SectionHeader meta={meta} />
          <View style={styles.list}>
            {visibleItems.length ? visibleItems.map((item) => (
              <NotificationCard item={item} key={item.id} onPress={() => markRead(item.id)} />
            )) : null}
            {(page === 'smartlife_notifications_ai' || page === 'smartlife_notifications') && visibleAi.length ? visibleAi.map((item) => (
              <AiCard item={item} key={item.id} />
            )) : null}
            {!visibleItems.length && !visibleAi.length ? <Text style={styles.emptyText}>ไม่มีการแจ้งเตือนในหมวดนี้</Text> : null}
          </View>
        </>
      )}
    </UserShell>
  );
}

const styles = StyleSheet.create({
  chip: {borderRadius: 99, fontFamily: 'Prompt_600SemiBold', fontSize: 9, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3},
  chipGreen: {backgroundColor: '#edf4e9', color: '#66835f'},
  chipPurple: {backgroundColor: '#eef0ff', color: '#8d91c5'},
  chipRed: {backgroundColor: '#ffe8e5', color: '#d9675f'},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8},
  emptyText: {color: '#8b9487', fontFamily: 'Prompt_500Medium', fontSize: 12, textAlign: 'center'},
  eyebrow: {color: '#668d65', fontFamily: 'Prompt_800ExtraBold', fontSize: 10, lineHeight: 12},
  header: {alignItems: 'center', flexDirection: 'row', gap: 10},
  headerButton: {alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 14, height: 44, justifyContent: 'center', width: 44},
  headerTitle: {flex: 1},
  hero: {borderRadius: 18, gap: 12, marginTop: 12, padding: 16},
  heroBell: {alignItems: 'center', backgroundColor: 'rgba(255,255,255,.18)', borderRadius: 16, height: 52, justifyContent: 'center', width: 52},
  heroSubtitle: {color: 'rgba(255,255,255,.84)', fontFamily: 'Prompt_400Regular', fontSize: 11, lineHeight: 17, marginTop: 4},
  heroTitle: {color: '#ffffff', fontFamily: 'Prompt_800ExtraBold', fontSize: 18},
  heroTop: {alignItems: 'center', flexDirection: 'row', gap: 12},
  itemCard: {alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e7ece2', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 82, padding: 13},
  itemIcon: {alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44},
  itemText: {color: '#7d8778', fontFamily: 'Prompt_400Regular', fontSize: 10, lineHeight: 15, marginTop: 2},
  itemTitle: {color: '#26321f', fontFamily: 'Prompt_800ExtraBold', fontSize: 12},
  list: {gap: 10, marginTop: 10},
  loading: {alignItems: 'center', gap: 12, paddingVertical: 80},
  metric: {backgroundColor: 'rgba(255,255,255,.16)', borderRadius: 12, flex: 1, minHeight: 58, padding: 10},
  metricGrid: {flexDirection: 'row', gap: 9},
  metricLabel: {color: 'rgba(255,255,255,.8)', fontFamily: 'Prompt_600SemiBold', fontSize: 9},
  metricValue: {color: '#ffffff', fontFamily: 'Prompt_800ExtraBold', fontSize: 20, lineHeight: 25, marginTop: 4},
  sectionHeader: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8},
  sectionSide: {color: '#789071', fontFamily: 'Prompt_500Medium', fontSize: 10},
  sectionTitle: {color: '#26321f', fontFamily: 'Prompt_800ExtraBold', fontSize: 14},
  tab: {backgroundColor: '#ffffff', borderRadius: 99, paddingHorizontal: 13, paddingVertical: 8},
  tabActive: {backgroundColor: '#26321f'},
  tabText: {color: '#789071', fontFamily: 'Prompt_700Bold', fontSize: 10},
  tabTextActive: {color: '#ffffff'},
  tabs: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12},
  title: {color: '#26321f', fontFamily: 'Prompt_800ExtraBold', fontSize: 24, lineHeight: 30},
});
