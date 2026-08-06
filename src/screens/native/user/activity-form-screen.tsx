import {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import NativeDateTimePicker from '@expo/ui/community/datetime-picker';

import {runLegacyDataAction} from '@/services/legacy-data';
import {getActivitySuggestions, recommendationLevel, type ActivitySuggestion} from '@/services/smartlife-recommendations';
import {Card, MaterialIcon, PrimaryButton, UserHeader, UserShell, type UserNavigate, userStyles} from './user-ui';

type FormPage = 'smartlife_add_activity' | 'smartlife_add_task' | 'smartlife_add_appointment' | 'smartlife_add_income' | 'smartlife_save_activity' | 'smartlife_save_task' | 'smartlife_save_appointment';
type ActivityKind = 'activity' | 'task' | 'appointment';
type FormMode = 'manual' | 'ai';
type TransactionKind = 'income' | 'expense';

const colors = ['#5f875f', '#9297bb', '#d06d62', '#d9a844', '#6c9db6', '#ad7cae'];
const activityTypes: {icon: string; label: string; value: ActivityKind}[] = [
  {icon: 'calendar_month', label: 'คลาสเรียน', value: 'activity'},
  {icon: 'check_box', label: 'งาน', value: 'task'},
  {icon: 'location_on', label: 'นัดหมาย', value: 'appointment'},
];
const activityCopy: Record<ActivityKind, {details: string; due: string; location: string; reminder: string; save: string; title: string}> = {
  activity: {details: 'โน้ต', due: 'วันที่', location: 'สถานที่', reminder: 'แจ้งเตือน', save: 'บันทึกกิจกรรม', title: 'เพิ่มกิจกรรม'},
  task: {details: 'รายละเอียดงาน', due: 'กำหนดส่ง', location: 'วิชา / หมวดหมู่', reminder: 'ความสำคัญ', save: 'บันทึกงาน', title: 'เพิ่มงาน'},
  appointment: {details: 'โน้ตนัดหมาย', due: 'วันที่', location: 'สถานที่นัด', reminder: 'ผู้เกี่ยวข้อง', save: 'บันทึกนัดหมาย', title: 'เพิ่มนัดหมาย'},
};
const priorityOptions = [
  {description: 'ทำเมื่อมีเวลา', icon: 'low_priority', label: 'ต่ำ', value: 'low'},
  {description: 'สำคัญระดับปกติ', icon: 'radio_button_checked', label: 'ปกติ', value: 'normal'},
  {description: 'ควรทำก่อนรายการทั่วไป', icon: 'priority_high', label: 'สูง', value: 'high'},
  {description: 'ดันขึ้นลำดับแรกของ AI', icon: 'warning', label: 'ด่วน', value: 'urgent'},
];

function config(page: FormPage) {
  if (page.includes('income')) return {action: 'create-transaction', title: 'เพิ่มรายการการเงิน', type: 'income', target: 'smartlife_finance_day'};
  if (page.includes('task')) return {action: 'create-activity', title: 'เพิ่มงาน', type: 'task' as ActivityKind, target: 'smartlife_calendar_day'};
  if (page.includes('appointment')) return {action: 'create-activity', title: 'เพิ่มนัดหมาย', type: 'appointment' as ActivityKind, target: 'smartlife_calendar_day'};
  return {action: 'create-activity', title: 'เพิ่มกิจกรรม', type: 'activity' as ActivityKind, target: 'smartlife_calendar_day'};
}

function padTimePart(value: number) { return String(value).padStart(2, '0'); }
function dateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${padTimePart(now.getMonth() + 1)}-${padTimePart(now.getDate())}`;
}
function timeValue() {
  const now = new Date();
  return `${padTimePart(now.getHours())}:${padTimePart(now.getMinutes())}`;
}

function parseDateText(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseTimeText(value: string) {
  const [hourText, minuteText] = value.split(':');
  const date = new Date();
  date.setHours(Number(hourText) || 0, Number(minuteText) || 0, 0, 0);
  return date;
}

function formatDateText(value: Date) {
  return `${value.getFullYear()}-${padTimePart(value.getMonth() + 1)}-${padTimePart(value.getDate())}`;
}

function formatTimeText(value: Date) {
  return `${padTimePart(value.getHours())}:${padTimePart(value.getMinutes())}`;
}

function thaiDateText(value: string) {
  return new Intl.DateTimeFormat('th-TH', {dateStyle: 'medium', timeZone: 'Asia/Bangkok'}).format(parseDateText(value));
}

export default function ActivityFormScreen({page, uid, onNavigate}: {page: FormPage; uid: string; onNavigate: UserNavigate}) {
  const form = useMemo(() => config(page), [page]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(form.type === 'income' ? '\u0e40\u0e07\u0e34\u0e19\u0e42\u0e2d\u0e19' : '');
  const [transactionType, setTransactionType] = useState<TransactionKind>(form.type === 'income' ? 'income' : 'expense');
  const [activityType, setActivityType] = useState<ActivityKind>(form.type === 'income' ? 'activity' : form.type as ActivityKind);
  const [formMode, setFormMode] = useState<FormMode>('manual');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(dateValue);
  const [time, setTime] = useState(timeValue);
  const [pickerTarget, setPickerTarget] = useState<'date' | 'time' | null>(null);
  const [reminder, setReminder] = useState('');
  const [note, setNote] = useState('');
  const [attendees, setAttendees] = useState('');
  const [priority, setPriority] = useState('normal');
  const [color, setColor] = useState(colors[0]);
  const [aiSuggestions, setAiSuggestions] = useState<ActivitySuggestion[]>([]);
  const [loadingAiSuggestions, setLoadingAiSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const isTransaction = form.action === 'create-transaction';
  const copy = activityCopy[isTransaction ? 'activity' : activityType];

  useEffect(() => {
    if (isTransaction || formMode !== 'ai') return undefined;
    let active = true;
    getActivitySuggestions(uid)
      .then((items) => {
        if (active) setAiSuggestions(items);
      })
      .catch((error) => {
        console.error('[ActivityForm] Load AI suggestions failed', error);
        if (active) setAiSuggestions([]);
      })
      .finally(() => {
        if (active) setLoadingAiSuggestions(false);
      });
    return () => {
      active = false;
    };
  }, [formMode, isTransaction, uid]);

  const save = async () => {
    if (!title.trim()) return Alert.alert('กรอกชื่อรายการก่อนบันทึก');
    const parsedAmount = Number(amount.replace(/,/g, '').trim());
    if (isTransaction && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      return Alert.alert('กรอกจำนวนเงินให้ถูกต้อง');
    }
    const startDate = new Date(`${date}T${time}:00`);
    if (Number.isNaN(startDate.getTime())) return Alert.alert('ตรวจสอบวันที่และเวลาอีกครั้ง');
    setSaving(true);
    try {
      const payload = isTransaction
        ? {type: transactionType, amount: parsedAmount, merchant: title.trim(), category, note, occurredAt: startDate.toISOString()}
        : {title, type: activityType, location, color, note, reminder, category, priority, attendees, startAt: startDate.toISOString(), endAt: new Date(startDate.getTime() + 60 * 60 * 1000).toISOString()};
      await runLegacyDataAction(uid, `user/${page}`, {action: form.action, payload});
    } catch (error) {
      Alert.alert('บันทึกไม่สำเร็จ', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง');
      setSaving(false);
      return;
    }
    setSaving(false);
    Alert.alert(
      'บันทึกสำเร็จ',
      isTransaction
        ? `เพิ่มรายรับ ${parsedAmount.toLocaleString('th-TH')} บาทเรียบร้อยแล้ว`
        : `เพิ่ม${copy.title.replace('เพิ่ม', '')}ลงตารางเวลาแล้ว`,
    );
    onNavigate(form.target);
  };

  const useSuggestion = (suggestion: ActivitySuggestion) => {
    const startAt = new Date(suggestion.startAt);
    setActivityType(suggestion.type);
    setTitle(suggestion.title);
    setLocation(suggestion.location);
    setDate(formatDateText(startAt));
    setTime(formatTimeText(startAt));
    setPriority(suggestion.priority);
    setNote(`${suggestion.note}\n\nเหตุผลที่ AI เลือก: ${suggestion.reasons.join(', ')}`);
    setFormMode('manual');
  };
  const selectFormDateTime = (selectedDate?: Date | null) => {
    if (!selectedDate || !pickerTarget) return;
    if (pickerTarget === 'date') setDate(formatDateText(selectedDate));
    else setTime(formatTimeText(selectedDate));
    setPickerTarget(null);
  };

  if (isTransaction) return <IncomeForm amount={amount} category={category} date={date} note={note} onBack={() => onNavigate('smartlife_finance_day')} onNavigate={onNavigate} onSave={save} saving={saving} setAmount={setAmount} setCategory={setCategory} setDate={setDate} setNote={setNote} setTime={setTime} setTitle={setTitle} time={time} title={title} />;

  if (false && isTransaction) return <UserShell active="smartlife_finance_day" onNavigate={onNavigate}>
    <UserHeader onNavigate={onNavigate} subtitle="บันทึกข้อมูลลง Firebase" title={form.title} />
    <Card><View style={userStyles.segmented}>{(['expense', 'income'] as TransactionKind[]).map((type) => <Pressable key={type} onPress={() => setTransactionType(type)} style={[userStyles.segment, transactionType === type && userStyles.segmentActive]}><Text style={[userStyles.segmentText, transactionType === type && userStyles.segmentTextActive]}>{type === 'expense' ? 'รายจ่าย' : 'รายรับ'}</Text></Pressable>)}</View>
      <Text style={userStyles.label}>ชื่อร้านหรือแหล่งเงิน</Text><TextInput onChangeText={setTitle} placeholder="พิมพ์ชื่อรายการ" placeholderTextColor="#a0a79e" style={userStyles.field} value={title} />
      <Text style={userStyles.label}>จำนวนเงิน</Text><TextInput keyboardType="numeric" onChangeText={setAmount} placeholder="0" placeholderTextColor="#a0a79e" style={userStyles.field} value={amount} />
      <Text style={userStyles.label}>หมวดหมู่</Text><TextInput onChangeText={setCategory} placeholderTextColor="#a0a79e" style={userStyles.field} value={category} />
      <Text style={userStyles.label}>วันที่</Text><TextInput onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor="#a0a79e" style={userStyles.field} value={date} />
      <Text style={userStyles.label}>เวลา</Text><TextInput onChangeText={setTime} placeholder="HH:MM" placeholderTextColor="#a0a79e" style={userStyles.field} value={time} /><PrimaryButton disabled={saving} label={saving ? 'กำลังบันทึก...' : 'บันทึกรายการ'} onPress={save} />
    </Card>
  </UserShell>;

  return <UserShell active="smartlife_planner" onNavigate={onNavigate}>
    <View style={styles.page}>
      {/* Refactored UI: activity, task, appointment, and AI suggestion layouts share one existing save pipeline. */}
      <View style={styles.header}><Text style={styles.title}>{formMode === 'ai' ? 'AI แนะนำ' : copy.title}</Text><Pressable accessibilityLabel="ปิด" onPress={() => onNavigate('smartlife_planner')} style={styles.close}><MaterialIcon color="#354133" name="close" size={21} /></Pressable></View>
      <View style={styles.modeToggle}><Pressable onPress={() => setFormMode('manual')} style={[styles.mode, formMode === 'manual' && styles.modeActive]}><Text style={[styles.modeText, formMode === 'manual' && styles.modeTextActive]}>เพิ่มเอง</Text></Pressable><Pressable onPress={() => { setLoadingAiSuggestions(true); setFormMode('ai'); }} style={[styles.mode, formMode === 'ai' && styles.modeActive]}><Text style={[styles.modeText, formMode === 'ai' && styles.modeTextActive]}>AI แนะนำ</Text></Pressable></View>
      {formMode === 'ai' ? <AiSuggestions loading={loadingAiSuggestions} onUse={useSuggestion} suggestions={aiSuggestions} /> : <>
        <View style={styles.typeRow}>{activityTypes.map((item) => <Pressable key={item.value} onPress={() => setActivityType(item.value)} style={[styles.typeCard, activityType === item.value && styles.typeCardActive]}><MaterialIcon color={activityType === item.value ? '#ffffff' : '#778477'} name={item.icon} size={20} /><Text style={[styles.typeText, activityType === item.value && styles.typeTextActive]}>{item.label}</Text></Pressable>)}</View>
        <View style={styles.formCard}>
          <FieldLabel label={activityType === 'task' ? 'ชื่องาน' : activityType === 'appointment' ? 'ชื่อนัดหมาย' : 'ชื่อกิจกรรม'} /><Input icon="format_align_left" onChangeText={setTitle} placeholder={activityType === 'task' ? 'แตะเพื่อพิมพ์ชื่องาน' : activityType === 'appointment' ? 'แตะเพื่อพิมพ์ชื่อนัดหมาย' : 'แตะเพื่อพิมพ์ชื่อกิจกรรม'} value={title} />
          <View style={styles.twoColumn}><View style={styles.column}><FieldLabel label={copy.due} /><PickerButton icon="event" label="วันที่" onPress={() => setPickerTarget('date')} value={thaiDateText(date)} /></View><View style={styles.column}><FieldLabel label={activityType === 'appointment' ? 'ช่วงเวลา' : activityType === 'task' ? 'เวลาเตือน' : 'เวลา'} /><PickerButton icon="schedule" label="เวลา" onPress={() => setPickerTarget('time')} value={time} /></View></View>
          {pickerTarget ? <NativeDateTimePicker accentColor="#638363" is24Hour mode={pickerTarget} onDismiss={() => setPickerTarget(null)} onValueChange={(_, selectedDate) => selectFormDateTime(selectedDate)} presentation="dialog" value={pickerTarget === 'date' ? parseDateText(date) : parseTimeText(time)} /> : null}
          <FieldLabel label={copy.location} /><Input icon="location_on" onChangeText={setLocation} placeholder={activityType === 'task' ? 'เลือกวิชาหรือหมวดงาน' : activityType === 'appointment' ? 'เพิ่มสถานที่นัด' : 'เพิ่มสถานที่'} value={location} />
          {activityType === 'task' ? <><FieldLabel label="ความสำคัญ" /><View style={styles.priorityGrid}>{priorityOptions.map((item) => <Pressable accessibilityLabel={`เลือกความสำคัญ${item.label}`} key={item.value} onPress={() => setPriority(item.value)} style={({pressed}) => [styles.priorityOption, priority === item.value && styles.priorityOptionActive, pressed && styles.pressed]}><View style={[styles.priorityIcon, priority === item.value && styles.priorityIconActive]}><MaterialIcon color={priority === item.value ? '#fff' : '#638363'} name={item.icon} size={17} /></View><View style={{flex: 1}}><Text style={[styles.priorityLabel, priority === item.value && styles.priorityLabelActive]}>{item.label}</Text><Text style={[styles.priorityDescription, priority === item.value && styles.priorityDescriptionActive]}>{item.description}</Text></View></Pressable>)}</View></> : activityType === 'appointment' ? <><FieldLabel label="ผู้เกี่ยวข้อง" /><Input icon="person_outline" onChangeText={setAttendees} placeholder="เพิ่มชื่อเพื่อนหรือกลุ่ม" value={attendees} /></> : <><FieldLabel label="แจ้งเตือน" /><Input icon="notifications_none" onChangeText={setReminder} placeholder="เลือกเวลาแจ้งเตือน" value={reminder} /></>}
          <FieldLabel label={copy.details} /><TextInput multiline onChangeText={setNote} placeholder={activityType === 'task' ? 'เพิ่มรายละเอียด เช่น rubric ไฟล์แนบ หรือสิ่งที่ต้องส่ง' : activityType === 'appointment' ? 'เพิ่มรายละเอียด เช่น จุดนัดพบ สิ่งที่ต้องเตรียม หรือหัวข้อที่จะคุย' : 'เพิ่มรายละเอียด เช่น สิ่งที่ต้องเตรียม หรือไฟล์ที่ต้องส่ง'} placeholderTextColor="#879186" style={styles.noteInput} textAlignVertical="top" value={note} />
          <Text style={styles.colorLabel}>สีของรายการ</Text><View style={styles.colorRow}>{colors.map((item) => <Pressable accessibilityLabel={`เลือกสี ${item}`} key={item} onPress={() => setColor(item)} style={[styles.color, {backgroundColor: item}, color === item && styles.colorSelected]} />)}</View>
          <Pressable disabled={saving} onPress={save} style={[styles.saveShell, saving && styles.disabled]}><LinearGradient colors={['#6f966f', '#476d43']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={styles.save}><Text style={styles.saveText}>{saving ? 'กำลังบันทึก...' : copy.save}</Text></LinearGradient></Pressable>
        </View>
        <View style={styles.aiCard}><Text style={styles.aiTitle}>{activityType === 'task' ? 'AI ช่วยแตกงานย่อย' : 'AI ช่วยแนะนำช่วงว่าง'}</Text><Text style={styles.aiText}>{activityType === 'task' ? 'ให้ระบบช่วยแยกงานเป็น checklist และแนะนำช่วงเวลาทำงานที่ไม่ชนตารางเรียนได้' : 'ระบบจะช่วยดูช่วงเวลาว่างและแนะนำกิจกรรมให้เหมาะกับตารางของคุณ'}</Text><View style={styles.aiActions}><Pressable onPress={() => setFormMode('ai')} style={styles.aiPrimary}><Text style={styles.aiPrimaryText}>ใช้คำแนะนำ</Text></Pressable><Pressable onPress={() => setFormMode('ai')} style={styles.aiSecondary}><Text style={styles.aiSecondaryText}>ดูตัวอย่าง</Text></Pressable></View></View>
      </>}
    </View>
  </UserShell>;
}

function IncomeForm({amount, category, date, note, onBack, onNavigate, onSave, saving, setAmount, setCategory, setDate, setNote, setTime, setTitle, time, title}: {amount: string; category: string; date: string; note: string; onBack: () => void; onNavigate: UserNavigate; onSave: () => void; saving: boolean; setAmount: (value: string) => void; setCategory: (value: string) => void; setDate: (value: string) => void; setNote: (value: string) => void; setTime: (value: string) => void; setTitle: (value: string) => void; time: string; title: string}) {
  const sources = [{icon: 'home', label: 'จากบ้าน', value: 'เงินโอน'}, {icon: 'work', label: 'งานพิเศษ', value: 'รายได้'}, {icon: 'account_balance', label: 'ทุน', value: 'ทุนการศึกษา'}, {icon: 'receipt_long', label: 'เงินคืน', value: 'คืนเงิน'}];
  const selected = sources.find((source) => source.value === category)?.value ?? sources[0].value;
  const [pickerTarget, setPickerTarget] = useState<'date' | 'time' | null>(null);
  const selectDateTime = (selectedDate?: Date | null) => {
    if (!selectedDate || !pickerTarget) return;
    if (pickerTarget === 'date') setDate(formatDateText(selectedDate));
    else setTime(formatTimeText(selectedDate));
    setPickerTarget(null);
  };
  return <UserShell active="smartlife_finance_day" onNavigate={onNavigate}>
    <View style={incomeStyles.page}>
      {/* Refactored UI: dedicated income form preserves the existing transaction save flow. */}
      <View style={incomeStyles.header}><Pressable onPress={onBack} style={incomeStyles.back}><MaterialIcon color="#344035" name="chevron_left" size={25} /></Pressable><View style={{flex: 1}}><Text style={incomeStyles.eyebrow}>รายรับใหม่</Text><Text style={incomeStyles.title}>เพิ่มรายรับเอง</Text></View><Pressable disabled={saving} onPress={onSave} style={[incomeStyles.done, saving && incomeStyles.disabled]}><MaterialIcon color="#fff" name="check" size={22} /></Pressable></View>
      <LinearGradient colors={['#6270aa', '#9199c2']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={incomeStyles.amountCard}><Text style={incomeStyles.amountLabel}>จำนวนเงิน</Text><View style={incomeStyles.amountRow}><Text style={incomeStyles.currency}>฿</Text><TextInput keyboardType="numeric" onChangeText={setAmount} placeholder="0" placeholderTextColor="rgba(255,255,255,.68)" style={incomeStyles.amountInput} value={amount} /></View></LinearGradient>
      <View style={incomeStyles.formCard}><Text style={incomeStyles.label}>แหล่งที่มา</Text><View style={incomeStyles.sourceGrid}>{sources.map((source) => <Pressable key={source.value} onPress={() => setCategory(source.value)} style={[incomeStyles.source, selected === source.value && incomeStyles.sourceActive]}><View style={[incomeStyles.sourceIcon, selected === source.value && incomeStyles.sourceIconActive]}><MaterialIcon color={selected === source.value ? '#fff' : '#6b8a68'} name={source.icon} size={18} /></View><View><Text style={incomeStyles.sourceTitle}>{source.label}</Text><Text style={incomeStyles.sourceSub}>{source.value}</Text></View></Pressable>)}</View>
        <Text style={incomeStyles.label}>ชื่อรายการ</Text><TextInput onChangeText={setTitle} placeholder="เงินโอนจากบ้าน" placeholderTextColor="#879087" style={incomeStyles.input} value={title} />
        <Text style={incomeStyles.label}>วันที่</Text><View style={incomeStyles.dateRow}><Pressable accessibilityLabel="เลือกรายรับวันที่" onPress={() => setPickerTarget('date')} style={({pressed}) => [incomeStyles.pickerButton, {flex: 1}, pressed && incomeStyles.pressed]}><MaterialIcon color="#6b8a68" name="event" size={18} /><View style={{flex: 1}}><Text style={incomeStyles.pickerLabel}>วันที่</Text><Text style={incomeStyles.pickerValue}>{thaiDateText(date)}</Text></View></Pressable><Pressable accessibilityLabel="เลือกรายรับเวลา" onPress={() => setPickerTarget('time')} style={({pressed}) => [incomeStyles.pickerButton, {flex: .7}, pressed && incomeStyles.pressed]}><MaterialIcon color="#6b8a68" name="schedule" size={18} /><View style={{flex: 1}}><Text style={incomeStyles.pickerLabel}>เวลา</Text><Text style={incomeStyles.pickerValue}>{time}</Text></View></Pressable></View>
        {pickerTarget ? <NativeDateTimePicker accentColor="#6b8a68" is24Hour mode={pickerTarget} onDismiss={() => setPickerTarget(null)} onValueChange={(_, selectedDate) => selectDateTime(selectedDate)} presentation="dialog" value={pickerTarget === 'date' ? parseDateText(date) : parseTimeText(time)} /> : null}
        <Text style={incomeStyles.label}>หมายเหตุ</Text><TextInput multiline onChangeText={setNote} placeholder="เงินสำหรับค่าอาหารและเดินทางสัปดาห์นี้" placeholderTextColor="#879087" style={incomeStyles.note} textAlignVertical="top" value={note} />
      </View><View style={incomeStyles.statRow}><IncomeStat label="หลังบันทึก" value={`รายรับ +฿${Number(amount || 0).toLocaleString('th-TH')}`} /><IncomeStat label="ยอดวันนี้" value={`฿${Number(amount || 0).toLocaleString('th-TH')}`} /></View><Pressable disabled={saving} onPress={onSave} style={[incomeStyles.saveShell, saving && incomeStyles.disabled]}><LinearGradient colors={['#2b3916', '#1e2b0f']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={incomeStyles.save}><MaterialIcon color="#fff" name="check" size={18} /><Text style={incomeStyles.saveText}>{saving ? 'กำลังบันทึก...' : 'บันทึกรายรับ'}</Text></LinearGradient></Pressable>
    </View>
  </UserShell>;
}
function IncomeStat({label, value}: {label: string; value: string}) { return <View style={incomeStyles.stat}><Text style={incomeStyles.statLabel}>{label}</Text><Text style={incomeStyles.statValue}>{value}</Text></View>; }
function AiSuggestions({loading, onUse, suggestions}: {loading: boolean; onUse: (suggestion: ActivitySuggestion) => void; suggestions: ActivitySuggestion[]}) {
  return <View style={styles.suggestionArea}>
    <LinearGradient colors={['#6f966f', '#9ab0a0']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={styles.suggestionHero}>
      <Text style={styles.suggestionHeroTitle}>พบช่วงว่างที่เหมาะกับกิจกรรม</Text>
      <Text style={styles.suggestionHeroText}>AI ดูจากตารางเรียน งานที่ต้องส่ง ความสำคัญที่เลือก และช่องว่างจริง แล้วให้คะแนน 0-100 ก่อนเสนอรายการ</Text>
    </LinearGradient>
    {loading ? <View style={styles.emptyAi}><ActivityIndicator color="#5f875f" /><Text style={styles.emptyAiText}>กำลังวิเคราะห์ข้อมูลจาก Firebase...</Text></View> : null}
    {!loading && suggestions.length === 0 ? <View style={styles.emptyAi}><MaterialIcon color="#7f8c7d" name="info" size={20} /><Text style={styles.emptyAiText}>ยังไม่มีคำแนะนำพอให้สร้างอัตโนมัติ ลองเพิ่มตารางเรียน งาน หรือกำหนดความสำคัญก่อน</Text></View> : null}
    {!loading && suggestions.map((suggestion) => <View key={`${suggestion.title}-${suggestion.startAt}`} style={styles.suggestionCard}>
      <View style={styles.suggestionCardHead}><Text style={styles.suggestionTitle}>{suggestion.title}</Text><View style={styles.scoreBadge}><Text style={styles.scoreBadgeText}>{recommendationLevel(suggestion.score)}</Text></View></View>
      <Text style={styles.suggestionText}>{suggestion.detail}</Text>
      <View style={styles.tagRow}><Tag label="วันนี้" /><Tag label={suggestion.time} /><Tag label={suggestion.location} /></View>
      <View style={styles.reasonRow}>{suggestion.reasons.slice(0, 3).map((reason) => <Tag key={reason} label={reason} />)}</View>
      <Pressable onPress={() => onUse(suggestion)} style={styles.useSuggestion}><Text style={styles.useSuggestionText}>ใช้กิจกรรมนี้</Text></Pressable>
    </View>)}
  </View>;
}
function Tag({label}: {label: string}) { return <View style={styles.tag}><Text style={styles.tagText}>{label}</Text></View>; }
function FieldLabel({label}: {label: string}) { return <Text style={styles.label}>{label}</Text>; }
function Input({icon, ...props}: {icon?: string} & React.ComponentProps<typeof TextInput>) { return <View style={styles.inputShell}>{icon ? <MaterialIcon color="#638363" name={icon} size={18} /> : null}<TextInput placeholderTextColor="#879186" style={styles.input} {...props} /></View>; }
function PickerButton({icon, label, onPress, value}: {icon: string; label: string; onPress: () => void; value: string}) { return <Pressable onPress={onPress} style={({pressed}) => [styles.pickerButton, pressed && styles.pressed]}><MaterialIcon color="#638363" name={icon} size={18} /><View style={{flex: 1}}><Text style={styles.pickerLabel}>{label}</Text><Text style={styles.pickerValue}>{value}</Text></View></Pressable>; }

const incomeStyles = StyleSheet.create({
  amountCard: {borderRadius: 20, marginTop: 14, padding: 16}, amountInput: {color: '#fff', flex: 1, fontFamily: 'Prompt_800ExtraBold', fontSize: 34, padding: 0}, amountLabel: {color: 'rgba(255,255,255,.88)', fontFamily: 'Prompt_600SemiBold', fontSize: 11}, amountRow: {alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 10}, back: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, height: 43, justifyContent: 'center', width: 43}, currency: {color: '#fff', fontFamily: 'Prompt_800ExtraBold', fontSize: 31}, dateRow: {flexDirection: 'row', gap: 8}, disabled: {opacity: .55}, done: {alignItems: 'center', backgroundColor: '#6270aa', borderRadius: 17, height: 43, justifyContent: 'center', width: 43}, eyebrow: {color: '#698668', fontFamily: 'Prompt_700Bold', fontSize: 9}, formCard: {backgroundColor: '#fff', borderRadius: 21, boxShadow: '0 8px 19px rgba(43,57,41,.08)', marginTop: 14, padding: 14}, header: {alignItems: 'center', flexDirection: 'row', gap: 10}, input: {backgroundColor: '#f8faf6', borderColor: '#e0e6dd', borderRadius: 14, borderWidth: 1, color: '#344035', fontFamily: 'Prompt_700Bold', fontSize: 12, minHeight: 44, paddingHorizontal: 12}, label: {color: '#788178', fontFamily: 'Prompt_700Bold', fontSize: 10, marginBottom: 6, marginTop: 13}, note: {backgroundColor: '#f8faf6', borderColor: '#e0e6dd', borderRadius: 14, borderWidth: 1, color: '#344035', fontFamily: 'Prompt_500Medium', fontSize: 11, minHeight: 78, padding: 12}, page: {paddingBottom: 5}, pickerButton: {alignItems: 'center', backgroundColor: '#f8faf6', borderColor: '#e0e6dd', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 58, paddingHorizontal: 12}, pickerLabel: {color: '#879087', fontFamily: 'Prompt_600SemiBold', fontSize: 8}, pickerValue: {color: '#344035', fontFamily: 'Prompt_700Bold', fontSize: 12, marginTop: 1}, pressed: {opacity: .78, transform: [{scale: .987}]}, save: {alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 50}, saveShell: {borderRadius: 16, marginTop: 14, overflow: 'hidden'}, saveText: {color: '#fff', fontFamily: 'Prompt_700Bold', fontSize: 14}, source: {alignItems: 'center', backgroundColor: '#f8faf6', borderColor: '#e0e6dd', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 9, width: '48.5%'}, sourceActive: {backgroundColor: '#eff1fb', borderColor: '#aeb8df'}, sourceGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8}, sourceIcon: {alignItems: 'center', backgroundColor: '#e7f0e4', borderRadius: 12, height: 32, justifyContent: 'center', width: 32}, sourceIconActive: {backgroundColor: '#8792c2'}, sourceSub: {color: '#8c948b', fontFamily: 'Prompt_400Regular', fontSize: 7, marginTop: 1}, sourceTitle: {color: '#374136', fontFamily: 'Prompt_700Bold', fontSize: 10}, stat: {backgroundColor: '#fff', borderRadius: 17, flex: 1, padding: 12}, statLabel: {color: '#8a9389', fontFamily: 'Prompt_600SemiBold', fontSize: 8}, statRow: {flexDirection: 'row', gap: 10, marginTop: 14}, statValue: {color: '#31402e', fontFamily: 'Prompt_800ExtraBold', fontSize: 13, marginTop: 3}, title: {color: '#344035', fontFamily: 'Prompt_800ExtraBold', fontSize: 20},
});

const styles = StyleSheet.create({
  aiActions: {flexDirection: 'row', gap: 9, marginTop: 12}, aiCard: {backgroundColor: '#edf4eb', borderRadius: 20, marginTop: 16, padding: 15}, aiPrimary: {alignItems: 'center', backgroundColor: '#5f875f', borderRadius: 11, flex: 1, minHeight: 35, justifyContent: 'center'}, aiPrimaryText: {color: '#fff', fontFamily: 'Prompt_700Bold', fontSize: 10}, aiSecondary: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 11, flex: 1, justifyContent: 'center', minHeight: 35}, aiSecondaryText: {color: '#5a7759', fontFamily: 'Prompt_700Bold', fontSize: 10}, aiText: {color: '#70806f', fontFamily: 'Prompt_400Regular', fontSize: 10, lineHeight: 15, marginTop: 3}, aiTitle: {color: '#2e3c2e', fontFamily: 'Prompt_700Bold', fontSize: 12}, close: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, height: 40, justifyContent: 'center', width: 40}, color: {borderColor: '#fff', borderRadius: 15, borderWidth: 3, height: 30, width: 30}, colorLabel: {color: '#344235', fontFamily: 'Prompt_700Bold', fontSize: 11, marginTop: 15}, colorRow: {flexDirection: 'row', gap: 7, marginTop: 7}, colorSelected: {borderColor: '#2e3c2e', transform: [{scale: 1.08}]}, column: {flex: 1}, disabled: {opacity: .55}, emptyAi: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, gap: 8, justifyContent: 'center', minHeight: 86, padding: 14}, emptyAiText: {color: '#6b7669', fontFamily: 'Prompt_500Medium', fontSize: 10, lineHeight: 16, textAlign: 'center'}, formCard: {backgroundColor: '#fff', borderRadius: 22, boxShadow: '0 8px 20px rgba(42,58,42,.08)', marginTop: 12, padding: 15}, header: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'}, input: {color: '#354133', flex: 1, fontFamily: 'Prompt_500Medium', fontSize: 12, minHeight: 42, paddingHorizontal: 10}, inputShell: {alignItems: 'center', backgroundColor: '#f7f9f5', borderColor: '#e0e7de', borderRadius: 14, borderWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: 11}, label: {color: '#344235', fontFamily: 'Prompt_700Bold', fontSize: 11, marginBottom: 6, marginTop: 13}, mode: {alignItems: 'center', borderRadius: 14, flex: 1, justifyContent: 'center', minHeight: 39}, modeActive: {backgroundColor: '#5f875f'}, modeText: {color: '#778477', fontFamily: 'Prompt_700Bold', fontSize: 11}, modeTextActive: {color: '#fff'}, modeToggle: {backgroundColor: '#e8eee5', borderRadius: 17, flexDirection: 'row', marginTop: 12, padding: 4}, noteInput: {backgroundColor: '#f7f9f5', borderColor: '#e0e7de', borderRadius: 14, borderWidth: 1, color: '#354133', fontFamily: 'Prompt_400Regular', fontSize: 12, minHeight: 96, padding: 12}, page: {paddingBottom: 6}, pickerButton: {alignItems: 'center', backgroundColor: '#f7f9f5', borderColor: '#e0e7de', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 52, paddingHorizontal: 11}, pickerLabel: {color: '#7c8879', fontFamily: 'Prompt_600SemiBold', fontSize: 8}, pickerValue: {color: '#354133', fontFamily: 'Prompt_700Bold', fontSize: 11, marginTop: 1}, pressed: {opacity: .78, transform: [{scale: .987}]}, priorityDescription: {color: '#7a8677', fontFamily: 'Prompt_400Regular', fontSize: 8, marginTop: 1}, priorityDescriptionActive: {color: 'rgba(255,255,255,.84)'}, priorityGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8}, priorityIcon: {alignItems: 'center', backgroundColor: '#e8efe5', borderRadius: 12, height: 32, justifyContent: 'center', width: 32}, priorityIconActive: {backgroundColor: 'rgba(255,255,255,.22)'}, priorityLabel: {color: '#354133', fontFamily: 'Prompt_800ExtraBold', fontSize: 11}, priorityLabelActive: {color: '#fff'}, priorityOption: {alignItems: 'center', backgroundColor: '#f7f9f5', borderColor: '#e0e7de', borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 58, padding: 9, width: '48.5%'}, priorityOptionActive: {backgroundColor: '#5f875f', borderColor: '#5f875f'}, reasonRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7}, save: {alignItems: 'center', justifyContent: 'center', minHeight: 50}, saveShell: {borderRadius: 16, marginTop: 15, overflow: 'hidden'}, saveText: {color: '#fff', fontFamily: 'Prompt_700Bold', fontSize: 14}, scoreBadge: {alignItems: 'center', backgroundColor: '#edf2eb', borderRadius: 99, minWidth: 33, paddingHorizontal: 8, paddingVertical: 4}, scoreBadgeText: {color: '#5f875f', fontFamily: 'Prompt_800ExtraBold', fontSize: 10}, suggestionArea: {gap: 10, marginTop: 16}, suggestionCard: {backgroundColor: '#fff', borderRadius: 20, boxShadow: '0 6px 18px rgba(42,58,42,.07)', padding: 14}, suggestionCardHead: {alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between'}, suggestionHero: {borderRadius: 20, padding: 16}, suggestionHeroText: {color: 'rgba(255,255,255,.88)', fontFamily: 'Prompt_400Regular', fontSize: 10, lineHeight: 15, marginTop: 4}, suggestionHeroTitle: {color: '#fff', fontFamily: 'Prompt_800ExtraBold', fontSize: 15}, suggestionText: {color: '#657164', fontFamily: 'Prompt_400Regular', fontSize: 10, lineHeight: 15, marginTop: 5}, suggestionTitle: {color: '#314032', flex: 1, fontFamily: 'Prompt_800ExtraBold', fontSize: 14}, tag: {backgroundColor: '#edf2eb', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4}, tagRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10}, tagText: {color: '#687767', fontFamily: 'Prompt_700Bold', fontSize: 8}, title: {color: '#2f3d2f', fontFamily: 'Prompt_800ExtraBold', fontSize: 22}, twoColumn: {flexDirection: 'row', gap: 9}, typeCard: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, flex: 1, gap: 5, minHeight: 61, justifyContent: 'center'}, typeCardActive: {backgroundColor: '#5f875f'}, typeRow: {flexDirection: 'row', gap: 7, marginTop: 12}, typeText: {color: '#778477', fontFamily: 'Prompt_700Bold', fontSize: 9}, typeTextActive: {color: '#fff'}, useSuggestion: {alignItems: 'center', backgroundColor: '#5f875f', borderRadius: 12, justifyContent: 'center', marginTop: 12, minHeight: 37}, useSuggestionText: {color: '#fff', fontFamily: 'Prompt_700Bold', fontSize: 11},
});
