import {Pressable, StyleSheet, Text, View, type PressableStateCallbackType} from 'react-native';
import {useReducedMotion} from 'react-native-reanimated';

import type {DesktopNavKey} from '@/lib/desktop-web';
import {MaterialIcon} from '@/screens/native/user/user-ui';

import {DESKTOP_ACCOUNT_NAV, DESKTOP_MAIN_NAV, type DesktopNavItem} from './desktop-nav';
import {DESKTOP_C, DESKTOP_F, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH} from './desktop-theme';

type WebState = PressableStateCallbackType & {hovered?: boolean};
/** react-native-web passes these straight to the DOM; core RN's types do not list them. */
const web = (props: Record<string, unknown>) => props as object;

/**
 * The desktop sidebar: who is signed in, search, a few shortcuts, the screens,
 * and the account entries -- in the calm, list-like style of a document app.
 * Rows are plain pressables with a soft hover fill rather than the lifted
 * card hover the phone layout's buttons use: a sidebar row is navigation, not
 * a card. Every row is keyboard reachable and gets the app's focus ring.
 */
export function DesktopSidebar({activeKey, badge, collapsed, name, onAdd, onNavigate, onSearch, onToggleCollapsed}: {
  activeKey: DesktopNavKey | null;
  badge: number;
  collapsed: boolean;
  name: string;
  onAdd: () => void;
  onNavigate: (page: string) => void;
  onSearch: () => void;
  onToggleCollapsed: () => void;
}) {
  const reduced = useReducedMotion();
  const transition = reduced ? null : web({transitionDuration: '160ms', transitionProperty: 'width', transitionTimingFunction: 'ease'});
  const hoverTransition = reduced ? null : web({transitionDuration: '120ms', transitionProperty: 'background-color'});
  const row = (state: WebState, isActive = false) => [
    styles.row,
    collapsed && styles.rowCollapsed,
    (state.hovered || state.pressed) && styles.rowHover,
    isActive && styles.rowActive,
    hoverTransition,
  ];
  const item = (entry: DesktopNavItem) => {
    const isActive = entry.key === activeKey;
    const count = entry.key === 'notifications' ? badge : 0;
    return (
      <Pressable
        {...web({'aria-current': isActive ? 'page' : undefined, role: 'link'})}
        accessibilityLabel={count ? `${entry.label} (${count} รายการใหม่)` : entry.label}
        key={entry.key}
        onPress={() => onNavigate(entry.page)}
        style={(state) => row(state, isActive)}
      >
        <View>
          <MaterialIcon color={isActive ? DESKTOP_C.pine : DESKTOP_C.muted} name={entry.icon} size={20} />
          {/* Collapsed, the number has nowhere to go, so a dot on the icon says it. */}
          {collapsed && count ? <View style={styles.dot} /> : null}
        </View>
        {collapsed ? null : <Text numberOfLines={1} style={[styles.rowText, isActive && styles.rowTextActive]}>{entry.label}</Text>}
        {!collapsed && count ? <View style={styles.badge}><Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text></View> : null}
      </Pressable>
    );
  };

  return (
    <View {...web({role: 'navigation'})} accessibilityLabel="เมนูหลัก" style={[styles.sidebar, {width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH}, transition]}>
      <View style={[styles.header, collapsed && styles.headerCollapsed]}>
        {collapsed ? null : (
          <Pressable accessibilityLabel={`บัญชี ${name} เปิดโปรไฟล์`} onPress={() => onNavigate('smartlife_profile')} style={(state: WebState) => [styles.account, (state.hovered || state.pressed) && styles.rowHover, hoverTransition]}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View>
            <Text numberOfLines={1} style={styles.accountName}>{name}</Text>
            <MaterialIcon color={DESKTOP_C.muted} name="unfold_more" size={16} />
          </Pressable>
        )}
        <Pressable
          accessibilityLabel={collapsed ? 'ขยายแถบด้านข้าง (Ctrl+\\)' : 'ย่อแถบด้านข้าง (Ctrl+\\)'}
          onPress={onToggleCollapsed}
          style={(state: WebState) => [styles.iconButton, (state.hovered || state.pressed) && styles.rowHover, hoverTransition]}
        >
          <MaterialIcon color={DESKTOP_C.muted} name={collapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'} size={20} />
        </Pressable>
      </View>

      <Pressable accessibilityLabel="ค้นหาและไปที่หน้า (Ctrl+K)" onPress={onSearch} style={(state: WebState) => (collapsed ? row(state) : [styles.search, (state.hovered || state.pressed) && styles.searchHover])}>
        <MaterialIcon color={DESKTOP_C.muted} name="search" size={18} />
        {collapsed ? null : <><Text style={styles.searchText}>ค้นหา...</Text><Text style={styles.kbd}>Ctrl K</Text></>}
      </Pressable>
      <Pressable accessibilityLabel="เพิ่มรายการใหม่" onPress={onAdd} style={(state: WebState) => row(state)}>
        <MaterialIcon color={DESKTOP_C.sage} name="add_circle" size={20} />
        {collapsed ? null : <Text style={[styles.rowText, styles.addText]}>เพิ่ม</Text>}
      </Pressable>
      <Pressable accessibilityLabel="Smart Scan" onPress={() => onNavigate('smartlife_scan_schedule')} style={(state: WebState) => row(state)}>
        <MaterialIcon color={DESKTOP_C.muted} name="document_scanner" size={20} />
        {collapsed ? null : <Text style={styles.rowText}>Smart Scan</Text>}
      </Pressable>

      {collapsed ? <View style={styles.rule} /> : <Text style={styles.section}>เมนู</Text>}
      {DESKTOP_MAIN_NAV.map(item)}

      <View style={styles.spacer} />
      {collapsed ? <View style={styles.rule} /> : <Text style={styles.section}>บัญชี</Text>}
      {DESKTOP_ACCOUNT_NAV.map(item)}
    </View>
  );
}

const styles = StyleSheet.create({
  account: {alignItems: 'center', borderRadius: 8, flex: 1, flexDirection: 'row', gap: 9, minWidth: 0, paddingHorizontal: 6, paddingVertical: 6},
  accountName: {color: DESKTOP_C.pine, flex: 1, fontFamily: DESKTOP_F.s, fontSize: 14},
  addText: {color: DESKTOP_C.sage, fontFamily: DESKTOP_F.s},
  avatar: {alignItems: 'center', backgroundColor: DESKTOP_C.sage, borderRadius: 6, height: 24, justifyContent: 'center', width: 24},
  avatarText: {color: DESKTOP_C.white, fontFamily: DESKTOP_F.b, fontSize: 12},
  badge: {alignItems: 'center', backgroundColor: DESKTOP_C.badge, borderRadius: 9, height: 18, justifyContent: 'center', minWidth: 18, paddingHorizontal: 5},
  badgeText: {color: DESKTOP_C.white, fontFamily: DESKTOP_F.b, fontSize: 11},
  dot: {backgroundColor: DESKTOP_C.badge, borderColor: DESKTOP_C.sidebar, borderRadius: 5, borderWidth: 2, height: 10, position: 'absolute', right: -3, top: -2, width: 10},
  header: {alignItems: 'center', flexDirection: 'row', gap: 4, marginBottom: 8},
  headerCollapsed: {justifyContent: 'center'},
  iconButton: {alignItems: 'center', borderRadius: 8, height: 32, justifyContent: 'center', width: 32},
  kbd: {borderColor: DESKTOP_C.border, borderRadius: 4, borderWidth: 1, color: DESKTOP_C.muted, fontFamily: DESKTOP_F.m, fontSize: 10, paddingHorizontal: 5, paddingVertical: 1},
  row: {alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 10, minHeight: 34, paddingHorizontal: 10},
  rowActive: {backgroundColor: DESKTOP_C.active},
  rowCollapsed: {justifyContent: 'center', paddingHorizontal: 0},
  rowHover: {backgroundColor: DESKTOP_C.hover},
  rowText: {color: '#4c5748', flex: 1, fontFamily: DESKTOP_F.m, fontSize: 14},
  rowTextActive: {color: DESKTOP_C.pine, fontFamily: DESKTOP_F.s},
  rule: {backgroundColor: DESKTOP_C.border, height: 1, marginHorizontal: 8, marginVertical: 10},
  search: {alignItems: 'center', backgroundColor: DESKTOP_C.white, borderColor: DESKTOP_C.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 6, minHeight: 34, paddingHorizontal: 10},
  searchHover: {borderColor: 'rgba(44, 52, 27, 0.2)'},
  searchText: {color: DESKTOP_C.muted, flex: 1, fontFamily: DESKTOP_F.r, fontSize: 13},
  section: {color: DESKTOP_C.muted, fontFamily: DESKTOP_F.s, fontSize: 11, letterSpacing: 0.3, marginBottom: 4, marginLeft: 10, marginTop: 16},
  sidebar: {backgroundColor: DESKTOP_C.sidebar, borderColor: DESKTOP_C.border, borderRightWidth: 1, gap: 2, height: '100%', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 12},
  spacer: {flex: 1},
});
