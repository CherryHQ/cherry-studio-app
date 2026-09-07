import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import type { FilePreviewVariant } from '../file-preview.types';

export function FilePreviewFrame({
  accessibilityLabel,
  children,
  disabled,
  onPress,
  size,
  variant = 'thumbnail',
}: {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
  size: number;
  variant?: FilePreviewVariant;
}) {
  const clippingClassName =
    variant === 'card'
      ? 'size-full overflow-hidden rounded-4xl'
      : 'size-full overflow-hidden rounded-2xl';

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={disabled ? { disabled: true } : undefined}
      className="active:opacity-70"
      disabled={disabled}
      onPress={onPress}
      style={{
        height: size,
        width: size,
      }}
    >
      <View className={clippingClassName} style={{ borderCurve: 'continuous' }}>
        {children}
      </View>
    </Pressable>
  );
}
