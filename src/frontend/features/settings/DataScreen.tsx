import { DownloadIcon, MonitorCloudIcon, RefreshCwIcon, UploadIcon } from '@cherrystudio/app-icons';
import { Section } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';

import { DataDirectorySection } from './DataDirectorySection/DataDirectorySection';

export default function DataSettingsScreen() {
  const { t } = useTranslation();

  const handleActionPress = useCallback(() => {
    // UI placeholder only. Wire real data actions when those services are ready.
  }, []);

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
          <Section title={t('settings.data.backupRestore.title')}>
            <Section.Item
              label={t('settings.data.backup.title')}
              leading={<UploadIcon className="size-5 text-foreground" />}
              onPress={handleActionPress}
              showChevron={false}
            />
            <Section.Item
              label={t('settings.data.restore.title')}
              leading={<DownloadIcon className="size-5 text-foreground" />}
              onPress={handleActionPress}
              showChevron={false}
            />
            <Section.Item
              label={t('settings.data.syncDesktop.title')}
              leading={<MonitorCloudIcon className="size-5 text-foreground" />}
              onPress={handleActionPress}
              showChevron={false}
            />
          </Section>
          <DataDirectorySection onClearCache={handleActionPress} />
          <Section>
            <Section.Item
              label={t('settings.data.resetData.title')}
              leading={<RefreshCwIcon className="size-5 text-foreground" />}
              onPress={handleActionPress}
              showChevron={false}
            />
          </Section>
        </View>
      </ScrollView>
    </>
  );
}
