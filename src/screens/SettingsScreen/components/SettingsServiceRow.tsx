import { Image, type ImageSource } from 'expo-image';
import { ChevronRightIcon } from 'lucide-uniwind';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { withUniwind } from 'uniwind';

export type SettingsServiceRowProps = {
  id: string;
  imageSource?: ImageSource | number;
  isEnabled: boolean;
  name: string;
  onPress: () => void;
};

const StyledPressable = withUniwind(Pressable);

export const SettingsServiceRow = memo(function SettingsServiceRow({
  id,
  imageSource,
  isEnabled,
  name,
  onPress,
}: SettingsServiceRowProps) {
  return (
    <View className="bg-surface-secondary">
      <StyledPressable
        accessibilityLabel={name}
        accessibilityRole="button"
        className="flex-row items-center justify-between active:opacity-60 py-2 px-2"
        onPress={onPress}
      >
        <View className="flex-1 flex-row items-center gap-2">
          {imageSource ? (
            <Image
              cachePolicy="memory-disk"
              contentFit="contain"
              recyclingKey={id}
              source={imageSource}
              style={styles.icon}
            />
          ) : null}
          <Text
            className={[
              'flex-1 text-base',
              isEnabled ? 'text-foreground' : 'text-default-foreground',
            ].join(' ')}
            numberOfLines={1}
          >
            {name}
          </Text>
        </View>
        <ChevronRightIcon className="size-6 text-default-foreground" strokeWidth={2} />
      </StyledPressable>
    </View>
  );
});

const styles = StyleSheet.create({
  icon: {
    height: 28,
    width: 28,
  },
});
