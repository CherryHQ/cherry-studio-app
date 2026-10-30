import { Section, useAlert, useToast } from '@cherrystudio/ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import { VoiceError, type VoiceModelModule } from '@/shared/contracts/voice';

const STATUS_KEYS = {
  'not-downloaded': 'settings.voice.model.notDownloaded',
  checking: 'settings.voice.model.checking',
  downloading: 'settings.voice.model.downloading',
  verifying: 'settings.voice.model.verifying',
  ready: 'settings.voice.model.ready',
  removing: 'settings.voice.model.removing',
} as const;
const FAILURE_KEYS = {
  download: 'settings.voice.model.downloadFailed',
  verification: 'settings.voice.model.verificationFailed',
  storage: 'settings.voice.model.storageFailed',
} as const;

/** React adapter for a transfer owned by the backend, not the settings route. */
function useVoiceModel(model: VoiceModelModule) {
  return useSyncExternalStore(model.subscribe, model.getState, model.getState);
}

export function OfflineModelSetting() {
  const voice = useBackendModule('voice');
  const model = voice.localModel;
  const state = useVoiceModel(model);
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const status = useQuery({
    queryKey: ['voice', 'engine-status', 'dictation', 'sensevoice'],
    queryFn: ({ signal }) => voice.getEngineStatus('dictation', 'sensevoice', { signal }),
    staleTime: 0,
  });
  const available = status.data !== 'unsupported' && !!status.data;
  const transferring = state.status === 'downloading' || state.status === 'verifying';
  const busy = transferring || state.status === 'checking' || state.status === 'removing';
  const size = Math.ceil(state.totalBytes / 1_000_000);
  const formatBytes = (bytes: number) =>
    (bytes / 1_000_000).toLocaleString(i18n.language, { maximumFractionDigits: 1 });
  const description =
    state.status === 'failed'
      ? t(FAILURE_KEYS[state.failure ?? 'storage'])
      : t(STATUS_KEYS[state.status], {
          size,
          received: formatBytes(state.receivedBytes),
          total: formatBytes(state.totalBytes),
        });
  const run = (operation: Promise<void>) => {
    void operation
      .catch((error: unknown) => {
        // Transfer/storage failures remain inline with their retry action.
        if (model.getState().status !== 'failed')
          toast.show({
            label: t(
              error instanceof VoiceError && error.code === 'busy'
                ? 'voice.error.busy'
                : 'settings.voice.model.storageFailed',
            ),
            variant: 'danger',
          });
      })
      .finally(() => {
        void queryClient.invalidateQueries({ queryKey: ['voice'] });
      });
  };
  return (
    <>
      <Section.Item
        label={t('settings.voice.model.title')}
        description={available ? description : t('settings.voice.engine.unavailable')}
        showChevron={false}
      />
      <Section.Item
        label="SenseVoiceSmall"
        description={t('settings.voice.model.description')}
        showChevron={false}
      />
      {transferring ? (
        <Section.Item
          label={t('common.cancel')}
          onPress={() => run(model.cancel())}
          testID="voice-model-cancel"
        />
      ) : state.status === 'ready' ? (
        <Section.Item
          destructive
          label={t('settings.voice.model.delete')}
          testID="voice-model-delete"
          onPress={() =>
            alert.confirm({
              title: t('settings.voice.model.delete'),
              description: t('settings.voice.model.deleteDescription'),
              confirmLabel: t('common.delete'),
              onConfirm: () => run(model.remove()),
            })
          }
        />
      ) : (
        <Section.Item
          disabled={busy || !available}
          label={
            state.status === 'failed'
              ? t('common.retry')
              : t('settings.voice.model.download', { size })
          }
          onPress={() => run(model.download())}
          testID="voice-model-download"
        />
      )}
    </>
  );
}
