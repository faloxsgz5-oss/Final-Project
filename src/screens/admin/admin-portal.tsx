/* eslint-disable react-hooks/set-state-in-effect */
import {useCallback, useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {ResponsiveSafeArea} from '@/components/layout/responsive-safe-area';
import {runLegacyDataAction, loadLegacyPageData} from '@/services/legacy-data';
import {MaterialIcon} from '@/screens/native/user/user-ui';

type Props = {onNavigate: (page: string) => void; onLogout: () => Promise<void>; page: string; uid: string};
type Data = Record<string, unknown>;
const C = {pine: '#213713', pine2: '#36552a', sage: '#6f966f', sageSoft: '#e7efe3', mist: '#f1f4ed', paper: '#fff', muted: '#7f897a', purple: '#9297bb', purpleSoft: '#eceef7', red: '#c96761', redSoft: '#f8e5e2', amber: '#c4943d', amberSoft: '#faf3e0'};
const F = {r: 'Prompt_400Regular', m: 'Prompt_500Medium', s: 'Prompt_600SemiBold', b: 'Prompt_700Bold', x: 'Prompt_800ExtraBold'};
const pageInfo: Record<string, [string, string, string]> = {
  admin_dashboard: ['Dashboard ภาพรวมระบบ', 'ติดตามการใช้งานและสถานะบริการของ SmartLife', 'dashboard'],
  admin_users: ['จัดการผู้ใช้', 'บัญชีผู้ใช้จาก Firebase Authentication', 'group'],
  admin_categories: ['จัดการหมวดหมู่', 'หมวดของโน้ต การเงิน และกิจกรรม', 'category'],
  admin_ai_knowledge: ['AI Knowledge Monitor', 'ข้อมูลที่ AI ใช้ประกอบคำแนะนำ', 'auto_awesome'],
  admin_ocr_logs: ['OCR / Import Log', 'ประวัติการสแกนจาก Cloud Storage', 'document_scanner'],
  admin_announcements: ['ประกาศ', 'ประกาศที่ส่งผ่าน Firebase', 'campaign'],
  admin_feedback: ['Feedback Center', 'ความคิดเห็นจากผู้ใช้จริง', 'forum'],
  admin_system_health: ['System Health', 'สถานะบริการจากระบบจริง', 'monitor_heart'],
  admin_more: ['เมนูผู้ดูแล', 'เครื่องมือจัดการ SmartLife', 'apps'],
};

function items(value: unknown) { return Array.isArray(value) ? value.filter((item): item is Data => Boolean(item) && typeof item === 'object') : []; }
function strings(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function text(value: unknown, fallback = '-') { return typeof value === 'string' && value.trim() ? value : fallback; }
function number(value: unknown) { return Number(value ?? 0).toLocaleString('th-TH'); }
function date(value: unknown) { const parsed = new Date(String(value ?? '')); return Number.isNaN(parsed.getTime()) ? '-' : new Intl.DateTimeFormat('th-TH', {dateStyle: 'medium', timeZone: 'Asia/Bangkok'}).format(parsed); }

function AdminCard({children, style}: {children: React.ReactNode; style?: object}) { return <LinearGradient colors={['rgba(255,255,255,.99)', '#f8faf6']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={[styles.card, style]}>{children}</LinearGradient>; }
function Empty({label}: {label: string}) { return <View style={styles.empty}><MaterialIcon color="#a0aaa0" name="inbox" size={30} /><Text style={styles.emptyText}>{label}</Text></View>; }
function Row({icon = 'circle', title, detail, tone = 'green', side, children}: {icon?: string; title: string; detail: string; tone?: 'green' | 'purple' | 'rose' | 'red' | 'amber'; side?: string; children?: React.ReactNode}) {
  const color = tone === 'red' ? C.red : tone === 'purple' ? '#6572b1' : tone === 'rose' ? '#b98080' : tone === 'amber' ? C.amber : C.sage;
  const backgroundColor = tone === 'purple' ? '#E8EAF3' : tone === 'rose' ? '#F3E8E8' : tone === 'red' ? C.redSoft : tone === 'amber' ? C.amberSoft : '#f5f8f2';
  return (
    <View style={[styles.row, {backgroundColor}]}>
      <View style={[styles.rowIcon, {backgroundColor: `${color}18`}]}><MaterialIcon color={color} name={icon} size={19} /></View>
      <View style={{flex: 1}}>
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6}}>
          <Text numberOfLines={1} style={[styles.rowTitle, {flexShrink: 1}]}>{title}</Text>
          {side ? <Text style={[styles.rowSide, {color}]}>{side}</Text> : null}
        </View>
        <Text numberOfLines={2} style={styles.rowDetail}>{detail}</Text>
        {children}
      </View>
    </View>
  );
}

function SummaryAction({icon, label, value, accent = 'green', onPress}: {icon: string; label: string; value: unknown; accent?: 'green' | 'purple' | 'rose'; onPress?: () => void}) {
  const purple = accent === 'purple';
  const rose = accent === 'rose';
  const colors = purple ? ['#eef0fb', '#e7ebf8'] as const : rose ? ['#F3E8E8', '#F3E8E8'] as const : ['#eff6ed', '#e6f0e3'] as const;
  const iconColor = purple ? '#6572b1' : rose ? '#b98080' : '#5a8d5d';
  const iconSoft = purple ? '#d8ddf1' : rose ? '#ead4d4' : '#dcebd9';
  return <Pressable disabled={!onPress} onPress={onPress} style={({pressed}) => pressed && styles.pressed}><LinearGradient colors={colors} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={styles.summaryAction}>
    <View style={[styles.summaryIcon, {backgroundColor: iconSoft}]}><MaterialIcon color={iconColor} name={icon} size={22} /></View>
    <View style={styles.summaryCopy}><Text style={styles.summaryLabel}>{label}</Text><Text style={[styles.summaryValue, {color: purple ? '#465382' : rose ? '#8b5d5d' : C.pine}]}>{number(value)}</Text><Text style={styles.summaryHint}>ข้อมูลจาก Firebase</Text></View>
    <MaterialIcon color={purple ? '#465382' : rose ? '#8b5d5d' : C.pine} name="chevron_right" size={23} />
  </LinearGradient></Pressable>;
}

function AdminTabs({active, onNavigate}: {active: string; onNavigate: (page: string) => void}) {
  const tabs = [['dashboard', 'Dashboard', 'admin_dashboard'], ['group', 'ผู้ใช้', 'admin_users'], ['apps', '', 'admin_more'], ['auto_awesome', 'AI', 'admin_ai_knowledge'], ['monitor_heart', 'ระบบ', 'admin_system_health']];
  const morePages = ['admin_categories', 'admin_ocr_logs', 'admin_announcements', 'admin_feedback', 'admin_more'];
  return <LinearGradient colors={['rgba(255,255,255,.99)', '#f6f8f3']} style={styles.tabs}>{tabs.map(([icon, label, target], index) => { const selected = active === target || (target === 'admin_more' && morePages.includes(active)); return <Pressable key={target} onPress={() => onNavigate(target)} style={({pressed}) => [styles.tab, pressed && styles.pressed]}>{index === 2 ? <LinearGradient colors={selected ? ['#60875d', '#31572d'] : ['#789a75', '#4d7049']} style={styles.centerTab}><MaterialIcon color="#fff" name="apps" size={28} /></LinearGradient> : <><MaterialIcon color={selected ? C.pine2 : '#9ea69b'} name={icon} size={20} /><Text style={[styles.tabText, selected && styles.tabTextActive]}>{label}</Text></>}</Pressable>; })}</LinearGradient>;
}

function Pill({label, selected, onPress, color}: {label: string; selected: boolean; onPress: () => void; color?: string}) {
  return (
    <Pressable onPress={onPress} style={({pressed}) => [styles.pill, selected && styles.pillActive, color && selected ? {backgroundColor: color} : null, pressed && styles.pressed]}>
      <Text style={[styles.pillText, selected && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SmallButton({icon, label, tone, onPress, loading}: {icon: string; label: string; tone: 'green' | 'red' | 'purple' | 'amber'; onPress: () => void; loading?: boolean}) {
  const color = tone === 'red' ? C.red : tone === 'purple' ? '#6572b1' : tone === 'amber' ? C.amber : C.sage;
  const bg = tone === 'red' ? C.redSoft : tone === 'purple' ? '#E8EAF3' : tone === 'amber' ? C.amberSoft : '#f5f8f2';
  return (
    <Pressable disabled={loading} onPress={onPress} style={({pressed}) => [styles.smallBtn, {backgroundColor: bg}, pressed && styles.pressed]}>
      {loading ? <ActivityIndicator color={color} size="small" /> : <MaterialIcon color={color} name={icon} size={14} />}
      <Text style={[styles.smallBtnText, {color}]}>{loading ? '...' : label}</Text>
    </Pressable>
  );
}

function KindBadge({kind, mapping}: {kind: string; mapping: Record<string, [string, string]>}) {
  const mapped = mapping[kind];
  if (!mapped) return null;
  const [label, colorStr] = mapped;
  let color = C.sage;
  let bg = '#f5f8f2';
  if (colorStr === 'purple') { color = '#6572b1'; bg = '#E8EAF3'; }
  else if (colorStr === 'red' || colorStr === 'rose') { color = C.red; bg = C.redSoft; }
  else if (colorStr === 'amber') { color = C.amber; bg = C.amberSoft; }
  else if (colorStr === 'muted') { color = C.muted; bg = C.mist; }

  return (
    <View style={[styles.kindBadge, {backgroundColor: bg}]}>
      <Text style={[styles.kindBadgeText, {color}]}>{label}</Text>
    </View>
  );
}

export default function AdminPortal({onNavigate, onLogout, page, uid}: Props) {
  const [loaded, setLoaded] = useState<{data: Data; key: string} | null>(null); const [refreshing, setRefreshing] = useState(false); const key = `admin/${page}`;

  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [announcementKind, setAnnouncementKind] = useState('update');
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);

  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [catDomain, setCatDomain] = useState('expense');
  const [catLabelTh, setCatLabelTh] = useState('');
  const [catLabelEn, setCatLabelEn] = useState('');
  const [catIcon, setCatIcon] = useState('tag');
  const [catColor, setCatColor] = useState('#6F8F6D');
  const [catSortOrder, setCatSortOrder] = useState('100');
  const [catLoading, setCatLoading] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const data = useMemo(() => loaded?.key === key ? loaded.data : {}, [key, loaded]); const loading = loaded?.key !== key; const info = pageInfo[page] ?? pageInfo.admin_dashboard;
  const load = useCallback(async () => setLoaded({data: await loadLegacyPageData(uid, key) as Data, key}), [key, uid]);
  useEffect(() => { load().catch(() => setLoaded({data: {}, key})); }, [key, load]);
  const refresh = useCallback(async () => { setRefreshing(true); try { await load(); } finally { setRefreshing(false); } }, [load]);
  const logout = useCallback(() => Alert.alert('ออกจากระบบ Admin', 'ต้องการกลับไปหน้าเข้าสู่ระบบใช่ไหม?', [{text: 'ยกเลิก', style: 'cancel'}, {text: 'ออกจากระบบ', style: 'destructive', onPress: () => onLogout().catch(() => Alert.alert('ออกจากระบบไม่สำเร็จ'))}]), [onLogout]);

  const handleAction = useCallback(async (id: string, actionName: string, payload: Record<string, unknown>, successMsg: string) => {
    setActionLoading(id);
    try {
      await runLegacyDataAction(uid, key, {action: actionName, payload});
      await load();
      if (successMsg) Alert.alert('สำเร็จ', successMsg);
    } catch (error) {
      Alert.alert('ข้อผิดพลาด', error instanceof Error ? error.message : 'กรุณาลองอีกครั้ง');
    } finally {
      setActionLoading(null);
    }
  }, [key, load, uid]);

  const publishAnnouncement = useCallback(async () => {
    const title = announcementTitle.trim();
    const message = announcementMessage.trim();
    if (!title || !message) { Alert.alert('กรอกข้อมูลไม่ครบ', 'กรุณาระบุหัวข้อและรายละเอียดประกาศ'); return; }
    setPublishing(true);
    try {
      if (editingAnnouncementId) {
        await runLegacyDataAction(uid, key, {action: 'update-announcement', payload: {id: editingAnnouncementId, title, message, kind: announcementKind}});
        Alert.alert('อัปเดตประกาศแล้ว', 'การแก้ไขถูกบันทึกเรียบร้อย');
      } else {
        await runLegacyDataAction(uid, key, {action: 'create-announcement', payload: {title, message, kind: announcementKind}});
        Alert.alert('สร้างประกาศแล้ว', 'ประกาศถูกบันทึกใน Firebase และพร้อมแสดงแก่ผู้ใช้');
      }
      setAnnouncementTitle('');
      setAnnouncementMessage('');
      setAnnouncementKind('update');
      setEditingAnnouncementId(null);
      await load();
    } catch (error) {
      Alert.alert(editingAnnouncementId ? 'อัปเดตประกาศไม่สำเร็จ' : 'สร้างประกาศไม่สำเร็จ', error instanceof Error ? error.message : 'กรุณาลองอีกครั้ง');
    } finally {
      setPublishing(false);
    }
  }, [announcementMessage, announcementTitle, announcementKind, editingAnnouncementId, key, load, uid]);

  const saveCategory = useCallback(async () => {
    if (!catLabelTh || !catLabelEn || !catIcon || !catColor) {
      Alert.alert('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    setCatLoading(true);
    try {
      if (editingCategoryId) {
        await runLegacyDataAction(uid, key, {action: 'update-category', payload: {id: editingCategoryId, domain: catDomain, labelTh: catLabelTh, labelEn: catLabelEn, icon: catIcon, color: catColor, sortOrder: Number(catSortOrder)}});
        Alert.alert('สำเร็จ', 'อัปเดตหมวดหมู่เรียบร้อย');
      } else {
        await runLegacyDataAction(uid, key, {action: 'create-category', payload: {domain: catDomain, labelTh: catLabelTh, labelEn: catLabelEn, icon: catIcon, color: catColor, sortOrder: Number(catSortOrder)}});
        Alert.alert('สำเร็จ', 'สร้างหมวดหมู่ใหม่เรียบร้อย');
      }
      setShowCategoryForm(false);
      setEditingCategoryId(null);
      setCatLabelTh('');
      setCatLabelEn('');
      setCatIcon('tag');
      setCatColor('#6F8F6D');
      setCatSortOrder('100');
      await load();
    } catch (error) {
      Alert.alert('ไม่สำเร็จ', error instanceof Error ? error.message : 'กรุณาลองอีกครั้ง');
    } finally {
      setCatLoading(false);
    }
  }, [catDomain, catLabelTh, catLabelEn, catIcon, catColor, catSortOrder, editingCategoryId, key, load, uid]);

  const resetCategoryForm = useCallback(() => {
    setEditingCategoryId(null);
    setCatDomain('expense');
    setCatLabelTh('');
    setCatLabelEn('');
    setCatIcon('tag');
    setCatColor('#6F8F6D');
    setCatSortOrder('100');
    setShowCategoryForm(!showCategoryForm);
  }, [showCategoryForm]);

  const body = useMemo(() => {
    if (page === 'admin_dashboard') {
      const counts = (data.counts ?? {}) as Data;
      const status = items(data.systemStatus);
      const scans = items(data.scanLogs);
      return (
        <>
          <View style={styles.summaryList}>
            <SummaryAction icon="group" label="ผู้ใช้ทั้งหมด" onPress={() => onNavigate('admin_users')} value={counts.users} />
            <SummaryAction icon="calendar_month" label="ตารางเรียน" onPress={() => onNavigate('admin_ocr_logs')} value={counts.schedules} />
            <SummaryAction accent="rose" icon="note_alt" label="โน้ตที่บันทึก" onPress={() => onNavigate('admin_categories')} value={counts.notes} />
            <SummaryAction accent="purple" icon="account_balance_wallet" label="รายการการเงิน" onPress={() => onNavigate('admin_ocr_logs')} value={counts.transactions} />
            <SummaryAction icon="auto_awesome" label="การใช้งาน AI" onPress={() => onNavigate('admin_ai_knowledge')} value={counts.aiRecommendations} />
            <SummaryAction accent="purple" icon="document_scanner" label="ประวัติการสแกน" onPress={() => onNavigate('admin_ocr_logs')} value={counts.scans} />
          </View>
          <Pressable onPress={() => onNavigate('admin_system_health')} style={({pressed}) => pressed && styles.pressed}>
            <AdminCard>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>System Health</Text>
                <Text style={styles.sectionMeta}>ตรวจสอบล่าสุด</Text>
              </View>
              {status.length ? status.slice(0, 4).map((item) => {
                const s = text(item.status);
                const ic = s === 'operational' ? 'check_circle' : s === 'degraded' ? 'warning' : 'error';
                const tone = s === 'operational' ? 'green' : s === 'degraded' ? 'amber' : 'red';
                const sideText = s === 'operational' ? 'พร้อม' : s === 'degraded' ? 'ลดลง' : 'ขัดข้อง';
                return <Row detail={`${text(item.detail)} · ${number(item.latencyMs)} ms`} icon={ic} key={text(item.id, text(item.name))} side={sideText} title={text(item.name)} tone={tone} />;
              }) : <Empty label="ยังไม่มีสถานะบริการ" />}
            </AdminCard>
          </Pressable>
          <Pressable onPress={() => onNavigate('admin_ocr_logs')} style={({pressed}) => pressed && styles.pressed}>
            <AdminCard>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionTitle}>กิจกรรมล่าสุด</Text>
                <Text style={styles.sectionMeta}>{scans.length} รายการ</Text>
              </View>
              {scans.length ? scans.slice(0, 4).map((item) => <Row detail={`${text(item.extractedText)} · ${date(item.createdAt)}`} icon={item.kind === 'receipt' ? 'receipt_long' : 'calendar_month'} key={text(item.id)} title={item.kind === 'receipt' ? 'OCR ใบเสร็จสำเร็จ' : 'OCR ตารางเรียนสำเร็จ'} tone="purple" />) : <Empty label="ยังไม่มีประวัติการสแกน" />}
            </AdminCard>
          </Pressable>
        </>
      );
    }

    if (page === 'admin_users') {
      const list = items(data.users);
      return (
        <AdminCard>
          <View style={styles.sectionHead}><Text style={styles.sectionTitle}>รายชื่อผู้ใช้ทั้งหมด</Text><Text style={styles.sectionMeta}>{list.length} คน</Text></View>
          {list.length ? list.map((item) => {
            const u = text(item.uid);
            const disabled = item.disabled;
            const lastSignIn = item.lastSignInTime ? ` · ล็อกอิน ${date(item.lastSignInTime)}` : '';
            return (
              <Row detail={`${text(item.email)} · สมัคร ${date(item.createdAt)}${lastSignIn}`} icon="person" key={u} side={disabled ? 'ระงับ' : 'ปกติ'} title={text(item.displayName, text(item.email))} tone={disabled ? 'red' : 'green'}>
                <View style={styles.actionRow}>
                  <SmallButton icon={disabled ? 'check_circle' : 'block'} label={disabled ? 'เปิดใช้งาน' : 'ระงับบัญชี'} tone={disabled ? 'green' : 'red'} loading={actionLoading === `${u}-toggle`} onPress={() => handleAction(`${u}-toggle`, 'toggle-user', {uid: u, disabled: !disabled}, disabled ? 'เปิดใช้งานบัญชีแล้ว' : 'ระงับบัญชีแล้ว')} />
                  <SmallButton icon="lock_reset" label="รีเซ็ตรหัสผ่าน" tone="purple" loading={actionLoading === `${u}-reset`} onPress={() => handleAction(`${u}-reset`, 'reset-user-password', {email: text(item.email)}, `ส่งลิงก์รีเซ็ตรหัสผ่านไปที่ ${text(item.email)} แล้ว`)} />
                </View>
              </Row>
            );
          }) : <Empty label="ยังไม่มีบัญชีผู้ใช้" />}
        </AdminCard>
      );
    }

    if (page === 'admin_categories') {
      const list = items(data.categories);
      return (
        <>
          <AdminCard style={styles.composer}>
            <Pressable style={styles.formToggle} onPress={resetCategoryForm}>
              <MaterialIcon name={showCategoryForm ? 'close' : 'add'} size={18} color={C.pine} />
              <Text style={styles.formToggleText}>{showCategoryForm ? 'ปิดฟอร์ม' : 'เพิ่มหมวดหมู่ใหม่'}</Text>
            </Pressable>
            {showCategoryForm && (
              <View style={{marginTop: 15}}>
                <Text style={styles.inputLabel}>Domain</Text>
                <View style={styles.pillRow}>
                  <Pill label="โน้ต (note)" selected={catDomain === 'note'} onPress={() => setCatDomain('note')} />
                  <Pill label="การเงิน (expense)" selected={catDomain === 'expense'} onPress={() => setCatDomain('expense')} />
                  <Pill label="กิจกรรม (activity)" selected={catDomain === 'activity'} onPress={() => setCatDomain('activity')} />
                </View>
                <Text style={styles.inputLabel}>ชื่อภาษาไทย (labelTh)</Text>
                <TextInput style={styles.input} value={catLabelTh} onChangeText={setCatLabelTh} placeholder="เช่น อาหาร" />
                <Text style={styles.inputLabel}>English Label (labelEn)</Text>
                <TextInput style={styles.input} value={catLabelEn} onChangeText={setCatLabelEn} placeholder="e.g. Food" />
                <Text style={styles.inputLabel}>ไอคอน (Material Icons)</Text>
                <TextInput style={styles.input} value={catIcon} onChangeText={setCatIcon} placeholder="เช่น restaurant" />
                <Text style={styles.inputLabel}>สี (Hex Code)</Text>
                <TextInput style={styles.input} value={catColor} onChangeText={setCatColor} placeholder="เช่น #E2796D" />
                <Text style={styles.inputLabel}>ลำดับ (Sort Order)</Text>
                <TextInput style={styles.input} value={catSortOrder} onChangeText={setCatSortOrder} keyboardType="numeric" />
                <Pressable disabled={catLoading} onPress={saveCategory} style={({pressed}) => [styles.publishButton, (pressed || catLoading) && styles.pressed]}>
                  {catLoading ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcon color="#fff" name="save" size={18} />}
                  <Text style={styles.publishText}>{catLoading ? 'กำลังบันทึก...' : editingCategoryId ? 'บันทึกการแก้ไข' : 'สร้างหมวดหมู่'}</Text>
                </Pressable>
              </View>
            )}
          </AdminCard>
          <AdminCard>
            {list.length ? list.map((item) => {
              const id = text(item.id);
              const colorHex = text(item.color, '#666');
              return (
                <Row detail={`${text(item.domain)} · ${text(item.labelEn)}`} icon={text(item.icon, 'sell')} key={id} title={text(item.labelTh)} tone={item.domain === 'note' ? 'rose' : item.domain === 'expense' ? 'purple' : 'green'}>
                  <View style={[styles.actionRow, {alignItems: 'center'}]}>
                    <View style={[styles.colorDot, {backgroundColor: colorHex, marginRight: 8}]} />
                    <SmallButton icon="edit" label="แก้ไข" tone="amber" onPress={() => {
                      setEditingCategoryId(id);
                      setCatDomain(text(item.domain, 'expense'));
                      setCatLabelTh(text(item.labelTh));
                      setCatLabelEn(text(item.labelEn));
                      setCatIcon(text(item.icon, 'tag'));
                      setCatColor(colorHex);
                      setCatSortOrder(String(item.sortOrder ?? 100));
                      setShowCategoryForm(true);
                    }} />
                    <SmallButton icon="delete" label="ลบ" tone="red" loading={actionLoading === `${id}-del`} onPress={() => {
                      Alert.alert('ยืนยันการลบ', `ต้องการลบหมวดหมู่ "${text(item.labelTh)}" ใช่หรือไม่?`, [
                        {text: 'ยกเลิก', style: 'cancel'},
                        {text: 'ลบ', style: 'destructive', onPress: () => handleAction(`${id}-del`, 'delete-category', {id}, 'ลบหมวดหมู่แล้ว')}
                      ]);
                    }} />
                  </View>
                </Row>
              );
            }) : <Empty label="ยังไม่มีหมวดหมู่" />}
          </AdminCard>
        </>
      );
    }

    if (page === 'admin_announcements') {
      const list = items(data.announcements);
      return (
        <>
          <AdminCard style={styles.composer}>
            <View style={styles.composerHead}>
              <View style={styles.composerIcon}><MaterialIcon color={C.sage} name="campaign" size={21} /></View>
              <View style={{flex: 1}}><Text style={styles.sectionTitle}>{editingAnnouncementId ? 'แก้ไขประกาศ' : 'สร้างประกาศ'}</Text><Text style={styles.sectionMeta}>ส่งถึงผู้ใช้ทุกคนผ่าน Firebase</Text></View>
              {editingAnnouncementId ? (
                <Pressable onPress={() => {
                  setEditingAnnouncementId(null);
                  setAnnouncementTitle('');
                  setAnnouncementMessage('');
                  setAnnouncementKind('update');
                }}>
                  <MaterialIcon name="close" size={20} color={C.red} />
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.inputLabel}>ประเภทประกาศ</Text>
            <View style={styles.pillRow}>
              <Pill label="อัปเดต" selected={announcementKind === 'update'} onPress={() => setAnnouncementKind('update')} />
              <Pill label="ปิดปรับปรุง" selected={announcementKind === 'maintenance'} onPress={() => setAnnouncementKind('maintenance')} color={C.amber} />
              <Pill label="ฟีเจอร์" selected={announcementKind === 'feature'} onPress={() => setAnnouncementKind('feature')} color="#6572b1" />
              <Pill label="เร่งด่วน" selected={announcementKind === 'urgent'} onPress={() => setAnnouncementKind('urgent')} color={C.red} />
            </View>
            <Text style={styles.inputLabel}>หัวข้อประกาศ</Text>
            <TextInput editable={!publishing} onChangeText={setAnnouncementTitle} placeholder="เช่น แจ้งปิดปรับปรุงระบบ" placeholderTextColor="#a6ada3" style={styles.input} value={announcementTitle} />
            <Text style={styles.inputLabel}>รายละเอียด</Text>
            <TextInput editable={!publishing} multiline onChangeText={setAnnouncementMessage} placeholder="พิมพ์รายละเอียดที่ต้องการสื่อสาร" placeholderTextColor="#a6ada3" style={[styles.input, styles.messageInput]} textAlignVertical="top" value={announcementMessage} />
            <View style={styles.audience}><MaterialIcon color={C.sage} name="group" size={18} /><Text style={styles.audienceText}>ผู้รับ: ผู้ใช้ทุกคน</Text></View>
            <Pressable disabled={publishing} onPress={publishAnnouncement} style={({pressed}) => [styles.publishButton, (pressed || publishing) && styles.pressed]}>
              {publishing ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcon color="#fff" name="send" size={18} />}
              <Text style={styles.publishText}>{publishing ? 'กำลังบันทึก...' : editingAnnouncementId ? 'บันทึกการแก้ไข' : 'สร้างประกาศถึงทุกคน'}</Text>
            </Pressable>
          </AdminCard>
          <AdminCard>
            {list.length ? list.map((item) => {
              const id = text(item.id);
              return (
                <Row detail={`${text(item.message)} · ${date(item.createdAt)}`} icon="campaign" key={id} title={text(item.title)} tone="purple">
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8}}>
                    <KindBadge kind={text(item.kind, 'update')} mapping={{
                      'update': ['อัปเดต', 'green'],
                      'maintenance': ['ปิดปรับปรุง', 'amber'],
                      'feature': ['ฟีเจอร์', 'purple'],
                      'urgent': ['เร่งด่วน', 'red']
                    }} />
                    <SmallButton icon="edit" label="แก้ไข" tone="amber" onPress={() => {
                      setEditingAnnouncementId(id);
                      setAnnouncementTitle(text(item.title));
                      setAnnouncementMessage(text(item.message));
                      setAnnouncementKind(text(item.kind, 'update'));
                    }} />
                    <SmallButton icon="delete" label="ลบ" tone="red" loading={actionLoading === `${id}-del`} onPress={() => {
                      Alert.alert('ยืนยันการลบ', 'ต้องการลบประกาศนี้ใช่หรือไม่?', [
                        {text: 'ยกเลิก', style: 'cancel'},
                        {text: 'ลบ', style: 'destructive', onPress: () => handleAction(`${id}-del`, 'delete-announcement', {id}, 'ลบประกาศแล้ว')}
                      ]);
                    }} />
                  </View>
                </Row>
              );
            }) : <Empty label="ยังไม่มีประกาศ" />}
          </AdminCard>
        </>
      );
    }

    if (page === 'admin_system_health') {
      const list = items(data.systemStatus);
      return (
        <>
          <Pressable onPress={refresh} style={({pressed}) => [styles.refreshButton, pressed && styles.pressed]}>
            <MaterialIcon name="refresh" size={16} color={C.pine} />
            <Text style={styles.refreshButtonText}>รีเฟรชสถานะ</Text>
          </Pressable>
          <AdminCard>
            {list.length ? list.map((item) => {
              const s = text(item.status);
              const ic = s === 'operational' ? 'check_circle' : s === 'degraded' ? 'warning' : 'error';
              const tone = s === 'operational' ? 'green' : s === 'degraded' ? 'amber' : 'red';
              const sideText = s === 'operational' ? 'พร้อมใช้งาน' : s === 'degraded' ? 'ประสิทธิภาพลดลง' : 'ขัดข้อง';
              const dotStyle = s === 'operational' ? styles.statusOperational : s === 'degraded' ? styles.statusDegraded : styles.statusOutage;
              const dt = item.checkedAt ? ` · ตรวจสอบเมื่อ ${date(item.checkedAt)}` : '';
              return (
                <Row detail={`${text(item.detail)} · ${number(item.latencyMs)} ms${dt}`} icon={ic} key={text(item.id, text(item.name))} title={text(item.name)} tone={tone}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, position: 'absolute', right: 0, top: 4}}>
                    <View style={[styles.colorDot, dotStyle]} />
                    <Text style={[styles.rowSide, {color: tone === 'amber' ? C.amber : tone === 'red' ? C.red : C.sage}]}>{sideText}</Text>
                  </View>
                </Row>
              );
            }) : <Empty label="กำลังตรวจสอบสถานะระบบ" />}
          </AdminCard>
          <Pressable onPress={logout} style={({pressed}) => [styles.logout, pressed && styles.pressed]}>
            <MaterialIcon color={C.red} name="logout" size={19} />
            <Text style={styles.logoutText}>ออกจากระบบ Admin</Text>
          </Pressable>
        </>
      );
    }

    if (page === 'admin_ocr_logs') {
      const list = items(data.scanLogs);
      return (
        <AdminCard>
          {list.length ? list.map((item) => {
            const status = text(item.status);
            const statusColor = status === 'completed' ? C.sage : status === 'failed' ? C.red : status === 'processing' ? '#6572b1' : C.muted;
            const prov = text(item.provider, 'unknown');
            const provBg = prov === 'iapp' ? C.amber : prov === 'google-vision' ? '#6572b1' : C.muted;
            const provText = prov === 'iapp' ? 'iApp' : prov === 'google-vision' ? 'Google Vision' : 'Fallback';
            const conf = item.ocrConfidence ?? item.confidence;

            return (
              <Row detail={`${text(item.extractedText)} · ${date(item.createdAt)}`} icon={item.kind === 'receipt' ? 'receipt_long' : 'document_scanner'} key={text(item.id)} title={item.kind === 'receipt' ? 'สแกนใบเสร็จ' : 'สแกนตารางเรียน'}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8}}>
                  <View style={[styles.providerBadge, {backgroundColor: provBg}]}><Text style={[styles.providerBadgeText, {color: '#fff'}]}>{provText}</Text></View>
                  <Text style={[styles.rowSide, {color: statusColor}]}>{status}</Text>
                  {conf !== undefined ? <Text style={styles.confidenceText}>ความแม่นยำ {number(Number(conf) * 100)}%</Text> : null}
                  {item.needsReview ? <View style={[styles.providerBadge, {backgroundColor: C.red}]}><Text style={[styles.providerBadgeText, {color: '#fff'}]}>ต้องตรวจสอบ</Text></View> : null}
                </View>
              </Row>
            );
          }) : <Empty label="ยังไม่มี OCR Log" />}
        </AdminCard>
      );
    }

    if (page === 'admin_feedback') {
      const list = items(data.feedback);
      return (
        <AdminCard>
          {list.length ? list.map((item) => {
            const t = text(item.type);
            return (
              <Row detail={`${date(item.createdAt)}`} icon="forum" key={text(item.id)} title={text(item.message)}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8}}>
                  <KindBadge kind={t} mapping={{
                    'ai': ['AI', 'purple'],
                    'schedule-scan': ['ตารางเรียน', 'green'],
                    'expense-category': ['หมวดการเงิน', 'rose'],
                    'other': ['อื่นๆ', 'muted']
                  }} />
                  <Text style={[styles.rowSide, {color: C.muted}]}>{text(item.status)}</Text>
                </View>
              </Row>
            );
          }) : <Empty label="ยังไม่มี Feedback" />}
        </AdminCard>
      );
    }

    if (page === 'admin_ai_knowledge') {
      const list = items(data.recommendations);
      return (
        <>
          <LinearGradient colors={['#777da5', '#9297bb']} style={styles.insight}>
            <MaterialIcon color="#fff" name="psychology" size={29} />
            <View style={{flex: 1}}>
              <Text style={styles.insightTitle}>AI Context Audit</Text>
              <Text style={styles.insightSub}>ตรวจสอบว่าคำแนะนำอ้างอิงข้อมูลใดบ้าง</Text>
            </View>
          </LinearGradient>
          <AdminCard>
            {list.length ? list.map((item) => (
              <Row detail={`แหล่งข้อมูล: ${strings(item.contextSources).join(', ') || 'ไม่ระบุ'}`} icon="auto_awesome" key={text(item.id)} title={text(item.title)} tone="purple">
                <Text style={[styles.rowDetail, {marginTop: 6, color: '#6572b1'}]}>{text(item.explanation)}</Text>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8}}>
                  <KindBadge kind={text(item.kind, 'priority')} mapping={{
                    'priority': ['Priority', 'purple'],
                    'schedule': ['Schedule', 'green'],
                    'burnout': ['Burnout', 'rose'],
                    'finance': ['Finance', 'amber'],
                    'note': ['Note', 'green']
                  }} />
                  <KindBadge kind={text(item.status, 'new')} mapping={{
                    'new': ['ใหม่', 'green'],
                    'accepted': ['ยอมรับแล้ว', 'purple'],
                    'dismissed': ['ละทิ้ง', 'muted']
                  }} />
                </View>
              </Row>
            )) : <Empty label="ยังไม่มี AI Recommendation" />}
          </AdminCard>
        </>
      );
    }

    const links = [['admin_categories', 'category', 'จัดการหมวดหมู่', 'โน้ต การเงิน และกิจกรรม'], ['admin_ocr_logs', 'document_scanner', 'OCR / Import Log', 'ตรวจสอบประวัติการสแกน'], ['admin_announcements', 'campaign', 'ประกาศ', 'สื่อสารถึงผู้ใช้'], ['admin_feedback', 'forum', 'Feedback Center', 'ความคิดเห็นจากผู้ใช้']];
    return <AdminCard>{links.map(([target, icon, title, detail]) => <Pressable key={target} onPress={() => onNavigate(target)} style={({pressed}) => [styles.menu, pressed && styles.pressed]}><View style={styles.menuIcon}><MaterialIcon color={C.sage} name={icon} size={20} /></View><View style={{flex: 1}}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowDetail}>{detail}</Text></View><MaterialIcon color={C.pine2} name="chevron_right" size={22} /></Pressable>)}</AdminCard>;
  }, [actionLoading, announcementKind, announcementMessage, announcementTitle, catColor, catDomain, catIcon, catLabelEn, catLabelTh, catLoading, catSortOrder, data, editingAnnouncementId, editingCategoryId, handleAction, logout, onNavigate, page, publishAnnouncement, publishing, refresh, resetCategoryForm, saveCategory, showCategoryForm]);

  return <ResponsiveSafeArea style={styles.safe}><View style={styles.shell}><LinearGradient colors={['#f7f9f4', '#eef3e9', '#e5ebdf']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={StyleSheet.absoluteFill} /><LinearGradient colors={['rgba(255,255,255,.98)', 'rgba(240,245,236,.94)']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={styles.headerLight}>{page === 'admin_dashboard' ? <View style={styles.headerAvatar}><Text style={styles.headerAvatarText}>SL</Text></View> : <Pressable accessibilityLabel="กลับหน้าภาพรวม" onPress={() => onNavigate('admin_dashboard')} style={({pressed}) => [styles.headerBack, pressed && styles.pressed]}><MaterialIcon color={C.pine} name="chevron_left" size={25} /></Pressable>}<View style={styles.headerCopy}><Text style={styles.headerBrand}>SmartLife Admin</Text><Text style={styles.adminTitle}>{page === 'admin_dashboard' ? 'ผู้ดูแลระบบ' : info[0]}</Text></View><Pressable accessibilityLabel="ดูประกาศ" onPress={() => onNavigate('admin_announcements')} style={({pressed}) => [styles.notificationButton, pressed && styles.pressed]}><MaterialIcon color={C.pine} name="notifications_none" size={21} /><View style={styles.notificationDot} /></Pressable></LinearGradient><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={C.sage} />} showsVerticalScrollIndicator={false}><View style={styles.pageHead}><View style={styles.pageIcon}><MaterialIcon color={C.sage} name={info[2]} size={22} /></View><View style={{flex: 1}}><Text style={styles.title}>{info[0]}</Text><Text style={styles.subtitle}>{info[1]}</Text></View></View>{loading ? <View style={styles.loading}><ActivityIndicator color={C.sage} size="large" /><Text style={styles.loadingText}>กำลังโหลดข้อมูลจาก Firebase</Text></View> : body}</ScrollView><AdminTabs active={page} onNavigate={onNavigate} /></View></ResponsiveSafeArea>;
}

const shadow = {shadowColor: C.pine, shadowOffset: {height: 10, width: 0}, shadowOpacity: .08, shadowRadius: 20};
const styles = StyleSheet.create({
  audience: {alignItems: 'center', backgroundColor: C.sageSoft, borderRadius: 12, flexDirection: 'row', gap: 7, marginTop: 12, paddingHorizontal: 11, paddingVertical: 10},
  audienceText: {color: C.pine2, fontFamily: F.s, fontSize: 10},
  composer: {padding: 15},
  composerHead: {alignItems: 'center', flexDirection: 'row', gap: 10},
  composerIcon: {alignItems: 'center', backgroundColor: C.sageSoft, borderRadius: 13, height: 42, justifyContent: 'center', width: 42},
  input: {backgroundColor: '#f6f8f3', borderColor: '#e1e6dd', borderRadius: 13, borderWidth: 1, color: C.pine, fontFamily: F.m, fontSize: 11, marginTop: 5, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10},
  inputLabel: {color: C.pine, fontFamily: F.s, fontSize: 10, marginTop: 13},
  messageInput: {minHeight: 92},
  publishButton: {alignItems: 'center', backgroundColor: C.pine, borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 12, minHeight: 48},
  publishText: {color: '#fff', fontFamily: F.b, fontSize: 11},
  adminBadgeLight: {...shadow, alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, height: 42, justifyContent: 'center', width: 42},
  adminTitle: {color: C.pine, fontFamily: F.x, fontSize: 18, lineHeight: 22, marginTop: 1},
  headerAvatar: {alignItems: 'center', backgroundColor: '#754b59', borderColor: '#fff', borderRadius: 24, borderWidth: 3, height: 46, justifyContent: 'center', width: 46},
  headerAvatarText: {color: '#fff', fontFamily: F.x, fontSize: 13},
  headerBack: {...shadow, alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, height: 42, justifyContent: 'center', width: 42},
  headerBrand: {color: '#668d65', fontFamily: F.s, fontSize: 12},
  headerCopy: {flex: 1},
  headerLight: {alignItems: 'center', borderBottomColor: '#e5e9e1', borderBottomWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'space-between', minHeight: 76, paddingHorizontal: 19, paddingVertical: 12},
  headerSub: {color: C.muted, fontFamily: F.r, fontSize: 9, marginTop: 1},
  notificationButton: {...shadow, alignItems: 'center', backgroundColor: '#fff', borderRadius: 22, height: 44, justifyContent: 'center', position: 'relative', width: 44},
  notificationDot: {backgroundColor: '#f06767', borderColor: '#fff', borderRadius: 6, borderWidth: 1.5, height: 11, position: 'absolute', right: 8, top: 8, width: 11},
  summaryAction: {...shadow, alignItems: 'center', borderColor: 'rgba(255,255,255,.9)', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 78, paddingHorizontal: 15, paddingVertical: 10},
  summaryCopy: {flex: 1},
  summaryHint: {color: C.muted, fontFamily: F.r, fontSize: 8, marginTop: 1},
  summaryIcon: {alignItems: 'center', borderRadius: 18, height: 42, justifyContent: 'center', width: 42},
  summaryLabel: {color: C.pine, fontFamily: F.b, fontSize: 12},
  summaryList: {gap: 9, marginTop: 13},
  summaryValue: {fontFamily: F.x, fontSize: 21, lineHeight: 25, marginTop: 1},
  adminBadge: {alignItems: 'center', backgroundColor: 'rgba(255,255,255,.14)', borderRadius: 18, height: 36, justifyContent: 'center', width: 36}, brand: {color: '#fff', fontFamily: F.b, fontSize: 15}, brandMark: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 11, height: 38, justifyContent: 'center', width: 38}, brandMarkText: {color: C.pine2, fontFamily: F.x, fontSize: 11}, brandSub: {color: 'rgba(255,255,255,.66)', fontFamily: F.r, fontSize: 9, marginTop: 1}, card: {...shadow, borderColor: 'rgba(255,255,255,.85)', borderRadius: 18, borderWidth: 1, marginTop: 13, padding: 14}, centerTab: {...shadow, alignItems: 'center', borderColor: '#fff', borderRadius: 32, borderWidth: 5, height: 64, justifyContent: 'center', marginTop: -27, width: 64}, content: {padding: 19, paddingBottom: 27}, empty: {alignItems: 'center', gap: 7, paddingVertical: 28}, emptyText: {color: C.muted, fontFamily: F.r, fontSize: 10}, header: {alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 82, paddingHorizontal: 19, paddingTop: 5}, insight: {...shadow, alignItems: 'center', borderRadius: 18, flexDirection: 'row', gap: 12, marginTop: 13, padding: 15}, insightSub: {color: 'rgba(255,255,255,.76)', fontFamily: F.r, fontSize: 9, marginTop: 2}, insightTitle: {color: '#fff', fontFamily: F.b, fontSize: 14}, loading: {alignItems: 'center', gap: 10, paddingVertical: 90}, loadingText: {color: C.muted, fontFamily: F.r, fontSize: 10}, logout: {alignItems: 'center', backgroundColor: C.redSoft, borderColor: 'rgba(201,103,97,.22)', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 14, minHeight: 48}, logoutText: {color: C.red, fontFamily: F.b, fontSize: 11}, menu: {alignItems: 'center', borderBottomColor: 'rgba(44,52,27,.08)', borderBottomWidth: 1, flexDirection: 'row', gap: 10, minHeight: 68, paddingVertical: 10}, menuIcon: {alignItems: 'center', backgroundColor: C.sageSoft, borderRadius: 13, height: 40, justifyContent: 'center', width: 40}, metric: {alignItems: 'center', flex: 1, marginTop: 0, minHeight: 158, paddingHorizontal: 8, paddingVertical: 16, width: '47%'}, metricHint: {color: C.sage, fontFamily: F.s, fontSize: 8, marginTop: 6}, metricIcon: {alignItems: 'center', borderRadius: 16, height: 48, justifyContent: 'center', width: 48}, metricLabel: {color: C.muted, fontFamily: F.r, fontSize: 9, marginTop: 9, textAlign: 'center'}, metrics: {flexDirection: 'row', flexWrap: 'wrap', gap: 10}, metricValue: {color: C.pine, fontFamily: F.x, fontSize: 27, marginTop: 1}, pageHead: {alignItems: 'center', flexDirection: 'row', gap: 11}, pageIcon: {...shadow, alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, height: 47, justifyContent: 'center', width: 47}, pressed: {opacity: .78, transform: [{scale: .987}]}, row: {alignItems: 'center', backgroundColor: '#f5f8f2', borderRadius: 13, flexDirection: 'row', gap: 10, marginTop: 9, minHeight: 64, padding: 11}, rowDetail: {color: C.muted, fontFamily: F.r, fontSize: 8, lineHeight: 13, marginTop: 2}, rowIcon: {alignItems: 'center', borderRadius: 13, height: 39, justifyContent: 'center', width: 39}, rowSide: {fontFamily: F.s, fontSize: 8}, rowTitle: {color: C.pine, fontFamily: F.s, fontSize: 10}, safe: {backgroundColor: C.pine, flex: 1}, sectionHead: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'}, sectionMeta: {color: C.muted, fontFamily: F.r, fontSize: 8}, sectionTitle: {color: C.pine, fontFamily: F.b, fontSize: 13}, shell: {backgroundColor: C.mist, flex: 1}, subtitle: {color: C.muted, fontFamily: F.r, fontSize: 9, marginTop: 2}, tab: {alignItems: 'center', flex: 1, justifyContent: 'center'}, tabs: {alignItems: 'center', borderTopColor: 'rgba(44,52,27,.08)', borderTopWidth: 1, flexDirection: 'row', height: 78, paddingHorizontal: 11}, tabText: {color: '#9da59a', fontFamily: F.m, fontSize: 8, marginTop: 3}, tabTextActive: {color: C.pine2, fontFamily: F.b}, title: {color: C.pine, fontFamily: F.x, fontSize: 22},
  pill: {alignItems: 'center', backgroundColor: C.sageSoft, borderRadius: 12, height: 32, justifyContent: 'center', paddingHorizontal: 12},
  pillActive: {backgroundColor: C.pine},
  pillText: {color: C.pine2, fontFamily: F.m, fontSize: 10},
  pillTextActive: {color: '#fff'},
  pillRow: {flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 8, flexWrap: 'wrap'},
  smallBtn: {alignItems: 'center', borderRadius: 11, flexDirection: 'row', gap: 4, height: 32, justifyContent: 'center', paddingHorizontal: 10},
  smallBtnText: {fontFamily: F.b, fontSize: 10},
  actionRow: {flexDirection: 'row', gap: 8, marginTop: 8},
  kindBadge: {alignItems: 'center', borderRadius: 8, height: 20, justifyContent: 'center', paddingHorizontal: 8},
  kindBadgeText: {fontFamily: F.b, fontSize: 8},
  statusOperational: {backgroundColor: C.sage},
  statusDegraded: {backgroundColor: C.amber},
  statusOutage: {backgroundColor: C.red},
  providerBadge: {alignItems: 'center', borderRadius: 8, height: 20, justifyContent: 'center', paddingHorizontal: 8},
  providerBadgeText: {fontFamily: F.b, fontSize: 8},
  confidenceText: {color: C.muted, fontFamily: F.m, fontSize: 8},
  colorDot: {borderRadius: 6, height: 12, width: 12},
  refreshButton: {alignItems: 'center', backgroundColor: C.sageSoft, borderRadius: 14, flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 12, minHeight: 40},
  refreshButtonText: {color: C.pine, fontFamily: F.b, fontSize: 11},
  formToggle: {alignItems: 'center', backgroundColor: C.sageSoft, borderRadius: 14, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 44},
  formToggleText: {color: C.pine, fontFamily: F.b, fontSize: 11}
});
