import type { ReactNode } from 'react';
import { Pressable } from 'react-native-gesture-handler';

type FilePreviewFrameProps = {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
  size: number;
};

export function FilePreviewFrame({
  accessibilityLabel,
  children,
  disabled,
  onPress,
  size,
}: FilePreviewFrameProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={disabled ? { disabled: true } : undefined}
      className="overflow-hidden rounded-2xl active:opacity-70"
      disabled={disabled}
      onPress={onPress}
      style={{ borderCurve: 'continuous', height: size, width: size }}
    >
      {children}
    </Pressable>
  );
}
