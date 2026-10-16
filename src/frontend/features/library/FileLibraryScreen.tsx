import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { Chip, ContentState, Tabs } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { resolveHeaderContentInset } from '@/frontend/appShell/navigation';
import {
  FileFolderBreadcrumbs,
  fileFolderAncestors,
} from '@/frontend/components/FileFolderBreadcrumbs';
import { FileFolderPicker, useCreateFileFolder } from '@/frontend/components/FileFolderPicker';
import {
  SelectionControls,
  SelectionProvider,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/Selection';
import { useQuery } from '@/frontend/data/hooks';

import { FileLibraryList } from './components/FileLibraryList';
import type { FileLibraryFilter } from './hooks/useFileEntries';
import { useFileLibraryItemActions } from './hooks/useFileLibraryItemActions';
import { fileLibrarySelectionScope, type FileLibraryBrowseMode } from './utils/constants';

const filterOrder: readonly FileLibraryFilter[] = ['all', 'image', 'document', 'sharing'];
const filterLabelKeys: Record<FileLibraryFilter, string> = {
  all: 'library.filter.all',
  sharing: 'library.filter.sharing',
  document: 'library.filter.documents',
  image: 'library.filter.images',
};

/** Recents spans the library; directory browsing retains its own location. */
function FileLibraryScreenBody() {
  const { t } = useTranslation();
  const router = useRouter();
  const contentTopInset = resolveHeaderContentInset(useHeaderHeight());
  const [browseMode, setBrowseMode] = useState<FileLibraryBrowseMode>('recent');
  const isBrowsingFolders = browseMode === 'folders';
  const [folderId, setFolderId] = useState<string | null>(null);
  const itemActions = useFileLibraryItemActions();
  const { moving } = itemActions;
  const folders = useQuery('/files/folders');
  const { requestCreate, isCreating } = useCreateFileFolder(isBrowsingFolders ? folderId : null);
  const currentFolder = folders.data?.find((folder) => folder.id === folderId);
  const childFolders = useMemo(
    () => (folders.data ?? []).filter((folder) => folder.parentId === folderId),
    [folderId, folders.data],
  );
  const folderPaths = useMemo(() => {
    const byId = new Map((folders.data ?? []).map((folder) => [folder.id, folder]));
    return new Map(
      (folders.data ?? []).map((folder) => [
        folder.id,
        fileFolderAncestors(folder.id, byId)
          .map((ancestor) => ancestor.name)
          .join(' / '),
      ]),
    );
  }, [folders.data]);
  const { left, right } = useSafeAreaInsets();
  const [filter, setFilter] = useState<FileLibraryFilter>('all');
  const { enterEditing, exitEditing } = useSelectionActions();
  const { isDeletionPending, isEditing } = useSelectionState();

  const openFolder = useCallback(
    (id: string | null) => {
      exitEditing();
      setFolderId(id);
    },
    [exitEditing],
  );
  const directory = useMemo(
    () => (isBrowsingFolders ? { folders: childFolders, onOpen: openFolder } : undefined),
    [childFolders, isBrowsingFolders, openFolder],
  );

  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('common.more'),
        icon: EllipsisIcon,
        items: [
          { id: 'library-select', label: t('library.selection.start'), onPress: enterEditing },
          ...(isBrowsingFolders
            ? [
                {
                  id: 'library-new-folder',
                  label: t('library.folders.create'),
                  disabled: isCreating,
                  onPress: requestCreate,
                },
              ]
            : []),
          {
            id: 'library-trash',
            label: t('trash.title'),
            onPress: () => router.push('/trash'),
          },
        ],
        key: 'library-actions',
        type: 'menu',
      },
    ],
    [enterEditing, isBrowsingFolders, isCreating, requestCreate, router, t],
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
            : isBrowsingFolders && folderId
              ? () => setFolderId(currentFolder?.parentId ?? null)
              : undefined
        }
        rightActions={isEditing ? doneActions : rightActions}
        title={isBrowsingFolders ? (currentFolder?.name ?? t('library.title')) : t('library.title')}
      />
      <View
        className="flex-1"
        style={{ paddingLeft: left, paddingRight: right, paddingTop: contentTopInset }}
      >
        {isEditing ? null : (
          <View className="gap-4 px-4 pt-2 pb-4">
            <Tabs
              accessibilityLabel={t('library.browse.label')}
              items={[
                {
                  label: t('library.browse.recent'),
                  value: 'recent',
                  testID: 'file-library-recent',
                },
                {
                  label: t('library.browse.folders'),
                  value: 'folders',
                  testID: 'file-library-folders',
                },
              ]}
              onValueChange={setBrowseMode}
              testID="file-library-browse"
              value={browseMode}
            />
            <ScrollView
              accessibilityLabel={t('library.filter.label')}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <View className="flex-row items-center gap-2">
                {filterOrder.map((value) => (
                  <Chip.Selectable
                    accessibilityRole="radio"
                    hitSlop={6}
                    key={value}
                    onSelectedChange={() => setFilter(value)}
                    selected={filter === value}
                    testID={`file-library-filter-${value}`}
                  >
                    {t(filterLabelKeys[value])}
                  </Chip.Selectable>
                ))}
              </View>
            </ScrollView>
            {isBrowsingFolders && folderId ? (
              <FileFolderBreadcrumbs
                folderId={folderId}
                folders={folders.data ?? []}
                onNavigate={openFolder}
              />
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
          </View>
        )}
        <FileLibraryList
          key={isBrowsingFolders ? (folderId ?? 'root') : 'recent'}
          directory={directory}
          folderId={isBrowsingFolders ? folderId : undefined}
          folderPaths={isBrowsingFolders ? undefined : folderPaths}
          getMenuItems={itemActions.getMenuItems}
          filter={filter}
        />
        <SelectionControls scope={fileLibrarySelectionScope} />
      </View>
      {moving ? (
        <FileFolderPicker
          excludedFolderId={moving.kind === 'folder' ? moving.folder.id : undefined}
          isSaving={itemActions.isPending}
          onClose={itemActions.closeMove}
          onSelect={(destination) => void itemActions.move(moving, destination)}
          selectedFolderId={
            moving.kind === 'folder' ? moving.folder.parentId : moving.file.folderId
          }
        />
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
