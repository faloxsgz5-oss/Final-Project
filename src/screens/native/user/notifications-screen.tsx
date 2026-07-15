/* eslint-disable react-hooks/set-state-in-effect */
import {useCallback, useEffect, useState} from 'react';
import {Pressable, Text, View} from 'react-native';

import {loadLegacyPageData, runLegacyDataAction} from '@/services/legacy-data';
import {Card, EmptyBlock, LoadingBlock, UserHeader, UserShell, type UserNavigate, userStyles as styles} from './user-ui';

type Page = 'smartlife_notifications' | 'smartlife_notifications_urgent' | 'smartlife_notifications_ai' | 'smartlife_notifications_finance' | 'smartlife_notifications_schedule';
type Notification = {id?: string; title?: string; message?: string; kind?: string; createdAt?: string; read?: boolean};
const tabs: [string, Page][] = [['ทั้งหมด', 'smartlife_notifications'], ['ด่วน', 'smartlife_notifications_urgent'], ['AI', 'smartlife_notifications_ai'], ['การเงิน', 'smartlife_notifications_finance'], ['ตาราง', 'smartlife_notifications_schedule']];

export default function NotificationsScreen({page, uid, onNavigate}: {page: Page; uid: string; onNavigate: UserNavigate}) {
  const [items, setItems] = useState<Notification[] | null>(null);
  const load = useCallback(async () => { const result = await loadLegacyPageData(uid, `user/${page}`) as {notifications?: Notification[]}; setItems(result.notifications ?? []); }, [page, uid]);
  useEffect(() => { load().catch(() => setItems([])); }, [load]);
  const markRead = async (id?: string) => { if (!id) return; await runLegacyDataAction(uid, `user/${page}`, {action: 'mark-notification-read', payload: {id}}); setItems((current) => current?.map((item) => item.id === id ? {...item, read: true} : item) ?? current); };
  return <UserShell onNavigate={onNavigate}><UserHeader onNavigate={onNavigate} title="การแจ้งเตือน" subtitle="สิ่งสำคัญสำหรับวันนี้" /><View style={styles.segmented}>{tabs.map(([label, target]) => <Pressable key={target} onPress={() => onNavigate(target)} style={[styles.segment, target === page && styles.segmentActive]}><Text style={[styles.segmentText, target === page && styles.segmentTextActive]}>{label}</Text></Pressable>)}</View>{items === null ? <LoadingBlock /> : <Card><Text style={styles.cardTitle}>ล่าสุด</Text>{items.length ? items.map((item) => <Pressable key={item.id} onPress={() => markRead(item.id)} style={[styles.row, !item.read && page === 'smartlife_notifications_urgent' ? {backgroundColor: '#fff1ef'} : null]}><View style={[styles.rowDot, {backgroundColor: item.read ? '#a3aaa1' : page === 'smartlife_notifications_urgent' ? '#d9675f' : '#668d65'}]} /><View style={{flex: 1}}><Text style={styles.rowMain}>{item.title || 'การแจ้งเตือน SmartLife'}</Text><Text style={styles.rowSub}>{item.message || 'ไม่มีรายละเอียด'}</Text></View>{!item.read ? <Text style={styles.rowSide}>ใหม่</Text> : null}</Pressable>) : <EmptyBlock label="ไม่มีการแจ้งเตือนในหมวดนี้" />}</Card>}</UserShell>;
}
