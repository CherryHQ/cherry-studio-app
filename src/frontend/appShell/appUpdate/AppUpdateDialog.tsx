import { Button, Dialog, MarkdownText, Spinner } from '@cherrystudio/ui/components';
import { normalizeFontSizeStep, type TypographySizeStep } from '@cherrystudio/ui/utils';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Platform, ScrollView, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data/BackendProvider';
import { usePreference } from '@/frontend/data/hooks';
import { openExternalUrl } from '@/frontend/utils/openExternalUrl';
import type { AppUpdateDownload, AppUpdateRelease } from '@/shared/contracts/appUpdate';

import { appUpdateReleaseNotesQueryOptions, useAppUpdateDownload } from './appUpdateQueries';

export type AppUpdateDialogActions = {
  cancel(): Promise<void>;
  close(): void;
  install(): Promise<void>;
  retry(): Promise<void>;
  start(release: AppUpdateRelease): void;
};

type RequiredUpdate = {
  version: string;
  checking: boolean;
  recheck(): void;
};

const STORE_KEYS = {
  'app-store': 'appUpdate.openAppStore',
  'google-play': 'appUpdate.openGooglePlay',
  'domestic-stores': 'appUpdate.openStore',
} as const;

/**
 * The single place an update is read and acted on: what changed, then the one next step for the
 * channel and the transfer. Closing never stops a transfer.
 */
export function AppUpdateDialog({
  actions,
  release,
  required = null,
}: {
  actions: AppUpdateDialogActions;
  release: AppUpdateRelease | null;
  required?: RequiredUpdate | null;
}) {
  const appUpdate = useBackendModule('appUpdate');
  const download = useAppUpdateDownload(appUpdate);
  // A raised floor can discover a new APK while the previous package is still ready to install.
  const transfer =
    required &&
    release &&
    (download.status === 'ready' || download.status === 'failed') &&
    download.release.id !== release.id
      ? ({ status: 'idle' } as const)
      : download;
  // Keep the last release on screen while the dialog animates closed.
  const [shown, setShown] = useState(release);
  if (release && release !== shown) setShown(release);
  const current = transfer.status !== 'idle' ? transfer.release : required ? release : shown;
  if (!current && !required) return null;

  return (
    <AppUpdateDialogContent
      actions={actions}
      current={current}
      open={required !== null || release !== null}
      required={required}
      transfer={transfer}
    />
  );
}

/**
 * Dialog children render through a portal outside the app providers, so every provider-backed
 * hook stays here and the children receive plain values.
 */
function AppUpdateDialogContent({
  actions,
  current,
  open,
  required,
  transfer,
}: {
  actions: AppUpdateDialogActions;
  current: AppUpdateRelease | null;
  open: boolean;
  required: RequiredUpdate | null;
  transfer: AppUpdateDownload;
}) {
  const appUpdate = useBackendModule('appUpdate');
  const [fontSizeStep] = usePreference('ui.font_size_step');
  const { t, i18n } = useTranslation();
  const [notes] = useQueries({
    queries: current
      ? [
          {
            ...appUpdateReleaseNotesQueryOptions(appUpdate, current, i18n.language),
            enabled: open,
          },
        ]
      : [],
  });

  const dismiss = () => {
    if (!required) {
      actions.close();
    } else if (Platform.OS === 'android') {
      void actions.cancel().finally(() => BackHandler.exitApp());
    }
  };
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      open={open}
      testID="app-update-dialog"
      title={
        required
          ? t('appUpdate.required', { version: required.version })
          : current?.latestVersion
            ? t('appUpdate.foundVersion', { version: current.latestVersion })
            : t('appUpdate.confirmTitle')
      }
    >
      {current ? (
        <>
          <Text className="text-sm text-muted-foreground">
            {t('appUpdate.currentVersion', { version: current.currentVersion })}
          </Text>
          <ReleaseNotes
            markdown={
              current.channel === 'apk' ||
              (current.channel === 'domestic-stores' && current.notesSource === 'gitcode')
            }
            fontSizeStep={normalizeFontSizeStep(fontSizeStep)}
            loading={notes?.isPending ?? false}
            notes={notes?.data ?? null}
          />
          <AppUpdateDialogActionsView
            actions={actions}
            release={current}
            transfer={transfer}
            required={!!required}
          />
        </>
      ) : (
        required && (
          <>
            <Text className="text-sm text-muted-foreground">
              {t(required.checking ? 'appUpdate.checking' : 'appUpdate.failed')}
            </Text>
            <Button disabled={required.checking} onPress={required.recheck}>
              {t('common.retry')}
            </Button>
          </>
        )
      )}
      {required && Platform.OS === 'android' && (
        <Button onPress={dismiss} variant="ghost">
          {t('appUpdate.exit')}
        </Button>
      )}
    </Dialog>
  );
}

function ReleaseNotes({
  markdown,
  fontSizeStep,
  loading,
  notes,
}: {
  markdown: boolean;
  fontSizeStep: TypographySizeStep;
  loading: boolean;
  notes: string | null;
}) {
  if (loading) {
    return (
      <View className="h-16 items-center justify-center">
        <Spinner size="sm" />
      </View>
    );
  }
  if (!notes) return null;
  // Notes scroll inside a bounded region so the actions below stay in view.
  return (
    <ScrollView className="max-h-80" nestedScrollEnabled showsVerticalScrollIndicator={false}>
      {/* GitCode and GitHub publish Markdown; store listings publish plain text with line breaks. */}
      {markdown ? (
        <MarkdownText
          fontSizeStep={fontSizeStep}
          markdown={notes}
          onLinkPress={(url) => void openExternalUrl(url)}
          selectable={false}
        />
      ) : (
        <Text className="text-base text-foreground">{notes}</Text>
      )}
    </ScrollView>
  );
}

function AppUpdateDialogActionsView({
  actions,
  release,
  required,
  transfer,
}: {
  actions: AppUpdateDialogActions;
  release: AppUpdateRelease;
  required: boolean;
  transfer: AppUpdateDownload;
}) {
  const { t } = useTranslation();
  const later = !required && (
    <Button onPress={actions.close} testID="app-update-later" variant="ghost">
      {t('appUpdate.later')}
    </Button>
  );

  switch (transfer.status) {
    case 'downloading':
    case 'verifying': {
      const percent =
        transfer.status === 'downloading' && transfer.totalBytes
          ? Math.min(100, Math.floor((100 * transfer.receivedBytes) / transfer.totalBytes))
          : null;
      return (
        <View className="gap-3">
          {percent === null ? (
            <View className="h-6 flex-row items-center gap-3">
              <Spinner size="sm" />
              <Text className="text-sm text-muted-foreground">
                {t(
                  transfer.status === 'verifying' ? 'appUpdate.verifying' : 'appUpdate.downloading',
                )}
              </Text>
            </View>
          ) : (
            <View
              accessibilityLabel={t('appUpdate.downloading')}
              accessibilityRole="progressbar"
              accessibilityValue={{ max: 100, min: 0, now: percent }}
              className="h-6 flex-row items-center gap-3"
            >
              <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <View
                  className="h-full rounded-full bg-foreground"
                  style={{ width: `${percent}%` }}
                />
              </View>
              <Text className="w-10 text-right text-sm tabular-nums text-muted-foreground">
                {percent}%
              </Text>
            </View>
          )}
          {!required && (
            <>
              <Button onPress={actions.close} testID="app-update-later" variant="secondary">
                {t('appUpdate.downloadInBackground')}
              </Button>
              <Button onPress={() => void actions.cancel()} variant="ghost">
                {t('appUpdate.cancelDownload')}
              </Button>
            </>
          )}
        </View>
      );
    }
    case 'ready':
      return (
        <View className="gap-3">
          <Text className="text-sm text-muted-foreground">{t('appUpdate.installDescription')}</Text>
          <Button onPress={() => void actions.install()} testID="app-update-install">
            {t('appUpdate.install')}
          </Button>
          {later}
        </View>
      );
    case 'failed':
      return (
        <View className="gap-3">
          <Text className="text-sm text-error">
            {t(
              transfer.reason === 'verification'
                ? 'appUpdate.verificationFailed'
                : 'appUpdate.downloadFailed',
            )}
          </Text>
          <Button onPress={() => void actions.retry()} testID="app-update-retry">
            {t('appUpdate.retryDownload')}
          </Button>
          {later}
        </View>
      );
    case 'idle':
      return (
        <View className="gap-3">
          <Button onPress={() => actions.start(release)} testID="app-update-start">
            {t(release.channel === 'apk' ? 'appUpdate.download' : STORE_KEYS[release.channel])}
          </Button>
          {later}
        </View>
      );
  }
}
