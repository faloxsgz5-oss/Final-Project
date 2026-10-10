import {useEffect, useMemo, useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, TextInput, View, type PressableStateCallbackType} from 'react-native';

import {MaterialIcon} from '@/screens/native/user/user-ui';

import {DESKTOP_ALL_NAV} from './desktop-nav';
import {DESKTOP_C, DESKTOP_F} from './desktop-theme';

type WebState = PressableStateCallbackType & {hovered?: boolean};

/**
 * Ctrl/Cmd+K: type to filter the sidebar's own screens, Enter to open the
 * first match, Escape to close. A jump list only -- it searches screen names,
 * not the user's data, and fetches nothing.
 */
export function QuickJump({onClose, onNavigate, visible}: {onClose: () => void; onNavigate: (page: string) => void; visible: boolean}) {
  const [text, setText] = useState('');
  const matches = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return needle ? DESKTOP_ALL_NAV.filter((item) => item.label.toLowerCase().includes(needle)) : DESKTOP_ALL_NAV;
  }, [text]);
  const go = (page: string) => { onClose(); setText(''); onNavigate(page); };

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, visible]);

  return (
    <Modal animationType="none" onRequestClose={onClose} transparent visible={visible}>
      <Pressable accessibilityLabel="ปิดการค้นหา" onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={() => undefined} style={styles.panel}>
          <View style={styles.inputRow}>
            <MaterialIcon color={DESKTOP_C.muted} name="search" size={20} />
            <TextInput
              accessibilityLabel="พิมพ์ชื่อหน้าที่ต้องการไป"
              autoFocus
              onChangeText={setText}
              onSubmitEditing={() => { if (matches[0]) go(matches[0].page); }}
              placeholder="ไปที่หน้า..."
              placeholderTextColor={DESKTOP_C.muted}
              style={styles.input}
              value={text}
            />
            <Text style={styles.kbd}>Esc</Text>
          </View>
          {matches.length ? matches.map((item, index) => (
            <Pressable accessibilityLabel={`ไปที่ ${item.label}`} key={item.key} onPress={() => go(item.page)} style={(state: WebState) => [styles.row, (state.hovered || index === 0) && styles.rowHover]}>
              <MaterialIcon color={DESKTOP_C.muted} name={item.icon} size={18} />
              <Text style={styles.rowText}>{item.label}</Text>
              {index === 0 ? <Text style={styles.kbd}>Enter</Text> : null}
            </Pressable>
          )) : <Text style={styles.empty}>ไม่พบหน้าที่ตรงกัน</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {alignItems: 'center', backgroundColor: 'rgba(28, 34, 20, 0.28)', flex: 1, paddingTop: '12%'},
  empty: {color: DESKTOP_C.muted, fontFamily: DESKTOP_F.r, fontSize: 13, padding: 14},
  input: {color: DESKTOP_C.pine, flex: 1, fontFamily: DESKTOP_F.r, fontSize: 15, paddingVertical: 10},
  inputRow: {alignItems: 'center', borderBottomWidth: 1, borderColor: DESKTOP_C.border, flexDirection: 'row', gap: 10, marginBottom: 6, paddingHorizontal: 14},
  kbd: {borderColor: DESKTOP_C.border, borderRadius: 4, borderWidth: 1, color: DESKTOP_C.muted, fontFamily: DESKTOP_F.m, fontSize: 10, paddingHorizontal: 5, paddingVertical: 1},
  panel: {backgroundColor: DESKTOP_C.white, borderRadius: 12, boxShadow: '0 18px 48px rgba(44, 52, 27, 0.22)', maxWidth: 560, paddingBottom: 8, width: '90%'},
  row: {alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 10, marginHorizontal: 8, minHeight: 36, paddingHorizontal: 10},
  rowHover: {backgroundColor: DESKTOP_C.hover},
  rowText: {color: DESKTOP_C.pine, flex: 1, fontFamily: DESKTOP_F.m, fontSize: 14},
});
