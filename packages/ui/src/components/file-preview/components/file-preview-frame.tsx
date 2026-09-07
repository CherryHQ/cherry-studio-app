import type { ReactNode } from 'react';
import { Pressable } from 'react-native-gesture-handler';

import { cn } from '../../../utils';
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
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={disabled ? { disabled: true } : undefined}
      className={cn('active:opacity-70', variant === 'card' ? 'rounded-4xl' : 'rounded-2xl')}
      disabled={disabled}
      onPress={onPress}
      style={{
        borderCurve: 'continuous',
        height: size,
        overflow: 'hidden',
        width: size,
      }}
    >
      {children}
    </Pressable>
  );
}
