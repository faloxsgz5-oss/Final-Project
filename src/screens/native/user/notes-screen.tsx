/* eslint-disable react-hooks/set-state-in-effect */
import {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {ResponsiveSafeArea} from '@/components/layout/responsive-safe-area';

import {loadLegacyPageData} from '@/services/legacy-data';
import {MaterialIcon, UserGradientBackdrop, UserTabBar} from './user-ui';

type Page = 'smartlife_notes' | 'smartlife_notes_study' | 'smartlife_notes_work' | 'smartlife_notes_ideas';
type Props = {onNavigate: (page: string) => void; page: Page; planner?: {activeTab: 'calendar' | 'notes'; onTabChange: (tab: 'calendar' | 'notes') => void}; uid: string};
type Item = Record<string, unknown>;

const C = {ink: '#29351f', mist: '#f4f6f1', muted: '#89928a', pink: '#c49497', pinkSoft: '#f5e8e9', sage: '#628660', sageSoft: '#e1ebdf', yellow: '#d3a957', yellowSoft: '#faf1d9'};
const F = {r: 'Prompt_400Regular', m: 'Prompt_500Medium', s: 'Prompt_600SemiBold', b: 'Prompt_700Bold', x: 'Prompt_800ExtraBold'};
const tabs: {icon: string; label: string; page: Page; value: 'all' | 'study' | 'work' | 'idea'}[] = [
  {icon: 'grid_view', label: 'ทั้งหมด', page: 'smartlife_notes', value: 'all'},
  {icon: 'menu_book', label: 'เรียน', page: 'smartlife_notes_study', value: 'study'},
  {icon: 'work', label: 'งาน', page: 'smartlife_notes_work', value: 'work'},
  {icon: 'lightbulb', label: 'ไอเดีย', page: 'smartlife_notes_ideas', value: 'idea'},
];

function list(value: unknown) { return Array.isArray(value) ? value.filter((item): item is Item => Boolean(item) && typeof item === 'object') : []; }
function str(item: Item, key: string, fallback = '-') { const value = item[key]; return typeof value === 'string' && value.trim() ? value : fallback; }
function date(value: unknown) { const result = new Date(String(value ?? '')); return Number.isNaN(result.getTime()) ? 'วันนี้' : new Intl.DateTimeFormat('th-TH', {day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok'}).format(result); }
function categoryOf(item: Item, fallback: 'all' | 'study' | 'work' | 'idea') { const category = str(item, 'category', fallback); return category === 'study' || category === 'work' || category === 'idea' || category === 'personal' ? category : fallback; }

export default function NotesScreen({onNavigate, page, planner, uid}: Props) {
  const [data, setData] = useState<{notes?: Item[]} | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const active = tabs.find((tab) => tab.page === page) ?? tabs[0];
  const load = useCallback(async () => setData(await loadLegacyPageData(uid, `user/${page}`) as {notes?: Item[]}), [page, uid]);
  useEffect(() => { load().catch(() => setData({})); }, [load]);
  const refresh = useCallback(async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }, [load]);
  const notes = useMemo(() => list(data?.notes), [data]);
  const focusNotes = notes.slice(0, 2);
  const completeCount = notes.filter((note) => Boolean(str(note, 'content', ''))).length;
  const importantCount = notes.filter((note) => str(note, 'priority', '').toLowerCase() === 'high' || str(note, 'pinned', '').toLowerCase() === 'true').length;

  return <ResponsiveSafeArea style={styles.safe}><View style={styles.screen}><UserGradientBackdrop />
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.sage} />} showsVerticalScrollIndicator={false}>
      {/* Refactored UI: compact notes dashboard with category-aware counts and list. */}
      <View style={styles.header}><View><Text style={styles.eyebrow}>บันทึกของฉัน</Text><Text style={styles.title}>โน้ต</Text></View><Pressable accessibilityLabel="เพิ่มโน้ต" onPress={() => onNavigate('smartlife_add_note')} style={styles.add}><MaterialIcon color={C.ink} name="add" size={26} /></Pressable></View>
      <View style={styles.focusCard}><View style={styles.focusAccent} /><Text style={styles.focusTitle}>โฟกัสวันนี้</Text>{focusNotes.length ? focusNotes.map((note, index) => <View key={str(note, 'id', String(index))} style={styles.focusRow}><View style={styles.focusCheck}><MaterialIcon color="#fff" name="check" size={14} /></View><View style={{flex: 1}}><Text numberOfLines={1} style={styles.focusNoteTitle}>{str(note, 'title')}</Text><Text numberOfLines={1} style={styles.focusNoteSub}>{str(note, 'content', 'เตรียมอ่านและทบทวนเนื้อหา')}</Text></View></View>) : <><View style={styles.focusRow}><View style={styles.focusCheck}><MaterialIcon color="#fff" name="check" size={14} /></View><View><Text style={styles.focusNoteTitle}>สรุปบทที่ 4</Text><Text style={styles.focusNoteSub}>วันนี้ 17:00</Text></View></View><View style={styles.focusRow}><View style={styles.focusCheck}><MaterialIcon color="#fff" name="check" size={14} /></View><View><Text style={styles.focusNoteTitle}>อ่านก่อนควิซ DS</Text><Text style={styles.focusNoteSub}>เหลือ 35 นาที</Text></View></View></>}</View>
      {planner ? <View accessibilityRole="tablist" style={styles.plannerTabs}><Pressable accessibilityRole="tab" onPress={() => planner.onTabChange('calendar')} style={styles.plannerTab}><Text style={styles.plannerTabText}>📅 Schedule</Text></Pressable><Pressable accessibilityRole="tab" onPress={() => planner.onTabChange('notes')} style={[styles.plannerTab, styles.plannerTabActive]}><Text style={[styles.plannerTabText, styles.plannerTabTextActive]}>📝 Notes</Text></Pressable></View> : null}
      <View style={styles.tabs}>{tabs.map((tab) => <Pressable key={tab.page} onPress={() => onNavigate(tab.page)} style={[styles.tab, active.page === tab.page && styles.tabActive]}><Text style={[styles.tabText, active.page === tab.page && styles.tabTextActive]}>{tab.label}</Text></Pressable>)}</View>
      <View style={styles.metrics}><Metric label={active.value === 'all' ? 'โน้ตทั้งหมด' : `โน้ต${active.label}`} value={notes.length} /><Metric color={C.pink} label={active.value === 'work' ? 'ด่วน' : 'ต้องอ่าน'} value={completeCount} /><Metric label="ปักหมุด" value={importantCount} /></View>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>{active.value === 'all' ? 'โน้ตล่าสุด' : `โน้ต${active.label}`}</Text><Pressable onPress={() => onNavigate('smartlife_notes')}><Text style={styles.allLink}>ดูทั้งหมด</Text></Pressable></View>
      {!data ? <View style={styles.loading}><ActivityIndicator color={C.sage} size="large" /><Text style={styles.loadingText}>กำลังโหลดโน้ตจาก Firebase</Text></View> : <View style={styles.noteList}>{notes.length ? notes.map((note, index) => <NoteRow category={categoryOf(note, active.value)} item={note} key={str(note, 'id', String(index))} />) : <View style={styles.empty}><MaterialIcon color="#9aa59a" name="note_add" size={34} /><Text style={styles.emptyText}>ยังไม่มีโน้ตในหมวดนี้</Text></View>}</View>}
    </ScrollView><UserTabBar active={planner ? 'smartlife_planner' : 'smartlife_notes'} onNavigate={onNavigate} />
  </View></ResponsiveSafeArea>;
}

function Metric({label, value, color = C.ink}: {color?: string; label: string; value: number}) { return <View style={styles.metric}><Text style={[styles.metricValue, {color}]}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>; }
function NoteRow({category, item}: {category: 'study' | 'work' | 'idea' | 'personal' | 'all'; item: Item}) { const theme = category === 'work' ? {bg: C.pinkSoft, color: C.pink, icon: 'push_pin', label: 'งาน'} : category === 'idea' ? {bg: C.yellowSoft, color: C.yellow, icon: 'lightbulb', label: 'ไอเดีย'} : category === 'personal' ? {bg: '#eceeea', color: '#7d877b', icon: 'person_outline', label: 'ส่วนตัว'} : {bg: C.sageSoft, color: C.sage, icon: 'description', label: 'เรียน'}; return <Pressable style={({pressed}) => [styles.noteRow, pressed && styles.pressed]}><View style={[styles.noteIcon, {backgroundColor: theme.bg}]}><MaterialIcon color={theme.color} name={theme.icon} size={19} /></View><View style={{flex: 1}}><Text numberOfLines={1} style={styles.noteTitle}>{str(item, 'title')}</Text><Text numberOfLines={1} style={styles.noteSub}>{str(item, 'content', `อัปเดต ${date(item.updatedAt ?? item.createdAt)}`)}</Text></View><View style={styles.noteTag}><Text style={styles.noteTagText}>{theme.label}</Text></View></Pressable>; }

const styles = StyleSheet.create({
  add: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 19, boxShadow: '0 7px 17px rgba(43,57,38,.08)', height: 48, justifyContent: 'center', width: 48}, allLink: {color: C.pink, fontFamily: F.b, fontSize: 10}, content: {padding: 20, paddingBottom: 28}, empty: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, gap: 7, paddingVertical: 30}, emptyText: {color: C.muted, fontFamily: F.r, fontSize: 11}, eyebrow: {color: C.sage, fontFamily: F.b, fontSize: 10}, focusAccent: {backgroundColor: '#f2e8e9', borderBottomLeftRadius: 80, height: 70, position: 'absolute', right: 0, top: 0, width: 66}, focusCard: {backgroundColor: '#fff', borderRadius: 21, marginTop: 12, overflow: 'hidden', padding: 15}, focusCheck: {alignItems: 'center', backgroundColor: C.pink, borderRadius: 9, height: 21, justifyContent: 'center', width: 21}, focusNoteSub: {color: C.muted, fontFamily: F.r, fontSize: 8, marginTop: 1}, focusNoteTitle: {color: C.ink, fontFamily: F.b, fontSize: 11}, focusRow: {alignItems: 'center', flexDirection: 'row', gap: 9, marginTop: 8}, focusTitle: {color: C.ink, fontFamily: F.x, fontSize: 15}, header: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'}, loading: {alignItems: 'center', gap: 9, paddingVertical: 45}, loadingText: {color: C.muted, fontFamily: F.r, fontSize: 10}, metric: {backgroundColor: '#fff', borderRadius: 17, flex: 1, minHeight: 72, padding: 12}, metricLabel: {color: C.muted, fontFamily: F.s, fontSize: 8, marginTop: 3}, metricValue: {fontFamily: F.x, fontSize: 18}, metrics: {flexDirection: 'row', gap: 9, marginTop: 13}, noteIcon: {alignItems: 'center', borderRadius: 13, height: 39, justifyContent: 'center', width: 39}, noteList: {gap: 9}, noteRow: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, flexDirection: 'row', gap: 10, minHeight: 62, padding: 11}, noteSub: {color: C.muted, fontFamily: F.r, fontSize: 8, marginTop: 2}, noteTag: {backgroundColor: '#f0f3ed', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 5}, noteTagText: {color: '#829082', fontFamily: F.b, fontSize: 7}, noteTitle: {color: C.ink, fontFamily: F.b, fontSize: 11}, plannerTab: {alignItems: 'center', borderRadius: 12, flex: 1, paddingVertical: 9}, plannerTabActive: {backgroundColor: '#fff'}, plannerTabText: {color: C.muted, fontFamily: F.s, fontSize: 10}, plannerTabTextActive: {color: C.sage}, plannerTabs: {backgroundColor: '#e5ece1', borderRadius: 16, flexDirection: 'row', marginTop: 13, padding: 4}, pressed: {opacity: .8, transform: [{scale: .985}]}, safe: {backgroundColor: C.mist, flex: 1}, screen: {backgroundColor: C.mist, flex: 1}, sectionHead: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, marginTop: 16}, sectionTitle: {color: C.ink, fontFamily: F.x, fontSize: 14}, tab: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 8}, tabActive: {backgroundColor: C.ink}, tabText: {color: C.muted, fontFamily: F.b, fontSize: 9}, tabTextActive: {color: '#fff'}, tabs: {flexDirection: 'row', gap: 7, marginTop: 13}, title: {color: C.ink, fontFamily: F.x, fontSize: 24},
});
