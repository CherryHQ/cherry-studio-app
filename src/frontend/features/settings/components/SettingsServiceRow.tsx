import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Image, Section, Switch, type SwitchProps } from '@cherrystudio/ui/components';
import { cn } from '@cherrystudio/ui/utils';
import type { ImageSource } from 'expo-image';
import { memo, type ReactNode, useState } from 'react';
import { Text, View } from 'react-native';

import { SettingsGroupedSeparator } from './SettingsGroupedSeparator';

export type SettingsServiceRowProps = {
  /** Custom leading visual; takes precedence over `imageSource` when provided. */
  avatar?: ReactNode;
  enabledSwitch?: SwitchProps;
  id: string;
  hideSeparator?: boolean;
  imageSource?: ImageSource | number;
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
  enabledSwitch,
  hideSeparator = false,
  id,
  imageSource,
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
          <Text className="min-w-0 text-base text-foreground" numberOfLines={1}>
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
              <View className="h-5 shrink-0 items-center justify-center rounded-lg border border-success-border bg-success-subtle px-1.5">
                <Text
                  className="font-medium text-success-subtle-foreground text-xs"
                  numberOfLines={1}
                >
                  {statusLabel}
                </Text>
              </View>
            ) : statusLabel ? (
              <Text
                className={cn(
                  'shrink-0 text-xs',
                  statusTone === 'danger' ? 'text-destructive' : 'text-foreground',
                )}
                numberOfLines={1}
              >
                {statusLabel}
              </Text>
            ) : null}
            {enabledSwitch ? <Switch {...enabledSwitch} /> : null}
            <ChevronRightIcon className="size-5 text-muted-foreground" />
          </View>
        }
      />
    </View>
  );
});
