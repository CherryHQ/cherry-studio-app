import SparklesIcon from '@cherrystudio/app-icons/icons/sparkles';
import { ContentState, Tabs } from '@cherrystudio/ui/components';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { memo, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FileEntrySkeleton, LoadedFileEntryPreview } from '@/frontend/components/FileEntryPreview';

import { FileLibrarySkeleton } from './components/FileLibrarySkeleton';
import {
  type FileLibraryEntry,
  type FileLibraryFilter,
  useFileEntries,
} from './hooks/useFileEntries';
import { fileLibraryGrid } from './utils/constants';

type FileLibraryListProps = {
  filter: FileLibraryFilter;
  isDataLoadEnabled: boolean;
  onFilterChange: (filter: FileLibraryFilter) => void;
};

const filterOrder: readonly FileLibraryFilter[] = ['all', 'image', 'document'];
const filterLabelKeys: Record<FileLibraryFilter, string> = {
  all: 'library.filter.all',
  document: 'library.filter.documents',
  image: 'library.filter.images',
};

/**
 * The library's grid. The filter row rides in the list header rather than above
 * the list, so on iOS it scrolls under the transparent native header with the
 * tiles instead of hiding behind it.
 */
export function FileLibraryList({
  filter,
  isDataLoadEnabled,
  onFilterChange,
}: FileLibraryListProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { entries, isLoading, isLoadingMore, loadMore } = useFileEntries(filter, {
    enabled: isDataLoadEnabled,
  });
  const listRef = useRef<LegendListRef>(null);
  const tileSize =
    (windowWidth - fileLibraryGrid.pageEdge * 2 - fileLibraryGrid.tileGap) /
    fileLibraryGrid.columns;
  const estimatedItemSize =
    tileSize + fileLibraryGrid.tileMetadataEstimatedHeight + fileLibraryGrid.tileGap;

  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: insets.bottom + fileLibraryGrid.pageEdge,
      // Half a gap of page margin here plus half on every tile adds up to the
      // full page edge outside and a full gap between columns.
      paddingHorizontal: fileLibraryGrid.pageEdge - fileLibraryGrid.tileGap / 2,
    }),
    [insets.bottom],
  );
  const listHeader = useMemo(
    () => (
      <View className="pt-2 pb-4">
        <Tabs
          accessibilityLabel={t('library.filter.label')}
          items={filterOrder.map((value) => ({ label: t(filterLabelKeys[value]), value }))}
          layout="hug"
          onValueChange={onFilterChange}
          value={filter}
        />
      </View>
    ),
    [filter, onFilterChange, t],
  );
  // A kind tab with nothing in it yet is still filling itself, so it shows the
  // same placeholders as the first load rather than claiming the library is
  // empty.
  const listEmpty = useMemo(
    () => (
      <View style={styles.empty}>
        {isLoading || isLoadingMore ? (
          <FileLibrarySkeleton count={fileLibraryGrid.skeletonTiles} tileSize={tileSize} />
        ) : (
          <ContentState.Empty
            className="min-h-48 flex-1 px-6 pb-24"
            testID="file-library-empty"
            title={t('library.empty')}
          />
        )}
      </View>
    ),
    [isLoading, isLoadingMore, t, tileSize],
  );
  const listFooter = useMemo(
    () =>
      isLoadingMore && entries.length > 0 ? (
        <FileLibrarySkeleton count={fileLibraryGrid.columns} tileSize={tileSize} />
      ) : null,
    [entries.length, isLoadingMore, tileSize],
  );

  return (
    <LegendList
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      ref={listRef}
      // Kept mounted through loading: a list that mounts late on iOS measures a
      // zero top inset and starts scrolled under the header.
      data={isLoading ? [] : entries}
      estimatedItemSize={estimatedItemSize}
      extraData={tileSize}
      keyExtractor={fileEntryKeyExtractor}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={listFooter}
      ListHeaderComponent={listHeader}
      ListHeaderComponentStyle={styles.header}
      numColumns={fileLibraryGrid.columns}
      onEndReached={loadMore}
      onEndReachedThreshold={0.7}
      recycleItems
      renderItem={renderFileTile}
      showsVerticalScrollIndicator={false}
      testID="file-library-grid"
    />
  );
}

function fileEntryKeyExtractor(item: FileLibraryEntry) {
  return item.entry.id;
}

function renderFileTile({ extraData, item }: LegendListRenderItemProps<FileLibraryEntry>) {
  return <FileTile item={item} size={extraData as number} />;
}

// URI pages retain prior item identities when a new page appends, so mounted
// tiles stay on the memoized path while the next page resolves.
const FileTile = memo(function FileTile({ item, size }: { item: FileLibraryEntry; size: number }) {
  const { t } = useTranslation();
  // Only a proven origin is worth saying. Most rows are imports, and rows that
  // predate the field have no proven origin at all, so labelling everything
  // would either repeat itself or claim something the data does not support.
  const isGenerated = item.entry.provenance === 'generated';

  return (
    <View
      className="gap-2"
      style={{
        paddingBottom: fileLibraryGrid.tileGap,
        paddingHorizontal: fileLibraryGrid.tileGap / 2,
      }}
    >
      {item.entry.mediaType.startsWith('image/') && !item.previewUri ? (
        <FileEntrySkeleton size={size} />
      ) : (
        <LoadedFileEntryPreview
          entry={item.entry}
          previewUri={item.previewUri}
          size={size}
          uri={item.uri}
        />
      )}
      <View className="min-w-0 gap-0.5 px-0.5">
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {item.entry.filename}
        </Text>
        {/* Held open whether or not the badge shows, so a labelled tile does not
            make its whole grid row taller than its neighbours. */}
        <View className="flex-row items-center gap-1" style={styles.provenance}>
          {isGenerated ? (
            <>
              <SparklesIcon className="size-3.5 text-muted-foreground" />
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                {t('library.provenance.generated')}
              </Text>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  empty: {
    flexGrow: 1,
  },
  header: {
    marginHorizontal: fileLibraryGrid.tileGap / 2,
  },
  provenance: {
    height: fileLibraryGrid.tileProvenanceHeight,
  },
});
