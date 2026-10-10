import {Pressable, StyleSheet, Text, View, type PressableStateCallbackType} from 'react-native';

import {useShellTourTarget} from '@/hooks/use-tour-target';
import {APP_NAME, screenName} from '@/lib/page-titles';
import {MaterialIcon} from '@/screens/native/user/user-ui';

import {DESKTOP_C, DESKTOP_F, TOP_BAR_HEIGHT} from './desktop-theme';

type WebState = PressableStateCallbackType & {hovered?: boolean};

/**
 * The slim bar above the content: the page's name on the left (the same name
 * the browser tab shows), and on the right the add action, the bell and the
 * profile shortcut. The bell's number is the shared badge -- no number at all
 * once everything has been seen.
 */
export function DesktopTopBar({badge, name, onAdd, onNavigate, page}: {
  badge: number;
  name: string;
  onAdd: () => void;
  onNavigate: (page: string) => void;
  page: string;
}) {
  const title = screenName('user', page) ?? APP_NAME;
  const hover = (state: WebState) => (state.hovered || state.pressed) && styles.hover;
  // On the dashboard this bell replaces the header one, so it carries the
  // dashboard tour's bell step.
  const {ref: bellRef, onLayout: bellOnLayout} = useShellTourTarget('dashboard', 'bell', page === 'index');
  return (
    <View style={styles.bar}>
      <Text numberOfLines={1} style={styles.title}>{title}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityLabel="เพิ่มรายการใหม่" onPress={onAdd} style={(state: WebState) => [styles.add, hover(state)]}>
          <MaterialIcon color={DESKTOP_C.white} name="add" size={18} />
          <Text style={styles.addText}>เพิ่ม</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={badge ? `การแจ้งเตือน ${badge} รายการใหม่` : 'การแจ้งเตือน'}
          onLayout={bellOnLayout}
          onPress={() => onNavigate('smartlife_notifications')}
          ref={bellRef}
          style={(state: WebState) => [styles.icon, hover(state)]}
        >
          <MaterialIcon color={DESKTOP_C.pine} name="notifications" size={21} />
          {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text></View> : null}
        </Pressable>
        <Pressable accessibilityLabel={`โปรไฟล์ ${name}`} onPress={() => onNavigate('smartlife_profile')} style={(state: WebState) => [styles.icon, hover(state)]}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {alignItems: 'center', flexDirection: 'row', gap: 6},
  add: {alignItems: 'center', backgroundColor: DESKTOP_C.sage, borderRadius: 8, flexDirection: 'row', gap: 4, height: 32, paddingLeft: 8, paddingRight: 12},
  addText: {color: DESKTOP_C.white, fontFamily: DESKTOP_F.s, fontSize: 13},
  avatar: {alignItems: 'center', backgroundColor: DESKTOP_C.sage, borderRadius: 13, height: 26, justifyContent: 'center', width: 26},
  avatarText: {color: DESKTOP_C.white, fontFamily: DESKTOP_F.b, fontSize: 12},
  badge: {alignItems: 'center', backgroundColor: DESKTOP_C.badge, borderColor: DESKTOP_C.white, borderRadius: 8, borderWidth: 2, height: 16, justifyContent: 'center', minWidth: 16, paddingHorizontal: 2, position: 'absolute', right: 2, top: 2},
  badgeText: {color: DESKTOP_C.white, fontFamily: DESKTOP_F.b, fontSize: 9},
  bar: {alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.72)', borderBottomWidth: 1, borderColor: DESKTOP_C.border, flexDirection: 'row', height: TOP_BAR_HEIGHT, justifyContent: 'space-between', paddingHorizontal: 20},
  hover: {backgroundColor: 'rgba(44, 52, 27, 0.06)'},
  icon: {alignItems: 'center', borderRadius: 8, height: 34, justifyContent: 'center', width: 34},
  title: {color: DESKTOP_C.pine, flex: 1, fontFamily: DESKTOP_F.s, fontSize: 15},
});
