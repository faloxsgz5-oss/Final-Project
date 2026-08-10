/* eslint-disable react-hooks/set-state-in-effect */
import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {CalendarList, CalendarProvider, LocaleConfig, WeekCalendar, type DateData} from 'react-native-calendars';

import {ResponsiveSafeArea} from '@/components/layout/responsive-safe-area';
import GoogleCalendarSyncCard from '@/components/google-calendar-sync-card';
import {activities, deleteCourseSeries, schedules} from '@/services/firestore';
import {MaterialIcon, UserTabBar} from './user-ui';

type Page = 'smartlife_calendar_day' | 'smartlife_calendar_week' | 'smartlife_calendar_month';
type PlannerTab = 'calendar' | 'notes';
type ViewMode = 'day' | 'week' | 'month' | 'year';
type EventItem = Record<string, unknown> & {
  id?: string;
  title?: string;
  color?: string;
  entityType?: 'activity' | 'schedule';
  location?: string;
  courseCode?: string;
  seriesId?: string;
  type?: string;
};
type Props = {
  onNavigate: (page: string) => void;
  page: Page;
  planner?: {activeTab: PlannerTab; onTabChange: (tab: PlannerTab) => void};
  uid: string;
};

const C = {
  accent: '#ff3b30',
  accentSoft: '#fff0ef',
  background: '#f2f2f7',
  blue: '#007aff',
  card: '#ffffff',
  green: '#5f835f',
  label: '#111111',
  line: '#e5e5ea',
  secondary: '#6c6c70',
  tertiary: '#aeaeb2',
};
const F = {r: 'Prompt_400Regular', m: 'Prompt_500Medium', s: 'Prompt_600SemiBold', b: 'Prompt_700Bold', x: 'Prompt_800ExtraBold'};

LocaleConfig.locales.th = {
  monthNames: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
  monthNamesShort: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  dayNames: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'],
  dayNamesShort: ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'],
  today: 'วันนี้',
};
LocaleConfig.defaultLocale = 'th';

function pad(value: number) { return String(value).padStart(2, '0'); }
function toDate(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as {toDate?: unknown}).toDate === 'function') return (value as {toDate: () => Date}).toDate();
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}
function bangkokParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok'}).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute')};
}
function todayKey() { const part = bangkokParts(new Date()); return `${part.year}-${part.month}-${part.day}`; }
function dateKey(value: unknown) { const part = bangkokParts(toDate(value)); return `${part.year}-${part.month}-${part.day}`; }
function formatTime(value: unknown) { return new Intl.DateTimeFormat('th-TH', {hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok'}).format(toDate(value)); }
function formatLongDate(value: string) { return new Intl.DateTimeFormat('th-TH', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok'}).format(new Date(`${value}T12:00:00+07:00`)); }
function formatMonth(value: string) { return new Intl.DateTimeFormat('th-TH', {month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok'}).format(new Date(`${value}T12:00:00+07:00`)); }
function shortDay(value: string) { return new Intl.DateTimeFormat('th-TH', {weekday: 'short', timeZone: 'Asia/Bangkok'}).format(new Date(`${value}T12:00:00+07:00`)); }
function eventTitle(item: EventItem) { return typeof item.title === 'string' && item.title.trim() ? item.title : 'กิจกรรม'; }
function textEvent(value: unknown, fallback: string) { return typeof value === 'string' && value.trim() ? value : fallback; }
function offsetDate(value: string, amount: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
function shift(value: string, mode: ViewMode, direction: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (mode === 'year') date.setUTCFullYear(date.getUTCFullYear() + direction);
  else if (mode === 'month') date.setUTCMonth(date.getUTCMonth() + direction);
  else date.setUTCDate(date.getUTCDate() + (mode === 'week' ? 7 : 1) * direction);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
function rangeFor(value: string, mode: ViewMode) {
  const [year, month, day] = value.split('-').map(Number);
  if (mode === 'year') return {from: new Date(Date.UTC(year, 0, 1) - 7 * 3600000), to: new Date(Date.UTC(year + 1, 0, 1) - 7 * 3600000)};
  if (mode === 'month') return {from: new Date(Date.UTC(year, month - 1, 1) - 7 * 3600000), to: new Date(Date.UTC(year, month, 1) - 7 * 3600000)};
  if (mode === 'day') {
    const from = new Date(Date.UTC(year, month - 1, day) - 7 * 3600000);
    return {from, to: new Date(from.getTime() + 86400000)};
  }
  const base = new Date(Date.UTC(year, month - 1, day, 12));
  const weekday = base.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const monday = new Date(Date.UTC(year, month - 1, day + mondayOffset) - 7 * 3600000);
  return {from: monday, to: new Date(monday.getTime() + 7 * 86400000)};
}
function miniMonthDays(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1, 12));
  const leading = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  return [...Array(leading).fill(null), ...Array.from({length: count}, (_, index) => `${year}-${pad(month + 1)}-${pad(index + 1)}`)];
}

export default function CalendarScreen({onNavigate, page, planner, uid}: Props) {
  const {width} = useWindowDimensions();
  const calendarWidth = Math.min(Math.max(width - 32, 310), 680);
  const [today] = useState(todayKey);
  const [mode, setMode] = useState<ViewMode>(page === 'smartlife_calendar_month' ? 'month' : page === 'smartlife_calendar_week' ? 'week' : 'day');
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleDate, setVisibleDate] = useState(today);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {from, to} = rangeFor(visibleDate, mode);
      const [classItems, activityItems] = await Promise.all([schedules.between(uid, from, to), activities.between(uid, from, to)]);
      setEvents([
        ...classItems.map((item) => ({...item, entityType: 'schedule' as const})),
        ...activityItems.map((item) => ({...item, entityType: 'activity' as const})),
      ].sort((a, b) => toDate(a.startAt).getTime() - toDate(b.startAt).getTime()));
    } finally {
      setLoading(false);
    }
  }, [mode, uid, visibleDate]);

  useEffect(() => { load().catch(() => { setEvents([]); setLoading(false); }); }, [load]);
  const refresh = useCallback(async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }, [load]);
  const grouped = useMemo(() => events.reduce<Record<string, EventItem[]>>((result, item) => {
    const key = dateKey(item.startAt);
    (result[key] ??= []).push(item);
    return result;
  }, {}), [events]);
  const selectedEvents = grouped[selectedDate] ?? [];
  const dayStrip = useMemo(() => [-3, -2, -1, 0, 1, 2, 3].map((offset) => offsetDate(selectedDate, offset)), [selectedDate]);
  const yearMonths = useMemo(() => {
    const year = Number(visibleDate.slice(0, 4));
    return Array.from({length: 12}, (_, month) => ({month, days: miniMonthDays(year, month)}));
  }, [visibleDate]);

  const openDay = (value: string, showDetails = false) => {
    setSelectedDate(value);
    setVisibleDate(value);
    if (showDetails) setDetailsOpen(true);
  };
  const navigate = (direction: number) => {
    const next = shift(visibleDate, mode, direction);
    setVisibleDate(next);
    setSelectedDate(next);
  };
  const goToday = () => { setSelectedDate(today); setVisibleDate(today); };

  const deleteEvent = useCallback((event: EventItem) => {
    if (!event.id || !event.entityType) return;
    if (event.entityType === 'schedule') {
      const courseCode = typeof event.courseCode === 'string' && event.courseCode.trim() ? event.courseCode.replace(/\s+/g, '').toUpperCase() : eventTitle(event);
      const seriesId = typeof event.seriesId === 'string' && event.seriesId.trim() ? event.seriesId : undefined;
      Alert.alert('ลบวิชานี้ทั้งหมดหรือไม่?', `ตารางทั้งหมดของ ${courseCode} จะถูกลบออก`, [
        {text: 'ยกเลิก', style: 'cancel'},
        {text: 'ลบทั้งหมด', style: 'destructive', onPress: () => {
          setEvents((current) => current.filter((item) => seriesId ? item.seriesId !== seriesId : item.courseCode?.replace(/\s+/g, '').toUpperCase() !== courseCode));
          deleteCourseSeries(uid, courseCode, seriesId).catch(() => { load().catch(() => undefined); Alert.alert('ลบไม่สำเร็จ', 'กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); });
        }},
      ]);
      return;
    }
    Alert.alert('ลบกิจกรรมนี้หรือไม่?', eventTitle(event), [
      {text: 'ยกเลิก', style: 'cancel'},
      {text: 'ลบ', style: 'destructive', onPress: () => {
        setEvents((current) => current.filter((item) => item.id !== event.id));
        activities.remove(uid, event.id as string).catch(() => { load().catch(() => undefined); Alert.alert('ลบไม่สำเร็จ', 'กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); });
      }},
    ]);
  }, [load, uid]);

  const DayCell = ({date, state}: {date?: DateData; state?: string}) => {
    if (!date) return null;
    const key = date.dateString;
    const selected = key === selectedDate;
    const isToday = key === today;
    const dayEvents = grouped[key] ?? [];
    return (
      <Pressable accessibilityLabel={`${formatLongDate(key)} มี ${dayEvents.length} รายการ`} accessibilityRole="button" accessibilityState={{selected}} onPress={() => openDay(key)} style={({pressed}) => [styles.dayCell, pressed && styles.pressed]}>
        <View style={[styles.dayCircle, isToday && styles.todayCircle, selected && !isToday && styles.selectedCircle]}>
          <Text style={[styles.dayNumber, state === 'disabled' && styles.disabledDay, isToday && styles.todayNumber, selected && !isToday && styles.selectedNumber]}>{date.day}</Text>
        </View>
        <View style={styles.dots}>{dayEvents.slice(0, 3).map((event, index) => <View key={`${String(event.id)}-${index}`} style={[styles.dot, {backgroundColor: typeof event.color === 'string' ? event.color : index % 2 ? C.blue : C.green}]} />)}</View>
      </Pressable>
    );
  };

  const calendarTheme = {
    calendarBackground: 'transparent',
    backgroundColor: 'transparent',
    monthTextColor: C.label,
    textMonthFontFamily: F.b,
    textMonthFontSize: 0,
    textSectionTitleColor: C.secondary,
    textDayHeaderFontFamily: F.s,
    textDayHeaderFontSize: 10,
    arrowColor: C.accent,
  };

  const renderCalendarBody = () => {
    if (mode === 'month') return (
      <CalendarList
        calendarHeight={340}
        calendarWidth={calendarWidth}
        current={visibleDate}
        dayComponent={DayCell}
        firstDay={1}
        futureScrollRange={24}
        horizontal
        key={`month-${visibleDate.slice(0, 7)}`}
        onVisibleMonthsChange={(months) => { if (months[0]?.dateString) setVisibleDate(months[0].dateString); }}
        pagingEnabled
        pastScrollRange={24}
        showScrollIndicator={false}
        staticHeader
        theme={calendarTheme}
      />
    );
    if (mode === 'week') return (
      <CalendarProvider date={visibleDate} onDateChanged={(value) => openDay(value)}>
        <WeekCalendar allowShadow={false} calendarWidth={calendarWidth} current={visibleDate} dayComponent={DayCell} firstDay={1} markedDates={{}} theme={calendarTheme} />
      </CalendarProvider>
    );
    if (mode === 'year') return (
      <View style={styles.yearGrid}>{yearMonths.map(({month, days}) => (
        <Pressable key={month} onPress={() => { const next = `${visibleDate.slice(0, 4)}-${pad(month + 1)}-01`; setSelectedDate(next); setVisibleDate(next); setMode('month'); }} style={styles.miniMonth}>
          <Text style={styles.miniMonthTitle}>{LocaleConfig.locales.th.monthNames[month]}</Text>
          <View style={styles.miniDays}>{days.map((key, index) => key ? (
            <View key={key} style={[styles.miniDay, key === today && styles.miniToday]}><Text style={[styles.miniDayText, key === today && styles.miniTodayText]}>{Number(key.slice(-2))}</Text>{grouped[key]?.length ? <View style={styles.miniDot} /> : null}</View>
          ) : <View key={`empty-${month}-${index}`} style={styles.miniDay} />)}</View>
        </Pressable>
      ))}</View>
    );
    return (
      <View style={styles.dayView}>
        <View style={styles.dayStrip}>{dayStrip.map((key) => {
          const active = key === selectedDate;
          const isToday = key === today;
          return (
            <Pressable key={key} onPress={() => openDay(key)} style={({pressed}) => [styles.dayStripItem, pressed && styles.pressed]}>
              <Text style={[styles.dayStripName, isToday && styles.redText]}>{shortDay(key)}</Text>
              <View style={[styles.dayStripCircle, active && styles.dayStripActive, isToday && styles.todayCircle]}><Text style={[styles.dayStripNumber, active && styles.dayStripNumberActive, isToday && styles.todayNumber]}>{Number(key.slice(-2))}</Text></View>
              {grouped[key]?.length ? <View style={[styles.dayStripDot, active && styles.dayStripDotActive]} /> : null}
            </Pressable>
          );
        })}</View>
        <AgendaList events={selectedEvents} onOpen={() => setDetailsOpen(true)} />
      </View>
    );
  };

  const periodTitle = mode === 'year' ? `พ.ศ. ${Number(visibleDate.slice(0, 4)) + 543}` : mode === 'month' ? formatMonth(visibleDate) : formatLongDate(visibleDate);

  return (
    <ResponsiveSafeArea style={styles.safe}>
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.accent} />} showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable onPress={goToday}><Text style={styles.todayLink}>วันนี้</Text></Pressable>
            <View style={styles.topActions}>
              <Pressable accessibilityLabel="นำเข้าตารางเรียน" onPress={() => onNavigate('smartlife_scan_schedule')} style={styles.circleButton}><MaterialIcon color={C.accent} name="document_scanner" size={20} /></Pressable>
              <Pressable accessibilityLabel="เพิ่มกิจกรรม" onPress={() => onNavigate('smartlife_add_activity')} style={styles.circleButton}><MaterialIcon color={C.accent} name="add" size={24} /></Pressable>
            </View>
          </View>
          <Text style={styles.largeTitle}>ปฏิทิน</Text>

          {planner ? <View style={styles.plannerTabs}><Pressable onPress={() => planner.onTabChange('calendar')} style={[styles.plannerTab, planner.activeTab === 'calendar' && styles.plannerTabActive]}><Text style={[styles.plannerTabText, planner.activeTab === 'calendar' && styles.plannerTabTextActive]}>ปฏิทิน</Text></Pressable><Pressable onPress={() => planner.onTabChange('notes')} style={[styles.plannerTab, planner.activeTab === 'notes' && styles.plannerTabActive]}><Text style={[styles.plannerTabText, planner.activeTab === 'notes' && styles.plannerTabTextActive]}>โน้ต</Text></Pressable></View> : null}

          <GoogleCalendarSyncCard onSynced={load} uid={uid} />

          <View accessibilityRole="tablist" style={styles.segment}>{(['day', 'week', 'month', 'year'] as ViewMode[]).map((item) => (
            <Pressable accessibilityRole="tab" accessibilityState={{selected: mode === item}} key={item} onPress={() => { setMode(item); setVisibleDate(selectedDate); }} style={[styles.segmentItem, mode === item && styles.segmentActive]}>
              <Text style={[styles.segmentText, mode === item && styles.segmentTextActive]}>{item === 'day' ? 'วัน' : item === 'week' ? 'สัปดาห์' : item === 'month' ? 'เดือน' : 'ปี'}</Text>
            </Pressable>
          ))}</View>

          <View style={styles.periodHeader}>
            <Pressable accessibilityLabel="ช่วงก่อนหน้า" onPress={() => navigate(-1)} style={styles.chevron}><MaterialIcon color={C.accent} name="chevron_left" size={26} /></Pressable>
            <Text numberOfLines={1} style={styles.periodTitle}>{periodTitle}</Text>
            <Pressable accessibilityLabel="ช่วงถัดไป" onPress={() => navigate(1)} style={styles.chevron}><MaterialIcon color={C.accent} name="chevron_right" size={26} /></Pressable>
          </View>

          <View style={styles.calendarCard}>
            {renderCalendarBody()}
            {loading ? <View style={styles.calendarLoading}><ActivityIndicator color={C.accent} /><Text style={styles.loadingText}>กำลังโหลดปฏิทิน…</Text></View> : null}
          </View>

          {mode !== 'day' ? <View style={styles.agendaSection}><View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>{selectedDate === today ? 'วันนี้' : formatLongDate(selectedDate)}</Text><Text style={styles.sectionSub}>{selectedEvents.length ? `${selectedEvents.length} รายการ` : 'ไม่มีกิจกรรม'}</Text></View><Pressable onPress={() => setDetailsOpen(true)}><Text style={styles.seeAll}>ดูทั้งหมด</Text></Pressable></View><AgendaList events={selectedEvents} onOpen={() => setDetailsOpen(true)} /></View> : null}
        </ScrollView>

        <UserTabBar active={planner ? 'smartlife_planner' : 'smartlife_calendar_day'} onNavigate={onNavigate} />

        <Modal animationType="slide" onRequestClose={() => setDetailsOpen(false)} transparent visible={detailsOpen}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <View style={styles.handle} />
              <View style={styles.sheetHead}><View><Text style={styles.sheetTitle}>{formatLongDate(selectedDate)}</Text><Text style={styles.sheetSub}>{selectedEvents.length} รายการ</Text></View><Pressable onPress={() => setDetailsOpen(false)} style={styles.close}><MaterialIcon color={C.secondary} name="close" size={20} /></Pressable></View>
              <ScrollView style={styles.sheetScroll}>{selectedEvents.length ? selectedEvents.map((event, index) => <EventRow event={event} key={String(event.id ?? index)} onDelete={() => deleteEvent(event)} />) : <EmptyAgenda />}</ScrollView>
              <Pressable onPress={() => { setDetailsOpen(false); onNavigate('smartlife_add_activity'); }} style={styles.sheetAdd}><MaterialIcon color="#fff" name="add" size={20} /><Text style={styles.sheetAddText}>เพิ่มกิจกรรม</Text></Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </ResponsiveSafeArea>
  );
}

function AgendaList({events, onOpen}: {events: EventItem[]; onOpen: () => void}) {
  if (!events.length) return <EmptyAgenda />;
  return <View style={styles.eventList}>{events.map((event, index) => <EventRow event={event} key={String(event.id ?? index)} onPress={onOpen} />)}</View>;
}

function EventRow({event, onDelete, onPress}: {event: EventItem; onDelete?: () => void; onPress?: () => void}) {
  const color = typeof event.color === 'string' ? event.color : event.entityType === 'schedule' ? C.green : C.blue;
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({pressed}) => [styles.eventRow, pressed && styles.pressed]}>
      <View style={[styles.eventColor, {backgroundColor: color}]} />
      <View style={styles.eventTime}><Text style={styles.eventStart}>{formatTime(event.startAt)}</Text><Text style={styles.eventEnd}>{formatTime(event.endAt)}</Text></View>
      <View style={styles.eventCopy}><Text numberOfLines={1} style={styles.eventTitle}>{eventTitle(event)}</Text><Text numberOfLines={1} style={styles.eventMeta}>{textEvent(event.location, textEvent(event.courseCode, textEvent(event.type, 'กิจกรรม')))}</Text></View>
      {onDelete ? <Pressable accessibilityLabel={`ลบ ${eventTitle(event)}`} onPress={onDelete} style={styles.deleteButton}><MaterialIcon color={C.accent} name="delete_outline" size={20} /></Pressable> : <MaterialIcon color={C.tertiary} name="chevron_right" size={20} />}
    </Pressable>
  );
}

function EmptyAgenda() {
  return <View style={styles.empty}><View style={styles.emptyIcon}><MaterialIcon color={C.tertiary} name="event_available" size={28} /></View><Text style={styles.emptyTitle}>ไม่มีกิจกรรม</Text><Text style={styles.emptySub}>เวลาว่างของคุณจะแสดงอยู่ตรงนี้</Text></View>;
}

const styles = StyleSheet.create({
  safe: {backgroundColor: C.background, flex: 1},
  screen: {backgroundColor: C.background, flex: 1},
  content: {alignSelf: 'center', gap: 12, maxWidth: 720, paddingBottom: 28, paddingHorizontal: 16, paddingTop: 8, width: '100%'},
  topBar: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  todayLink: {color: C.accent, fontFamily: F.s, fontSize: 14},
  topActions: {flexDirection: 'row', gap: 8},
  circleButton: {alignItems: 'center', backgroundColor: C.card, borderRadius: 18, height: 36, justifyContent: 'center', width: 36},
  largeTitle: {color: C.label, fontFamily: F.x, fontSize: 31, letterSpacing: -.5, lineHeight: 39},
  plannerTabs: {backgroundColor: '#e3e3e8', borderRadius: 9, flexDirection: 'row', padding: 2},
  plannerTab: {alignItems: 'center', borderRadius: 7, flex: 1, paddingVertical: 7},
  plannerTabActive: {backgroundColor: C.card, boxShadow: '0 1px 3px rgba(0,0,0,.16)'},
  plannerTabText: {color: C.secondary, fontFamily: F.m, fontSize: 11},
  plannerTabTextActive: {color: C.label, fontFamily: F.s},
  segment: {backgroundColor: '#e3e3e8', borderRadius: 9, flexDirection: 'row', padding: 2},
  segmentItem: {alignItems: 'center', borderRadius: 7, flex: 1, justifyContent: 'center', minHeight: 32},
  segmentActive: {backgroundColor: C.card, boxShadow: '0 1px 3px rgba(0,0,0,.18)'},
  segmentText: {color: C.secondary, fontFamily: F.m, fontSize: 10},
  segmentTextActive: {color: C.label, fontFamily: F.s},
  periodHeader: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  periodTitle: {color: C.label, flex: 1, fontFamily: F.b, fontSize: 17, textAlign: 'center'},
  chevron: {alignItems: 'center', height: 36, justifyContent: 'center', width: 40},
  calendarCard: {backgroundColor: C.card, borderRadius: 18, minHeight: 120, overflow: 'hidden'},
  calendarLoading: {alignItems: 'center', backgroundColor: 'rgba(255,255,255,.86)', gap: 8, justifyContent: 'center', ...StyleSheet.absoluteFill},
  loadingText: {color: C.secondary, fontFamily: F.r, fontSize: 10},
  dayCell: {alignItems: 'center', height: 43, justifyContent: 'flex-start', width: 38},
  dayCircle: {alignItems: 'center', borderRadius: 15, height: 30, justifyContent: 'center', width: 30},
  todayCircle: {backgroundColor: C.accent},
  selectedCircle: {backgroundColor: '#e5e5ea'},
  dayNumber: {color: C.label, fontFamily: F.m, fontSize: 11},
  todayNumber: {color: '#fff', fontFamily: F.b},
  selectedNumber: {color: C.label, fontFamily: F.b},
  disabledDay: {color: C.tertiary},
  dots: {flexDirection: 'row', gap: 2, marginTop: 3},
  dot: {borderRadius: 2, height: 4, width: 4},
  dayView: {paddingTop: 4},
  dayStrip: {borderBottomColor: C.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 8},
  dayStripItem: {alignItems: 'center', flex: 1, minHeight: 62},
  dayStripName: {color: C.secondary, fontFamily: F.m, fontSize: 8},
  redText: {color: C.accent},
  dayStripCircle: {alignItems: 'center', borderRadius: 16, height: 32, justifyContent: 'center', marginTop: 3, width: 32},
  dayStripActive: {backgroundColor: '#e5e5ea'},
  dayStripNumber: {color: C.label, fontFamily: F.s, fontSize: 13},
  dayStripNumberActive: {fontFamily: F.b},
  dayStripDot: {backgroundColor: C.blue, borderRadius: 2, height: 4, marginTop: 3, width: 4},
  dayStripDotActive: {backgroundColor: C.accent},
  yearGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', padding: 12},
  miniMonth: {paddingVertical: 5, width: '47%'},
  miniMonthTitle: {color: C.accent, fontFamily: F.b, fontSize: 11, marginBottom: 6},
  miniDays: {flexDirection: 'row', flexWrap: 'wrap'},
  miniDay: {alignItems: 'center', height: 21, justifyContent: 'center', position: 'relative', width: '14.285%'},
  miniDayText: {color: C.label, fontFamily: F.m, fontSize: 7},
  miniToday: {backgroundColor: C.accent, borderRadius: 10},
  miniTodayText: {color: '#fff', fontFamily: F.b},
  miniDot: {backgroundColor: C.blue, borderRadius: 2, bottom: 1, height: 3, position: 'absolute', width: 3},
  agendaSection: {gap: 8},
  sectionHeader: {alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2},
  sectionTitle: {color: C.label, fontFamily: F.b, fontSize: 15},
  sectionSub: {color: C.secondary, fontFamily: F.r, fontSize: 9, marginTop: 1},
  seeAll: {color: C.accent, fontFamily: F.s, fontSize: 10},
  eventList: {backgroundColor: C.card, borderRadius: 16, overflow: 'hidden'},
  eventRow: {alignItems: 'center', borderBottomColor: C.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 70, paddingHorizontal: 12, paddingVertical: 10},
  eventColor: {alignSelf: 'stretch', borderRadius: 2, marginRight: 10, width: 4},
  eventTime: {alignItems: 'flex-end', marginRight: 12, width: 48},
  eventStart: {color: C.label, fontFamily: F.s, fontSize: 10},
  eventEnd: {color: C.secondary, fontFamily: F.r, fontSize: 8, marginTop: 2},
  eventCopy: {flex: 1},
  eventTitle: {color: C.label, fontFamily: F.s, fontSize: 11},
  eventMeta: {color: C.secondary, fontFamily: F.r, fontSize: 9, marginTop: 3},
  empty: {alignItems: 'center', backgroundColor: C.card, gap: 4, justifyContent: 'center', minHeight: 150, padding: 22},
  emptyIcon: {alignItems: 'center', backgroundColor: C.background, borderRadius: 24, height: 48, justifyContent: 'center', width: 48},
  emptyTitle: {color: C.label, fontFamily: F.s, fontSize: 11, marginTop: 4},
  emptySub: {color: C.secondary, fontFamily: F.r, fontSize: 9},
  overlay: {backgroundColor: 'rgba(0,0,0,.25)', flex: 1, justifyContent: 'flex-end'},
  sheet: {backgroundColor: C.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '78%', minHeight: 340, padding: 16},
  handle: {alignSelf: 'center', backgroundColor: '#c7c7cc', borderRadius: 3, height: 5, marginBottom: 16, width: 36},
  sheetHead: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12},
  sheetTitle: {color: C.label, fontFamily: F.b, fontSize: 16},
  sheetSub: {color: C.secondary, fontFamily: F.r, fontSize: 9, marginTop: 2},
  close: {alignItems: 'center', backgroundColor: '#e5e5ea', borderRadius: 17, height: 34, justifyContent: 'center', width: 34},
  sheetScroll: {marginBottom: 12},
  deleteButton: {alignItems: 'center', height: 36, justifyContent: 'center', width: 36},
  sheetAdd: {alignItems: 'center', backgroundColor: C.accent, borderRadius: 14, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 48},
  sheetAddText: {color: '#fff', fontFamily: F.b, fontSize: 11},
  pressed: {opacity: .62},
});
