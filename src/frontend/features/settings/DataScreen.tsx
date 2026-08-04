import * as FileSystem from 'expo-file-system/legacy';
import { ActivityAction, startActivityAsync } from 'expo-intent-launcher';
import {
  DownloadIcon,
  FolderOpenIcon,
  MonitorCloudIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-uniwind/png';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';
import { Section, SectionIcon } from '@/frontend/components/Section';
import { isAndroid } from '@/frontend/utils/constants';

const ANDROID_GRANT_READ_URI_PERMISSION_FLAG = 1;

export default function DataSettingsScreen() {
  const { t } = useTranslation();

  const handleActionPress = useCallback(() => {
    // UI placeholder only. Wire real data actions when those services are ready.
  }, []);

  const handleAppDataPress = useCallback(() => {
    if (!isAndroid || !FileSystem.documentDirectory) {
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

  const directoryItems = isAndroid
    ? [
        {
          hideAccessory: true,
          leading: <SectionIcon icon={FolderOpenIcon} />,
          title: t('settings.data.appData.title'),
          onPress: handleAppDataPress,
        },
        {
          hideAccessory: true,
          leading: <SectionIcon icon={Trash2Icon} />,
          title: t('settings.data.clearCache.title'),
          onPress: handleActionPress,
        },
      ]
    : [
        {
          hideAccessory: true,
          leading: <SectionIcon icon={Trash2Icon} />,
          title: t('settings.data.clearCache.title'),
          onPress: handleActionPress,
        },
      ];

  return (
    <>
      <BackHeader title={t('settings.pages.data.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-6 px-4 py-5">
          <Section
            items={[
              {
                hideAccessory: true,
                leading: <SectionIcon icon={UploadIcon} />,
                title: t('settings.data.backup.title'),
                onPress: handleActionPress,
              },
              {
                hideAccessory: true,
                leading: <SectionIcon icon={DownloadIcon} />,
                title: t('settings.data.restore.title'),
                onPress: handleActionPress,
              },
              {
                hideAccessory: true,
                leading: <SectionIcon icon={MonitorCloudIcon} />,
                title: t('settings.data.syncDesktop.title'),
                onPress: handleActionPress,
              },
            ]}
            title={t('settings.data.backupRestore.title')}
          />
          <Section items={directoryItems} title={t('settings.data.directory.title')} />
          <Section
            items={[
              {
                hideAccessory: true,
                leading: <SectionIcon icon={RefreshCwIcon} />,
                title: t('settings.data.resetData.title'),
                onPress: handleActionPress,
              },
            ]}
          />
        </View>
      </ScrollView>
    </>
  );
}
