import { View } from 'react-native';

import type { ComposerSurfaceProps, ComposerTextInsets } from './composerPlatform.types';

// Android's EditText centers its text in the box it reports, so no correction is
// needed here — see composerPlatform.ios.tsx for why iOS is asymmetric.
const textPaddingVertical = 4;

export const composerTextInsets: ComposerTextInsets = {
  paddingBottom: textPaddingVertical,
  paddingTop: textPaddingVertical,
};

// No Liquid Glass outside iOS 26+, so this never imports expo-glass-effect —
// keeping it out of the Android bundle entirely.
export function ComposerSurface({
  children,
  className,
  cornerRadius,
  style,
}: ComposerSurfaceProps) {
  return (
    <View className={className} style={[{ borderRadius: cornerRadius, overflow: 'hidden' }, style]}>
      {children}
    </View>
  );
}
