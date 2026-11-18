import { Pressable, Text, View } from 'react-native';

import { MarketplaceIcon } from './MarketplaceIcon';

/** What one catalog entry shows. The section or list around it owns its gutter. */
export type MarketplaceEntry = {
  description?: string;
  emoji?: string;
  key: string;
  kind: 'skill' | 'template';
  onPress(): void;
  testID?: string;
  title: string;
};

/** One flat catalog entry: mark, name and one-line purpose, opening the entry's page. */
export function MarketplaceRow({ entry }: { entry: MarketplaceEntry }) {
  return (
    <Pressable
      accessibilityHint={entry.description}
      accessibilityLabel={entry.title}
      accessibilityRole="link"
      className="flex-row items-center gap-4 py-3 active:opacity-60"
      onPress={entry.onPress}
      testID={entry.testID}
    >
      {entry.kind === 'skill' ? (
        <MarketplaceIcon kind="skill" />
      ) : (
        <MarketplaceIcon emoji={entry.emoji} kind="template" name={entry.title} />
      )}
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-medium text-foreground" numberOfLines={1}>
          {entry.title}
        </Text>
        {entry.description ? (
          <Text className="text-sm text-muted-foreground" numberOfLines={1}>
            {entry.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
