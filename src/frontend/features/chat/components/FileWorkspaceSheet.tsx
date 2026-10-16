import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import CircleSlashIcon from '@cherrystudio/app-icons/icons/circle-slash';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';
import {
  BottomSheet,
  Button,
  ContentState,
  SearchField,
  Section,
  useToast,
} from '@cherrystudio/ui/components';
import { LegendList, type LegendListRenderItemProps } from '@legendapp/list/react-native';
import { useIsFocused } from 'expo-router';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FileEntrySkeleton,
  LoadedFileEntryPreview,
  fileEntryPreviewKind,
  useOpenFileEntry,
} from '@/frontend/components/FileEntryPreview';
import { fileFolderAncestors } from '@/frontend/components/FileFolderBreadcrumbs';
import { useCreateFileFolder } from '@/frontend/components/FileFolderPicker';
import { useAgentSessionStatus } from '@/frontend/hooks/agent';
import {
  type FileWorkspaceAddress,
  useFileEntryPages,
  useFileWorkspace,
} from '@/frontend/hooks/file';
import type { FileFolder } from '@/shared/data/types/fileLibrary';

type WorkspaceOption = { folder: FileFolder | null; path: string };
type WorkspaceListExtraData = {
  expandedIds: ReadonlySet<string>;
  isFocused: boolean;
  selectedId: string | null;
  isSaving: boolean;
  onSelect: (id: string | null) => Promise<void>;
  onToggle: (id: string) => void;
};
const styles = StyleSheet.create({ list: { flex: 1 }, content: { paddingBottom: 24 } });

/** Directory selection, expansion and file preview have separate press targets. */
export function FileWorkspaceSheet({
  address,
  onClose,
}: {
  address: FileWorkspaceAddress;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const focused = useIsFocused();
  const workspace = useFileWorkspace(address);
  const selectWorkspace = workspace.select;
  const { requestCreate, isCreating } = useCreateFileFolder(null);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const folders = workspace.availableFolders;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const noneLabel = t('workspace.none');
  const noneDescription = t('workspace.noneDescription');
  const rootLabel = t('library.title');
  const options = useMemo(() => {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const needle = search.trim().toLocaleLowerCase(locale);
    return [
      { folder: null, path: noneDescription },
      ...folders.map((folder) => ({
        folder,
        path: [
          rootLabel,
          ...fileFolderAncestors(folder.parentId, byId).map((parent) => parent.name),
        ].join(' / '),
      })),
    ].filter(({ folder, path }) =>
      `${folder?.name ?? noneLabel} ${path}`.toLocaleLowerCase(locale).includes(needle),
    );
  }, [folders, locale, noneDescription, noneLabel, rootLabel, search]);
  const toggleFolder = useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const selectFolder = useCallback(
    async (id: string | null) => {
      try {
        await selectWorkspace(id);
        onClose();
      } catch {
        toast.show({ label: t('library.actionFailed'), variant: 'danger' });
      }
    },
    [selectWorkspace, onClose, t, toast],
  );
  const listExtraData = useMemo<WorkspaceListExtraData>(
    () => ({
      expandedIds,
      isFocused: focused,
      selectedId: workspace.folderId,
      isSaving: workspace.isSaving,
      onSelect: selectFolder,
      onToggle: toggleFolder,
    }),
    [expandedIds, focused, workspace.folderId, workspace.isSaving, selectFolder, toggleFolder],
  );
  const unavailable = Boolean(
    workspace.folderId && !folders.some((folder) => folder.id === workspace.folderId),
  );

  return (
    <BottomSheet
      avoidKeyboard
      closeAction={{ accessibilityLabel: t('common.cancel') }}
      headerAction={
        <Button
          accessibilityLabel={t('library.folders.create')}
          disabled={isCreating || workspace.isLoading || Boolean(workspace.error)}
          icon={<PlusIcon />}
          onPress={requestCreate}
          size="sm"
          testID="file-workspace-create"
          variant="ghost"
        />
      }
      onClose={onClose}
      // Keep the list mounted under the existing file viewer. Controlled hiding
      // on route blur preserves expansion, loaded pages and the scroll position.
      open={focused}
      size="large"
      testID="file-workspace-sheet"
      title={t('workspace.title')}
    >
      <View className="gap-2 px-5 pb-2">
        <SearchField
          accessibilityLabel={t('workspace.searchPlaceholder')}
          clearAccessibilityLabel={t('common.clear')}
          onChangeText={setSearch}
          onClear={() => setSearch('')}
          placeholder={t('workspace.searchPlaceholder')}
          testID="file-workspace-search"
          value={search}
        />
        {address.sessionId ? <WorkspaceTaskNotice sessionId={address.sessionId} /> : null}
        {unavailable ? (
          <Text className="text-sm text-warning">{t('workspace.unavailable')}</Text>
        ) : null}
      </View>
      {workspace.error ? (
        <ContentState.Error
          title={t('library.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void workspace.refetch() }}
        />
      ) : workspace.isLoading ? (
        <ContentState.Loading title={t('library.loading')} />
      ) : (
        <LegendList
          contentContainerStyle={styles.content}
          data={options}
          estimatedItemSize={72}
          extraData={listExtraData}
          keyExtractor={workspaceOptionKey}
          ListEmptyComponent={<ContentState.Empty title={t('library.folders.noChildren')} />}
          maintainVisibleContentPosition={false}
          nestedScrollEnabled
          recycleItems
          renderItem={renderWorkspaceOption}
          style={styles.list}
          testID="file-workspace-options"
        />
      )}
    </BottomSheet>
  );
}

function renderWorkspaceOption({ item, extraData }: LegendListRenderItemProps<WorkspaceOption>) {
  const data = extraData as WorkspaceListExtraData;
  return (
    <WorkspaceOptionRow
      folder={item.folder}
      path={item.path}
      selectedId={data.selectedId}
      isFocused={data.isFocused}
      expanded={Boolean(item.folder && data.expandedIds.has(item.folder.id))}
      isSaving={data.isSaving}
      onSelect={data.onSelect}
      onToggle={data.onToggle}
    />
  );
}

const WorkspaceOptionRow = memo(function WorkspaceOptionRow({
  folder,
  path,
  selectedId,
  isFocused,
  expanded,
  isSaving,
  onSelect,
  onToggle,
}: WorkspaceOption & Omit<WorkspaceListExtraData, 'expandedIds'> & { expanded: boolean }) {
  const { t } = useTranslation();
  const id = folder?.id ?? null;

  return (
    <View>
      <View className="flex-row items-center">
        <View className="min-w-0 flex-1">
          <Section.RadioItem
            description={path}
            disabled={isSaving}
            label={folder?.name ?? t('workspace.none')}
            leading={
              folder ? (
                <FolderIcon className="size-6 text-muted-foreground" />
              ) : (
                <CircleSlashIcon className="size-6 text-muted-foreground" />
              )
            }
            onPress={() => void onSelect(id)}
            selected={selectedId === id}
            testID={id ? `file-workspace-option-${id}` : 'file-workspace-unlink'}
          />
        </View>
        {folder ? (
          <Pressable
            accessibilityLabel={t(expanded ? 'workspace.collapse' : 'workspace.expand', {
              name: folder.name,
            })}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            className="size-11 items-center justify-center rounded-lg active:bg-secondary"
            onPress={() => {
              if (id) onToggle(id);
            }}
            testID={`file-workspace-expand-${id}`}
          >
            {expanded ? (
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            )}
          </Pressable>
        ) : (
          <View className="w-11" />
        )}
      </View>
      {expanded && id ? <WorkspaceFolderFiles key={id} folderId={id} enabled={isFocused} /> : null}
      <View className="mx-5 h-px bg-border" />
    </View>
  );
});

function workspaceOptionKey({ folder }: WorkspaceOption) {
  return folder?.id ?? 'none';
}

function WorkspaceFolderFiles({ folderId, enabled }: { folderId: string; enabled: boolean }) {
  const { t, i18n } = useTranslation();
  const { openFileEntry } = useOpenFileEntry();
  const query = useFileEntryPages({ folderId, enabled });
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: 'medium' }),
    [i18n.resolvedLanguage, i18n.language],
  );

  return (
    <View className="pl-12 pr-5 pb-3" testID={`file-workspace-files-${folderId}`}>
      {query.entries.map((item) => {
        const name = item.libraryFile?.name ?? item.entry.filename;
        return (
          <Pressable
            accessibilityLabel={t('workspace.preview', { name })}
            accessibilityRole="button"
            className="min-h-16 flex-row items-center gap-3 py-2 active:opacity-60 disabled:opacity-40"
            disabled={!item.uri}
            key={item.entry.id}
            onPress={() => {
              if (item.uri) openFileEntry({ entry: item.entry, uri: item.uri });
            }}
            testID={`file-workspace-preview-${item.entry.id}`}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
            >
              {fileEntryPreviewKind(item.entry) === 'image' && item.uri && !item.previewUri ? (
                <FileEntrySkeleton size={28} variant="icon" />
              ) : (
                <LoadedFileEntryPreview
                  entry={item.entry}
                  previewUri={item.previewUri}
                  size={28}
                  uri={item.uri}
                  variant="icon"
                />
              )}
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-sm text-foreground" numberOfLines={2}>
                {name}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {item.uri
                  ? t('chat.filePicker.modifiedAt', {
                      date: dateFormatter.format(item.entry.updatedAt),
                    })
                  : t('filePreview.unavailable')}
              </Text>
            </View>
          </Pressable>
        );
      })}
      {query.error ? (
        <ContentState.Error
          title={t('library.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void query.refresh() }}
        />
      ) : query.isLoading || query.isLoadingMore ? (
        <ContentState.Loading title={t('library.loading')} />
      ) : query.entries.length === 0 ? (
        <Text className="py-4 text-sm text-muted-foreground">{t('library.empty')}</Text>
      ) : query.hasNext ? (
        <Button onPress={() => void query.loadNext()} size="sm" variant="ghost">
          {t('workspace.loadMore')}
        </Button>
      ) : null}
    </View>
  );
}

function WorkspaceTaskNotice({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const { status } = useAgentSessionStatus(sessionId);
  return status &&
    ['running', 'awaiting-approval', 'awaiting-input', 'cancelling'].includes(status) ? (
    <Text className="text-sm text-muted-foreground">{t('workspace.runningHint')}</Text>
  ) : null;
}
