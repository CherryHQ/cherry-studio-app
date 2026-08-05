import { Section } from '@cherrystudio/ui/components';
import type { ImageSource } from 'expo-image';
import { cn } from 'heroui-native/utils';
import { ChevronRightIcon } from 'lucide-uniwind/png';
import { memo, type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';

import { Image } from '@/frontend/components/nativePrimitives';

import { SettingsGroupedSeparator } from './SettingsGroupedSeparator';

export type SettingsServiceRowProps = {
  /** Custom leading visual; takes precedence over `imageSource` when provided. */
  avatar?: ReactNode;
  id: string;
  hideSeparator?: boolean;
  imageSource?: ImageSource | number;
  isEnabled: boolean;
  name: string;
  onPress: () => void;
  onPressedChange?: (id: string, isPressed: boolean) => void;
  /** Draws {@link SettingsGroupedSeparator} above the row. */
  showSeparator?: boolean;
  statusLabel?: string;
  statusTone?: 'danger' | 'default' | 'success';
  subtitle?: string;
};

export const SettingsServiceRow = memo(function SettingsServiceRow({
  avatar,
  hideSeparator = false,
  id,
  imageSource,
  isEnabled,
  name,
  onPress,
  onPressedChange,
  showSeparator = false,
  statusLabel,
  statusTone = 'default',
  subtitle,
}: SettingsServiceRowProps) {
  const accessibilityLabel = [name, statusLabel, subtitle].filter(Boolean).join(', ');
  const [isPressed, setIsPressed] = useState(false);

  return (
    <View>
      {showSeparator ? <SettingsGroupedSeparator hidden={hideSeparator || isPressed} /> : null}
      <Section.Item
        accessibilityLabel={accessibilityLabel}
        description={
          subtitle ? (
            <Text className="text-foreground-tertiary text-sm" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : undefined
        }
        label={
          <Text
            className={cn(
              'min-w-0 text-base',
              isEnabled ? 'text-foreground' : 'text-default-foreground',
            )}
            numberOfLines={1}
          >
            {name}
          </Text>
        }
        leading={
          avatar ??
          (imageSource ? (
            <Image
              cachePolicy="memory-disk"
              className="size-5"
              contentFit="contain"
              recyclingKey={id}
              source={imageSource}
            />
          ) : null)
        }
        onPress={onPress}
        onPressIn={() => {
          setIsPressed(true);
          onPressedChange?.(id, true);
        }}
        onPressOut={() => {
          setIsPressed(false);
          onPressedChange?.(id, false);
        }}
        showChevron={false}
        trailing={
          <View className="flex-row items-center gap-2">
            {statusLabel && statusTone === 'success' ? (
              <View
                className="h-5 shrink-0 items-center justify-center rounded-lg border px-1.5"
                style={{
                  backgroundColor: '#00b96b20',
                  borderColor: '#00b96b66',
                }}
              >
                <Text
                  className="font-medium text-xs"
                  numberOfLines={1}
                  style={{ color: '#00b96b' }}
                >
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
            <ChevronRightIcon className="size-5 text-muted-foreground" strokeWidth={2} />
          </View>
        }
      />
    </View>
  );
});
