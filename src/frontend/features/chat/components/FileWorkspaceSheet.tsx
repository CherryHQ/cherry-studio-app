import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ChevronDownIcon from '@cherrystudio/app-icons/icons/chevron-down';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import CircleSlashIcon from '@cherrystudio/app-icons/icons/circle-slash';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import { BottomSheet, Button, ContentState, useToast } from '@cherrystudio/ui/components';
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
import { useAgentSessionStatus } from '@/frontend/hooks/agent';
import {
  type FileWorkspaceAddress,
  useFileEntryPages,
  useFileWorkspace,
} from '@/frontend/hooks/file';
import type { FileFolder } from '@/shared/data/types/fileLibrary';

/** One flattened line of the folder tree; expanded folders are followed by their contents. */
type WorkspaceRow =
  | { kind: 'none' }
  | { kind: 'folder'; folder: FileFolder; depth: number }
  | { kind: 'files'; folderId: string; depth: number; hasChildFolders: boolean };
type WorkspaceListExtraData = {
  expandedIds: ReadonlySet<string>;
  isFocused: boolean;
  selectedId: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSelect: (id: string | null) => Promise<void>;
  onToggle: (id: string) => void;
};
const styles = StyleSheet.create({ list: { flex: 1 }, content: { paddingBottom: 24 } });
// Each level starts where its parent's name starts: page edge, icon and gap.
const ROW_EDGE = 20;
const LEVEL_INDENT = 36;

/** Directory selection, expansion and file preview have separate press targets. */
export function FileWorkspaceSheet({
  address,
  onClose,
}: {
  address: FileWorkspaceAddress;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const focused = useIsFocused();
  const workspace = useFileWorkspace(address);
  const selectWorkspace = workspace.select;
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  const folders = workspace.availableFolders;
  const rows = useMemo(() => {
    const childrenByParent = new Map<string | null, FileFolder[]>();
    for (const folder of folders) {
      const siblings = childrenByParent.get(folder.parentId) ?? [];
      siblings.push(folder);
      childrenByParent.set(folder.parentId, siblings);
    }
    const result: WorkspaceRow[] = [{ kind: 'none' }];
    const visit = (parentId: string | null, depth: number) => {
      for (const folder of childrenByParent.get(parentId) ?? []) {
        result.push({ kind: 'folder', folder, depth });
        if (!expandedIds.has(folder.id)) continue;
        visit(folder.id, depth + 1);
        result.push({
          kind: 'files',
          folderId: folder.id,
          depth: depth + 1,
          hasChildFolders: childrenByParent.has(folder.id),
        });
      }
    };
    visit(null, 0);
    return result;
  }, [expandedIds, folders]);
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
      onClose,
      onSelect: selectFolder,
      onToggle: toggleFolder,
    }),
    [
      expandedIds,
      focused,
      workspace.folderId,
      workspace.isSaving,
      onClose,
      selectFolder,
      toggleFolder,
    ],
  );
  const unavailable = Boolean(
    workspace.folderId && !folders.some((folder) => folder.id === workspace.folderId),
  );

  return (
    <BottomSheet
      onClose={onClose}
      // Keep the list mounted under the existing file viewer. Controlled hiding
      // on route blur preserves expansion, loaded pages and the scroll position.
      open={focused}
      size="large"
      testID="file-workspace-sheet"
      title={t('workspace.title')}
    >
      {address.sessionId ? <WorkspaceTaskNotice sessionId={address.sessionId} /> : null}
      {unavailable ? (
        <Text className="px-5 pb-2 text-sm text-warning">{t('workspace.unavailable')}</Text>
      ) : null}
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
          data={rows}
          estimatedItemSize={56}
          extraData={listExtraData}
          getItemType={workspaceRowType}
          keyExtractor={workspaceRowKey}
          ListEmptyComponent={<ContentState.Empty title={t('library.folders.noChildren')} />}
          maintainVisibleContentPosition={false}
          nestedScrollEnabled
          recycleItems
          renderItem={renderWorkspaceRow}
          style={styles.list}
          testID="file-workspace-options"
        />
      )}
    </BottomSheet>
  );
}

function renderWorkspaceRow({ item, extraData }: LegendListRenderItemProps<WorkspaceRow>) {
  const data = extraData as WorkspaceListExtraData;
  if (item.kind === 'files') {
    return (
      <WorkspaceFolderFiles
        key={item.folderId}
        depth={item.depth}
        enabled={data.isFocused}
        folderId={item.folderId}
        hasChildFolders={item.hasChildFolders}
        onClose={data.onClose}
      />
    );
  }
  const folder = item.kind === 'folder' ? item : undefined;
  return (
    <WorkspaceOptionRow
      folder={folder?.folder ?? null}
      depth={folder?.depth ?? 0}
      expanded={Boolean(folder && data.expandedIds.has(folder.folder.id))}
      isSaving={data.isSaving}
      onSelect={data.onSelect}
      onToggle={data.onToggle}
      selectedId={data.selectedId}
    />
  );
}

const WorkspaceOptionRow = memo(function WorkspaceOptionRow({
  folder,
  depth,
  expanded,
  isSaving,
  onSelect,
  onToggle,
  selectedId,
}: {
  folder: FileFolder | null;
  depth: number;
  expanded: boolean;
  isSaving: boolean;
  onSelect: (id: string | null) => Promise<void>;
  onToggle: (id: string) => void;
  selectedId: string | null;
}) {
  const { t } = useTranslation();
  const id = folder?.id ?? null;
  const name = folder?.name ?? t('workspace.none');
  const selected = selectedId === id;

  // The name selects the workspace; the chevron only reveals its contents.
  return (
    <View>
      <View
        className="flex-row items-center pr-2"
        style={{ paddingLeft: ROW_EDGE + depth * LEVEL_INDENT }}
      >
        <Pressable
          accessibilityLabel={name}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected, disabled: isSaving }}
          className="min-h-14 min-w-0 flex-1 flex-row items-center gap-3 py-2 active:opacity-60 disabled:opacity-40"
          disabled={isSaving}
          onPress={() => void onSelect(id)}
          testID={id ? `file-workspace-option-${id}` : 'file-workspace-unlink'}
        >
          {folder ? (
            <FolderIcon className="size-6 text-muted-foreground" />
          ) : (
            <CircleSlashIcon className="size-6 text-muted-foreground" />
          )}
          <Text
            className="min-w-0 flex-1 text-base text-foreground"
            ellipsizeMode="middle"
            numberOfLines={1}
          >
            {name}
          </Text>
          {selected && folder ? <CheckIcon className="size-5 text-foreground" /> : null}
        </Pressable>
        {folder ? (
          <Pressable
            accessibilityLabel={t(expanded ? 'workspace.collapse' : 'workspace.expand', {
              name: folder.name,
            })}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            className="size-11 items-center justify-center rounded-lg active:bg-secondary"
            onPress={() => onToggle(folder.id)}
            testID={`file-workspace-expand-${folder.id}`}
          >
            {expanded ? (
              <ChevronDownIcon className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            )}
          </Pressable>
        ) : (
          // Without an expand control, the check takes that column to line up with the chevrons.
          <View className="w-11 items-center">
            {selected ? <CheckIcon className="size-5 text-foreground" /> : null}
          </View>
        )}
      </View>
    </View>
  );
});

function workspaceRowKey(row: WorkspaceRow) {
  return row.kind === 'none'
    ? 'none'
    : row.kind === 'folder'
      ? `folder:${row.folder.id}`
      : `files:${row.folderId}`;
}

function workspaceRowType(row: WorkspaceRow) {
  return row.kind;
}

function WorkspaceFolderFiles({
  depth,
  enabled,
  folderId,
  hasChildFolders,
  onClose,
}: {
  depth: number;
  enabled: boolean;
  folderId: string;
  hasChildFolders: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { openFileEntry } = useOpenFileEntry();
  const query = useFileEntryPages({ folderId, enabled });

  return (
    <View
      className="pr-5"
      style={{ paddingLeft: ROW_EDGE + depth * LEVEL_INDENT }}
      testID={`file-workspace-files-${folderId}`}
    >
      {query.entries.map((item) => {
        const name = item.libraryFile?.name ?? item.entry.filename;
        return (
          <Pressable
            accessibilityLabel={
              item.uri
                ? t('workspace.preview', { name })
                : `${name}, ${t('filePreview.unavailable')}`
            }
            accessibilityRole="button"
            className="min-h-14 flex-row items-center gap-3 py-2 active:opacity-60 disabled:opacity-40"
            disabled={!item.uri}
            key={item.entry.id}
            onPress={() => {
              // A file beside chat would sit under this sheet, so the sheet gives way to it.
              if (item.uri && openFileEntry({ entry: item.entry, uri: item.uri }) === 'pane') {
                onClose();
              }
            }}
            testID={`file-workspace-preview-${item.entry.id}`}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
            >
              {fileEntryPreviewKind(item.entry) === 'image' && item.uri && !item.previewUri ? (
                <FileEntrySkeleton size={24} variant="icon" />
              ) : (
                <LoadedFileEntryPreview
                  entry={item.entry}
                  previewUri={item.previewUri}
                  size={24}
                  uri={item.uri}
                  variant="icon"
                />
              )}
            </View>
            <Text
              className="min-w-0 flex-1 text-base text-foreground"
              ellipsizeMode="middle"
              numberOfLines={1}
            >
              {name}
            </Text>
          </Pressable>
        );
      })}
      {query.error ? (
        <ContentState.Error
          title={t('library.loadFailed')}
          primaryAction={{ children: t('common.retry'), onPress: () => void query.refresh() }}
        />
      ) : query.isLoading || query.isLoadingMore ? (
        <View className="py-2">
          <ContentState.Loading layout="row" title={t('library.loading')} />
        </View>
      ) : query.entries.length === 0 && !hasChildFolders ? (
        <Text className="py-3 text-sm text-muted-foreground">{t('library.empty')}</Text>
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
    <Text className="px-5 pb-2 text-sm text-muted-foreground">{t('workspace.runningHint')}</Text>
  ) : null;
}
