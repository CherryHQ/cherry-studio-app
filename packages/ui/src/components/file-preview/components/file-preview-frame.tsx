import type { ReactNode } from 'react';
import { Pressable } from 'react-native-gesture-handler';

const frameRadius = 16;

export function FilePreviewFrame({
  accessibilityLabel,
  children,
  disabled,
  onPress,
  size,
}: {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
  size: number;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={disabled ? { disabled: true } : undefined}
      className="active:opacity-70"
      disabled={disabled}
      onPress={onPress}
      style={{
        borderCurve: 'continuous',
        borderRadius: frameRadius,
        height: size,
        overflow: 'hidden',
        width: size,
      }}
    >
      {children}
    </Pressable>
  );
}
