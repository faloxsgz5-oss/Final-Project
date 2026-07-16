import type {PropsWithChildren} from 'react';
import type {StyleProp, ViewStyle} from 'react-native';
import {StyleSheet} from 'react-native';
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
    flex: 1,
    // A small buffer after the device inset keeps headers comfortable on phones
    // without affecting the existing button shapes, colors, or spacing system.
    paddingTop: 6,
  },
});
