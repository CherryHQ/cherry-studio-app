import type { ImageSource } from 'expo-image';
import { ChevronRightIcon, type PngIconProps } from 'lucide-uniwind/png';
import type { ComponentType, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Image } from '@/frontend/components/nativePrimitives';

export type SettingsItemProps = {
  accessory?: ReactNode;
  hideAccessory?: boolean;
  icon?: ComponentType<PngIconProps>;
  iconEmoji?: string;
  id?: string;
  imageSource?: ImageSource | number;
  onPress?: () => void;
  onPressIn?: () => void;
  title: string;
};

export function SettingsItem({
  accessory,
  hideAccessory,
  icon: Icon,
  iconEmoji,
  imageSource,
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
          <Text allowFontScaling={false} className="w-6 text-center" style={styles.iconEmoji}>
            {iconEmoji}
          </Text>
        ) : imageSource ? (
          <Image
            cachePolicy="memory-disk"
            className="size-6"
            contentFit="contain"
            source={imageSource}
          />
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

const styles = StyleSheet.create({
  iconEmoji: {
    fontSize: 20,
    lineHeight: 24,
  },
});
