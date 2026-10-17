import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import FolderOpenIcon from '@cherrystudio/app-icons/icons/folder-open';
import { Button, ContentState, SelectionIndicator } from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isComposerImageMediaType } from '@/frontend/components/Composer/utils/composerAttachments';
import { FileEntrySkeleton, LoadedFileEntryPreview } from '@/frontend/components/FileEntryPreview';
import { useQuery } from '@/frontend/data';
import { type ResolvedFileEntry, useFileEntryPages } from '@/frontend/hooks/file';
import type { FileEntryId } from '@/shared/data/types/file';
import type { FileFolder } from '@/shared/data/types/fileLibrary';

// Matches the library rows so both lists share one name column.
const PREVIEW_SIZE = 40;
// Folder status lines start where a child row's name would.
const NAME_INSET = PREVIEW_SIZE + 16;
const LEVEL_INDENT = 24;
// Preserve room for filenames and selection controls in deeply nested folders.
const MAX_VISUAL_DEPTH = 3;

type FilePickerDirectoryItem =
  | { kind: 'folder'; folder: FileFolder }
  | { kind: 'file'; file: ResolvedFileEntry };

type FilePickerSelection = {
  attachedIds: ReadonlySet<FileEntryId>;
  selectedIds: ReadonlySet<FileEntryId>;
  onToggle: (file: ResolvedFileEntry) => void;
};

type FilePickerListData = FilePickerSelection & {
  dateFormatter: Intl.DateTimeFormat;
  expandedIds: ReadonlySet<string>;
  folders: readonly FileFolder[];
  onToggleFolder: (id: string) => void;
};

/** Keep expansion above recycled rows; each open directory reuses the shared file pages. */
export function FilePickerList(selection: FilePickerSelection) {
  const { t, i18n } = useTranslation();
  const folders = useQuery('/files/folders');
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const directory = useFilePickerDirectory(null, folders.data ?? []);
  const error = folders.error ?? directory.error;
  const isLoading = folders.isLoading || directory.isLoading;
  const dateFormatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  function toggleFolder(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function refresh() {
    await Promise.all([folders.refetch(), directory.refresh()]);
  }

  const listData: FilePickerListData = {
    ...selection,
    dateFormatter,
    expandedIds,
    folders: folders.data ?? [],
    onToggleFolder: toggleFolder,
  };

  if (directory.items.length === 0) {
    return (
      <View className="flex-1 justify-center px-5 pb-8">
        {error ? (
          <FilePickerError onRetry={refresh} />
        ) : isLoading ? (
          <ContentState.Loading title={t('chat.filePicker.loading')} />
        ) : (
          <ContentState.Empty title={t('library.empty')} />
        )}
      </View>
    );
  }

  return (
    <LegendList
      contentContainerStyle={styles.listContent}
      data={directory.items}
      estimatedItemSize={72}
      extraData={listData}
      getItemType={filePickerItemType}
      keyExtractor={filePickerItemKey}
      ListFooterComponent={
        error ? (
          <View className="py-4">
            <FilePickerError onRetry={refresh} />
          </View>
        ) : isLoading || directory.isLoadingMore ? (
          <View className="py-4">
            <ContentState.Loading title={t('chat.filePicker.loading')} />
          </View>
        ) : null
      }
      maintainVisibleContentPosition={false}
      nestedScrollEnabled
      onEndReached={() => {
        if (!error) void directory.loadNext();
      }}
      onEndReachedThreshold={0.5}
      recycleItems
      renderItem={renderFilePickerItem}
      style={styles.list}
      testID="file-picker-list"
    />
  );
}

/** Like the library, a level lists its folders first, then its files newest first. */
function useFilePickerDirectory(folderId: string | null, folders: readonly FileFolder[]) {
  const query = useFileEntryPages({ enabled: true, folderId });
  const items: FilePickerDirectoryItem[] = [
    ...folders
      .filter((folder) => folder.parentId === folderId)
      .map((folder) => ({ kind: 'folder' as const, folder })),
    ...query.entries.map((file) => ({ kind: 'file' as const, file })),
  ];
  return { ...query, items };
}

function filePickerItemKey(item: FilePickerDirectoryItem) {
  return item.kind === 'folder' ? `folder:${item.folder.id}` : `file:${item.file.entry.id}`;
}

function filePickerItemType(item: FilePickerDirectoryItem) {
  return item.kind;
}

function renderFilePickerItem({
  extraData,
  item,
}: LegendListRenderItemProps<FilePickerDirectoryItem>) {
  return <FilePickerItem data={extraData as FilePickerListData} depth={0} item={item} />;
}

function FilePickerItem({
  data,
  depth,
  item,
}: {
  data: FilePickerListData;
  depth: number;
  item: FilePickerDirectoryItem;
}) {
  const { t } = useTranslation();
  const placement = { paddingLeft: Math.min(depth, MAX_VISUAL_DEPTH) * LEVEL_INDENT };
  if (item.kind === 'file') {
    return (
      <View style={placement}>
        <FilePickerFileRow
          isAttached={data.attachedIds.has(item.file.entry.id)}
          isSelected={data.selectedIds.has(item.file.entry.id)}
          item={item.file}
          modifiedDate={data.dateFormatter.format(item.file.entry.updatedAt)}
          onToggle={data.onToggle}
        />
      </View>
    );
  }

  const { folder } = item;
  const expanded = data.expandedIds.has(folder.id);
  return (
    <View>
      <View style={placement}>
        <Pressable
          accessibilityLabel={t(expanded ? 'workspace.collapse' : 'workspace.expand', {
            name: folder.name,
          })}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          className="min-h-18 flex-row items-center gap-4 py-3 active:opacity-60"
          onPress={() => data.onToggleFolder(folder.id)}
          testID={`file-picker-folder-${folder.id}`}
        >
          <View className="size-10 items-center justify-center">
            {expanded ? (
              <FolderOpenIcon className="size-7 text-muted-foreground" />
            ) : (
              <FolderIcon className="size-7 text-muted-foreground" />
            )}
          </View>
          <Text
            className="min-w-0 flex-1 text-base text-foreground"
            ellipsizeMode="middle"
            numberOfLines={1}
          >
            {folder.name}
          </Text>
          {/* Same column as the file rows' selection indicator. */}
          <View className="size-6 items-center justify-center">
            {expanded ? (
              <ChevronDownIcon className="size-5 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-5 text-muted-foreground" />
            )}
          </View>
        </Pressable>
      </View>
      {expanded ? (
        <FilePickerFolderContents
          data={data}
          depth={depth + 1}
          folderId={folder.id}
          key={folder.id}
        />
      ) : null}
    </View>
  );
}

/** Like the workspace tree, folder contents scroll with their parent rather than nesting scrollers. */
function FilePickerFolderContents({
  data,
  depth,
  folderId,
}: {
  data: FilePickerListData;
  depth: number;
  folderId: string;
}) {
  const { t } = useTranslation();
  const directory = useFilePickerDirectory(folderId, data.folders);
  return (
    <View testID={`file-picker-folder-contents-${folderId}`}>
      {directory.items.map((item) => (
        <FilePickerItem data={data} depth={depth} item={item} key={filePickerItemKey(item)} />
      ))}
      <View style={{ paddingLeft: Math.min(depth, MAX_VISUAL_DEPTH) * LEVEL_INDENT + NAME_INSET }}>
        {directory.error ? (
          <FilePickerError onRetry={directory.refresh} />
        ) : directory.isLoading || directory.isLoadingMore ? (
          <View className="py-2">
            <ContentState.Loading layout="row" title={t('chat.filePicker.loading')} />
          </View>
        ) : directory.hasNext ? (
          <View className="items-start">
            <Button onPress={() => void directory.loadNext()} size="sm" variant="ghost">
              {t('workspace.loadMore')}
            </Button>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function FilePickerError({ onRetry }: { onRetry: () => Promise<unknown> }) {
  const { t } = useTranslation();
  return (
    <ContentState.Error
      primaryAction={{ children: t('common.retry'), onPress: () => void onRetry() }}
      title={t('chat.filePicker.loadFailed')}
    />
  );
}

function FilePickerFileRow({
  isAttached,
  isSelected,
  item,
  modifiedDate,
  onToggle,
}: {
  isAttached: boolean;
  isSelected: boolean;
  item: ResolvedFileEntry;
  modifiedDate: string;
  onToggle: (file: ResolvedFileEntry) => void;
}) {
  const { t } = useTranslation();
  const isDisabled = isAttached || !item.uri;
  const description = !item.uri
    ? t('filePreview.unavailable')
    : isAttached
      ? t('chat.filePicker.alreadyAdded')
      : t('chat.filePicker.modifiedAt', { date: modifiedDate });

  return (
    <Pressable
      accessibilityLabel={`${item.libraryFile?.name ?? item.entry.filename}, ${description}`}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isAttached || isSelected, disabled: isDisabled }}
      className="min-h-18 flex-row items-center gap-4 py-3 active:opacity-60"
      disabled={isDisabled}
      onPress={() => onToggle(item)}
      testID={`file-picker-entry-${item.entry.id}`}
    >
      {/* Selection owns the entire row, including the existing preview. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        {item.uri && isComposerImageMediaType(item.entry.mediaType) && !item.previewUri ? (
          <FileEntrySkeleton size={PREVIEW_SIZE} variant="icon" />
        ) : (
          <LoadedFileEntryPreview
            entry={item.entry}
            previewUri={item.previewUri}
            size={PREVIEW_SIZE}
            uri={item.uri}
            variant="icon"
          />
        )}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-base text-foreground" ellipsizeMode="middle" numberOfLines={1}>
          {item.libraryFile?.name ?? item.entry.filename}
        </Text>
        <Text className="text-sm text-muted-foreground" numberOfLines={1}>
          {description}
        </Text>
      </View>
      <SelectionIndicator disabled={isDisabled} selected={isAttached || isSelected} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  listContent: { paddingBottom: 16, paddingHorizontal: 20 },
});
