/* eslint-disable react-hooks/set-state-in-effect */
import {useCallback, useEffect, useState} from 'react';
import {Pressable, Text, TextInput, View} from 'react-native';

import {loadLegacyPageData} from '@/services/legacy-data';
import {Card, EmptyBlock, LoadingBlock, PrimaryButton, UserHeader, UserShell, type UserNavigate, userStyles as styles} from './user-ui';

type Recommendation = {id?: string; title?: string; explanation?: string; contextSources?: string[]; createdAt?: string};

export default function AssistantScreen({page, uid, onNavigate}: {page: string; uid: string; onNavigate: UserNavigate}) {
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [question, setQuestion] = useState('วันนี้ฉันมีเรียนกี่โมง?');
  const load = useCallback(async () => { const result = await loadLegacyPageData(uid, 'user/smartlife_ai_assistant') as {recommendations?: Recommendation[]}; setItems(result.recommendations ?? []); }, [uid]);
  useEffect(() => { load().catch(() => setItems([])); }, [load]);
  return <UserShell onNavigate={onNavigate}><UserHeader onNavigate={onNavigate} title="AI Assistant" subtitle="คำแนะนำจากข้อมูลจริงของคุณ" /><Card style={{backgroundColor: '#92a98f'}}><Text style={[styles.cardTitle, {color: '#fff'}]}>ถาม SmartLife</Text><TextInput onChangeText={setQuestion} style={[styles.field, {backgroundColor: '#fff', marginTop: 12}]} value={question} /><PrimaryButton label="ส่งคำถาม" onPress={() => onNavigate('smartlife_ai_activity')} /></Card>{items === null ? <LoadingBlock /> : <Card><Text style={styles.cardTitle}>AI แนะนำสำหรับคุณ</Text>{items.length ? items.map((item) => <View key={item.id} style={styles.row}><View style={[styles.rowDot, {backgroundColor: '#9297bb'}]} /><View style={{flex: 1}}><Text style={styles.rowMain}>{item.title || 'คำแนะนำ SmartLife'}</Text><Text style={styles.rowSub}>{item.explanation || 'อ้างอิงข้อมูลตารางเรียน โน้ต และการเงิน'}</Text>{item.contextSources?.length ? <Text style={[styles.rowSub, {color: '#668d65'}]}>ใช้ข้อมูล: {item.contextSources.join(', ')}</Text> : null}</View></View>) : <EmptyBlock label="ยังไม่มีคำแนะนำจาก AI" />}</Card>}<View style={styles.actionRow}><Pressable onPress={() => onNavigate('smartlife_ai_activity')} style={{flex: 1}}><Text style={styles.badge}>แนะนำกิจกรรม</Text></Pressable><Pressable onPress={() => onNavigate('smartlife_ai_note')} style={{flex: 1}}><Text style={styles.badge}>แนะนำโน้ต</Text></Pressable></View></UserShell>;
}
