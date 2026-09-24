import { Button, Section, useAlert, useToast } from '@cherrystudio/ui/components';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useBackupState } from '@/frontend/hooks/useBackupState';
import { BackupError, type BackupErrorCode } from '@/shared/contracts/backup';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

const ERROR_KEYS: Record<BackupErrorCode, string> = {
  unavailable: 'backup.unavailable',
  busy: 'backup.error.busy',
  cancelled: 'common.cancel',
  invalid: 'backup.error.invalid',
  incompatible: 'backup.error.incompatible',
  'too-large': 'backup.limits',
  'disk-space': 'backup.error.space',
  'missing-files': 'backup.error.missing',
  storage: 'backup.error.storage',
  'restart-required': 'backup.restart.description',
};
export function BackupScreen() {
  const { t, i18n } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const { backup, state } = useBackupState();
  const busy = state.phase !== 'idle' && state.phase !== 'ready';
  const available = backup.isAvailable();
  const preview = state.preview;

  const report = (error: unknown) => {
    if (
      error instanceof BackupError &&
      (error.code === 'cancelled' || error.code === 'restart-required')
    )
      return;
    const key = error instanceof BackupError ? ERROR_KEYS[error.code] : 'backup.error.storage';
    toast.show({ label: t(key), variant: 'danger' });
  };
  const create = async () => {
    try {
      const result = await backup.createBackup();
      if (!(await Sharing.isAvailableAsync())) throw new BackupError('unavailable');
      await Sharing.shareAsync(result.uri, {
        mimeType: 'application/zip',
        UTI: 'public.zip-archive',
        dialogTitle: t('backup.save'),
      });
    } catch (error) {
      report(error);
    }
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
  const confirmRestore = () => {
    if (!preview) return;
    alert.confirm({
      title: t('backup.confirm.title'),
      description: t('backup.confirm.description'),
      role: 'destructive',
      confirmLabel: t('backup.apply'),
      onConfirm: () => {
        void backup.applyRestore(preview.id).catch(report);
      },
    });
  };

  return (
    <SettingsScrollPage headerProps={{ title: t('backup.title') }} contentClassName="gap-6">
      <Section footer={t('backup.sensitive')}>
        <Section.Item
          label={t('backup.create')}
          onPress={() => void create()}
          disabled={!available || busy}
        />
        <Section.Item
          label={t('backup.select')}
          onPress={() => void select()}
          disabled={!available || busy}
        />
      </Section>
      {!available && (
        <Text className="text-sm text-muted-foreground">{t('backup.unavailable')}</Text>
      )}
      {state.phase === 'ready' && preview && (
        <View className="gap-4">
          <Text className="text-lg font-semibold text-foreground">{t('backup.preview')}</Text>
          <Text className="text-sm text-muted-foreground">
            {t('backup.source', {
              date: new Date(preview.createdAt).toLocaleString(i18n.language),
              version: preview.appVersion,
              platform: preview.platform,
            })}
          </Text>
          <Text className="text-base text-foreground">
            {t('backup.contents', {
              sessions: preview.sessions,
              messages: preview.messages,
              files: preview.files,
              size: (preview.bytes / 1024 / 1024).toLocaleString(i18n.language, {
                maximumFractionDigits: 1,
              }),
            })}
          </Text>
          <Text className="text-sm text-muted-foreground">{t('backup.reconnect')}</Text>
          <Button variant="destructive" onPress={confirmRestore}>
            {t('backup.apply')}
          </Button>
          <Button variant="outline" onPress={backup.cancel}>
            {t('common.cancel')}
          </Button>
        </View>
      )}
    </SettingsScrollPage>
  );
}
