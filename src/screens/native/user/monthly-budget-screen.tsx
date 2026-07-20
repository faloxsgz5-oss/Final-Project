import {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';

import {ResponsiveSafeArea} from '@/components/layout/responsive-safe-area';
import {loadLegacyPageData} from '@/services/legacy-data';
import {currentMonthKey, loadMonthlyBudget, saveMonthlyBudget} from '@/services/monthly-budget';
import {MaterialIcon, UserGradientBackdrop, UserTabBar} from './user-ui';

type Item = Record<string, unknown>;
type BudgetMode = 'ai' | 'manual';
type Props = {onNavigate: (page: string) => void; uid: string};

const C = {accent: '#626fa8', accentSoft: '#eceef8', ink: '#29351f', mist: '#f4f6f1', muted: '#89928a', sage: '#618661', sageSoft: '#e2eddf', line: '#e3e8df'};
const F = {r: 'Prompt_400Regular', s: 'Prompt_600SemiBold', b: 'Prompt_700Bold', x: 'Prompt_800ExtraBold'};

function items(value: unknown) { return Array.isArray(value) ? value.filter((item): item is Item => Boolean(item) && typeof item === 'object') : []; }
function money(value: number) { return `฿${Math.max(0, Math.round(value)).toLocaleString('th-TH')}`; }
function parseMoney(value: string) { return Number(value.replace(/[^\d]/g, '')) || 0; }
function suggestedBudget(income: number) { return Math.max(0, Math.floor(income * .7 / 100) * 100); }

// Added for monthly budget planning: lets users set their own spending limit or apply the income-based recommendation.
export default function MonthlyBudgetScreen({onNavigate, uid}: Props) {
  const monthKey = useMemo(() => currentMonthKey(), []);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [income, setIncome] = useState(0);
  const [expense, setExpense] = useState(0);
  const [mode, setMode] = useState<BudgetMode>('ai');
  const [amountText, setAmountText] = useState('');

  const recommendation = suggestedBudget(income);
  const selectedAmount = mode === 'ai' ? recommendation : parseMoney(amountText);
  const remaining = Math.max(0, selectedAmount - expense);
  const monthLabel = new Intl.DateTimeFormat('th-TH', {month: 'long', year: 'numeric'}).format(new Date());

  useEffect(() => {
    let active = true;
    Promise.all([
      loadLegacyPageData(uid, 'user/smartlife_finance_month') as Promise<{transactions?: unknown}>,
      loadMonthlyBudget(uid, monthKey),
    ]).then(([pageData, saved]) => {
      if (!active) return;
      const monthTransactions = items(pageData.transactions);
      setIncome(monthTransactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount ?? 0), 0));
      setExpense(monthTransactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount ?? 0), 0));
      if (saved) {
        setMode(saved.source);
        setAmountText(String(saved.amount));
      }
    }).catch((error) => {
      console.error('[MonthlyBudget] Load failed', error);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [monthKey, uid]);

  const applyRecommendation = () => {
    setMode('ai');
    setAmountText(String(recommendation));
  };

  const save = async () => {
    if (!selectedAmount) {
      Alert.alert('ยังไม่ได้กำหนดงบ', mode === 'ai' && income === 0 ? 'เพิ่มรายรับของเดือนนี้ก่อน หรือกำหนดงบด้วยตัวเองได้เลย' : 'กรุณาระบุจำนวนงบประมาณ');
      return;
    }
    setSaving(true);
    try {
      await saveMonthlyBudget(uid, {amount: selectedAmount, monthKey, source: mode});
      Alert.alert('บันทึกงบแล้ว', `ตั้งลิมิตค่าใช้จ่ายเดือนนี้ไว้ ${money(selectedAmount)}`);
      onNavigate('smartlife_finance_month');
    } catch (error) {
      console.error('[MonthlyBudget] Save failed', error);
      Alert.alert('บันทึกไม่สำเร็จ', 'ลองใหม่อีกครั้งนะ');
    } finally {
      setSaving(false);
    }
  };

  return <ResponsiveSafeArea style={styles.safe}><View style={styles.screen}><UserGradientBackdrop />
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}><Pressable accessibilityLabel="กลับหน้าการเงิน" onPress={() => onNavigate('smartlife_finance_month')} style={styles.back}><MaterialIcon color={C.ink} name="chevron_left" size={27} /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>แผนการเงินของฉัน</Text><Text style={styles.title}>กำหนดงบรายเดือน</Text></View><View style={styles.headerIcon}><MaterialIcon color="#fff" name="savings" size={20} /></View></View>
      {loading ? <View style={styles.loading}><ActivityIndicator color={C.sage} size="large" /><Text style={styles.loadingText}>กำลังเตรียมข้อมูลการเงิน</Text></View> : <>
        <LinearGradient colors={['#6674ac', '#8d96c2']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={styles.hero}>
          <View style={styles.heroGlow} /><Text style={styles.heroEyebrow}>งบเดือน{monthLabel}</Text><Text style={styles.heroAmount}>{money(selectedAmount || recommendation)}</Text><Text style={styles.heroText}>{mode === 'ai' ? 'AI แนะนำลิมิตจากรายรับเดือนนี้' : 'ลิมิตค่าใช้จ่ายที่คุณกำหนดเอง'}</Text>
          <View style={styles.heroStatRow}><HeroStat label="รายรับเดือนนี้" value={money(income)} /><HeroStat label="ใช้ไปแล้ว" value={money(expense)} /></View>
        </LinearGradient>

        <View style={styles.modeBar}><ModeButton active={mode === 'ai'} icon="auto_awesome" label="AI แนะนำ" onPress={applyRecommendation} /><ModeButton active={mode === 'manual'} icon="edit" label="กำหนดเอง" onPress={() => setMode('manual')} /></View>

        {mode === 'ai' ? <View style={styles.card}><View style={styles.cardHeader}><View style={styles.cardIcon}><MaterialIcon color={C.accent} name="auto_awesome" size={20} /></View><View style={{flex: 1}}><Text style={styles.cardTitle}>คำแนะนำสำหรับเดือนนี้</Text><Text style={styles.cardSub}>กันไว้ 70% ของรายรับ เพื่อเหลือเงินสำรอง 30%</Text></View></View>
          {income > 0 ? <><View style={styles.recommendation}><Text style={styles.recommendationLabel}>ลิมิตที่แนะนำ</Text><Text style={styles.recommendationAmount}>{money(recommendation)}</Text></View><BudgetSplit label="ค่าอาหาร" amount={recommendation * .45} color="#71936e" percent={45} /><BudgetSplit label="การเดินทาง" amount={recommendation * .25} color="#828dbb" percent={25} /><BudgetSplit label="เรียน / ของใช้" amount={recommendation * .15} color="#d49a88" percent={15} /><BudgetSplit label="สำรอง" amount={recommendation * .15} color="#a8b794" percent={15} /></> : <View style={styles.emptySuggestion}><MaterialIcon color={C.muted} name="account_balance_wallet" size={25} /><Text style={styles.emptySuggestionText}>เพิ่มรายรับของเดือนนี้ แล้ว AI จะคำนวณงบที่เหมาะสมให้</Text></View>}</View> : <View style={styles.card}><Text style={styles.fieldLabel}>กำหนดลิมิตค่าใช้จ่ายเดือนนี้</Text><View style={styles.inputShell}><Text style={styles.currency}>฿</Text><TextInput accessibilityLabel="จำนวนงบรายเดือน" keyboardType="number-pad" onChangeText={setAmountText} placeholder="เช่น 5,000" placeholderTextColor="#a5ada1" style={styles.amountInput} value={amountText} /></View><Text style={styles.inputHint}>คุณสามารถเปลี่ยนงบใหม่ได้ตลอดเดือน</Text></View>}

        <View style={styles.statusCard}><View style={[styles.statusIcon, {backgroundColor: remaining > 0 ? C.sageSoft : '#fbe8e5'}]}><MaterialIcon color={remaining > 0 ? C.sage : '#d66963'} name={remaining > 0 ? 'check_circle' : 'warning_amber'} size={21} /></View><View style={{flex: 1}}><Text style={styles.statusTitle}>{expense > selectedAmount && selectedAmount > 0 ? 'ใช้เกินลิมิตแล้ว' : 'งบที่ยังใช้ได้'}</Text><Text style={styles.statusText}>{selectedAmount ? `${money(remaining)} จากลิมิต ${money(selectedAmount)}` : 'เลือกวิธีกำหนดงบด้านบน'}</Text></View></View>
        <Pressable disabled={saving} onPress={save} style={[styles.saveShell, saving && styles.disabled]}><LinearGradient colors={['#2b3916', '#1e2b0f']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={styles.save}><MaterialIcon color="#fff" name="check" size={19} /><Text style={styles.saveText}>{saving ? 'กำลังบันทึก...' : 'บันทึกงบเดือนนี้'}</Text></LinearGradient></Pressable>
      </>}
    </ScrollView><UserTabBar active="smartlife_finance_day" onNavigate={onNavigate} />
  </View></ResponsiveSafeArea>;
}

function HeroStat({label, value}: {label: string; value: string}) { return <View style={styles.heroStat}><Text style={styles.heroStatLabel}>{label}</Text><Text style={styles.heroStatValue}>{value}</Text></View>; }
function ModeButton({active, icon, label, onPress}: {active: boolean; icon: string; label: string; onPress: () => void}) { return <Pressable onPress={onPress} style={[styles.modeButton, active && styles.modeButtonActive]}><MaterialIcon color={active ? '#fff' : C.muted} name={icon} size={17} /><Text style={[styles.modeText, active && styles.modeTextActive]}>{label}</Text></Pressable>; }
function BudgetSplit({amount, color, label, percent}: {amount: number; color: string; label: string; percent: number}) { return <View style={styles.split}><View style={styles.splitTop}><Text style={styles.splitLabel}>{label}</Text><Text style={styles.splitAmount}>{money(amount)}</Text></View><View style={styles.splitTrack}><View style={[styles.splitFill, {backgroundColor: color, width: `${percent}%`}]} /></View></View>; }

const shadow = {shadowColor: '#29351f', shadowOffset: {height: 8, width: 0}, shadowOpacity: .07, shadowRadius: 18};
const styles = StyleSheet.create({
  amountInput: {color: C.ink, flex: 1, fontFamily: F.x, fontSize: 25, minHeight: 52, padding: 0}, back: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 19, height: 42, justifyContent: 'center', width: 42}, card: {...shadow, backgroundColor: '#fff', borderRadius: 21, marginTop: 14, padding: 16}, cardHeader: {alignItems: 'center', flexDirection: 'row', gap: 10}, cardIcon: {alignItems: 'center', backgroundColor: C.accentSoft, borderRadius: 15, height: 42, justifyContent: 'center', width: 42}, cardSub: {color: C.muted, fontFamily: F.r, fontSize: 9, marginTop: 2}, cardTitle: {color: C.ink, fontFamily: F.b, fontSize: 13}, content: {padding: 20, paddingBottom: 26}, currency: {color: C.sage, fontFamily: F.x, fontSize: 25, marginRight: 7}, disabled: {opacity: .6}, emptySuggestion: {alignItems: 'center', gap: 7, paddingVertical: 23}, emptySuggestionText: {color: C.muted, fontFamily: F.r, fontSize: 10, lineHeight: 16, maxWidth: 245, textAlign: 'center'}, eyebrow: {color: C.sage, fontFamily: F.b, fontSize: 9}, fieldLabel: {color: C.ink, fontFamily: F.b, fontSize: 11}, header: {alignItems: 'center', flexDirection: 'row', gap: 10}, headerCopy: {flex: 1}, headerIcon: {alignItems: 'center', backgroundColor: C.accent, borderRadius: 21, height: 42, justifyContent: 'center', width: 42}, hero: {...shadow, borderRadius: 23, marginTop: 16, overflow: 'hidden', padding: 18}, heroAmount: {color: '#fff', fontFamily: F.x, fontSize: 32, marginTop: 2}, heroEyebrow: {color: 'rgba(255,255,255,.8)', fontFamily: F.s, fontSize: 10}, heroGlow: {backgroundColor: 'rgba(255,255,255,.15)', borderBottomLeftRadius: 90, height: 110, position: 'absolute', right: 0, top: 0, width: 110}, heroStat: {flex: 1}, heroStatLabel: {color: 'rgba(255,255,255,.7)', fontFamily: F.r, fontSize: 8}, heroStatRow: {borderTopColor: 'rgba(255,255,255,.22)', borderTopWidth: 1, flexDirection: 'row', gap: 18, marginTop: 14, paddingTop: 11}, heroStatValue: {color: '#fff', fontFamily: F.b, fontSize: 12, marginTop: 1}, heroText: {color: 'rgba(255,255,255,.82)', fontFamily: F.r, fontSize: 10}, inputHint: {color: C.muted, fontFamily: F.r, fontSize: 9, marginTop: 7}, inputShell: {alignItems: 'center', backgroundColor: '#f6f8f4', borderColor: C.line, borderRadius: 15, borderWidth: 1, flexDirection: 'row', marginTop: 8, paddingHorizontal: 14}, loading: {alignItems: 'center', gap: 9, paddingVertical: 100}, loadingText: {color: C.muted, fontFamily: F.r, fontSize: 10}, modeBar: {backgroundColor: '#fff', borderRadius: 17, flexDirection: 'row', marginTop: 14, padding: 5}, modeButton: {alignItems: 'center', borderRadius: 13, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 43}, modeButtonActive: {backgroundColor: C.ink}, modeText: {color: C.muted, fontFamily: F.b, fontSize: 10}, modeTextActive: {color: '#fff'}, recommendation: {alignItems: 'baseline', backgroundColor: '#f2f5ef', borderRadius: 15, flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingHorizontal: 13, paddingVertical: 11}, recommendationAmount: {color: C.ink, fontFamily: F.x, fontSize: 21}, recommendationLabel: {color: C.sage, fontFamily: F.b, fontSize: 10}, safe: {backgroundColor: C.mist, flex: 1}, save: {alignItems: 'center', borderRadius: 17, flexDirection: 'row', gap: 8, height: 54, justifyContent: 'center'}, saveShell: {...shadow, borderRadius: 17, marginTop: 15, overflow: 'hidden'}, saveText: {color: '#fff', fontFamily: F.b, fontSize: 13}, screen: {backgroundColor: C.mist, flex: 1}, split: {marginTop: 13}, splitAmount: {color: C.ink, fontFamily: F.b, fontSize: 11}, splitFill: {borderRadius: 99, height: 9}, splitLabel: {color: C.muted, fontFamily: F.s, fontSize: 10}, splitTop: {flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6}, splitTrack: {backgroundColor: '#e4e8e2', borderRadius: 99, height: 9, overflow: 'hidden'}, statusCard: {...shadow, alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, flexDirection: 'row', gap: 10, marginTop: 14, padding: 13}, statusIcon: {alignItems: 'center', borderRadius: 16, height: 40, justifyContent: 'center', width: 40}, statusText: {color: C.muted, fontFamily: F.r, fontSize: 9, marginTop: 2}, statusTitle: {color: C.ink, fontFamily: F.b, fontSize: 11}, title: {color: C.ink, fontFamily: F.x, fontSize: 20},
});
