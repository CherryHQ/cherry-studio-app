import { ContentState, Tabs } from '@cherrystudio/ui/components';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { memo, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fileEntryPreviewKind,
  FileEntrySkeleton,
  LoadedFileEntryPreview,
} from '@/frontend/components/FileEntryPreview';

import {
  type FileLibraryEntry,
  type FileLibraryFilter,
  useFileEntries,
} from '../hooks/useFileEntries';
import { fileLibraryGrid, type FileLibraryViewMode } from '../utils/constants';
import { FILE_LIBRARY_ROW_ESTIMATED_SIZE, FileLibraryRow } from './FileLibraryRow';
import { FileLibrarySkeleton } from './FileLibrarySkeleton';

type FileLibraryListProps = {
  filter: FileLibraryFilter;
  isDataLoadEnabled: boolean;
  onFilterChange: (filter: FileLibraryFilter) => void;
  viewMode: FileLibraryViewMode;
};

type FileLibraryListExtraData = {
  dateFormatter: Intl.DateTimeFormat;
  tileSize: number;
  viewMode: FileLibraryViewMode;
};

const filterOrder: readonly FileLibraryFilter[] = ['all', 'image', 'document'];
const filterLabelKeys: Record<FileLibraryFilter, string> = {
  all: 'library.filter.all',
  document: 'library.filter.documents',
  image: 'library.filter.images',
};

/**
 * The library's grid or list. The filter row rides in the list header rather than above
 * the list, so on iOS it scrolls under the transparent native header with the
 * tiles instead of hiding behind it.
 */
export function FileLibraryList({
  filter,
  isDataLoadEnabled,
  onFilterChange,
  viewMode,
}: FileLibraryListProps) {
  const { t, i18n } = useTranslation();
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
    viewMode === 'grid' ? tileSize + fileLibraryGrid.tileGap : FILE_LIBRARY_ROW_ESTIMATED_SIZE;
  const dateFormatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const listExtraData: FileLibraryListExtraData = { dateFormatter, tileSize, viewMode };

  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: insets.bottom + fileLibraryGrid.pageEdge,
      // Keep the viewport and header gutters unchanged when columns switch.
      // Both item layouts supply the remaining half-gap in their row frame.
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
          <FileLibrarySkeleton
            count={fileLibraryGrid.skeletonTiles}
            tileSize={tileSize}
            viewMode={viewMode}
          />
        ) : (
          <View className="min-h-48 flex-1 justify-center px-6 pb-24">
            <ContentState.Empty testID="file-library-empty" title={t('library.empty')} />
          </View>
        )}
      </View>
    ),
    [isLoading, isLoadingMore, t, tileSize, viewMode],
  );
  const listFooter = useMemo(
    () =>
      isLoadingMore && entries.length > 0 ? (
        <FileLibrarySkeleton
          count={fileLibraryGrid.columns}
          tileSize={tileSize}
          viewMode={viewMode}
        />
      ) : null,
    [entries.length, isLoadingMore, tileSize, viewMode],
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
      extraData={listExtraData}
      keyExtractor={fileEntryKeyExtractor}
      ListEmptyComponent={listEmpty}
      ListFooterComponent={listFooter}
      ListHeaderComponent={listHeader}
      ListHeaderComponentStyle={styles.header}
      // Reflowing every file is a new layout, not a size change to compensate
      // by shifting the scroll container and its header.
      maintainVisibleContentPosition={false}
      numColumns={viewMode === 'grid' ? fileLibraryGrid.columns : 1}
      onEndReached={loadMore}
      onEndReachedThreshold={0.7}
      recycleItems
      renderItem={renderFileItem}
      showsVerticalScrollIndicator={false}
      testID={viewMode === 'grid' ? 'file-library-grid' : 'file-library-list'}
    />
  );
}

function fileEntryKeyExtractor(item: FileLibraryEntry) {
  return item.entry.id;
}

function renderFileItem({ extraData, item }: LegendListRenderItemProps<FileLibraryEntry>) {
  const { dateFormatter, tileSize, viewMode } = extraData as FileLibraryListExtraData;
  return viewMode === 'grid' ? (
    <FileTile item={item} size={tileSize} />
  ) : (
    <View style={styles.row}>
      <FileLibraryRow item={item} modifiedDate={dateFormatter.format(item.entry.updatedAt)} />
    </View>
  );
}

// URI pages retain prior item identities when a new page appends, so mounted
// tiles stay on the memoized path while the next page resolves.
const FileTile = memo(function FileTile({ item, size }: { item: FileLibraryEntry; size: number }) {
  return (
    <View
      style={{
        paddingBottom: fileLibraryGrid.tileGap,
        paddingHorizontal: fileLibraryGrid.tileGap / 2,
      }}
    >
      {fileEntryPreviewKind(item.entry) === 'image' && !item.previewUri ? (
        <FileEntrySkeleton size={size} variant="card" />
      ) : (
        <LoadedFileEntryPreview
          entry={item.entry}
          previewUri={item.previewUri}
          size={size}
          uri={item.uri}
          variant="card"
        />
      )}
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
  row: {
    paddingHorizontal: fileLibraryGrid.tileGap / 2,
  },
});
