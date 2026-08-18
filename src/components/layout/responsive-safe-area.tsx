import type {PropsWithChildren} from 'react';
import type {StyleProp, ViewStyle} from 'react-native';
import {Platform, StyleSheet} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

type ResponsiveSafeAreaProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>;

/**
 * Keeps app content clear of status bars, camera cutouts, curved corners, and
 * Android navigation areas without changing the visual design inside a screen.
 */
export function ResponsiveSafeArea({children, style}: ResponsiveSafeAreaProps) {
  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.base, style]}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'center',
    flex: 1,
    // A small buffer after the device inset keeps headers comfortable on phones
    // without affecting the existing button shapes, colors, or spacing system.
    paddingTop: 6,
    width: '100%',
    ...(Platform.OS === 'web' ? {
      // Keep the same SmartLife screen hierarchy on web, but give it a real
      // desktop canvas instead of forcing every route into a phone-sized frame.
      boxShadow: '0 18px 60px rgba(44, 52, 27, 0.10)',
      maxWidth: 1280,
    } : null),
  },
});
