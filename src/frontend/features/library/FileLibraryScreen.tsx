import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader, type HeaderToolbarAction } from '@/frontend/appShell/header';
import { usePreference } from '@/frontend/data/hooks';

import { FileLibraryList } from './components/FileLibraryList';
import type { FileLibraryFilter } from './hooks/useFileEntries';
import type { FileLibraryViewMode } from './utils/constants';

/**
 * The file library (`/library`), the sidebar's library destination: everything
 * Cherry has stored as a file — chat attachments, generated images, imported
 * documents — in a grid or list, filterable by kind. The root Stack pushes it above
 * chat, so its leading action returns to the chat surface.
 */
export function FileLibraryScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [filter, setFilter] = useState<FileLibraryFilter>('all');
  const [viewMode, setViewMode] = usePreference('ui.library.view_mode');

  function changeViewMode(nextViewMode: FileLibraryViewMode) {
    if (nextViewMode === viewMode) return;
    void setViewMode(nextViewMode).catch(() => {
      toast.show({ label: t('library.view.saveFailed'), variant: 'danger' });
    });
  }

  const rightActions: HeaderToolbarAction[] = [
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
  ];

  return (
    <>
      <RouteHeader rightActions={rightActions} title={t('library.title')} />
      <View className="flex-1">
        <FileLibraryList
          filter={filter}
          isDataLoadEnabled
          onFilterChange={setFilter}
          viewMode={viewMode}
        />
      </View>
    </>
  );
}
