import type {ReactNode} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {Touchable} from '@/components/touchable';

import {AuroraGradient} from '@/components/color-motion';
import {Card, MaterialIcon, PrimaryButton} from '@/screens/native/user/user-ui';

/**
 * Presentation primitives shared by every admin view.
 *
 * These were previously inlined in `admin-portal.tsx`; extracting them is what
 * lets each view live in its own file without cloning the styling.
 */

export const C = {
  amber: '#c4943d',
  amberSoft: '#faf3e0',
  mist: '#f1f4ed',
  muted: '#7f897a',
  paper: '#fff',
  pine: '#213713',
  pine2: '#36552a',
  purple: '#9297bb',
  purpleSoft: '#eceef7',
  red: '#c96761',
  redSoft: '#f8e5e2',
  sage: '#6f966f',
  sageSoft: '#e7efe3',
};

export const F = {
  b: 'Prompt_700Bold',
  m: 'Prompt_500Medium',
  r: 'Prompt_400Regular',
  s: 'Prompt_600SemiBold',
  x: 'Prompt_800ExtraBold',
};

export type Data = Record<string, unknown>;
export type Tone = 'green' | 'purple' | 'rose' | 'red' | 'amber';

export function items(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is Data => Boolean(item) && typeof item === 'object') : [];
}

export function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function text(value: unknown, fallback = '-') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function number(value: unknown) {
  return Number(value ?? 0).toLocaleString('th-TH');
}

export function money(value: number) {
  return `${value < 0 ? '-' : ''}${Math.abs(value).toLocaleString('th-TH', {maximumFractionDigits: 2})} ฿`;
}

export function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function date(value: unknown) {
  const parsed = new Date(String(value ?? ''));
  return Number.isNaN(parsed.getTime())
    ? '-'
    : new Intl.DateTimeFormat('th-TH', {dateStyle: 'medium', timeZone: 'Asia/Bangkok'}).format(parsed);
}

export function dateTimeFromMillis(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return new Intl.DateTimeFormat('th-TH', {dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok'})
    .format(new Date(value));
}

export function timeFromMillis(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--:--';
  return new Intl.DateTimeFormat('th-TH', {hour: '2-digit', hour12: false, minute: '2-digit', timeZone: 'Asia/Bangkok'})
    .format(new Date(value));
}

export function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  return new Intl.DateTimeFormat('th-TH', {month: 'long', timeZone: 'Asia/Bangkok', year: 'numeric'})
    .format(new Date(Date.UTC(year, month - 1, 15)));
}

export function toneColor(tone: Tone) {
  if (tone === 'red') return C.red;
  if (tone === 'purple') return '#6572b1';
  if (tone === 'rose') return '#b98080';
  if (tone === 'amber') return C.amber;
  return C.sage;
}

/** Gradient pairs lifted from the original admin SummaryAction palette. */
export function toneGradient(tone: Tone): readonly [string, string] {
  if (tone === 'purple') return ['#eef0fb', '#e7ebf8'];
  if (tone === 'rose') return ['#F3E8E8', '#efdfdf'];
  if (tone === 'red') return ['#f8e5e2', '#f3ded9'];
  if (tone === 'amber') return ['#faf3e0', '#f6ecd2'];
  return ['#eff6ed', '#e6f0e3'];
}

export function toneBackground(tone: Tone) {
  if (tone === 'purple') return '#E8EAF3';
  if (tone === 'rose') return '#F3E8E8';
  if (tone === 'red') return C.redSoft;
  if (tone === 'amber') return C.amberSoft;
  return '#f5f8f2';
}

/** The User home's hero palette (its AI Assistant card), reused for each admin page's intro. */
export const HERO_COLORS = ['#769674', '#8fa69a', '#9297bb', '#a8b7aa'] as const;

/**
 * The page's own icon, title and subtitle, set in the User app's hero card:
 * the same drifting gradient, radius and shadow as the dashboard's top card.
 */
export function AdminPageIntro({icon, title, subtitle}: {icon: string; subtitle: string; title: string}) {
  return (
    <AuroraGradient colors={HERO_COLORS} end={{x: 1, y: 1}} start={{x: 0, y: 0}} style={styles.intro}>
      <View style={styles.introIcon}><MaterialIcon color="#fff" name={icon} size={24} /></View>
      <View style={{flex: 1}}>
        <Text style={styles.introBrand}>SmartLife Admin</Text>
        <Text style={styles.introTitle}>{title}</Text>
        <Text style={styles.introSubtitle}>{subtitle}</Text>
      </View>
    </AuroraGradient>
  );
}

/**
 * A view's own heading (ปฏิทินรายผู้ใช้, AI Context Audit...), once a solid
 * gradient banner, now a User card: its colour in a tinted icon chip.
 */
export function InsightBanner({colors, icon, subtitle, title}: {colors: readonly [string, string]; icon: string; subtitle: string; title: string}) {
  return (
    <Card style={styles.insight}>
      <View style={[styles.insightIcon, {backgroundColor: `${colors[0]}1f`}]}><MaterialIcon color={colors[0]} name={icon} size={24} /></View>
      <View style={{flex: 1}}>
        <Text style={styles.insightTitle}>{title}</Text>
        <Text style={styles.insightSub}>{subtitle}</Text>
      </View>
    </Card>
  );
}

/** The User app's card, as is: white surface, 18 radius, soft shadow. */
export function AdminCard({children, style}: {children: ReactNode; style?: object}) {
  return <Card style={style}>{children}</Card>;
}

export function SectionHead({title, meta, right}: {title: string; meta?: string; right?: ReactNode}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {right ?? (meta ? <Text style={styles.sectionMeta}>{meta}</Text> : null)}
    </View>
  );
}

export function Empty({label, icon = 'inbox'}: {label: string; icon?: string}) {
  return (
    <View style={styles.empty}>
      <MaterialIcon color="#a0aaa0" name={icon} size={30} />
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

export function ErrorBlock({message, onRetry}: {message: string; onRetry?: () => void}) {
  return (
    <View style={styles.errorBlock}>
      <MaterialIcon color={C.red} name="error" size={26} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? <SmallButton icon="refresh" label="ลองอีกครั้ง" onPress={onRetry} tone="red" /> : null}
    </View>
  );
}

export function LoadingBlock({label = 'กำลังโหลดข้อมูลจาก Firebase'}: {label?: string}) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={C.sage} size="large" />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function Row({icon = 'circle', title, detail, tone = 'green', side, children, onPress}: {
  children?: ReactNode;
  detail: string;
  icon?: string;
  onPress?: () => void;
  side?: string;
  title: string;
  tone?: Tone;
}) {
  const color = toneColor(tone);
  const backgroundColor = toneBackground(tone);
  const content = (
    <View style={[styles.row, {backgroundColor}]}>
      <View style={[styles.rowIcon, {backgroundColor: `${color}18`}]}><MaterialIcon color={color} name={icon} size={19} /></View>
      <View style={{flex: 1}}>
        <View style={{alignItems: 'center', flexDirection: 'row', gap: 6}}>
          <Text numberOfLines={1} style={[styles.rowTitle, {flexShrink: 1}]}>{title}</Text>
          {side ? <Text style={[styles.rowSide, {color}]}>{side}</Text> : null}
        </View>
        <Text numberOfLines={2} style={styles.rowDetail}>{detail}</Text>
        {children}
      </View>
      {onPress ? <MaterialIcon color={color} name="chevron_right" size={20} /> : null}
    </View>
  );
  if (!onPress) return content;
  return <Touchable onPress={onPress} style={({pressed}) => pressed && styles.pressed}>{content}</Touchable>;
}

export function SummaryAction({icon, label, value, accent = 'green', onPress, hint = 'ข้อมูลจาก Firebase'}: {
  accent?: 'green' | 'purple' | 'rose';
  hint?: string;
  icon: string;
  label: string;
  onPress?: () => void;
  value: unknown;
}) {
  const purple = accent === 'purple';
  const rose = accent === 'rose';
  const iconColor = purple ? '#6572b1' : rose ? '#b98080' : '#5a8d5d';
  const iconSoft = purple ? '#eceef7' : rose ? '#f3e8e8' : '#e7efe3';
  // A white User-style list card; the accent lives in the icon chip and the number.
  return (
    <Touchable disabled={!onPress} onPress={onPress} style={({pressed}) => pressed && styles.pressed}>
      <View style={styles.summaryAction}>
        <View style={[styles.summaryIcon, {backgroundColor: iconSoft}]}><MaterialIcon color={iconColor} name={icon} size={22} /></View>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryLabel}>{label}</Text>
          <Text style={[styles.summaryValue, {color: purple ? '#465382' : rose ? '#8b5d5d' : C.pine}]}>{number(value)}</Text>
          <Text style={styles.summaryHint}>{hint}</Text>
        </View>
        <MaterialIcon color="#a0a99c" name="chevron_right" size={23} />
      </View>
    </Touchable>
  );
}

/**
 * Compact metric tile used by the Notes and Finance summaries, drawn like the
 * User home's stat tiles: a white rounded tile, the number large, a tone dot.
 */
export function StatTile({label, value, tone = 'green', hint}: {hint?: string; label: string; tone?: Tone; value: string}) {
  return (
    <View style={styles.statTile}>
      <View style={styles.statLabelRow}>
        <View style={[styles.statDot, {backgroundColor: toneColor(tone)}]} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text numberOfLines={1} style={[styles.statValue, {color: toneColor(tone)}]}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

/** Horizontal proportion bar — one segment per share, widths sum to 100%. */
export function ShareBar({segments}: {segments: {color: string; key: string; share: number}[]}) {
  const usable = segments.filter((segment) => segment.share > 0);
  if (!usable.length) return <View style={styles.shareBarEmpty} />;
  return (
    <View style={styles.shareBar}>
      {usable.map((segment) => (
        <View key={segment.key} style={{backgroundColor: segment.color, flex: Math.max(segment.share, 0.01)}} />
      ))}
    </View>
  );
}

/**
 * Horizontal bar chart of one metric per user.
 *
 * Horizontal bars are used deliberately: user labels are long Thai names or
 * email addresses, which are unreadable rotated under vertical bars. Widths
 * come from `ratio` (already normalised to the largest value), so this stays a
 * dumb renderer with no scale maths of its own.
 */
export function UserBarChart({points, color = C.sage, onSelectUser, emptyLabel = 'ยังไม่มีข้อมูล', unit = ''}: {
  color?: string;
  emptyLabel?: string;
  onSelectUser?: (uid: string) => void;
  points: {count: number; label: string; ratio: number; uid: string}[];
  unit?: string;
}) {
  if (!points.length) return <Empty icon="bar_chart" label={emptyLabel} />;
  if (points.every((point) => point.count === 0)) return <Empty icon="bar_chart" label={emptyLabel} />;

  return (
    <View style={styles.chart}>
      {points.map((point) => {
        const row = (
          <View style={styles.chartRow}>
            <Text numberOfLines={1} style={styles.chartLabel}>{point.label}</Text>
            <View style={styles.chartTrack}>
              <View style={[styles.chartFill, {backgroundColor: color, width: `${Math.max(point.ratio * 100, point.count > 0 ? 4 : 0)}%`}]} />
            </View>
            <Text style={styles.chartValue}>{number(point.count)}{unit}</Text>
          </View>
        );
        if (!onSelectUser) return <View key={point.uid}>{row}</View>;
        return (
          <Touchable
            accessibilityLabel={`ดูข้อมูลของ ${point.label}`}
            key={point.uid}
            onPress={() => onSelectUser(point.uid)}
            style={({pressed}) => pressed && styles.pressed}
          >
            {row}
          </Touchable>
        );
      })}
    </View>
  );
}

/**
 * Large, visually distinct overview section.
 *
 * The header mirrors the original admin "AI Context Audit" banner — a solid
 * two-stop gradient with white text — so the new sections read as part of the
 * same design system rather than a bolted-on redesign.
 */
export function FeatureSection({icon, title, subtitle, accent, gradient, onOpen, openLabel, children, footnote}: {
  accent: string;
  children: ReactNode;
  footnote?: string;
  gradient: readonly [string, string];
  icon: string;
  onOpen: () => void;
  openLabel: string;
  subtitle: string;
  title: string;
}) {
  // A User-style card: the section's colour moves from a solid banner into the
  // icon chip and the bars, and the open action is the User app's primary button.
  const tint = gradient[0] ?? accent;
  return (
    <Card style={styles.feature}>
      <View style={styles.featureHead}>
        <View style={[styles.featureIcon, {backgroundColor: `${tint}1f`}]}>
          <MaterialIcon color={tint} name={icon} size={24} />
        </View>
        <View style={{flex: 1}}>
          <Text style={styles.featureTitle}>{title}</Text>
          <Text style={styles.featureSubtitle}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.featureBody}>
        {children}
        {footnote ? <Text style={styles.featureFootnote}>{footnote}</Text> : null}
        <View style={styles.featureButton}><PrimaryButton label={openLabel} onPress={onOpen} /></View>
      </View>
    </Card>
  );
}

export function Pill({label, selected, onPress, color}: {color?: string; label: string; onPress: () => void; selected: boolean}) {
  return (
    // Labelled as a filter, because several pill labels repeat as row badges
    // further down the same screen -- "ต้องตรวจสอบ" is both a filter and a
    // status badge -- and a bare label leaves them indistinguishable to a
    // screen reader. `selected` is exposed so the active filter is announced.
    <Touchable
      accessibilityLabel={`ตัวกรอง ${label}`}
      accessibilityRole="button"
      accessibilityState={{selected}}
      onPress={onPress}
      style={({pressed}) => [styles.pill, selected && styles.pillActive, color && selected ? {backgroundColor: color} : null, pressed && styles.pressed]}
    >
      <Text style={[styles.pillText, selected && styles.pillTextActive]}>{label}</Text>
    </Touchable>
  );
}

export function SmallButton({icon, label, tone, onPress, loading, disabled}: {
  disabled?: boolean;
  icon: string;
  label: string;
  loading?: boolean;
  onPress: () => void;
  tone: 'green' | 'red' | 'purple' | 'amber';
}) {
  const color = tone === 'red' ? C.red : tone === 'purple' ? '#6572b1' : tone === 'amber' ? C.amber : C.sage;
  const backgroundColor = tone === 'red' ? C.redSoft : tone === 'purple' ? '#E8EAF3' : tone === 'amber' ? C.amberSoft : '#f5f8f2';
  return (
    <Touchable disabled={loading || disabled} onPress={onPress} style={({pressed}) => [styles.smallBtn, {backgroundColor}, (pressed || disabled) && styles.pressed]}>
      {loading ? <ActivityIndicator color={color} size="small" /> : <MaterialIcon color={color} name={icon} size={14} />}
      <Text style={[styles.smallBtnText, {color}]}>{loading ? '...' : label}</Text>
    </Touchable>
  );
}

export function KindBadge({kind, mapping}: {kind: string; mapping: Record<string, [string, string]>}) {
  const mapped = mapping[kind];
  if (!mapped) return null;
  const [label, colorStr] = mapped;
  let color = C.sage;
  let backgroundColor = '#f5f8f2';
  if (colorStr === 'purple') { color = '#6572b1'; backgroundColor = '#E8EAF3'; }
  else if (colorStr === 'red' || colorStr === 'rose') { color = C.red; backgroundColor = C.redSoft; }
  else if (colorStr === 'amber') { color = C.amber; backgroundColor = C.amberSoft; }
  else if (colorStr === 'muted') { color = C.muted; backgroundColor = C.mist; }
  return (
    <View style={[styles.kindBadge, {backgroundColor}]}>
      <Text style={[styles.kindBadgeText, {color}]}>{label}</Text>
    </View>
  );
}

export function Tag({label, color = C.sage, backgroundColor = '#f5f8f2'}: {backgroundColor?: string; color?: string; label: string}) {
  return <View style={[styles.kindBadge, {backgroundColor}]}><Text style={[styles.kindBadgeText, {color}]}>{label}</Text></View>;
}

const shadow = {shadowColor: C.pine, shadowOffset: {height: 10, width: 0}, shadowOpacity: 0.08, shadowRadius: 20};

export const styles = StyleSheet.create({
  actionRow: {flexDirection: 'row', gap: 8, marginTop: 8},
  audience: {alignItems: 'center', backgroundColor: C.sageSoft, borderRadius: 12, flexDirection: 'row', gap: 7, marginTop: 12, paddingHorizontal: 11, paddingVertical: 10},
  audienceText: {color: C.pine2, fontFamily: F.s, fontSize: 12},
  chart: {gap: 4, marginTop: 12},
  chartFill: {borderRadius: 99, height: '100%'},
  chartLabel: {color: C.pine, fontFamily: F.m, fontSize: 13, width: 110},
  chartRow: {alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 6},
  chartTrack: {backgroundColor: '#e7ede4', borderRadius: 99, flex: 1, height: 10, overflow: 'hidden'},
  chartValue: {color: C.pine, fontFamily: F.b, fontSize: 13, minWidth: 40, textAlign: 'right'},
  feature: {marginTop: 16},
  featureBody: {marginTop: 12},
  featureButton: {marginTop: -3},
  featureFootnote: {color: C.muted, fontFamily: F.r, fontSize: 12, lineHeight: 18, marginTop: 10},
  featureHead: {alignItems: 'center', borderBottomColor: '#eef1ea', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingBottom: 14},
  featureIcon: {alignItems: 'center', borderRadius: 14, height: 46, justifyContent: 'center', width: 46},
  featureSubtitle: {color: C.muted, fontFamily: F.r, fontSize: 13, lineHeight: 19, marginTop: 2},
  featureTitle: {color: '#29351f', fontFamily: F.b, fontSize: 17},
  card: {...shadow, borderColor: 'rgba(255,255,255,.85)', borderRadius: 18, borderWidth: 1, marginTop: 13, padding: 14},
  colorDot: {borderRadius: 6, height: 12, width: 12},
  composer: {padding: 15},
  composerHead: {alignItems: 'center', flexDirection: 'row', gap: 10},
  composerIcon: {alignItems: 'center', backgroundColor: C.sageSoft, borderRadius: 13, height: 42, justifyContent: 'center', width: 42},
  confidenceText: {color: C.muted, fontFamily: F.m, fontSize: 12},
  empty: {alignItems: 'center', gap: 7, paddingVertical: 28},
  emptyText: {color: C.muted, fontFamily: F.r, fontSize: 12},
  errorBlock: {alignItems: 'center', backgroundColor: C.redSoft, borderRadius: 14, gap: 8, marginTop: 13, padding: 18},
  errorText: {color: C.red, fontFamily: F.m, fontSize: 12, textAlign: 'center'},
  formToggle: {alignItems: 'center', backgroundColor: C.sageSoft, borderRadius: 14, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 44},
  formToggleText: {color: C.pine, fontFamily: F.b, fontSize: 12},
  input: {backgroundColor: '#f6f8f3', borderColor: '#e1e6dd', borderRadius: 13, borderWidth: 1, color: C.pine, fontFamily: F.m, fontSize: 12, marginTop: 5, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10},
  inputLabel: {color: C.pine, fontFamily: F.s, fontSize: 12, marginTop: 13},
  intro: {...shadow, alignItems: 'center', backgroundColor: '#88a188', borderRadius: 18, flexDirection: 'row', gap: 14, overflow: 'hidden', padding: 18},
  introBrand: {color: 'rgba(255,255,255,.82)', fontFamily: F.s, fontSize: 12},
  introIcon: {alignItems: 'center', backgroundColor: 'rgba(255,255,255,.22)', borderRadius: 16, height: 50, justifyContent: 'center', width: 50},
  introSubtitle: {color: 'rgba(255,255,255,.86)', fontFamily: F.r, fontSize: 13, lineHeight: 19, marginTop: 2},
  introTitle: {color: '#fff', fontFamily: F.x, fontSize: 21, lineHeight: 27, marginTop: 1},
  insight: {alignItems: 'center', flexDirection: 'row', gap: 12},
  insightIcon: {alignItems: 'center', borderRadius: 14, height: 46, justifyContent: 'center', width: 46},
  insightSub: {color: C.muted, fontFamily: F.r, fontSize: 13, lineHeight: 19, marginTop: 2},
  insightTitle: {color: '#29351f', fontFamily: F.b, fontSize: 16},
  kindBadge: {alignItems: 'center', borderRadius: 8, height: 20, justifyContent: 'center', paddingHorizontal: 8},
  kindBadgeText: {fontFamily: F.b, fontSize: 12},
  loading: {alignItems: 'center', gap: 10, paddingVertical: 90},
  loadingText: {color: C.muted, fontFamily: F.r, fontSize: 12},
  logout: {alignItems: 'center', backgroundColor: C.redSoft, borderColor: 'rgba(201,103,97,.22)', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 14, minHeight: 48},
  logoutText: {color: C.red, fontFamily: F.b, fontSize: 12},
  menu: {alignItems: 'center', borderBottomColor: 'rgba(44,52,27,.08)', borderBottomWidth: 1, flexDirection: 'row', gap: 10, minHeight: 68, paddingVertical: 10},
  menuIcon: {alignItems: 'center', backgroundColor: C.sageSoft, borderRadius: 13, height: 40, justifyContent: 'center', width: 40},
  messageInput: {minHeight: 92},
  pill: {alignItems: 'center', backgroundColor: C.sageSoft, borderRadius: 12, height: 32, justifyContent: 'center', paddingHorizontal: 12},
  pillActive: {backgroundColor: C.pine},
  pillRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8, marginTop: 12},
  pillText: {color: C.pine2, fontFamily: F.m, fontSize: 12},
  pillTextActive: {color: '#fff'},
  pressed: {opacity: 0.78, transform: [{scale: 0.987}]},
  providerBadge: {alignItems: 'center', borderRadius: 8, height: 20, justifyContent: 'center', paddingHorizontal: 8},
  providerBadgeText: {fontFamily: F.b, fontSize: 12},
  publishButton: {alignItems: 'center', backgroundColor: C.pine, borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 12, minHeight: 48},
  publishText: {color: '#fff', fontFamily: F.b, fontSize: 12},
  refreshButton: {alignItems: 'center', backgroundColor: C.sageSoft, borderRadius: 14, flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 12, minHeight: 40},
  refreshButtonText: {color: C.pine, fontFamily: F.b, fontSize: 12},
  row: {alignItems: 'center', backgroundColor: '#f7f9f4', borderRadius: 13, flexDirection: 'row', gap: 11, marginTop: 10, minHeight: 64, padding: 12},
  rowDetail: {color: C.muted, fontFamily: F.r, fontSize: 12, lineHeight: 18, marginTop: 2},
  rowIcon: {alignItems: 'center', borderRadius: 13, height: 39, justifyContent: 'center', width: 39},
  rowSide: {fontFamily: F.s, fontSize: 12},
  rowTitle: {color: C.pine, fontFamily: F.s, fontSize: 12},
  sectionHead: {alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between'},
  sectionMeta: {color: C.muted, fontFamily: F.r, fontSize: 12},
  sectionTitle: {color: '#29351f', fontFamily: F.b, fontSize: 15},
  shareBar: {borderRadius: 6, flexDirection: 'row', height: 10, marginTop: 10, overflow: 'hidden'},
  shareBarEmpty: {backgroundColor: C.mist, borderRadius: 6, height: 10, marginTop: 10},
  smallBtn: {alignItems: 'center', borderRadius: 11, flexDirection: 'row', gap: 4, height: 32, justifyContent: 'center', paddingHorizontal: 10},
  smallBtnText: {fontFamily: F.b, fontSize: 12},
  statDot: {borderRadius: 4, height: 8, width: 8},
  statHint: {color: C.muted, fontFamily: F.r, fontSize: 12, marginTop: 2},
  statLabel: {color: C.muted, fontFamily: F.m, fontSize: 12},
  statLabelRow: {alignItems: 'center', flexDirection: 'row', gap: 6},
  statTile: {boxShadow: '0 8px 18px rgba(44, 52, 27, 0.07)', backgroundColor: '#fff', borderColor: 'rgba(44,52,27,.05)', borderRadius: 17, borderWidth: 1, flexGrow: 1, flexShrink: 1, minWidth: 110, paddingHorizontal: 14, paddingVertical: 12},
  statValue: {fontFamily: F.x, fontSize: 19, marginTop: 4},
  statusDegraded: {backgroundColor: C.amber},
  statusOperational: {backgroundColor: C.sage},
  statusOutage: {backgroundColor: C.red},
  statusUnknown: {backgroundColor: C.purple},
  summaryAction: {boxShadow: '0 8px 18px rgba(44, 52, 27, 0.07)', alignItems: 'center', backgroundColor: '#fff', borderColor: 'rgba(255,255,255,.8)', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 78, paddingHorizontal: 16, paddingVertical: 11},
  summaryCopy: {flex: 1},
  summaryHint: {color: C.muted, fontFamily: F.r, fontSize: 12, marginTop: 1},
  summaryIcon: {alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44},
  summaryLabel: {color: C.pine, fontFamily: F.b, fontSize: 12},
  summaryList: {gap: 9, marginTop: 13},
  summaryValue: {fontFamily: F.x, fontSize: 21, lineHeight: 25, marginTop: 1},
  tileRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12},
});
