import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { cn } from '@cherrystudio/ui/utils';
import { LegendList } from '@legendapp/list/react-native';
import type { ReactElement, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** What one catalog row shows; the list owns its frame, separator and press target. */
export type MarketplaceRow = {
  accessibilityLabel: string;
  description?: string;
  key: string;
  leading?: ReactNode;
  metadata?: string;
  onPress(): void;
  testID?: string;
  title: string;
};

// A 40pt avatar or two text lines, 12pt vertical padding and the hairline separator.
const ROW_ESTIMATED_HEIGHT = 77;

/**
 * One grouped card for a catalog. Each row draws its slice of the card, so the list stays
 * virtualized while reading as the same inset group as the Agent list and settings.
 */
export function MarketplaceList<T>({
  data,
  empty,
  footer,
  header,
  onEndReached,
  renderRow,
  testID,
}: {
  data: readonly T[];
  empty: ReactElement;
  footer?: ReactElement | null;
  header?: ReactElement | null;
  onEndReached?: () => void;
  renderRow: (item: T) => MarketplaceRow;
  testID?: string;
}) {
  const { bottom } = useSafeAreaInsets();
  const rows = data.map(renderRow);
  const lastKey = rows.at(-1)?.key;

  return (
    <LegendList
      alwaysBounceVertical={false}
      contentContainerStyle={{ paddingBottom: bottom + 24, paddingHorizontal: 16, paddingTop: 4 }}
      contentInsetAdjustmentBehavior="never"
      data={rows}
      estimatedItemSize={ROW_ESTIMATED_HEIGHT}
      extraData={lastKey}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.key}
      ListEmptyComponent={<View className="px-4 py-16">{empty}</View>}
      ListFooterComponent={footer ?? undefined}
      ListHeaderComponent={header ?? undefined}
      maintainVisibleContentPosition={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      recycleItems
      renderItem={({ index, item }) => (
        <View
          className={cn(
            'overflow-hidden bg-card',
            index === 0 && 'rounded-t-2xl',
            item.key === lastKey && 'rounded-b-2xl',
          )}
          style={styles.cardSlice}
        >
          {index === 0 ? null : <View className="mx-4 h-px bg-border" />}
          <MarketplaceRowView row={item} />
        </View>
      )}
      showsVerticalScrollIndicator={false}
      style={styles.list}
      testID={testID}
    />
  );
}

function MarketplaceRowView({ row }: { row: MarketplaceRow }) {
  return (
    <Pressable
      accessibilityLabel={row.accessibilityLabel}
      accessibilityRole="link"
      className="w-full active:bg-foreground/5"
      onPress={row.onPress}
      testID={row.testID}
    >
      <View className="min-w-0 flex-row items-center gap-3 px-4 py-3">
        {row.leading ? <View className="shrink-0 self-start">{row.leading}</View> : null}
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base text-foreground" numberOfLines={1}>
            {row.title}
          </Text>
          {row.description ? (
            <Text className="text-sm text-muted-foreground" numberOfLines={2}>
              {row.description}
            </Text>
          ) : null}
          {row.metadata ? (
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {row.metadata}
            </Text>
          ) : null}
        </View>
        <ChevronRightIcon className="size-5 text-muted-foreground" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardSlice: { borderCurve: 'continuous' },
  list: { flex: 1 },
});
