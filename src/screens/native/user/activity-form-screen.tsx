import {useMemo, useState} from 'react';
import {Alert, Pressable, Text, TextInput, View} from 'react-native';

import {runLegacyDataAction} from '@/services/legacy-data';
import {Card, PrimaryButton, UserHeader, UserShell, type UserNavigate, userStyles as styles} from './user-ui';

type FormPage = 'smartlife_add_activity' | 'smartlife_add_task' | 'smartlife_add_appointment' | 'smartlife_add_income' | 'smartlife_save_activity' | 'smartlife_save_task' | 'smartlife_save_appointment';
type TransactionKind = 'income' | 'expense';

const colors = ['#6f966f', '#9297bb', '#d06d62', '#d9a844', '#6c9db6', '#ad7cae'];

function config(page: FormPage) {
  if (page.includes('income')) return {action: 'create-transaction', title: 'เพิ่มรายการการเงิน', type: 'income', target: 'smartlife_finance_day'};
  if (page.includes('task')) return {action: 'create-activity', title: 'เพิ่มงาน', type: 'task', target: 'smartlife_calendar_day'};
  if (page.includes('appointment')) return {action: 'create-activity', title: 'เพิ่มนัดหมาย', type: 'appointment', target: 'smartlife_calendar_day'};
  return {action: 'create-activity', title: 'เพิ่มกิจกรรม', type: 'activity', target: 'smartlife_calendar_day'};
}

export default function ActivityFormScreen({page, uid, onNavigate}: {page: FormPage; uid: string; onNavigate: UserNavigate}) {
  const form = useMemo(() => config(page), [page]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('ทั่วไป');
  const [transactionType, setTransactionType] = useState<TransactionKind>('expense');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 16));
  const [color, setColor] = useState(colors[0]);
  const [saving, setSaving] = useState(false);

  const isTransaction = form.action === 'create-transaction';

  const save = async () => {
    if (!title.trim()) return Alert.alert('กรอกชื่อรายการก่อนบันทึก');
    setSaving(true);
    try {
      const payload = isTransaction
        ? {type: transactionType, amount, merchant: title, category, occurredAt: date}
        : {title, type: form.type, location, color, startAt: date, endAt: new Date(new Date(date).getTime() + 60 * 60 * 1000).toISOString()};
      await runLegacyDataAction(uid, `user/${page}`, {action: form.action, payload});
      Alert.alert('บันทึกสำเร็จ', 'ข้อมูลถูกเพิ่มใน Firebase แล้ว');
      onNavigate(form.target);
    } catch (error) {
      Alert.alert('บันทึกไม่สำเร็จ', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  return <UserShell active={isTransaction ? 'smartlife_finance_day' : 'smartlife_calendar_day'} onNavigate={onNavigate}>
    <UserHeader onNavigate={onNavigate} subtitle="บันทึกข้อมูลจริงลง Firebase" title={form.title} />
    <Card>
      {isTransaction ? <View style={styles.segmented}>
        {(['expense', 'income'] as TransactionKind[]).map((type) => <Pressable key={type} onPress={() => setTransactionType(type)} style={[styles.segment, transactionType === type && styles.segmentActive]}>
          <Text style={[styles.segmentText, transactionType === type && styles.segmentTextActive]}>{type === 'expense' ? 'รายจ่าย' : 'รายรับ'}</Text>
        </Pressable>)}
      </View> : null}
      <Text style={styles.label}>{isTransaction ? 'ชื่อร้านหรือแหล่งเงิน' : 'ชื่อรายการ'}</Text>
      <TextInput onChangeText={setTitle} placeholder="พิมพ์ชื่อรายการ" placeholderTextColor="#a0a79e" style={styles.field} value={title} />
      {isTransaction ? <>
        <Text style={styles.label}>จำนวนเงิน</Text>
        <TextInput keyboardType="numeric" onChangeText={setAmount} placeholder="0" placeholderTextColor="#a0a79e" style={styles.field} value={amount} />
        <Text style={styles.label}>หมวดหมู่</Text>
        <TextInput onChangeText={setCategory} placeholder="เช่น อาหาร เดินทาง รายได้" placeholderTextColor="#a0a79e" style={styles.field} value={category} />
        <Text style={styles.label}>วันและเวลา</Text>
        <TextInput onChangeText={setDate} style={styles.field} value={date} />
      </> : <>
        <Text style={styles.label}>วันและเวลา</Text>
        <TextInput onChangeText={setDate} style={styles.field} value={date} />
        <Text style={styles.label}>สถานที่</Text>
        <TextInput onChangeText={setLocation} placeholder="เพิ่มสถานที่" placeholderTextColor="#a0a79e" style={styles.field} value={location} />
        <Text style={styles.label}>สีของรายการ</Text>
        <View style={styles.actionRow}>{colors.map((item) => <Pressable key={item} onPress={() => setColor(item)} style={{backgroundColor: item, borderColor: color === item ? '#29351f' : '#fff', borderRadius: 16, borderWidth: 3, height: 31, width: 31}} />)}</View>
      </>}
      <PrimaryButton disabled={saving} label={saving ? 'กำลังบันทึก...' : 'บันทึกรายการ'} onPress={save} />
    </Card>
  </UserShell>;
}
