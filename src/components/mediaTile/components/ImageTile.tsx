import { cn } from 'heroui-native/utils';
import type { ReactNode } from 'react';
import { type AccessibilityState, Pressable, View } from 'react-native';
import { Image } from '@/components/uniwind';

type ImageTileProps = {
  accessibilityLabel?: string;
  accessibilityState?: AccessibilityState;
  children?: ReactNode;
  className?: string;
  /** Fills the parent box instead of sizing itself — for callers that own the outer box. */
  fill?: boolean;
  onPress?: () => void;
  uri: string;
};

export function ImageTile({
  accessibilityLabel,
  accessibilityState,
  children,
  className,
  fill,
  onPress,
  uri,
}: ImageTileProps) {
  const containerClassName = cn(
    'items-center justify-center overflow-hidden rounded-2xl bg-surface-secondary',
    fill ? 'absolute inset-0' : 'size-28',
    onPress && 'active:opacity-80',
    className,
  );
  const content = (
    <>
      <Image cachePolicy="memory-disk" className="absolute inset-0" contentFit="cover" source={uri} />
      {children}
    </>
  );

  if (!onPress) {
    return <View className={containerClassName}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      className={containerClassName}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}
