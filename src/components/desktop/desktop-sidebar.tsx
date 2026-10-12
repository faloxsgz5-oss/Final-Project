import {Fragment} from 'react';
import {Pressable, StyleSheet, Text, View, type PressableStateCallbackType} from 'react-native';
import {useReducedMotion} from 'react-native-reanimated';

import {BrandLogo} from '@/components/brand-logo';
import {useShellTourTarget} from '@/hooks/use-tour-target';
import type {DesktopNavKey} from '@/lib/desktop-web';
import {MaterialIcon} from '@/screens/native/user/user-ui';

import {DESKTOP_ACCOUNT_NAV, DESKTOP_MAIN_NAV} from './desktop-nav';
import {DESKTOP_C, DESKTOP_F, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_WIDTH} from './desktop-theme';

type WebState = PressableStateCallbackType & {hovered?: boolean};
/** react-native-web passes these straight to the DOM; core RN's types do not list them. */
const web = (props: Record<string, unknown>) => props as object;

/**
 * A sidebar entry. The User shell's entries (`DesktopNavItem`) fit as they are;
 * another shell -- the admin portal -- passes its own. `onPress` replaces
 * navigation for an entry that is an action (ออกจากระบบ), and `danger` tints it.
 */
export type SidebarItem = {danger?: boolean; icon: string; key: string; label: string; onPress?: () => void; page?: string};
export type SidebarSection = {items: SidebarItem[]; title: string};

const USER_SECTIONS: SidebarSection[] = [{items: DESKTOP_MAIN_NAV, title: 'เมนู'}];
const USER_ACCOUNT: SidebarSection = {items: DESKTOP_ACCOUNT_NAV, title: 'บัญชี'};

/** Nav icon size: the icon is what you scan for, and the rail shows nothing else. */
const ICON = 24;

/**
 * The desktop sidebar: the app's brand, search, a few shortcuts, the screens,
 * and the account entries -- in the calm, list-like style of a document app.
 * Rows are plain pressables with a soft hover fill rather than the lifted
 * card hover the phone layout's buttons use: a sidebar row is navigation, not
 * a card. Every row is keyboard reachable and gets the app's focus ring.
 */
export function DesktopSidebar({account = USER_ACCOUNT, activeKey, badge, brandLabel = 'SmartLife ไปหน้าหลัก', brandPage = 'index', canToggle = true, collapsed, onAdd, onDashboard, onNavigate, onSearch, onToggleCollapsed, sections = USER_SECTIONS, shortcuts = true}: {
  /** The bottom group. Default: the User shell's บัญชี entries. */
  account?: SidebarSection;
  activeKey: DesktopNavKey | string | null;
  badge: number;
  brandLabel?: string;
  /** Where the brand row goes. Default: the User dashboard. */
  brandPage?: string;
  /** False on a compact window, where the rail cannot be expanded. */
  canToggle?: boolean;
  collapsed: boolean;
  onAdd?: () => void;
  /** True while the dashboard is the page on show: its tour points at the bell here. */
  onDashboard: boolean;
  onNavigate: (page: string) => void;
  onSearch?: () => void;
  onToggleCollapsed: () => void;
  /** The groups under the shortcuts. Default: the User shell's เมนู. */
  sections?: SidebarSection[];
  /** Search, เพิ่ม and Smart Scan. Default: shown (the User shell). */
  shortcuts?: boolean;
}) {
  const reduced = useReducedMotion();
  // On desktop the sidebar's bell is the only bell, so it carries the
  // dashboard tour's bell step (in the rail, the bell icon).
  const {ref: bellRef, onLayout: bellOnLayout} = useShellTourTarget('dashboard', 'bell', onDashboard);
  const transition = reduced ? null : web({transitionDuration: '160ms', transitionProperty: 'width', transitionTimingFunction: 'ease'});
  const hoverTransition = reduced ? null : web({transitionDuration: '120ms', transitionProperty: 'background-color'});
  const row = (state: WebState, isActive = false) => [
    styles.row,
    collapsed && styles.rowCollapsed,
    (state.hovered || state.pressed) && styles.rowHover,
    isActive && styles.rowActive,
    hoverTransition,
  ];
  const item = (entry: SidebarItem) => {
    const isActive = entry.key === activeKey;
    const isBell = entry.key === 'notifications';
    const count = isBell ? badge : 0;
    return (
      <Pressable
        // Button role, not link: react-native-web leaves Enter on a link role to the
        // browser, which only acts on a real <a href>, so these rows ignored the
        // keyboard. aria-current still tells assistive tech which page is open.
        {...web({'aria-current': isActive ? 'page' : undefined})}
        accessibilityRole="button"
        accessibilityLabel={count ? `${entry.label} (${count} รายการใหม่)` : entry.label}
        key={entry.key}
        onLayout={isBell ? bellOnLayout : undefined}
        onPress={() => (entry.onPress ? entry.onPress() : onNavigate(entry.page ?? entry.key))}
        ref={isBell ? bellRef : undefined}
        style={(state) => row(state, isActive)}
      >
        <View>
          <MaterialIcon color={entry.danger ? DESKTOP_C.danger : isActive ? DESKTOP_C.pine : DESKTOP_C.muted} name={entry.icon} size={ICON} />
          {/* Collapsed, the number has nowhere to go, so a dot on the icon says it. */}
          {collapsed && count ? <View style={styles.dot} /> : null}
        </View>
        {collapsed ? null : <Text numberOfLines={1} style={[styles.rowText, isActive && styles.rowTextActive, entry.danger && styles.rowTextDanger]}>{entry.label}</Text>}
        {!collapsed && count ? <View style={styles.badge}><Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text></View> : null}
      </Pressable>
    );
  };

  const toggle = canToggle ? (
    <Pressable
      accessibilityLabel={collapsed ? 'ขยายแถบด้านข้าง (Ctrl+\\)' : 'ย่อแถบด้านข้าง (Ctrl+\\)'}
      onPress={onToggleCollapsed}
      style={(state: WebState) => [styles.iconButton, (state.hovered || state.pressed) && styles.rowHover, hoverTransition]}
    >
      <MaterialIcon color={DESKTOP_C.muted} name={collapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left'} size={22} />
    </Pressable>
  ) : null;

  return (
    <View {...web({role: 'navigation'})} accessibilityLabel="เมนูหลัก" style={[styles.sidebar, {width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH}, transition]}>
      {/* The app's brand, not the signed-in user: there is one workspace, so
          no switcher chevron. It goes home; the profile is the โปรไฟล์ row. */}
      <View style={[styles.header, collapsed && styles.headerCollapsed]}>
        <Pressable accessibilityLabel={brandLabel} onPress={() => onNavigate(brandPage)} style={(state: WebState) => [collapsed ? styles.brandCollapsed : styles.brand, (state.hovered || state.pressed) && styles.rowHover, hoverTransition]}>
          {/* The row's label already says SmartLife, so the logo itself stays silent. */}
          <BrandLogo decorative size={36} />
          {collapsed ? null : <Text numberOfLines={1} style={styles.brandName}>SmartLife</Text>}
        </Pressable>
        {toggle}
      </View>

      {shortcuts ? (
        <>
          <Pressable accessibilityLabel="ค้นหาและไปที่หน้า (Ctrl+K)" onPress={onSearch} style={(state: WebState) => (collapsed ? row(state) : [styles.search, (state.hovered || state.pressed) && styles.searchHover])}>
            <MaterialIcon color={DESKTOP_C.muted} name="search" size={collapsed ? ICON : 20} />
            {collapsed ? null : <><Text style={styles.searchText}>ค้นหา...</Text><Text style={styles.kbd}>Ctrl K</Text></>}
          </Pressable>
          <Pressable accessibilityLabel="เพิ่มรายการใหม่" onPress={onAdd} style={(state: WebState) => row(state)}>
            <MaterialIcon color={DESKTOP_C.sage} name="add_circle" size={ICON} />
            {collapsed ? null : <Text style={[styles.rowText, styles.addText]}>เพิ่ม</Text>}
          </Pressable>
          <Pressable accessibilityLabel="Smart Scan" onPress={() => onNavigate('smartlife_scan_schedule')} style={(state: WebState) => row(state)}>
            <MaterialIcon color={DESKTOP_C.muted} name="document_scanner" size={ICON} />
            {collapsed ? null : <Text style={styles.rowText}>Smart Scan</Text>}
          </Pressable>
        </>
      ) : null}

      {sections.map((section) => (
        <Fragment key={section.title}>
          {collapsed ? <View style={styles.rule} /> : <Text style={styles.section}>{section.title}</Text>}
          {section.items.map(item)}
        </Fragment>
      ))}

      <View style={styles.spacer} />
      {collapsed ? <View style={styles.rule} /> : <Text style={styles.section}>{account.title}</Text>}
      {account.items.map(item)}
    </View>
  );
}

const styles = StyleSheet.create({
  addText: {color: DESKTOP_C.sage, fontFamily: DESKTOP_F.s},
  badge: {alignItems: 'center', backgroundColor: DESKTOP_C.badge, borderRadius: 10, height: 20, justifyContent: 'center', minWidth: 20, paddingHorizontal: 6},
  badgeText: {color: DESKTOP_C.white, fontFamily: DESKTOP_F.b, fontSize: 11},
  brand: {alignItems: 'center', borderRadius: 10, flex: 1, flexDirection: 'row', gap: 10, minWidth: 0, paddingHorizontal: 4, paddingVertical: 4},
  brandCollapsed: {alignItems: 'center', borderRadius: 10, justifyContent: 'center', padding: 4},
  brandName: {color: DESKTOP_C.pine, flex: 1, fontFamily: DESKTOP_F.b, fontSize: 17},
  dot: {backgroundColor: DESKTOP_C.badge, borderColor: DESKTOP_C.sidebar, borderRadius: 6, borderWidth: 2, height: 12, position: 'absolute', right: -3, top: -2, width: 12},
  header: {alignItems: 'center', flexDirection: 'row', gap: 4, marginBottom: 10},
  headerCollapsed: {flexDirection: 'column', gap: 6, justifyContent: 'center'},
  iconButton: {alignItems: 'center', borderRadius: 8, height: 40, justifyContent: 'center', width: 40},
  kbd: {borderColor: DESKTOP_C.border, borderRadius: 4, borderWidth: 1, color: DESKTOP_C.muted, fontFamily: DESKTOP_F.m, fontSize: 10, paddingHorizontal: 5, paddingVertical: 1},
  row: {alignItems: 'center', borderRadius: 8, flexDirection: 'row', gap: 12, minHeight: 42, paddingHorizontal: 10},
  rowActive: {backgroundColor: DESKTOP_C.active},
  rowCollapsed: {justifyContent: 'center', paddingHorizontal: 0},
  rowHover: {backgroundColor: DESKTOP_C.hover},
  rowText: {color: '#4c5748', flex: 1, fontFamily: DESKTOP_F.m, fontSize: 15},
  rowTextActive: {color: DESKTOP_C.pine, fontFamily: DESKTOP_F.s},
  rowTextDanger: {color: DESKTOP_C.danger},
  rule: {backgroundColor: DESKTOP_C.border, height: 1, marginHorizontal: 8, marginVertical: 10},
  search: {alignItems: 'center', backgroundColor: DESKTOP_C.white, borderColor: DESKTOP_C.border, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 6, minHeight: 38, paddingHorizontal: 10},
  searchHover: {borderColor: 'rgba(44, 52, 27, 0.2)'},
  searchText: {color: DESKTOP_C.muted, flex: 1, fontFamily: DESKTOP_F.r, fontSize: 14},
  section: {color: DESKTOP_C.muted, fontFamily: DESKTOP_F.s, fontSize: 12, letterSpacing: 0.3, marginBottom: 4, marginLeft: 10, marginTop: 16},
  sidebar: {backgroundColor: DESKTOP_C.sidebar, borderColor: DESKTOP_C.border, borderRightWidth: 1, gap: 2, height: '100%', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 12},
  spacer: {flex: 1},
});
