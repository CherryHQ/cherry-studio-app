import { ContentState, SelectionIndicator, Tabs } from '@cherrystudio/ui/components';
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
} from '@legendapp/list/react-native';
import { memo, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  fileEntryPreviewKind,
  FileEntrySkeleton,
  LoadedFileEntryPreview,
  useOpenFileEntry,
} from '@/frontend/components/FileEntryPreview';
import {
  type SelectionSource,
  useListBottomInset,
  usePendingDeletionIds,
  useRegisterSelectionSource,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/Selection';
import { useBackendModule } from '@/frontend/data';

import {
  type FileLibraryEntry,
  type FileLibraryFilter,
  useFileEntries,
} from '../hooks/useFileEntries';
import {
  fileLibraryGrid,
  fileLibrarySelectionScope,
  type FileLibraryViewMode,
} from '../utils/constants';
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
  isEditing: boolean;
  onStartSelection: (fileEntryId: string) => void;
  onToggle: (fileEntryId: string) => void;
  selectedIds: ReadonlySet<string>;
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
  const file = useBackendModule('file');
  const bottomInset = useListBottomInset();
  const pendingDeletionIds = usePendingDeletionIds(fileLibrarySelectionScope);
  const { enterEditing, toggleId } = useSelectionActions();
  const { isDeletionPending, isEditing, selectedIds } = useSelectionState();
  const { width: windowWidth } = useWindowDimensions();
  const { entries, error, isLoading, isLoadingMore, loadMore, refresh } = useFileEntries(filter, {
    enabled: isDataLoadEnabled,
  });
  const visibleEntries = useMemo(
    () =>
      pendingDeletionIds.size === 0
        ? entries
        : entries.filter((item) => !pendingDeletionIds.has(item.entry.id)),
    [entries, pendingDeletionIds],
  );
  const selectionSource = useMemo<SelectionSource>(
    () => ({
      copy: {
        deleteFailed: 'library.selection.deleteFailed',
        deleteMessage: 'library.selection.deleteMessage',
        deleteTitle: 'library.selection.deleteTitle',
      },
      deleteSelected: async (ids) => {
        const results = await Promise.allSettled(ids.map((id) => file.delete(id)));
        const firstFailure = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (firstFailure) {
          throw firstFailure.reason;
        }
      },
      getAllIds: () => visibleEntries.map((item) => item.entry.id),
    }),
    [file, visibleEntries],
  );
  useRegisterSelectionSource(fileLibrarySelectionScope, selectionSource);
  const listRef = useRef<LegendListRef>(null);
  const tileSize =
    (windowWidth - fileLibraryGrid.pageEdge * 2 - fileLibraryGrid.tileGap) /
    fileLibraryGrid.columns;
  const estimatedItemSize =
    viewMode === 'grid' ? tileSize + fileLibraryGrid.tileGap : FILE_LIBRARY_ROW_ESTIMATED_SIZE;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    [locale],
  );
  const handleStartSelection = useCallback(
    (fileEntryId: string) => {
      if (isEditing || isDeletionPending) {
        return;
      }
      enterEditing();
      toggleId(fileEntryId);
    },
    [enterEditing, isDeletionPending, isEditing, toggleId],
  );
  const listExtraData = useMemo<FileLibraryListExtraData>(
    () => ({
      dateFormatter,
      isEditing,
      onStartSelection: handleStartSelection,
      onToggle: toggleId,
      selectedIds,
      tileSize,
      viewMode,
    }),
    [dateFormatter, handleStartSelection, isEditing, selectedIds, tileSize, toggleId, viewMode],
  );

  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: bottomInset,
      // Keep the viewport and header gutters unchanged when columns switch.
      // Both item layouts supply the remaining half-gap in their row frame.
      paddingHorizontal: fileLibraryGrid.pageEdge - fileLibraryGrid.tileGap / 2,
    }),
    [bottomInset],
  );
  const listHeader = useMemo(
    () =>
      isEditing ? null : (
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
    [filter, isEditing, onFilterChange, t],
  );
  // A kind tab with nothing in it yet is still filling itself, so it shows the
  // same placeholders as the first load rather than claiming the library is
  // empty.
  const listEmpty = useMemo(
    () => (
      <View style={styles.empty}>
        {error ? (
          <View className="min-h-48 flex-1 justify-center px-6 pb-24">
            <ContentState.Error
              primaryAction={{ children: t('common.retry'), onPress: () => void refresh() }}
              title={t('library.loadFailed')}
            />
          </View>
        ) : isLoading || isLoadingMore ? (
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
    [error, isLoading, isLoadingMore, refresh, t, tileSize, viewMode],
  );
  const listFooter = useMemo(
    () =>
      visibleEntries.length === 0 ? null : error ? (
        <View className="px-6 py-4">
          <ContentState.Error
            primaryAction={{ children: t('common.retry'), onPress: () => void refresh() }}
            title={t('library.loadFailed')}
          />
        </View>
      ) : isLoadingMore ? (
        <FileLibrarySkeleton
          count={fileLibraryGrid.columns}
          tileSize={tileSize}
          viewMode={viewMode}
        />
      ) : null,
    [error, isLoadingMore, refresh, t, tileSize, viewMode, visibleEntries.length],
  );

  return (
    <LegendList
      contentContainerStyle={contentContainerStyle}
      contentInsetAdjustmentBehavior="automatic"
      ref={listRef}
      // Kept mounted through loading: a list that mounts late on iOS measures a
      // zero top inset and starts scrolled under the header.
      data={isLoading ? [] : visibleEntries}
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
  const { dateFormatter, isEditing, onStartSelection, onToggle, selectedIds, tileSize, viewMode } =
    extraData as FileLibraryListExtraData;
  const isSelected = selectedIds.has(item.entry.id);

  return viewMode === 'grid' ? (
    <FileTile
      isEditing={isEditing}
      isSelected={isSelected}
      item={item}
      onStartSelection={onStartSelection}
      onToggle={onToggle}
      size={tileSize}
    />
  ) : (
    <View style={styles.row}>
      <FileLibraryRow
        isEditing={isEditing}
        isSelected={isSelected}
        item={item}
        modifiedDate={dateFormatter.format(item.entry.updatedAt)}
        onStartSelection={onStartSelection}
        onToggle={onToggle}
      />
    </View>
  );
}

// URI pages retain prior item identities when a new page appends, so mounted
// tiles stay on the memoized path while the next page resolves.
const FileTile = memo(function FileTile({
  isEditing,
  isSelected,
  item,
  onStartSelection,
  onToggle,
  size,
}: {
  isEditing: boolean;
  isSelected: boolean;
  item: FileLibraryEntry;
  onStartSelection: (fileEntryId: string) => void;
  onToggle: (fileEntryId: string) => void;
  size: number;
}) {
  const { t } = useTranslation();
  const { openFileEntry } = useOpenFileEntry();

  return (
    <Pressable
      accessibilityActions={
        isEditing ? undefined : [{ name: 'longpress', label: t('library.selection.start') }]
      }
      accessibilityLabel={item.entry.filename}
      accessibilityRole={isEditing ? 'checkbox' : 'button'}
      accessibilityState={isEditing ? { checked: isSelected } : undefined}
      className="relative active:opacity-70"
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'longpress') {
          onStartSelection(item.entry.id);
        }
      }}
      onLongPress={() => onStartSelection(item.entry.id)}
      onPress={() => {
        if (isEditing) {
          onToggle(item.entry.id);
        } else if (item.uri) {
          openFileEntry({ entry: item.entry, uri: item.uri });
        }
      }}
      style={{
        paddingBottom: fileLibraryGrid.tileGap,
        paddingHorizontal: fileLibraryGrid.tileGap / 2,
      }}
      testID={`file-library-entry-${item.entry.id}`}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
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
      {isEditing ? (
        <SelectionIndicator
          className="absolute top-2 right-2"
          selected={isSelected}
          variant="overlay"
        />
      ) : null}
    </Pressable>
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
