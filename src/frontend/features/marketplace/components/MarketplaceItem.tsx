import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

/** One content-led row shared by the marketplace's two catalogs. */
export function MarketplaceItem({
  accessibilityLabel,
  action,
  children,
  description,
  onPress,
  testID,
}: {
  accessibilityLabel: string;
  action?: ReactNode;
  children: ReactNode;
  description: string;
  onPress(): void;
  testID?: string;
}) {
  return (
    <View className="flex-row items-center gap-3 border-b border-border-subtle py-5">
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={description}
        accessibilityRole="button"
        className="min-w-0 flex-1 active:opacity-70"
        onPress={onPress}
        testID={testID}
      >
        {children}
      </Pressable>
      {action}
    </View>
  );
}

/** Static content also fits the shared search route, which owns its own selection target. */
export function MarketplaceItemContent({
  description,
  leading,
  metadata,
  title,
  trailing,
}: {
  description: string;
  leading: ReactNode;
  metadata?: ReactNode;
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <View className="flex-row items-start gap-3">
      {leading}
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-semibold text-base text-foreground" numberOfLines={2}>
          {title}
        </Text>
        {description ? (
          <Text className="text-sm text-muted-foreground" numberOfLines={2}>
            {description}
          </Text>
        ) : null}
        {metadata ? <View className="pt-1">{metadata}</View> : null}
      </View>
      {trailing ? <View className="self-center">{trailing}</View> : null}
    </View>
  );
}
