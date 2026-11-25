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

/** One catalog entry: card in multi-column wide grids, or flat list row on phones. */
export function MarketplaceRow({
  entry,
  isCard = false,
}: {
  entry: MarketplaceEntry;
  isCard?: boolean;
}) {
  return (
    <Pressable
      accessibilityHint={entry.description}
      accessibilityLabel={entry.title}
      accessibilityRole="link"
      className={
        isCard
          ? 'bg-card border-border-subtle flex-row items-center gap-3.5 rounded-2xl border px-3.5 py-3 active:opacity-80'
          : 'flex-row items-center gap-4 py-3 active:opacity-60'
      }
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
