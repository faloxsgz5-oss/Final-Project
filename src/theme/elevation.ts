import {Platform, type TextStyle, type ViewStyle} from 'react-native';

/**
 * Shadow and glow tokens, defined once.
 *
 * Mechanism: `boxShadow` everywhere. This app runs React Native 0.86 on the
 * new architecture, where `boxShadow` is a real style on Android (API 28+) and
 * iOS, and react-native-web passes it straight to CSS. That replaces the older
 * `shadowColor`/`shadowOffset`/`shadowOpacity`/`shadowRadius` set, which
 * react-native-web logs as deprecated and Android ignores altogether -- so the
 * cards that used it had no shadow at all on Android. `boxShadow` also follows
 * `borderRadius` and draws outside the view, so it avoids the grey square that
 * `elevation` leaves behind a rounded, translucent view.
 *
 * Colours come from the app's own palette (pine ink #2c341b, sage #5f835f,
 * finance lavender #9297bb, note rose #bb9293, night #5a3d82). Shadows stay
 * low: on a light ground the card should read as lifted, not floating.
 */

/** Ink used for neutral shadows: the app's pine, never pure black. */
const INK = '44, 52, 27';

export type ShadowSize = 'sm' | 'md' | 'lg';

/** Light-ground shadows. `sm` for small controls, `md` for cards, `lg` for floating buttons and sheets. */
const LIGHT: Record<ShadowSize, ViewStyle> = {
  sm: {boxShadow: `0 1px 2px rgba(${INK}, 0.06), 0 2px 6px rgba(${INK}, 0.07)`},
  md: {boxShadow: `0 10px 22px rgba(${INK}, 0.08)`},
  lg: {boxShadow: `0 12px 28px rgba(${INK}, 0.16), 0 3px 8px rgba(${INK}, 0.08)`},
};

/**
 * Dark-ground variants. A shadow barely shows on a dark surface, so depth there
 * comes from a hairline highlight instead (a 1px spread ring, which -- unlike a
 * border -- takes no layout space). The user screens are light-only today; these
 * exist so a future dark theme reads tokens instead of inventing values.
 */
const DARK: Record<ShadowSize, ViewStyle> = {
  sm: {boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.06)'},
  md: {boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.08), 0 8px 20px rgba(0, 0, 0, 0.35)'},
  lg: {boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.10), 0 12px 28px rgba(0, 0, 0, 0.45)'},
};

export function shadow(size: ShadowSize, scheme: 'light' | 'dark' = 'light'): ViewStyle {
  return (scheme === 'dark' ? DARK : LIGHT)[size];
}

/** Glow colours, as `r, g, b`, taken from the palette. */
export const GLOW = {
  ai: '255, 255, 255', // white on the sage-to-lavender AI gradient
  sage: '95, 131, 95',
  finance: '146, 151, 187',
  alert: '210, 92, 92', // the unread-badge red
  night: '90, 61, 130',
} as const;

export type GlowTone = keyof typeof GLOW;

/**
 * A soft coloured halo behind a font icon. Icons here are glyphs in the
 * Material Symbols font, so the halo is a text shadow: the CSS `textShadow`
 * string on web (react-native-web deprecates the split `textShadow*` props),
 * and the split props on native, where the string form does not exist.
 * `strength` scales the opacity; keep it low in light mode.
 */
export function glowText(tone: GlowTone, strength = 1, radius = 10): TextStyle {
  const alpha = Math.min(1, 0.55 * strength);
  const color = `rgba(${GLOW[tone]}, ${alpha})`;
  if (Platform.OS === 'web') return {textShadow: `0 0 ${radius}px ${color}`} as TextStyle;
  return {textShadowColor: color, textShadowOffset: {height: 0, width: 0}, textShadowRadius: radius};
}

/** The same halo for a round icon button's surface rather than the glyph. */
export function glowSurface(tone: GlowTone, strength = 1, radius = 16): ViewStyle {
  return {boxShadow: `0 0 ${radius}px rgba(${GLOW[tone]}, ${Math.min(1, 0.32 * strength)})`};
}
