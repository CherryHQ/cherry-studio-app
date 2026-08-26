import { useDrawerProgress } from 'expo-router/drawer';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

import { RouteHeader } from '@/frontend/components/headers';

import { FileLibraryList } from './FileLibraryList';
import type { FileLibraryFilter } from './hooks/useFileEntries';

/**
 * The file library (`/library`), the sidebar's library destination: everything
 * Cherry has stored as a file — chat attachments, generated images, imported
 * documents — in one grid, filterable by kind. A drawer scene, so it leads with
 * a hamburger and has nothing to go back to.
 */
export function FileLibraryScreen() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FileLibraryFilter>('all');
  const isDrawerSettled = useDrawerSettled();

  return (
    <>
      <RouteHeader title={t('library.title')} />
      <View className="flex-1 bg-background">
        <FileLibraryList
          filter={filter}
          isDataLoadEnabled={isDrawerSettled}
          onFilterChange={setFilter}
        />
      </View>
    </>
  );
}

/** Keeps file I/O and tile mounting off the drawer's transition frames. */
function useDrawerSettled() {
  const drawerProgress = useDrawerProgress();
  const [isSettled, setIsSettled] = useState(false);
  const syncSettledState = useCallback((nextIsSettled: boolean) => {
    setIsSettled(nextIsSettled);
  }, []);

  useAnimatedReaction(
    () => drawerProgress.value === 0,
    (nextIsSettled, previousIsSettled) => {
      if (nextIsSettled !== previousIsSettled) {
        runOnJS(syncSettledState)(nextIsSettled);
      }
    },
    [drawerProgress, syncSettledState],
  );

  return isSettled;
}
