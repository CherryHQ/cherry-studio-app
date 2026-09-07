import type { ReactNode } from 'react';
import { Pressable } from 'react-native-gesture-handler';
import { useResolveClassNames } from 'uniwind';

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
  const cornerStyle = useResolveClassNames(variant === 'card' ? 'rounded-4xl' : 'rounded-2xl');

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={disabled ? { disabled: true } : undefined}
      className="active:opacity-70"
      disabled={disabled}
      onPress={onPress}
      style={{
        ...cornerStyle,
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
