import { ChevronRightIcon, type PngIconProps } from 'lucide-uniwind/png';
import type { ComponentType, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

export type SettingsItemProps = {
  accessory?: ReactNode;
  hideAccessory?: boolean;
  icon?: ComponentType<PngIconProps>;
  iconEmoji?: string;
  id?: string;
  onPress?: () => void;
  onPressIn?: () => void;
  title: string;
};

export function SettingsItem({
  accessory,
  hideAccessory,
  icon: Icon,
  iconEmoji,
  onPress,
  onPressIn,
  title,
}: SettingsItemProps) {
  const isPressable = Boolean(onPress);

  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole={isPressable ? 'button' : undefined}
      className="flex-row items-center justify-between gap-4 px-4 py-3 active:opacity-70"
      disabled={!isPressable}
      onPress={onPress}
      onPressIn={onPressIn}
    >
      <View className="flex-1 flex-row items-center gap-3">
        {iconEmoji ? (
          <Text className="w-6 text-center text-xl leading-6">{iconEmoji}</Text>
        ) : Icon ? (
          <Icon className="size-6 text-default-foreground" strokeWidth={2} />
        ) : null}
        <Text className="flex-1 text-base text-foreground" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {hideAccessory
        ? null
        : (accessory ?? (
            <ChevronRightIcon className="size-6 text-default-foreground" strokeWidth={2} />
          ))}
    </Pressable>
  );
}
