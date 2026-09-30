import { Section } from '@cherrystudio/ui/components';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { useTranslation } from 'react-i18next';

import { useBackupErrorReporter } from '@/frontend/appShell/backup';
import { useBackupState } from '@/frontend/hooks/useBackupState';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

/** Starts an export or a restore; the app-wide `BackupDialog` shows progress and the outcome. */
export function BackupScreen() {
  const { t } = useTranslation();
  const report = useBackupErrorReporter();
  const { backup, state } = useBackupState();
  const busy = state.phase !== 'idle';
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
    <SettingsScrollPage headerProps={{ title: t('backup.title') }}>
      <Section footer={t(available ? 'backup.sensitive' : 'backup.unavailable')}>
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
    </SettingsScrollPage>
  );
}
