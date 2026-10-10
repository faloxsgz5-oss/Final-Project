import {useIsFocused} from 'expo-router';
import {useCallback, useEffect, useImperativeHandle, useRef, type Ref} from 'react';
import {AppState, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle} from 'react-native';
import {glowSurface, glowText} from '@/theme/elevation';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export type AnimatedBotIconHandle = {
  /** Plays one wave, unless one is already playing or reduced motion is on. */
  wave: () => void;
};

type Props = {
  accessibilityLabel?: string;
  color?: string;
  /** A soft white halo around the robot and its arm, for the coloured AI card. */
  glow?: boolean;
  /**
   * Wave every ~11 s while the screen is focused and the app is in the
   * foreground. Touch has no hover, so on a phone this is what keeps the
   * robot feeling alive; it is off on web, where hovering does the job.
   */
  idle?: boolean;
  ref?: Ref<AnimatedBotIconHandle>;
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Wave once each time the screen comes into focus. */
  waveOnFocus?: boolean;
};

const IDLE_MS = 11000;
const SWING_MS = 130;
// Arm up -> three full waves (six swings) -> settle -> fold away.
const SWINGS = 6;
const WAVE_MS = 110 + SWING_MS * SWINGS + 220 + 160 + 200;
const SWING = 25; // degrees either side of the arm's resting angle
// The raised arm leans outward to the robot's left, into the card's padding,
// so the hand never sweeps across the title beside the icon.
const REST_ANGLE = -32;

/**
 * The Material "smart_toy" robot, waving.
 *
 * The robot itself is the same font glyph the card always used, at the same
 * size and colour, so nothing about the layout or the at-rest look changes.
 * The waving hand is a separate small arm (a forearm and a hand, two plain
 * views) that rises from the robot's left side and swings about its shoulder,
 * then folds away. It is built from views rather than an SVG because
 * react-native-svg is not part of this app and adding it would need a native
 * rebuild.
 *
 * The rotation pivot is set with `transformOrigin`, which React Native 0.86
 * (new architecture) and react-native-web both understand natively, so the arm
 * turns about the same point on Android, iOS and the web.
 *
 * Everything runs on the UI thread through Reanimated; a wave is a single
 * `withSequence`, and no React state changes while it plays.
 */
export function AnimatedBotIcon({accessibilityLabel = 'ผู้ช่วย AI', color = '#fff', glow = false, idle = false, ref, size = 21, style, waveOnFocus = true}: Props) {
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const angle = useSharedValue(0);
  const shown = useSharedValue(0);
  const busyUntil = useRef(0);

  const wave = useCallback(() => {
    if (reduced) return;
    const now = Date.now();
    if (now < busyUntil.current) return; // a hover that leaves and re-enters must not stack waves
    busyUntil.current = now + WAVE_MS;
    const ease = Easing.out(Easing.quad);
    const timing = (to: number, duration = SWING_MS) => withTiming(to, {duration, easing: ease, reduceMotion: ReduceMotion.System});
    shown.set(withSequence(
      withTiming(1, {duration: 110, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System}),
      withDelay(SWING_MS * SWINGS + 220, withTiming(0, {duration: 200, easing: Easing.in(Easing.quad), reduceMotion: ReduceMotion.System})),
    ));
    const swings = Array.from({length: SWINGS}, (_, i) => timing(i % 2 === 0 ? -SWING : SWING, i === 0 ? 110 : SWING_MS));
    angle.set(withSequence(...swings, timing(0, 220)));
  }, [angle, reduced, shown]);

  useImperativeHandle(ref, () => ({wave}), [wave]);

  // Once on focus: the dashboard sections fade in first (Reveal), so wait for
  // the card to settle before waving at the user.
  useEffect(() => {
    if (!focused || !waveOnFocus) return undefined;
    const timer = setTimeout(wave, 700);
    return () => clearTimeout(timer);
  }, [focused, wave, waveOnFocus]);

  // Idle wave: only while focused, foregrounded and motion is allowed. One
  // timer, cleared on blur, background and unmount, so nothing runs off screen.
  useEffect(() => {
    if (!idle || !focused || reduced) return undefined;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => { if (!timer) timer = setInterval(wave, IDLE_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    if (AppState.currentState === 'active') start();
    const subscription = AppState.addEventListener('change', (state) => (state === 'active' ? start() : stop()));
    return () => { stop(); subscription.remove(); };
  }, [focused, idle, reduced, wave]);

  const armStyle = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{rotate: `${REST_ANGLE + angle.get()}deg`}, {scale: 0.7 + shown.get() * 0.3}],
  }));

  // Geometry, as fractions of the icon size, measured against the glyph: the
  // shoulder sits on the robot's left "ear" and the arm rises from there.
  const armWidth = Math.max(5, size * 0.34);
  const armHeight = size * 0.62;
  const forearm = Math.max(2, size * 0.14);
  const hand = Math.max(5, size * 0.31);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      accessible
      style={[{height: size, width: size}, style]}
    >
      <Text style={[{color, fontFamily: 'MaterialSymbols_400Regular', fontSize: size, lineHeight: size}, glow && glowText('ai', 0.75, 8)]}>smart_toy</Text>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.arm,
          {
            height: armHeight,
            // Bottom-centre of this box is the shoulder pivot, on the
            // robot's left "ear".
            left: size * 0.13 - armWidth / 2,
            top: size * 0.62 - armHeight,
            transformOrigin: '50% 100%',
            width: armWidth,
          },
          armStyle,
        ]}
      >
        <View style={[{backgroundColor: color, borderRadius: hand, height: hand, width: hand}, glow && armGlow]} />
        <View style={[{backgroundColor: color, borderRadius: forearm, flex: 1, marginTop: -hand * 0.25, width: forearm}, glow && armGlow]} />
      </Animated.View>
    </View>
  );
}

// The arm is two views, not glyph text, so its halo is a box shadow sized to match the glyph's.
const armGlow = glowSurface('ai', 1.4, 5);

const styles = StyleSheet.create({
  arm: {
    alignItems: 'center',
    position: 'absolute',
    ...(Platform.OS === 'web' ? ({willChange: 'transform, opacity'} as object) : {}),
  },
});
