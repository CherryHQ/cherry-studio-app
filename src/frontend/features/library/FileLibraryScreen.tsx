import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { RouteHeader } from '@/frontend/components/headers';

import { FileLibraryList } from './FileLibraryList';
import type { FileLibraryFilter } from './hooks/useFileEntries';

/**
 * The file library (`/library`), the sidebar's library destination: everything
 * Cherry has stored as a file — chat attachments, generated images, imported
 * documents — in one grid, filterable by kind, with a badge on the files Cherry
 * generated. The root Stack pushes it above chat, so its leading action returns
 * to the chat surface.
 */
export function FileLibraryScreen() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FileLibraryFilter>('all');

  return (
    <>
      <RouteHeader title={t('library.title')} />
      <View className="flex-1 bg-background">
        <FileLibraryList filter={filter} isDataLoadEnabled onFilterChange={setFilter} />
      </View>
    </>
  );
}
