import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import SquareArrowOutUpRightIcon from '@cherrystudio/app-icons/icons/square-arrow-out-up-right';
import { Pressable, Text, View } from 'react-native';

import type { MessagePartSourceProps } from '../message-part.types';

export function MessagePartSource({
  label,
  onPress,
  url,
  variant = 'card',
  ...props
}: MessagePartSourceProps) {
  const isCard = variant === 'card';
  const containerClassName = isCard
    ? 'min-h-11 flex-row items-center gap-2 rounded-lg border border-border bg-secondary p-2 active:opacity-70'
    : '-mx-2 min-h-10 flex-row items-center gap-2 rounded-md px-2 py-1.5 active:bg-secondary-active active:opacity-80';
  const iconClassName = isCard
    ? 'size-4 shrink-0 text-foreground'
    : 'size-4 shrink-0 text-muted-foreground';

  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      accessibilityRole="link"
      className={containerClassName}
      onPress={() => onPress(url)}
    >
      <GlobeIcon className={iconClassName} />
      <View className="min-w-0 flex-1">
        <Text
          className={isCard ? 'font-medium text-foreground text-base' : 'text-foreground text-sm'}
          numberOfLines={1}
          selectable
        >
          {label || url}
        </Text>
      </View>
      <SquareArrowOutUpRightIcon className={iconClassName} />
    </Pressable>
  );
}
