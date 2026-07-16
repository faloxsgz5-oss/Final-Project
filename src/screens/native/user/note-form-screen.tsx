import {useState} from 'react';
import {Alert, Pressable, Text, TextInput, View} from 'react-native';

import {runLegacyDataAction} from '@/services/legacy-data';
import {Card, PrimaryButton, UserHeader, UserShell, type UserNavigate, userStyles as styles} from './user-ui';

const categories = ['study', 'work', 'idea'] as const;
const labels = {study: 'เรียน', work: 'งาน', idea: 'ไอเดีย'};

export default function NoteFormScreen({uid, onNavigate}: {uid: string; onNavigate: UserNavigate}) {
  const [title, setTitle] = useState(''); const [content, setContent] = useState(''); const [category, setCategory] = useState<typeof categories[number]>('study'); const [saving, setSaving] = useState(false);
  const save = async () => { if (!title.trim()) return Alert.alert('กรอกชื่อโน้ตก่อนบันทึก'); setSaving(true); try { await runLegacyDataAction(uid, 'user/smartlife_add_note', {action: 'create-note', payload: {title, content, category, color: '#9297bb'}}); Alert.alert('บันทึกโน้ตสำเร็จ'); onNavigate('smartlife_notes'); } catch (error) { Alert.alert('บันทึกไม่สำเร็จ', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'); } finally { setSaving(false); } };
  return <UserShell onNavigate={onNavigate}><UserHeader onNavigate={onNavigate} title="เพิ่มโน้ต" subtitle="บันทึกสิ่งสำคัญไว้กับ SmartLife" /><Card><Text style={styles.label}>ชื่อโน้ต</Text><TextInput onChangeText={setTitle} placeholder="เช่น Linked List ก่อนควิซ" placeholderTextColor="#9ea69d" style={styles.field} value={title} /><Text style={styles.label}>หมวดหมู่</Text><View style={styles.segmented}>{categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.segment, category === item && styles.segmentActive]}><Text style={[styles.segmentText, category === item && styles.segmentTextActive]}>{labels[item]}</Text></Pressable>)}</View><Text style={styles.label}>รายละเอียด</Text><TextInput multiline onChangeText={setContent} placeholder="พิมพ์เนื้อหาโน้ต" placeholderTextColor="#9ea69d" style={[styles.field, {height: 150, paddingTop: 12, textAlignVertical: 'top'}]} value={content} /><PrimaryButton disabled={saving} label={saving ? 'กำลังบันทึก...' : 'บันทึกโน้ต'} onPress={save} /></Card></UserShell>;
}
