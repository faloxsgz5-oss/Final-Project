import {useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';

import {runLegacyDataAction} from '@/services/legacy-data';
import {getNoteSuggestions, recommendationLevel, type NoteSuggestion} from '@/services/smartlife-recommendations';
import type {NoteCategory} from '@/types/smartlife';
import {MaterialIcon, UserShell, type UserNavigate} from './user-ui';

type FormMode = 'manual' | 'ai';
type PriorityValue = 'normal' | 'important' | 'urgent';
const categories: {label: string; value: NoteCategory}[] = [{label: 'เรียน', value: 'study'}, {label: 'งาน', value: 'work'}, {label: 'ไอเดีย', value: 'idea'}, {label: 'ส่วนตัว', value: 'personal'}];
const priorities = [
  {icon: 'radio_button_checked', label: 'ทั่วไป', value: 'normal'},
  {icon: 'priority_high', label: 'สำคัญ', value: 'important'},
  {icon: 'warning', label: 'เร่งด่วน', value: 'urgent'},
] as const;

export default function NoteFormScreen({uid, onNavigate}: {uid: string; onNavigate: UserNavigate}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<NoteCategory>('study');
  const [priority, setPriority] = useState<PriorityValue>('normal');
  const [mode, setMode] = useState<FormMode>('manual');
  const [aiSuggestions, setAiSuggestions] = useState<NoteSuggestion[]>([]);
  const [loadingAiSuggestions, setLoadingAiSuggestions] = useState(true);
  const [saving, setSaving] = useState(false);
  const color = category === 'work' ? '#c49497' : category === 'idea' ? '#d3a957' : category === 'personal' ? '#859084' : '#628660';

  useEffect(() => {
    let active = true;
    getNoteSuggestions(uid)
      .then((items) => {
        if (active) setAiSuggestions(items);
      })
      .catch((error) => {
        console.error('[NoteForm] Load AI suggestions failed', error);
        if (active) setAiSuggestions([]);
      })
      .finally(() => {
        if (active) setLoadingAiSuggestions(false);
      });
    return () => {
      active = false;
    };
  }, [uid]);

  const save = async () => {
    if (!title.trim()) return Alert.alert('กรอกชื่อโน้ตก่อนบันทึก');
    setSaving(true);
    try {
      await runLegacyDataAction(uid, 'user/smartlife_add_note', {action: 'create-note', payload: {title, content, category, color, priority}});
      Alert.alert('บันทึกโน้ตสำเร็จ'); onNavigate('smartlife_planner_notes');
    } catch (error) { Alert.alert('บันทึกไม่สำเร็จ', error instanceof Error ? error.message : 'ลองใหม่อีกครั้ง'); }
    finally { setSaving(false); }
  };
  const applySuggestion = (suggestion: NoteSuggestion) => { setTitle(suggestion.title); setContent(`${suggestion.content}\n\nเหตุผลที่ AI เลือก: ${suggestion.reasons.join(', ')}`); setCategory(suggestion.category); setPriority(suggestion.score >= 80 ? 'urgent' : suggestion.score >= 60 ? 'important' : 'normal'); setMode('manual'); };

  return <UserShell active="smartlife_notes" onNavigate={onNavigate}>
    <View style={styles.page}>
      {/* Refactored UI: note creation supports a manual form and a review-before-save AI suggestion view. */}
      <View style={styles.header}><Pressable accessibilityLabel="ปิด" onPress={() => onNavigate('smartlife_planner_notes')} style={styles.headerButton}><MaterialIcon color="#364033" name="close" size={24} /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>SMARTLIFE NOTES</Text><Text style={styles.title}>{mode === 'ai' ? 'AI แนะนำโน้ต' : 'โน้ตใหม่'}</Text></View><Pressable accessibilityLabel="บันทึกโน้ต" disabled={saving || !title.trim()} onPress={save} style={[styles.noteDone, (saving || !title.trim()) && styles.disabled]}>{saving ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcon color="#fff" name="check" size={23} />}</Pressable></View>
      <View style={styles.noteModeToggle}><Pressable onPress={() => setMode('manual')} style={[styles.mode, mode === 'manual' && styles.noteModeActive]}><MaterialIcon color={mode === 'manual' ? '#fff' : '#758274'} name="edit_note" size={17} /><Text style={[styles.modeText, mode === 'manual' && styles.modeTextActive]}>เขียนโน้ต</Text></Pressable><Pressable onPress={() => setMode('ai')} style={[styles.mode, mode === 'ai' && styles.noteModeActive]}><MaterialIcon color={mode === 'ai' ? '#fff' : '#758274'} name="auto_awesome" size={17} /><Text style={[styles.modeText, mode === 'ai' && styles.modeTextActive]}>AI แนะนำ</Text></Pressable></View>
      {mode === 'ai' ? <AiSuggestionList loading={loadingAiSuggestions} onUse={applySuggestion} suggestions={aiSuggestions} /> : <>
        <View style={styles.aiTeaser}><LinearGradient colors={['#c88d91', '#d7a8aa']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={StyleSheet.absoluteFill} /><Text style={styles.aiTeaserTitle}>✦ &nbsp;AI แนะนำโน้ตได้</Text><Text style={styles.aiTeaserText}>ดูจากตารางเรียน งาน และโน้ตเดิมใน Firebase เพื่อช่วยเรียบโน้ตได้เร็วขึ้น</Text><View style={styles.teaserRows}>{loadingAiSuggestions ? <ActivityIndicator color="#fff" /> : aiSuggestions.slice(0, 2).map((suggestion) => <Pressable key={suggestion.title} onPress={() => applySuggestion(suggestion)} style={styles.teaserRow}><View style={styles.teaserIcon}><MaterialIcon color="#fff" name="description" size={16} /></View><View style={{flex: 1}}><Text style={styles.teaserTitle}>{suggestion.title}</Text><Text style={styles.teaserSub}>{suggestion.detail}</Text></View><MaterialIcon color="#fff" name="chevron_right" size={18} /></Pressable>)}</View></View>
        <View style={styles.formCard}><Text style={styles.label}>ชื่อโน้ต</Text><TextInput onChangeText={setTitle} placeholder="เช่น สรุปบทที่ 4" placeholderTextColor="#8d968b" style={styles.input} value={title} />
          <Text style={styles.label}>หมวดหมู่</Text><View style={styles.categoryRow}>{categories.map((item) => <Pressable key={item.value} onPress={() => setCategory(item.value)} style={[styles.category, category === item.value && {backgroundColor: color}]}><Text style={[styles.categoryText, category === item.value && styles.categoryTextActive]}>{item.label}</Text></Pressable>)}</View>
          <Text style={styles.label}>ความสำคัญ</Text><View style={styles.priorityRow}>{priorities.map((item) => <Pressable accessibilityLabel={`เลือกความสำคัญ ${item.label}`} accessibilityRole="button" accessibilityState={{selected: priority === item.value}} key={item.value} onPress={() => setPriority(item.value)} style={[styles.notePriority, priority === item.value && styles.notePriorityActive]}><MaterialIcon color={priority === item.value ? '#fff' : '#bd8185'} name={item.icon} size={16} /><Text style={[styles.notePriorityText, priority === item.value && styles.priorityTextActive]}>{item.label}</Text></Pressable>)}</View>
          <Text style={styles.label}>รายละเอียด</Text><TextInput multiline onChangeText={setContent} placeholder={'หัวข้อที่ต้องสรุป:\n- Recursion คืออะไร\n- Stack ทำงานอย่างไร\n- ตัวอย่างโจทย์ที่ควรฝึกก่อนควิซ'} placeholderTextColor="#748074" style={styles.content} textAlignVertical="top" value={content} />
        </View><Pressable disabled={saving || !title.trim()} onPress={save} style={[styles.saveShell, (saving || !title.trim()) && styles.disabled]}><LinearGradient colors={['#c48a8e', '#b97b7f']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={styles.save}>{saving ? <ActivityIndicator color="#fff" /> : <MaterialIcon color="#fff" name="check" size={19} />}<Text style={styles.saveText}>{saving ? 'กำลังบันทึก...' : 'บันทึกโน้ต'}</Text></LinearGradient></Pressable>
      </>}
    </View>
  </UserShell>;
}

function AiSuggestionList({loading, onUse, suggestions}: {loading: boolean; onUse: (suggestion: NoteSuggestion) => void; suggestions: NoteSuggestion[]}) {
  const importantCount = suggestions.filter((suggestion) => suggestion.score >= 70).length;
  return <View style={styles.aiArea}>
    <LinearGradient colors={['#c88d91', '#d7a8aa']} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={styles.aiHero}>
      <Text style={styles.aiHeroTitle}>✦ &nbsp;AI วิเคราะห์จากวันนี้</Text>
      <Text style={styles.aiHeroText}>ระบบดึงตารางเรียน งาน และโน้ตเดิมจาก Firebase แล้วให้คะแนนจากความใกล้กำหนด ความสำคัญ และคำสำคัญ</Text>
    </LinearGradient>
    <View style={styles.aiStats}><Stat label="คำแนะนำ" value={`${suggestions.length} โน้ต`} /><Stat color="#c48a8e" label="สำคัญมาก" value={`${importantCount} รายการ`} /></View>
    {loading ? <View style={styles.emptyAi}><ActivityIndicator color="#bd8185" /><Text style={styles.noteEmptyAiText}>กำลังวิเคราะห์ข้อมูลจาก Firebase...</Text></View> : null}
    {!loading && suggestions.length === 0 ? <View style={styles.emptyAi}><MaterialIcon color="#9b7477" name="info" size={20} /><Text style={styles.noteEmptyAiText}>ยังไม่มีข้อมูลพอให้ AI แนะนำโน้ต ลองเพิ่มตารางเรียน งาน หรือโน้ตเดิมก่อน</Text></View> : null}
    {!loading && suggestions.map((suggestion) => <View key={suggestion.title} style={styles.suggestionCard}>
      <View style={styles.suggestionHead}><View style={styles.noteSuggestionIcon}><MaterialIcon color="#c48a8e" name="description" size={18} /></View><View style={{flex: 1}}><Text style={styles.suggestionTitle}>{suggestion.title}</Text><Text style={styles.suggestionSub}>{suggestion.detail}</Text></View><View style={styles.noteScoreBadge}><Text style={styles.noteScoreBadgeText}>{recommendationLevel(suggestion.score)}</Text></View></View>
      <Text style={styles.suggestionContent}>{suggestion.content}</Text>
      <View style={styles.reasonRow}>{suggestion.reasons.slice(0, 3).map((reason) => <View key={reason} style={styles.noteReasonChip}><Text style={styles.noteReasonChipText}>{reason}</Text></View>)}</View>
      <Pressable onPress={() => onUse(suggestion)} style={styles.noteUseButton}><MaterialIcon color="#fff" name="check" size={17} /><Text style={styles.useButtonText}>ใช้คำแนะนำนี้</Text></Pressable>
    </View>)}
  </View>;
}
function Stat({label, value, color = '#354033'}: {color?: string; label: string; value: string}) { return <View style={styles.stat}><Text style={[styles.statValue, {color}]}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  aiArea: {gap: 10, marginTop: 14}, aiHero: {borderRadius: 20, padding: 16}, aiHeroText: {color: 'rgba(255,255,255,.9)', fontFamily: 'Prompt_400Regular', fontSize: 10, lineHeight: 15, marginTop: 5}, aiHeroTitle: {color: '#fff', fontFamily: 'Prompt_800ExtraBold', fontSize: 16}, aiStats: {flexDirection: 'row', gap: 9}, aiTeaser: {borderRadius: 20, marginTop: 14, overflow: 'hidden', padding: 16}, aiTeaserText: {color: 'rgba(255,255,255,.88)', fontFamily: 'Prompt_400Regular', fontSize: 10, lineHeight: 15, marginTop: 3}, aiTeaserTitle: {color: '#fff', fontFamily: 'Prompt_800ExtraBold', fontSize: 16}, category: {backgroundColor: '#eef1eb', borderRadius: 99, paddingHorizontal: 11, paddingVertical: 7}, categoryRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8}, categoryText: {color: '#778177', fontFamily: 'Prompt_700Bold', fontSize: 9}, categoryTextActive: {color: '#fff'}, content: {backgroundColor: '#f8faf6', borderColor: '#e1e6de', borderRadius: 15, borderWidth: 1, color: '#344033', fontFamily: 'Prompt_500Medium', fontSize: 12, lineHeight: 18, minHeight: 142, padding: 13}, disabled: {opacity: .5}, done: {alignItems: 'center', backgroundColor: '#5f875f', borderRadius: 21, boxShadow: '0 8px 17px rgba(70,100,65,.2)', height: 44, justifyContent: 'center', width: 44}, emptyAi: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, gap: 8, justifyContent: 'center', minHeight: 86, padding: 14}, emptyAiText: {color: '#5f725e', fontFamily: 'Prompt_500Medium', fontSize: 10, lineHeight: 16, textAlign: 'center'}, eyebrow: {color: '#698667', fontFamily: 'Prompt_700Bold', fontSize: 8, letterSpacing: .6}, formCard: {backgroundColor: '#fff', borderRadius: 22, boxShadow: '0 8px 20px rgba(42,58,42,.07)', marginTop: 14, padding: 15}, header: {alignItems: 'center', flexDirection: 'row', gap: 10}, headerButton: {alignItems: 'center', backgroundColor: '#fff', borderRadius: 21, boxShadow: '0 6px 15px rgba(42,58,42,.07)', height: 44, justifyContent: 'center', width: 44}, headerCopy: {alignItems: 'center', flex: 1}, input: {backgroundColor: '#f8faf6', borderColor: '#e1e6de', borderRadius: 15, borderWidth: 1, color: '#344033', fontFamily: 'Prompt_700Bold', fontSize: 15, minHeight: 51, paddingHorizontal: 13}, label: {color: '#667365', fontFamily: 'Prompt_700Bold', fontSize: 10, marginBottom: 6, marginTop: 13}, mode: {alignItems: 'center', borderRadius: 14, flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 41}, modeActive: {backgroundColor: '#5f875f'}, modeText: {color: '#758274', fontFamily: 'Prompt_700Bold', fontSize: 10}, modeTextActive: {color: '#fff'}, modeToggle: {backgroundColor: '#e8eee5', borderRadius: 18, flexDirection: 'row', marginTop: 13, padding: 4}, page: {paddingBottom: 5}, priority: {alignItems: 'center', backgroundColor: '#f0f4ed', borderColor: '#e1e7df', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', minHeight: 42}, priorityActive: {backgroundColor: '#5f875f', borderColor: '#5f875f'}, priorityRow: {flexDirection: 'row', gap: 7}, priorityText: {color: '#657264', fontFamily: 'Prompt_700Bold', fontSize: 8}, priorityTextActive: {color: '#fff'}, reasonChip: {backgroundColor: '#eaf2e6', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4}, reasonChipText: {color: '#5f795d', fontFamily: 'Prompt_700Bold', fontSize: 8}, reasonRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 9}, save: {alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 50}, saveShell: {borderRadius: 16, marginTop: 14, overflow: 'hidden'}, saveText: {color: '#fff', fontFamily: 'Prompt_700Bold', fontSize: 13}, scoreBadge: {alignItems: 'center', backgroundColor: '#eaf2e6', borderRadius: 99, minWidth: 33, paddingHorizontal: 8, paddingVertical: 4}, scoreBadgeText: {color: '#5f875f', fontFamily: 'Prompt_800ExtraBold', fontSize: 10}, stat: {backgroundColor: '#fff', borderRadius: 17, flex: 1, padding: 13}, statLabel: {color: '#8b938a', fontFamily: 'Prompt_600SemiBold', fontSize: 9, marginTop: 2}, statValue: {fontFamily: 'Prompt_800ExtraBold', fontSize: 17}, suggestionCard: {backgroundColor: '#fff', borderRadius: 20, boxShadow: '0 6px 17px rgba(42,58,42,.07)', padding: 13}, suggestionContent: {backgroundColor: '#f5f7f2', borderRadius: 13, color: '#667066', fontFamily: 'Prompt_400Regular', fontSize: 10, lineHeight: 15, marginTop: 10, padding: 10}, suggestionHead: {alignItems: 'center', flexDirection: 'row', gap: 10}, suggestionIcon: {alignItems: 'center', backgroundColor: '#eaf2e6', borderRadius: 13, height: 39, justifyContent: 'center', width: 39}, suggestionSub: {color: '#8a938a', fontFamily: 'Prompt_400Regular', fontSize: 8, marginTop: 1}, suggestionTitle: {color: '#354033', fontFamily: 'Prompt_800ExtraBold', fontSize: 12}, teaserIcon: {alignItems: 'center', backgroundColor: 'rgba(255,255,255,.22)', borderRadius: 11, height: 34, justifyContent: 'center', width: 34}, teaserRow: {alignItems: 'center', backgroundColor: 'rgba(255,255,255,.18)', borderRadius: 13, flexDirection: 'row', gap: 9, marginTop: 9, padding: 8}, teaserRows: {marginTop: 10}, teaserSub: {color: 'rgba(255,255,255,.78)', fontFamily: 'Prompt_400Regular', fontSize: 8, marginTop: 1}, teaserTitle: {color: '#fff', fontFamily: 'Prompt_700Bold', fontSize: 10}, title: {color: '#354033', fontFamily: 'Prompt_800ExtraBold', fontSize: 21}, useButton: {alignItems: 'center', backgroundColor: '#5f875f', borderRadius: 11, flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 10, minHeight: 36}, useButtonText: {color: '#fff', fontFamily: 'Prompt_700Bold', fontSize: 10},
  noteDone: {alignItems: 'center', backgroundColor: '#bd8185', borderRadius: 21, boxShadow: '0 8px 17px rgba(136,82,87,.18)', height: 44, justifyContent: 'center', width: 44},
  noteEmptyAiText: {color: '#7d6264', fontFamily: 'Prompt_500Medium', fontSize: 10, lineHeight: 16, textAlign: 'center'},
  noteModeActive: {backgroundColor: '#762729'},
  noteModeToggle: {backgroundColor: '#fff', borderRadius: 18, flexDirection: 'row', marginTop: 13, padding: 4},
  notePriority: {alignItems: 'center', backgroundColor: '#fbf3f4', borderColor: '#efdadd', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', minHeight: 42},
  notePriorityActive: {backgroundColor: '#bd8185', borderColor: '#bd8185'},
  notePriorityText: {color: '#8f696c', fontFamily: 'Prompt_700Bold', fontSize: 8},
  noteReasonChip: {backgroundColor: '#f7e9e9', borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4},
  noteReasonChipText: {color: '#9b696d', fontFamily: 'Prompt_700Bold', fontSize: 8},
  noteScoreBadge: {alignItems: 'center', backgroundColor: '#f7e9e9', borderRadius: 99, minWidth: 33, paddingHorizontal: 8, paddingVertical: 4},
  noteScoreBadgeText: {color: '#bd8185', fontFamily: 'Prompt_800ExtraBold', fontSize: 10},
  noteSuggestionIcon: {alignItems: 'center', backgroundColor: '#f7e9e9', borderRadius: 13, height: 39, justifyContent: 'center', width: 39},
  noteUseButton: {alignItems: 'center', backgroundColor: '#bd8185', borderRadius: 11, flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 10, minHeight: 36},
});
