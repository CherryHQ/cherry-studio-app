import { Section, useAlert, useToast } from '@cherrystudio/ui/components';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { formatStorageSize, useBackupErrorReporter } from '@/frontend/appShell/backup';
import { useBackendModule } from '@/frontend/data/BackendProvider';
import { useBackupState } from '@/frontend/hooks/useBackupState';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

/** Backup and local storage maintenance; the app-wide `BackupDialog` shows backup progress. */
export function DataScreen() {
  const { t } = useTranslation();
  const report = useBackupErrorReporter();
  const { backup, state } = useBackupState();
  const [clearing, setClearing] = useState(false);
  const busy = state.phase !== 'idle' || clearing;
  const available = backup.isAvailable();

  const create = () => {
    void backup.createBackup().catch(report);
  };
  const select = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        const { uri } = result.assets[0];
        try {
          await backup.prepareRestore(uri);
        } finally {
          // DocumentPicker was asked for a cache copy; never unlink a user's source document.
          if (uri.startsWith(Paths.cache.uri)) {
            try {
              const file = new File(uri);
              if (file.exists) file.delete();
            } catch {
              /* A cache cleanup failure must not change the import outcome. */
            }
          }
        }
      }
    } catch (error) {
      report(error);
    }
  };

  return (
    <SettingsScrollPage contentClassName="gap-6" headerProps={{ title: t('settings.data.title') }}>
      <Section
        title={t('backup.title')}
        footer={t(available ? 'backup.sensitive' : 'backup.unavailable')}
      >
        <Section.Item
          label={t('backup.create')}
          onPress={create}
          showChevron={false}
          disabled={!available || busy}
        />
        <Section.Item
          label={t('backup.select')}
          onPress={() => void select()}
          showChevron={false}
          disabled={!available || busy}
        />
      </Section>
      <StorageSection disabled={busy} onClearingChange={setClearing} />
    </SettingsScrollPage>
  );
}

function StorageSection({
  disabled,
  onClearingChange,
}: {
  disabled: boolean;
  onClearingChange: (clearing: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const report = useBackupErrorReporter();
  const agent = useBackendModule('agent');
  const [size, setSize] = useState<number>();

  const refresh = useCallback(() => agent.getWorkingStorageSize().then(setSize), [agent]);
  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const clear = async () => {
    onClearingChange(true);
    try {
      const before = await agent.getWorkingStorageSize();
      await agent.clearWorkingStorage();
      const after = await agent.getWorkingStorageSize();
      setSize(after);
      toast.show({
        label: t('settings.data.runtimeCache.cleared', {
          size: formatStorageSize(Math.max(before - after, 0), t, i18n.language),
        }),
        variant: 'success',
      });
    } catch (error) {
      report(error);
      void refresh().catch(() => undefined);
    } finally {
      onClearingChange(false);
    }
  };
  const confirm = () =>
    alert.confirm({
      confirmLabel: t('settings.data.runtimeCache.confirm'),
      description: t('settings.data.runtimeCache.confirmDescription'),
      role: 'destructive',
      title: t('settings.data.runtimeCache.confirmTitle'),
      onConfirm: () => void clear(),
    });

  return (
    <Section title={t('settings.data.storage')} footer={t('settings.data.runtimeCache.footer')}>
      <Section.Item
        label={t('settings.data.runtimeCache.clear')}
        onPress={confirm}
        showChevron={false}
        disabled={disabled}
        testID="settings-data-clear-runtime-cache"
        trailing={
          size === undefined ? undefined : (
            <Text className="text-muted-foreground">
              {formatStorageSize(size, t, i18n.language)}
            </Text>
          )
        }
      />
    </Section>
  );
}
