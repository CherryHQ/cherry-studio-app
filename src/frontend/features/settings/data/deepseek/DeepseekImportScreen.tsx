import { Input, TextField, useToast } from '@cherrystudio/ui/components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data/BackendProvider';
import { useBackupState } from '@/frontend/hooks/useBackupState';
import {
  DeepseekImportError,
  type DeepseekImportErrorCode,
  type DeepseekImportProgress,
} from '@/shared/contracts/deepseekImport';
import { parseDeepseekExportUrl } from '@/shared/utils/deepseekExportUrl';

import { SettingsScrollPage } from '../../components/SettingsScrollPage';

const ERROR_KEYS = {
  invalid: 'settings.data.deepseek.error.invalid',
  unsupported: 'settings.data.deepseek.error.unsupported',
  empty: 'settings.data.deepseek.error.empty',
  'too-large': 'settings.data.deepseek.error.tooLarge',
  'disk-space': 'settings.data.deepseek.error.diskSpace',
  busy: 'settings.data.deepseek.error.busy',
  failed: 'settings.data.deepseek.error.failed',
  'invalid-link': 'settings.data.deepseek.error.invalidLink',
  'expired-link': 'settings.data.deepseek.error.expiredLink',
  download: 'settings.data.deepseek.error.download',
} as const satisfies Record<DeepseekImportErrorCode, string>;

export function DeepseekImportScreen() {
  const { t } = useTranslation();
  return (
    <SettingsScrollPage
      headerProps={{ title: t('settings.data.deepseek.title') }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <ImportAction />
    </SettingsScrollPage>
  );
}

function ImportAction() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const importer = useBackendModule('deepseekImport');
  const { state: backupState } = useBackupState();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<DeepseekImportProgress>();
  const [url, setUrl] = useState('');
  const [linkError, setLinkError] = useState<DeepseekImportErrorCode>();
  const operation = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => operation.current?.abort(), []);

  const importConversations = async () => {
    if (operation.current || backupState.phase !== 'idle') return;
    let downloadUrl: string;
    try {
      downloadUrl = parseDeepseekExportUrl(url);
      setLinkError(undefined);
    } catch (error) {
      setLinkError(error instanceof DeepseekImportError ? error.code : 'invalid-link');
      return;
    }
    const controller = new AbortController();
    Keyboard.dismiss();
    operation.current = controller;
    setBusy(true);
    setProgress(undefined);
    try {
      const result = await importer.importFromUrl(downloadUrl, {
        signal: controller.signal,
        onProgress: setProgress,
      });
      setUrl('');
      const partial = result.missingAttachments > 0 || result.skippedConversations > 0;
      toast.show({
        label: t(
          partial ? 'settings.data.deepseek.successPartial' : 'settings.data.deepseek.success',
          { sessions: result.sessions.toLocaleString(i18n.language) },
        ),
        variant: partial ? 'warning' : 'success',
      });
    } catch (error) {
      if (!controller.signal.aborted)
        toast.show({
          label: t(ERROR_KEYS[error instanceof DeepseekImportError ? error.code : 'failed']),
          variant: 'danger',
        });
    } finally {
      if (operation.current === controller) operation.current = undefined;
      if (!controller.signal.aborted) {
        setBusy(false);
        setProgress(undefined);
      }
    }
  };
  let status: string | undefined;
  if (busy) {
    switch (progress?.phase) {
      case 'downloading':
        status = progress.total
          ? t('settings.data.deepseek.downloadingProgress', {
              percent: Math.min(
                100,
                Math.floor((progress.completed / progress.total) * 100),
              ).toLocaleString(i18n.language),
            })
          : t('settings.data.deepseek.downloading');
        break;
      case 'importing':
        status = t('settings.data.deepseek.progress', {
          completed: progress.completed.toLocaleString(i18n.language),
          total: progress.total.toLocaleString(i18n.language),
        });
        break;
      default:
        status = t('settings.data.deepseek.reading');
        break;
    }
  }
  return (
    <View className="gap-3">
      <TextField disabled={busy || backupState.phase !== 'idle'} invalid={Boolean(linkError)}>
        <TextField.Label>{t('settings.data.deepseek.linkLabel')}</TextField.Label>
        <Input
          accessibilityLabel={t('settings.data.deepseek.linkLabel')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://…"
          value={url}
          onChangeText={(value) => {
            setUrl(value);
            setLinkError(undefined);
          }}
          onSubmitEditing={() => void importConversations()}
          returnKeyType="go"
        />
        <TextField.Error>{linkError ? t(ERROR_KEYS[linkError]) : undefined}</TextField.Error>
      </TextField>
      {status ? (
        <Text accessibilityLiveRegion="polite" className="text-sm text-muted-foreground">
          {status}
        </Text>
      ) : null}
    </View>
  );
}
