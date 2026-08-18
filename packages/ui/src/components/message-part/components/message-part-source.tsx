import { GlobeIcon, SquareArrowOutUpRightIcon } from '@cherrystudio/app-icons';
import { Pressable, Text, View } from 'react-native';

import type { MessagePartSourceProps } from '../message-part.types';

export function MessagePartSource({
  label,
  onPress,
  url,
  variant = 'card',
  ...props
}: MessagePartSourceProps) {
  const containerClassName =
    variant === 'card'
      ? 'min-h-11 flex-row items-center gap-2 rounded-lg border border-border bg-secondary p-2 active:opacity-70'
      : '-mx-2 min-h-10 flex-row items-center gap-2 rounded-md px-2 py-1.5 active:bg-secondary-active active:opacity-80';

  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      accessibilityRole="link"
      className={containerClassName}
      onPress={() => onPress(url)}
    >
      <GlobeIcon className="size-4 shrink-0 text-foreground" />
      <View className="min-w-0 flex-1">
        <Text className="font-medium text-foreground text-base" numberOfLines={1} selectable>
          {label || url}
        </Text>
      </View>
      <SquareArrowOutUpRightIcon className="size-4 shrink-0 text-foreground" />
    </Pressable>
  );
}
