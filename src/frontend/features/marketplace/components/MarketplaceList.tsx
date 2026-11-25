import { LegendList } from '@legendapp/list/react-native';
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRootNavigationDockClearance } from '@/frontend/appShell/navigationShell/state';

import { type MarketplaceEntry, MarketplaceRow } from './MarketplaceRow';
import { useMarketplaceColumns } from './useMarketplaceColumns';

// A 48pt mark with 12pt above and below.
const ROW_ESTIMATED_HEIGHT = 72;

/** Every entry of one collection or search, flat and virtualized, in the same columns as sections. */
export function MarketplaceList({
  empty,
  entries,
  footer,
  header,
  onEndReached,
  testID,
}: {
  empty: ReactElement;
  entries: readonly MarketplaceEntry[];
  footer?: ReactElement | null;
  header?: ReactElement | null;
  onEndReached?: () => void;
  testID?: string;
}) {
  const { bottom } = useSafeAreaInsets();
  const dockClearance = useRootNavigationDockClearance();
  const columns = useMarketplaceColumns();
  const isCardLayout = columns >= 2;

  return (
    <LegendList
      key={columns}
      alwaysBounceVertical={false}
      contentContainerStyle={{
        paddingBottom: bottom + dockClearance + 24,
        paddingHorizontal: isCardLayout ? 8 : 0,
        paddingTop: 4,
      }}
      contentInsetAdjustmentBehavior="never"
      data={entries}
      estimatedItemSize={ROW_ESTIMATED_HEIGHT}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      keyExtractor={(entry) => entry.key}
      ListEmptyComponent={<View className="px-8 py-16">{empty}</View>}
      ListFooterComponent={footer ?? undefined}
      ListHeaderComponent={header ?? undefined}
      maintainVisibleContentPosition={false}
      numColumns={columns}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      recycleItems
      renderItem={({ item }) => (
        <View className={isCardLayout ? 'px-2 py-1.5' : 'px-4'}>
          <MarketplaceRow entry={item} isCard={isCardLayout} />
        </View>
      )}
      showsVerticalScrollIndicator={false}
      style={[styles.list, isCardLayout && styles.wideList]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  wideList: { alignSelf: 'center', maxWidth: 880, width: '100%' },
});
