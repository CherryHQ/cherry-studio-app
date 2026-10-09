import { Button, Dialog, Spinner, useToast } from '@cherrystudio/ui/components';
import { Directory, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { TFunction } from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useBackupState } from '@/frontend/hooks/useBackupState';
import type { BackupExport, BackupPreview, BackupState } from '@/shared/contracts/backup';

import { useBackupErrorReporter } from './useBackupErrorReporter';

const RUNNING_PHASE_TITLES: Partial<Record<BackupState['phase'], string>> = {
  capturing: 'backup.progress.export',
  packing: 'backup.progress.export',
  validating: 'backup.progress.import',
  staging: 'backup.progress.restore',
};

const PLATFORM_NAMES: Record<string, string> = { android: 'Android', ios: 'iOS' };

type ExportAction = 'save' | 'share';

/**
 * The single surface for a backup or restore: progress, then the finished export or the restore
 * preview. Mounted beside the root stack, so while work runs the user cannot act on any route
 * until it finishes or is cancelled.
 *
 * Dialog content renders through a portal outside the app's providers, so every hook runs here
 * and the content components only receive props.
 */
export function BackupDialog() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const report = useBackupErrorReporter();
  const { backup, state } = useBackupState();
  const [pendingAction, setPendingAction] = useState<ExportAction>();
  const runningTitle = RUNNING_PHASE_TITLES[state.phase];
  const exported = state.phase === 'exported' ? state.exported : undefined;
  const preview = state.phase === 'ready' ? state.preview : undefined;
  const title = runningTitle
    ? t(runningTitle)
    : exported
      ? t('backup.save')
      : preview
        ? t('backup.confirm.title')
        : '';

  const runExportAction = async (action: ExportAction, uri: string) => {
    setPendingAction(action);
    try {
      if (action === 'save') {
        const directory = await Directory.pickDirectoryAsync();
        await new File(uri).copy(directory);
        toast.show({ label: t('backup.saved'), variant: 'success' });
        // The saved copy is the result; the temporary export is no longer needed.
        backup.cancel();
      } else {
        if (!(await Sharing.isAvailableAsync())) throw new Error('sharing unavailable');
        await Sharing.shareAsync(uri, {
          dialogTitle: t('backup.save'),
          mimeType: 'application/zip',
          UTI: 'public.zip-archive',
        });
      }
    } catch (error) {
      // Both platforms reject a dismissed folder picker with a "cancelled" error.
      if (!/cancel/i.test(String(error))) {
        toast.show({
          label: t(action === 'save' ? 'backup.error.save' : 'backup.error.share'),
          variant: 'danger',
        });
      }
    } finally {
      setPendingAction(undefined);
    }
  };

  return (
    <Dialog
      // Running work only closes by finishing or cancelling; a result closes like Cancel.
      onOpenChange={(open) => {
        if (!open && !runningTitle && !pendingAction) backup.cancel();
      }}
      // The dialog draws above presented system sheets, so it steps aside while the folder picker
      // or share sheet is open and returns when that sheet closes.
      open={title !== '' && !pendingAction}
      testID="backup-dialog"
      title={title}
    >
      {runningTitle ? (
        <BackupProgress
          completed={state.completed}
          label={title}
          onCancel={backup.cancel}
          total={state.total}
        />
      ) : exported ? (
        <BackupExportResult
          exported={exported}
          onDiscard={backup.cancel}
          onSave={() => void runExportAction('save', exported.uri)}
          onShare={() => void runExportAction('share', exported.uri)}
          pendingAction={pendingAction}
        />
      ) : preview ? (
        <BackupRestorePreview
          onCancel={backup.cancel}
          onRestore={() => void backup.applyRestore(preview.id).catch(report)}
          preview={preview}
        />
      ) : null}
    </Dialog>
  );
}

function BackupProgress({
  completed,
  label,
  onCancel,
  total,
}: {
  completed: number;
  label: string;
  onCancel: () => void;
  total: number;
}) {
  const { t } = useTranslation();
  const percent = total > 0 ? Math.floor((completed / total) * 100) : null;

  return (
    <>
      {percent === null ? (
        <View className="h-8 items-center justify-center">
          <Spinner accessibilityLabel={label} size="sm" />
        </View>
      ) : (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityValue={{ max: 100, min: 0, now: percent }}
          className="flex-row items-center gap-3"
        >
          <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
            <View className="h-full rounded-full bg-foreground" style={{ width: `${percent}%` }} />
          </View>
          <Text className="w-10 text-right text-sm tabular-nums text-muted-foreground">
            {percent}%
          </Text>
        </View>
      )}
      <Button onPress={onCancel} variant="secondary">
        {t('common.cancel')}
      </Button>
    </>
  );
}

function BackupSummary({ rows }: { rows: readonly (readonly [string, string])[] }) {
  return (
    <View className="gap-2 rounded-xl bg-secondary px-4 py-3">
      {rows.map(([label, value]) => (
        <View className="flex-row items-center justify-between gap-4" key={label}>
          <Text className="text-sm text-muted-foreground">{label}</Text>
          <Text
            className="shrink text-right text-sm tabular-nums text-foreground"
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const MEBIBYTE = 1024 * 1024;

function formatSize(bytes: number, t: TFunction, language: string): string {
  const inMegabytes = bytes >= MEBIBYTE;
  const size = (inMegabytes ? bytes / MEBIBYTE : bytes / 1024).toLocaleString(language, {
    maximumFractionDigits: 1,
  });
  return t(inMegabytes ? 'backup.details.sizeValue' : 'backup.details.sizeValueKb', { size });
}

function useCountRows(counts: {
  sessions: number;
  messages: number;
  files: number;
  bytes: number;
}) {
  const { t, i18n } = useTranslation();
  const format = (value: number) => value.toLocaleString(i18n.language);
  return [
    [t('backup.details.sessions'), format(counts.sessions)],
    [t('backup.details.messages'), format(counts.messages)],
    [t('backup.details.files'), format(counts.files)],
    [t('backup.details.size'), formatSize(counts.bytes, t, i18n.language)],
  ] as const;
}

function BackupExportResult({
  exported,
  onDiscard,
  onSave,
  onShare,
  pendingAction,
}: {
  exported: BackupExport;
  onDiscard: () => void;
  onSave: () => void;
  onShare: () => void;
  pendingAction: ExportAction | undefined;
}) {
  const { t } = useTranslation();
  const rows = useCountRows(exported);
  const isPending = pendingAction !== undefined;

  return (
    <>
      <BackupSummary rows={rows} />
      <Text className="text-sm text-muted-foreground">{t('backup.sensitive')}</Text>
      <View className="gap-2">
        <Button disabled={isPending} loading={pendingAction === 'save'} onPress={onSave}>
          {t('backup.saveToFiles')}
        </Button>
        <Button
          disabled={isPending}
          loading={pendingAction === 'share'}
          onPress={onShare}
          variant="secondary"
        >
          {t('backup.share')}
        </Button>
        <Button disabled={isPending} onPress={onDiscard} variant="ghost">
          {t('common.cancel')}
        </Button>
      </View>
    </>
  );
}

function BackupRestorePreview({
  onCancel,
  onRestore,
  preview,
}: {
  onCancel: () => void;
  onRestore: () => void;
  preview: BackupPreview;
}) {
  const { t, i18n } = useTranslation();
  const countRows = useCountRows(preview);
  const rows = [
    [t('backup.details.createdAt'), new Date(preview.createdAt).toLocaleString(i18n.language)],
    [
      t('backup.details.source'),
      t('backup.details.sourceValue', {
        platform: PLATFORM_NAMES[preview.platform] ?? preview.platform,
        version: preview.appVersion,
      }),
    ],
    ...countRows,
  ] as const;

  return (
    <>
      <BackupSummary rows={rows} />
      <Text className="text-sm text-muted-foreground">{t('backup.confirm.description')}</Text>
      <View className="gap-2">
        <Button onPress={onRestore} variant="destructive">
          {t('backup.apply')}
        </Button>
        <Button onPress={onCancel} variant="secondary">
          {t('common.cancel')}
        </Button>
      </View>
    </>
  );
}
