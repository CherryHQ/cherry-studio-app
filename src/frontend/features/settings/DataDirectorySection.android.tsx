import { FolderOpenIcon, Trash2Icon } from '@cherrystudio/app-icons';
import { Section } from '@cherrystudio/ui/components';
import * as FileSystem from 'expo-file-system/legacy';
import { ActivityAction, startActivityAsync } from 'expo-intent-launcher';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { DataDirectorySectionProps } from './dataDirectorySection.types';

const ANDROID_GRANT_READ_URI_PERMISSION_FLAG = 1;

export function DataDirectorySection({ onClearCache }: DataDirectorySectionProps) {
  const { t } = useTranslation();
  const handleAppDataPress = useCallback(() => {
    if (!FileSystem.documentDirectory) {
      return;
    }

    FileSystem.getContentUriAsync(FileSystem.documentDirectory)
      .then((contentUri) =>
        startActivityAsync('android.intent.action.VIEW', {
          data: contentUri,
          flags: ANDROID_GRANT_READ_URI_PERMISSION_FLAG,
          type: 'resource/folder',
        }),
      )
      .catch(() => {
        void startActivityAsync(ActivityAction.APP_STORAGE_SETTINGS).catch(() => undefined);
      });
  }, []);

  return (
    <Section title={t('settings.data.directory.title')}>
      <Section.Item
        label={t('settings.data.appData.title')}
        leading={<FolderOpenIcon className="size-5 text-foreground" />}
        onPress={handleAppDataPress}
        showChevron={false}
      />
      <Section.Item
        label={t('settings.data.clearCache.title')}
        leading={<Trash2Icon className="size-5 text-foreground" />}
        onPress={onClearCache}
        showChevron={false}
      />
    </Section>
  );
}
