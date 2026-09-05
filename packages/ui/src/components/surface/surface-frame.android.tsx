import { View } from 'react-native';

import type { SurfaceFrameProps } from './surface-frame.types';

// No Liquid Glass outside iOS 26+, so this never imports expo-glass-effect —
// keeping it out of the Android bundle entirely.
export function SurfaceFrame({
  children,
  className,
  cornerRadius,
  style,
  testID,
}: SurfaceFrameProps) {
  return (
    <View
      className={className}
      style={[{ borderRadius: cornerRadius, overflow: 'hidden' }, style]}
      testID={testID}
    >
      {children}
    </View>
  );
}
