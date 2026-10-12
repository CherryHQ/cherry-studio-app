import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Svg, { Rect } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import type { FilePreviewVariant, FilePreviewTransfer } from '../file-preview.types';

export function FilePreviewFrame({
  accessibilityLabel,
  children,
  disabled,
  onPress,
  size,
  transfer,
  variant = 'thumbnail',
}: {
  accessibilityLabel: string;
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
  size: number;
  variant?: FilePreviewVariant;
  transfer?: FilePreviewTransfer;
}) {
  const [primary, danger] = useCSSVariable(['--color-primary', '--color-danger']);
  const radius = Math.min(16, size / 4);
  const perimeter = 4 * (size - 2 - 2 * radius) + 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, transfer?.progress ?? 0.18));
  const clippingClassName =
    variant === 'card'
      ? 'size-full overflow-hidden rounded-4xl'
      : 'size-full overflow-hidden rounded-2xl';

  return (
    <Pressable
      accessibilityLabel={
        transfer ? `${accessibilityLabel}, ${transfer.label}` : accessibilityLabel
      }
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: transfer?.state === 'uploading' }}
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
      {transfer ? (
        <View
          pointerEvents="none"
          className="absolute inset-0"
          accessibilityRole="progressbar"
          accessibilityLabel={transfer.label}
          accessibilityValue={
            transfer.progress === undefined
              ? undefined
              : { min: 0, max: 100, now: Math.floor(progress * 100) }
          }
        >
          <Svg width={size} height={size}>
            <Rect
              x={1}
              y={1}
              width={size - 2}
              height={size - 2}
              rx={radius}
              fill="none"
              stroke={String(transfer.state === 'failed' ? danger : primary)}
              strokeWidth={2}
              strokeDasharray={
                transfer.state === 'failed' ? undefined : `${perimeter * progress} ${perimeter}`
              }
            />
          </Svg>
        </View>
      ) : null}
    </Pressable>
  );
}
