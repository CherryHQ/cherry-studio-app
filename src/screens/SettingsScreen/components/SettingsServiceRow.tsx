import type { ImageSource } from 'expo-image';
import { cn } from 'heroui-native/utils';
import { ChevronRightIcon } from 'lucide-uniwind/png';
import { memo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from '@/components/nativePrimitives';

export type SettingsServiceRowProps = {
  /** Custom leading visual; takes precedence over `imageSource` when provided. */
  avatar?: ReactNode;
  id: string;
  imageSource?: ImageSource | number;
  isEnabled: boolean;
  name: string;
  onPress: () => void;
};

export const SettingsServiceRow = memo(function SettingsServiceRow({
  avatar,
  id,
  imageSource,
  isEnabled,
  name,
  onPress,
}: SettingsServiceRowProps) {
  return (
    <View>
      <Pressable
        accessibilityLabel={name}
        accessibilityRole="button"
        className="flex-row items-center justify-between active:opacity-60 py-2 px-2"
        onPress={onPress}
      >
        <View className="flex-1 flex-row items-center gap-2">
          {avatar ??
            (imageSource ? (
              <Image
                cachePolicy="memory-disk"
                className="size-5"
                contentFit="contain"
                recyclingKey={id}
                source={imageSource}
              />
            ) : null)}
          <Text
            className={cn(
              'flex-1 text-base',
              isEnabled ? 'text-foreground' : 'text-default-foreground',
            )}
            numberOfLines={1}
          >
            {name}
          </Text>
        </View>
        <ChevronRightIcon className="size-6 text-default-foreground" strokeWidth={2} />
      </Pressable>
    </View>
  );
});
