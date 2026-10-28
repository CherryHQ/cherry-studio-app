import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { ActionMenu, Button, ContentState, type MenuItem } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  type SelectionSource,
  useListBottomInset,
  usePendingDeletionIds,
  useRegisterSelectionSource,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/Selection';
import { useBackendModule } from '@/frontend/data';
import type { ResolvedFile } from '@/shared/contracts/file';
import type { FileFolder } from '@/shared/data/types/fileLibrary';

import {
  type FileLibraryEntry,
  type FileLibraryFilter,
  useFileEntries,
} from '../hooks/useFileEntries';
import type { LibrarySelection } from '../hooks/useFileLibraryItemActions';
import { useOpenLibraryFile } from '../hooks/useOpenLibraryFile';
import { fileLibraryLayout, fileLibrarySelectionScope } from '../utils/constants';
import { FileLibraryFolderItem } from './FileLibraryFolderItem';
import { FILE_LIBRARY_ROW_ESTIMATED_SIZE, FileLibraryRow } from './FileLibraryRow';
import { FileLibrarySelectionControls } from './FileLibrarySelectionControls';
import { FileLibrarySkeleton } from './FileLibrarySkeleton';

type FileLibraryListProps = {
  folderId?: string | null;
  directory?: {
    folders: readonly FileFolder[];
    onOpen: (folderId: string) => void;
  };
  folderPaths?: ReadonlyMap<string, string>;
  getMenuItems: (selection: LibrarySelection) => MenuItem[];
  filter: FileLibraryFilter;
};

type FileLibraryListItem =
  | { kind: 'folder'; folder: FileFolder }
  | { kind: 'file'; file: FileLibraryEntry };

type FileLibraryListExtraData = {
  directory: FileLibraryListProps['directory'];
  folderPaths: FileLibraryListProps['folderPaths'];
  getMenuItems: (selection: LibrarySelection) => MenuItem[];
  getManageLabel: (name: string) => string;
  dateFormatter: Intl.DateTimeFormat;
  isEditing: boolean;
  onOpen: (file: ResolvedFile) => void;
  onToggle: (fileEntryId: string) => void;
  selectedIds: ReadonlySet<string>;
};

/** Folders and files share one result list below the common browser controls. */
export function FileLibraryList({
  folderId,
  directory,
  folderPaths,
  getMenuItems,
  filter,
}: FileLibraryListProps) {
  const { t, i18n } = useTranslation();
  const file = useBackendModule('file');
  // Keep the edit request above recycled rows so refreshing the library cannot cancel it.
  const openLibraryFile = useOpenLibraryFile();
  const bottomInset = useListBottomInset();
  const pendingDeletionIds = usePendingDeletionIds(fileLibrarySelectionScope);
  const { toggleId } = useSelectionActions();
  const { isEditing, selectedIds } = useSelectionState();
  const { entries, error, isLoading, isLoadingMore, loadMore, refresh } = useFileEntries(filter, {
    enabled: true,
    folderId,
  });
  const visibleEntries = useMemo(
    () =>
      pendingDeletionIds.size === 0
        ? entries
        : entries.filter((item) => !pendingDeletionIds.has(item.entry.id)),
    [entries, pendingDeletionIds],
  );
  const listItems = useMemo<FileLibraryListItem[]>(
    () => [
      ...(directory?.folders ?? []).map((folder) => ({
        kind: 'folder' as const,
        folder,
      })),
      ...(isLoading ? [] : visibleEntries).map((file) => ({ kind: 'file' as const, file })),
    ],
    [directory?.folders, isLoading, visibleEntries],
  );
  const selectionSource = useMemo<SelectionSource>(
    () => ({
      copy: {
        deleteFailed: 'library.selection.deleteFailed',
        deleteMessage: 'library.selection.deleteMessage',
        deleteTitle: 'library.selection.deleteTitle',
      },
      deleteSelected: async (ids) => {
        const results = await Promise.allSettled(ids.map((id) => file.moveToTrash(id)));
        // Keep optimistic hides until the list reflects every committed deletion,
        // including the successful files in a partially failed batch.
        await refresh();
        const firstFailure = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (firstFailure) {
          throw firstFailure.reason;
        }
      },
      getAllIds: () => visibleEntries.map((item) => item.entry.id),
    }),
    [file, refresh, visibleEntries],
  );
  useRegisterSelectionSource(fileLibrarySelectionScope, selectionSource);
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
  const listExtraData = useMemo<FileLibraryListExtraData>(
    () => ({
      directory,
      folderPaths,
      dateFormatter,
      getMenuItems,
      getManageLabel: (name: string) => t('library.manage', { name }),
      isEditing,
      onOpen: (resolvedFile) => void openLibraryFile(resolvedFile),
      onToggle: toggleId,
      selectedIds,
    }),
    [
      directory,
      folderPaths,
      dateFormatter,
      getMenuItems,
      t,
      isEditing,
      openLibraryFile,
      selectedIds,
      toggleId,
    ],
  );

  const contentContainerStyle = useMemo(
    () => ({
      paddingBottom: bottomInset,
      paddingHorizontal: fileLibraryLayout.pageEdge,
    }),
    [bottomInset],
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
          <FileLibrarySkeleton count={fileLibraryLayout.skeletonRows} />
        ) : (
          <View className="min-h-48 flex-1 justify-center px-6 pb-24">
            <ContentState.Empty testID="file-library-empty" title={t('library.empty')} />
          </View>
        )}
      </View>
    ),
    [error, isLoading, isLoadingMore, refresh, t],
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
        <FileLibrarySkeleton count={2} />
      ) : null,
    [error, isLoadingMore, refresh, t, visibleEntries.length],
  );

  return (
    <>
      <LegendList
        contentContainerStyle={contentContainerStyle}
        contentInsetAdjustmentBehavior="never"
        data={listItems}
        estimatedItemSize={FILE_LIBRARY_ROW_ESTIMATED_SIZE}
        extraData={listExtraData}
        keyExtractor={libraryItemKeyExtractor}
        getItemType={libraryItemType}
        ListEmptyComponent={listEmpty}
        ListFooterComponent={
          directory?.folders.length && visibleEntries.length === 0
            ? error || isLoading || isLoadingMore
              ? listEmpty
              : null
            : listFooter
        }
        maintainVisibleContentPosition={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.7}
        ItemSeparatorComponent={FileLibraryItemSeparator}
        recycleItems
        renderItem={renderLibraryItem}
        showsVerticalScrollIndicator={false}
        style={styles.list}
        testID="file-library-list"
      />
      <FileLibrarySelectionControls refresh={refresh} />
    </>
  );
}

function libraryItemKeyExtractor(item: FileLibraryListItem) {
  return item.kind === 'folder' ? `folder:${item.folder.id}` : `file:${item.file.entry.id}`;
}

function libraryItemType(item: FileLibraryListItem) {
  return item.kind;
}

function renderLibraryItem({ extraData, item }: LegendListRenderItemProps<FileLibraryListItem>) {
  const data = extraData as FileLibraryListExtraData;
  if (item.kind === 'folder') {
    return data.directory ? (
      <FileLibraryFolderItem
        disabled={data.isEditing}
        folder={item.folder}
        menuItems={data.isEditing ? [] : data.getMenuItems({ kind: 'folder', folder: item.folder })}
        modifiedDate={data.dateFormatter.format(item.folder.updatedAt)}
        onOpen={data.directory.onOpen}
      />
    ) : null;
  }
  return <FileItem item={item.file} data={data} />;
}

function FileItem({ item, data }: { item: FileLibraryEntry; data: FileLibraryListExtraData }) {
  // Files at the top level are simply in the library and need no location.
  const location = item.libraryFile?.folderId
    ? data.folderPaths?.get(item.libraryFile.folderId)
    : undefined;
  const menuItems =
    !data.isEditing && item.libraryFile
      ? data.getMenuItems({ kind: 'file', file: item.libraryFile })
      : [];
  return (
    <View className="flex-row items-center gap-2">
      <View className="min-w-0 flex-1">
        <FileLibraryRow
          isEditing={data.isEditing}
          isSelected={data.selectedIds.has(item.entry.id)}
          item={item}
          location={location}
          menuItems={menuItems}
          modifiedDate={data.dateFormatter.format(item.entry.updatedAt)}
          onOpen={data.onOpen}
          onToggle={data.onToggle}
        />
      </View>
      {menuItems.length > 0 && item.libraryFile ? (
        <ActionMenu items={menuItems}>
          <Button
            accessibilityLabel={data.getManageLabel(item.libraryFile.name)}
            hitSlop={6}
            icon={<EllipsisIcon />}
            size="sm"
            testID={`file-library-manage-${item.libraryFile.id}`}
            variant="ghost"
          />
        </ActionMenu>
      ) : null}
    </View>
  );
}

function FileLibraryItemSeparator() {
  return <View className="h-px bg-border" />;
}

const styles = StyleSheet.create({
  list: { alignSelf: 'center', flex: 1, maxWidth: 800, width: '100%' },
  empty: { flexGrow: 1 },
});
