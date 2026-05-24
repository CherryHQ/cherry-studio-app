import { ChevronRightIcon } from 'lucide-uniwind';
import type { ComponentType, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import { withUniwind } from 'uniwind';

export type SettingsItemProps = {
  accessory?: ReactNode;
  hideAccessory?: boolean;
  icon?: ComponentType<SvgProps>;
  iconEmoji?: string;
  id?: string;
  onPress?: () => void;
  onPressIn?: () => void;
  title: string;
};

const StyledPressable = withUniwind(Pressable);

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
    <StyledPressable
      accessibilityLabel={title}
      accessibilityRole={isPressable ? 'button' : undefined}
      className="min-h-12 flex-row items-center justify-between gap-4 px-4 py-4 active:opacity-60 disabled:active:opacity-100"
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
    </StyledPressable>
  );
}
