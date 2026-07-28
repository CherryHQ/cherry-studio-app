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
  /** Inset hairline that separates this row from the next one inside a grouped card. */
  showSeparator?: boolean;
  statusLabel?: string;
  statusTone?: 'danger' | 'default' | 'success';
  subtitle?: string;
};

export const SettingsServiceRow = memo(function SettingsServiceRow({
  avatar,
  id,
  imageSource,
  isEnabled,
  name,
  onPress,
  showSeparator = false,
  statusLabel,
  statusTone = 'default',
  subtitle,
}: SettingsServiceRowProps) {
  const accessibilityLabel = [name, statusLabel, subtitle].filter(Boolean).join(', ');

  return (
    <View>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className="min-h-11 flex-row items-center justify-between px-4 py-2.5 active:opacity-60"
        onPress={onPress}
      >
        <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
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
          <View className="min-w-0 flex-1 gap-0.5">
            <Text
              className={cn(
                'min-w-0 text-base',
                isEnabled ? 'text-foreground' : 'text-default-foreground',
              )}
              numberOfLines={1}
            >
              {name}
            </Text>
            {subtitle ? (
              <Text className="text-foreground-muted text-sm" numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        <View className="ml-2 flex-row items-center gap-2">
          {statusLabel && statusTone === 'success' ? (
            <View
              className="h-5 shrink-0 items-center justify-center rounded-lg border px-1.5"
              style={{
                backgroundColor: '#00b96b20',
                borderColor: '#00b96b66',
              }}
            >
              <Text className="font-medium text-xs" numberOfLines={1} style={{ color: '#00b96b' }}>
                {statusLabel}
              </Text>
            </View>
          ) : statusLabel ? (
            <Text
              className={cn(
                'shrink-0 text-xs',
                statusTone === 'danger' ? 'text-danger' : 'text-default-foreground',
              )}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
          ) : null}
          <ChevronRightIcon className="size-6 text-default-foreground" strokeWidth={2} />
        </View>
      </Pressable>
      {showSeparator ? (
        <View className="mx-4 h-px bg-border" testID="settings-service-row-separator" />
      ) : null}
    </View>
  );
});
