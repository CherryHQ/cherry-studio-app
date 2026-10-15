import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import { Button, ContentState, useAlert, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import {
  SelectionControls,
  SelectionProvider,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/Selection';
import { useMutation, usePreference, useQuery } from '@/frontend/data/hooks';

import { FileLibraryItemSheet, type LibrarySelection } from './components/FileLibraryItemSheet';
import { FileLibraryList } from './components/FileLibraryList';
import type { FileLibraryFilter } from './hooks/useFileEntries';
import { fileLibrarySelectionScope, type FileLibraryViewMode } from './utils/constants';

/**
 * The file library (`/library`), the sidebar's library destination: everything
 * Cherry has stored as a file — chat attachments, generated images, imported
 * documents — in a grid or list, filterable by kind. The root Stack pushes it above
 * chat, so its leading action returns to the chat surface.
 */
function FileLibraryScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const { alert } = useAlert();
  const [folderId, setFolderId] = useState<string | null>(null);
  const [selection, setSelection] = useState<LibrarySelection | null>(null);
  const folders = useQuery('/files/folders');
  const createFolder = useMutation('POST', '/files/folders');
  const currentFolder = folders.data?.find((folder) => folder.id === folderId);
  const { left, right } = useSafeAreaInsets();
  const [filter, setFilter] = useState<FileLibraryFilter>('all');
  const [viewMode, setViewMode] = usePreference('ui.library.view_mode');
  const { exitEditing } = useSelectionActions();
  const { isDeletionPending, isEditing } = useSelectionState();
  const addFolder = useCallback(() => {
    alert.prompt({
      title: t('library.folders.create'),
      confirmLabel: t('common.save'),
      input: { accessibilityLabel: t('library.folders.name'), maxLength: 255, autoFocus: true },
      onConfirm: (name) => {
        if (!name.trim()) return;
        void createFolder
          .trigger({ body: { parentId: folderId, name } })
          .catch(() => toast.show({ label: t('library.actionFailed'), variant: 'danger' }));
      },
    });
  }, [alert, createFolder, folderId, t, toast]);

  const changeViewMode = useCallback(
    (nextViewMode: FileLibraryViewMode) => {
      if (nextViewMode === viewMode) return;
      void setViewMode(nextViewMode).catch(() => {
        toast.show({ label: t('library.view.saveFailed'), variant: 'danger' });
      });
    },
    [setViewMode, t, toast, viewMode],
  );

  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('library.view.label'),
        icon: EllipsisIcon,
        items: [
          { id: 'new-folder', label: t('library.folders.create'), onPress: addFolder },
          {
            id: 'library-trash',
            label: t('trash.title'),
            onPress: () => router.push('/trash'),
          },
          {
            checked: viewMode === 'grid',
            id: 'library-view-grid',
            label: t('library.view.grid'),
            onPress: () => changeViewMode('grid'),
          },
          {
            checked: viewMode === 'list',
            id: 'library-view-list',
            label: t('library.view.list'),
            onPress: () => changeViewMode('list'),
          },
        ],
        key: 'library-view',
        type: 'menu',
      },
    ],
    [addFolder, changeViewMode, router, t, viewMode],
  );
  const doneActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.done'),
        disabled: isDeletionPending,
        key: 'finish-selecting-files',
        label: t('common.done'),
        onPress: exitEditing,
        type: 'label',
      },
    ],
    [exitEditing, isDeletionPending, t],
  );

  return (
    <>
      <RouteHeader
        onBack={
          isEditing
            ? exitEditing
            : folderId
              ? () => setFolderId(currentFolder?.parentId ?? null)
              : undefined
        }
        rightActions={isEditing ? doneActions : rightActions}
        title={currentFolder?.name ?? t('library.title')}
      />
      <View className="flex-1" style={{ paddingLeft: left, paddingRight: right }}>
        <FileLibraryList
          key={folderId ?? 'root'}
          folderId={folderId}
          onManage={(file) => setSelection({ kind: 'file', file })}
          header={
            <View className="gap-1 pb-3">
              {folderId ? (
                <Button
                  variant="ghost"
                  onPress={() => setFolderId(currentFolder?.parentId ?? null)}
                >
                  {t('library.folders.up')}
                </Button>
              ) : null}
              {folders.error ? (
                <ContentState.Error
                  title={t('library.loadFailed')}
                  primaryAction={{
                    children: t('common.retry'),
                    onPress: () => void folders.refetch(),
                  }}
                />
              ) : null}
              {(folders.data ?? [])
                .filter((folder) => folder.parentId === folderId)
                .map((folder) => (
                  <View key={folder.id} className="flex-row items-center gap-2">
                    <Pressable
                      accessibilityRole="button"
                      className="min-h-14 flex-1 flex-row items-center gap-3 py-2 active:opacity-60"
                      onPress={() => {
                        exitEditing();
                        setFolderId(folder.id);
                      }}
                    >
                      <FolderIcon className="size-6 text-muted-foreground" />
                      <Text className="flex-1 text-base text-foreground">{folder.name}</Text>
                    </Pressable>
                    <Button
                      variant="ghost"
                      icon={<EllipsisIcon />}
                      accessibilityLabel={t('library.manage', { name: folder.name })}
                      onPress={() => setSelection({ kind: 'folder', folder })}
                    />
                  </View>
                ))}
            </View>
          }
          filter={filter}
          isDataLoadEnabled
          onFilterChange={setFilter}
          viewMode={viewMode}
        />
        <SelectionControls scope={fileLibrarySelectionScope} />
      </View>
      {selection ? (
        <FileLibraryItemSheet selection={selection} onClose={() => setSelection(null)} />
      ) : null}
    </>
  );
}

export function FileLibraryScreen() {
  return (
    <SelectionProvider>
      <FileLibraryScreenBody />
    </SelectionProvider>
  );
}
