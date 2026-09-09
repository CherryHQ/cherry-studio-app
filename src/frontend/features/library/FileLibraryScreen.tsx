import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { useToast } from '@cherrystudio/ui/components';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import {
  SelectionControls,
  SelectionProvider,
  useSelectionActions,
  useSelectionState,
} from '@/frontend/components/Selection';
import { usePreference } from '@/frontend/data/hooks';

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
  const { toast } = useToast();
  const [filter, setFilter] = useState<FileLibraryFilter>('all');
  const [viewMode, setViewMode] = usePreference('ui.library.view_mode');
  const { exitEditing } = useSelectionActions();
  const { isDeletionPending, isEditing } = useSelectionState();

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
    [changeViewMode, t, viewMode],
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
        onBack={isEditing ? exitEditing : undefined}
        rightActions={isEditing ? doneActions : rightActions}
        title={t('library.title')}
      />
      <View className="flex-1">
        <FileLibraryList
          filter={filter}
          isDataLoadEnabled
          onFilterChange={setFilter}
          viewMode={viewMode}
        />
        <SelectionControls scope={fileLibrarySelectionScope} />
      </View>
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
