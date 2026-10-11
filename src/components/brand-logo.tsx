import {Image, StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';

// Generated from the owner's artwork by scripts/generate-brand-assets.cjs.
const LOGO_512 = require('@/assets/brand/brand-logo-512.png');
const LOGO_256 = require('@/assets/brand/brand-logo-256.png');

/** The light surface the logo is generated onto wherever it cannot be transparent. */
export const BRAND_SURFACE = '#F4F5EF';

/**
 * The SmartLife logo, as the owner drew it -- the one brand mark the app
 * shows. `plain` is the drawing on its transparent ground, for light
 * surfaces. On a dark surface use `tile`: the drawing's dark green strokes
 * disappear on dark, so it sits on a light rounded tile instead of being
 * recoloured. `decorative` hides it from assistive tech when the control
 * around it already says "SmartLife".
 */
export function BrandLogo({decorative = false, size, style, variant = 'plain'}: {
  decorative?: boolean;
  size: number;
  style?: StyleProp<ViewStyle>;
  variant?: 'plain' | 'tile';
}) {
  const inner = variant === 'tile' ? Math.round(size * 0.84) : size;
  const image = (
    <Image
      accessibilityIgnoresInvertColors
      accessibilityLabel={decorative ? undefined : 'SmartLife'}
      accessibilityRole={decorative ? undefined : 'image'}
      accessible={!decorative}
      source={inner > 128 ? LOGO_512 : LOGO_256}
      style={{height: inner, width: inner}}
    />
  );
  return (
    <View
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      style={[variant === 'tile' ? [styles.tile, {borderRadius: size * 0.22, height: size, width: size}] : {height: size, width: size}, style]}
      {...(decorative ? ({'aria-hidden': true} as object) : null)}
    >
      {image}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {alignItems: 'center', backgroundColor: BRAND_SURFACE, justifyContent: 'center'},
});
