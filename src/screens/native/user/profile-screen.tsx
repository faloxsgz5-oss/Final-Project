/* eslint-disable react-hooks/set-state-in-effect */
import {useCallback, useEffect, useMemo, useState} from 'react';
import {Alert, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';

import {loadLegacyPageData, runLegacyDataAction} from '@/services/legacy-data';
import {Card, LoadingBlock, MaterialIcon, UserShell, type UserNavigate} from './user-ui';

type Profile = {displayName?: string; email?: string; studentId?: string};
type Counts = {schedules?: number; notes?: number; transactions?: number};
type FeedbackType = 'ai' | 'schedule-scan' | 'expense-category' | 'other';
const C = {pine: '#2c341b', sage: '#6f8f6d', dark: '#5f835f', soft: '#e8eee3', muted: '#81887d', danger: '#c96761', note: '#bb9293', finance: '#9297bb'};
const F = {r: 'Prompt_400Regular', m: 'Prompt_500Medium', s: 'Prompt_600SemiBold', b: 'Prompt_700Bold', x: 'Prompt_800ExtraBold'};
const feedbackTypes: [FeedbackType, string, string][] = [['ai', 'AI แนะนำไม่ตรง', 'auto_awesome'], ['schedule-scan', 'สแกนตารางผิด', 'document_scanner'], ['expense-category', 'หมวดรายจ่ายไม่ถูก', 'receipt_long'], ['other', 'ข้อเสนอแนะอื่น', 'chat_bubble']];

export default function ProfileScreen({uid, onNavigate, onLogout}: {uid: string; onNavigate: UserNavigate; onLogout: () => Promise<void>}) {
  const [profile, setProfile] = useState<Profile | null>(null); const [counts, setCounts] = useState<Counts>({}); const [feedbackType, setFeedbackType] = useState<FeedbackType>('ai'); const [feedback, setFeedback] = useState(''); const [sending, setSending] = useState(false); const [success, setSuccess] = useState(false); const [seeding, setSeeding] = useState(false);
  const load = useCallback(async () => { const result = await loadLegacyPageData(uid, 'user/smartlife_profile') as {profile?: Profile; counts?: Counts}; setProfile(result.profile ?? {}); setCounts(result.counts ?? {}); }, [uid]);
  useEffect(() => { load().catch(() => setProfile({})); }, [load]);
  const initials = useMemo(() => (profile?.displayName || 'SL').trim().split(/\s+/).map((word) => word[0]).join('').slice(0, 2).toUpperCase(), [profile]);

  const submit = async () => {
    if (!feedback.trim()) return Alert.alert('กรอกรายละเอียดก่อนส่ง', 'บอกเราได้ว่าอยากให้ปรับปรุงอะไร');
    setSending(true); setSuccess(false);
    try { await runLegacyDataAction(uid, 'user/smartlife_profile', {action: 'feedback', payload: {type: feedbackType, message: feedback}}); setFeedback(''); setSuccess(true); }
    catch { Alert.alert('ส่งไม่สำเร็จ', 'กรุณาลองใหม่อีกครั้ง'); }
    finally { setSending(false); }
  };

  const logout = () => Alert.alert('ออกจากระบบ', 'ต้องการออกจากบัญชี SmartLife ใช่ไหม?', [{text: 'ยกเลิก', style: 'cancel'}, {text: 'ออกจากระบบ', style: 'destructive', onPress: () => onLogout().catch(() => Alert.alert('ออกจากระบบไม่สำเร็จ'))}]);
  const seedAiDynamicData = () => Alert.alert('เพิ่มข้อมูลทดสอบ AI Dynamic', 'ระบบจะเพิ่มตาราง งาน โน้ต และรายการการเงินจำลองเข้า Firebase ของบัญชีนี้ เหมือนผู้ใช้เพิ่มเอง ต้องการทำต่อไหม?', [{text: 'ยกเลิก', style: 'cancel'}, {text: 'เพิ่มข้อมูล', onPress: async () => {
    setSeeding(true);
    try {
      const result = await runLegacyDataAction(uid, 'user/smartlife_profile', {action: 'seed-ai-dynamic-test-data'});
      await load();
      const summary = result && typeof result === 'object' ? Object.entries(result).map(([key, value]) => `${key}: ${value}`).join('\n') : '';
      Alert.alert('เพิ่มข้อมูลสำเร็จ', summary || 'เพิ่มข้อมูลทดสอบเรียบร้อยแล้ว');
    } catch (error) {
      Alert.alert('เพิ่มข้อมูลไม่สำเร็จ', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง');
    } finally {
      setSeeding(false);
    }
  }}]);

  return <UserShell active="smartlife_profile" onNavigate={onNavigate}>
    <View style={styles.pageHead}><Pressable onPress={() => onNavigate('index')} style={({pressed}) => [styles.back, pressed && styles.pressed]}><MaterialIcon name="arrow_back_ios_new" size={18} /></Pressable><View><Text style={styles.title}>โปรไฟล์ของฉัน</Text><Text style={styles.subtitle}>บัญชี ความคิดเห็น และความเป็นส่วนตัว</Text></View></View>
    {profile === null ? <LoadingBlock /> : <>
      <Card colors={['#f7fbf4', '#eef5ea']} style={styles.seedPanel}><View style={styles.panelTitleRow}><View style={styles.seedIcon}><MaterialIcon color={C.dark} name="auto_awesome" size={20} /></View><View style={{flex: 1}}><Text style={styles.panelTitle}>ข้อมูลทดสอบ AI Dynamic</Text><Text style={styles.panelSub}>เติมข้อมูลจำลองเข้า Firebase ของบัญชีนี้เพื่อทดสอบ Dashboard และ AI Assistant</Text></View></View><Pressable disabled={seeding} onPress={seedAiDynamicData} style={({pressed}) => [styles.seedButton, pressed && styles.pressed, seeding && styles.disabled]}><MaterialIcon color="#fff" name="database" size={17} /><Text style={styles.seedButtonText}>{seeding ? 'กำลังเพิ่มข้อมูล...' : 'เพิ่มข้อมูลทดสอบ'}</Text></Pressable></Card>
      <LinearGradient colors={['#769674', '#8ca28b', '#a1afa0']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={styles.profileCard}><LinearGradient colors={['#392e3a', '#844a50', '#c1a895']} style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></LinearGradient><View style={{flex: 1}}><Text style={styles.name}>{profile.displayName || 'ผู้ใช้ SmartLife'}</Text><Text style={styles.email}>{profile.email || 'ยังไม่มีอีเมล'}</Text><Text style={styles.student}>รหัสนักศึกษา {profile.studentId || '-'}</Text></View><MaterialIcon color="rgba(255,255,255,.75)" name="verified" size={22} /></LinearGradient>
      <View style={styles.stats}>{[[counts.schedules ?? 0, 'กิจกรรม', 'school', C.sage], [counts.notes ?? 0, 'โน้ต', 'note_alt', C.note], [counts.transactions ?? 0, 'รายการเงิน', 'account_balance_wallet', C.finance]].map(([value, label, icon, color]) => <Card key={String(label)} style={styles.stat}><View style={[styles.statIcon, {backgroundColor: `${String(color)}22`}]}><MaterialIcon color={String(color)} name={String(icon)} size={18} /></View><Text style={styles.statValue}>{String(value)}</Text><Text style={styles.statLabel}>{String(label)}</Text></Card>)}</View>
      <Card colors={['rgba(255,255,255,.99)', '#f8faf5']} style={styles.panel}><View style={styles.panelTitleRow}><View style={styles.feedbackIcon}><MaterialIcon color={C.sage} name="forum" size={20} /></View><View style={{flex: 1}}><Text style={styles.panelTitle}>ส่ง Feedback</Text><Text style={styles.panelSub}>ช่วยบอกเราเมื่อ AI หรือตารางข้อมูลไม่ตรง</Text></View></View>
        <Text style={styles.label}>ประเภทปัญหา</Text><View style={styles.typeGrid}>{feedbackTypes.map(([type, label, icon]) => <Pressable key={type} onPress={() => setFeedbackType(type)} style={({pressed}) => [styles.typeChip, feedbackType === type && styles.typeChipActive, pressed && styles.pressed]}><MaterialIcon color={feedbackType === type ? '#fff' : C.sage} name={icon} size={15} /><Text style={[styles.typeText, feedbackType === type && styles.typeTextActive]}>{label}</Text></Pressable>)}</View>
        <Text style={styles.label}>รายละเอียด</Text><View style={styles.textAreaShell}><TextInput multiline onChangeText={(value) => {setFeedback(value); setSuccess(false);}} placeholder="อธิบายสิ่งที่พบหรือสิ่งที่อยากให้ปรับปรุง" placeholderTextColor="#9ca49a" style={styles.textArea} textAlignVertical="top" value={feedback} /></View>
        <Pressable disabled={sending} onPress={submit} style={({pressed}) => [styles.submitShell, pressed && styles.pressed, sending && styles.disabled]}><LinearGradient colors={['#759873', '#4e704a']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={styles.submit}>{sending ? <Text style={styles.submitText}>กำลังส่ง...</Text> : <><MaterialIcon color="#fff" name="send" size={17} /><Text style={styles.submitText}>ส่งความคิดเห็น</Text></>}</LinearGradient></Pressable>
        {success ? <View style={styles.success}><MaterialIcon color={C.dark} name="check_circle" size={18} /><Text style={styles.successText}>ส่ง Feedback สำเร็จ ขอบคุณที่ช่วยพัฒนา SmartLife</Text></View> : null}
      </Card>
      <Pressable onPress={logout} style={({pressed}) => [styles.logout, pressed && styles.pressed]}><MaterialIcon color={C.danger} name="logout" size={19} /><Text style={styles.logoutText}>ออกจากระบบ</Text></Pressable>
    </>}
  </UserShell>;
}

const shadow = {shadowColor: C.pine, shadowOffset: {height: 10, width: 0}, shadowOpacity: .08, shadowRadius: 20};
const styles = StyleSheet.create({
  avatar: {alignItems: 'center', borderColor: 'rgba(255,255,255,.88)', borderRadius: 31, borderWidth: 3, height: 62, justifyContent: 'center', width: 62}, avatarText: {color: '#fff', fontFamily: F.x, fontSize: 17}, back: {...shadow, alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, height: 42, justifyContent: 'center', width: 42}, disabled: {opacity: .6}, email: {color: 'rgba(255,255,255,.88)', fontFamily: F.r, fontSize: 10, marginTop: 1}, feedbackIcon: {alignItems: 'center', backgroundColor: '#e8f0e4', borderRadius: 14, height: 40, justifyContent: 'center', width: 40}, label: {color: '#4d5948', fontFamily: F.s, fontSize: 9, marginBottom: 6, marginTop: 14}, logout: {alignItems: 'center', backgroundColor: '#f8e5e2', borderColor: 'rgba(201,103,97,.22)', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 48}, logoutText: {color: C.danger, fontFamily: F.b, fontSize: 11}, name: {color: '#fff', fontFamily: F.x, fontSize: 18}, pageHead: {alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 14}, panel: {marginBottom: 13, marginTop: 0, padding: 15}, panelSub: {color: C.muted, fontFamily: F.r, fontSize: 9, marginTop: 1}, panelTitle: {color: C.pine, fontFamily: F.b, fontSize: 14}, panelTitleRow: {alignItems: 'center', flexDirection: 'row', gap: 10}, pressed: {opacity: .82, transform: [{scale: .987}]}, profileCard: {...shadow, alignItems: 'center', borderRadius: 20, flexDirection: 'row', gap: 13, marginBottom: 12, padding: 16}, seedButton: {alignItems: 'center', backgroundColor: C.dark, borderRadius: 13, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 12, minHeight: 44}, seedButtonText: {color: '#fff', fontFamily: F.b, fontSize: 11}, seedIcon: {alignItems: 'center', backgroundColor: '#dfeadd', borderRadius: 14, height: 40, justifyContent: 'center', width: 40}, seedPanel: {marginBottom: 13, marginTop: 0, padding: 15}, stat: {alignItems: 'center', flex: 1, marginTop: 0, padding: 10}, statIcon: {alignItems: 'center', borderRadius: 12, height: 31, justifyContent: 'center', marginBottom: 3, width: 31}, statLabel: {color: C.muted, fontFamily: F.r, fontSize: 8, marginTop: 1}, statValue: {color: C.pine, fontFamily: F.x, fontSize: 18}, stats: {flexDirection: 'row', gap: 8, marginBottom: 12}, student: {color: 'rgba(255,255,255,.72)', fontFamily: F.r, fontSize: 8, marginTop: 2}, submit: {alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 45}, submitShell: {...shadow, borderRadius: 13, marginTop: 3, overflow: 'hidden'}, submitText: {color: '#fff', fontFamily: F.b, fontSize: 11}, subtitle: {color: C.muted, fontFamily: F.r, fontSize: 9, marginTop: 1}, success: {alignItems: 'center', backgroundColor: C.soft, borderRadius: 11, flexDirection: 'row', gap: 7, marginTop: 10, padding: 9}, successText: {color: C.dark, flex: 1, fontFamily: F.s, fontSize: 8}, textArea: {color: C.pine, fontFamily: F.r, fontSize: 10, minHeight: 88, padding: 10}, textAreaShell: {backgroundColor: '#f8faf5', borderColor: 'rgba(44,52,27,.1)', borderRadius: 12, borderWidth: 1}, title: {color: C.pine, fontFamily: F.x, fontSize: 21}, typeChip: {alignItems: 'center', backgroundColor: '#eef3ea', borderRadius: 10, flexDirection: 'row', gap: 5, minHeight: 35, paddingHorizontal: 9, width: '48.5%'}, typeChipActive: {backgroundColor: C.sage}, typeGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 7}, typeText: {color: C.dark, fontFamily: F.m, fontSize: 8}, typeTextActive: {color: '#fff', fontFamily: F.s},
});
