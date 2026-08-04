import type { ImageSource } from 'expo-image';
import { ChevronRightIcon, type PngIconProps } from 'lucide-uniwind/png';
import type { ComponentType, ReactNode } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';

import { Image } from '@/frontend/components/nativePrimitives';

export type SectionItemProps = {
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

type SectionProps = {
  action?: ReactNode;
  children?: ReactNode;
  contentClassName?: string;
  items?: readonly SectionItemProps[];
  onLayout?: ViewProps['onLayout'];
  subtitle?: string;
  testID?: string;
  title?: string;
  titleAccessory?: ReactNode;
};

export function Section({
  action,
  children,
  contentClassName,
  items,
  onLayout,
  subtitle,
  testID,
  title,
  titleAccessory,
}: SectionProps) {
  const hasHeader = Boolean(title || subtitle || action || titleAccessory);

  return (
    <View className="gap-2" testID={testID} onLayout={onLayout}>
      {hasHeader ? (
        <View className="flex-row items-center justify-between gap-3 px-1">
          <View className="min-w-0 flex-1 gap-0.5">
            {title || titleAccessory ? (
              <View className="flex-row items-center gap-2">
                {title ? (
                  <Text
                    selectable
                    className="shrink font-medium text-default-foreground text-sm"
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                ) : null}
                {titleAccessory}
              </View>
            ) : null}
            {subtitle ? (
              <Text
                selectable
                className="text-muted-foreground text-xs"
                maxFontSizeMultiplier={1.1}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            ) : null}
          </View>
          {action}
        </View>
      ) : null}

      <View
        className={`overflow-hidden rounded-xl bg-settings-grouped-surface${contentClassName ? ` ${contentClassName}` : ''}`}
        testID={testID ? `${testID}-content` : undefined}
      >
        {items?.map((item) => (
          <SectionItem key={item.id ?? item.title} {...item} />
        ))}
        {children}
      </View>
    </View>
  );
}

function SectionItem({
  accessory,
  hideAccessory,
  icon: Icon,
  iconEmoji,
  imageSource,
  onPress,
  onPressIn,
  title,
}: SectionItemProps) {
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
