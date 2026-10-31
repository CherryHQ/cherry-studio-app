import { Button, Section, useAlert, useToast } from '@cherrystudio/ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { VoiceError, type VoiceModelModule } from '@/shared/contracts/voice';

const STATUS_KEYS = {
  checking: 'settings.voice.model.checking',
  verifying: 'settings.voice.model.verifying',
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
  const unavailable = status.data === 'unsupported';
  const transferring = state.status === 'downloading' || state.status === 'verifying';
  const busy = transferring || state.status === 'checking' || state.status === 'removing';
  const size = Math.ceil(state.totalBytes / 1_000_000);
  const percent =
    state.totalBytes > 0
      ? Math.min(100, Math.floor((100 * state.receivedBytes) / state.totalBytes))
      : 0;
  const description = unavailable
    ? t('settings.voice.engine.unavailable')
    : state.status === 'failed'
      ? t(FAILURE_KEYS[state.failure ?? 'storage'])
      : state.status === 'downloading'
        ? (percent / 100).toLocaleString(i18n.resolvedLanguage, { style: 'percent' })
        : state.status === 'not-downloaded' || state.status === 'ready'
          ? t('settings.voice.model.size', { size: size.toLocaleString(i18n.resolvedLanguage) })
          : t(STATUS_KEYS[state.status]);
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
    <Section.Item density="comfortable">
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="font-medium text-base text-foreground">SenseVoiceSmall</Text>
            <Text className="text-xs text-muted-foreground">{description}</Text>
          </View>
          <View className="max-w-[45%] shrink">
            {transferring ? (
              <Button
                onPress={() => run(model.cancel())}
                size="sm"
                testID="voice-model-cancel"
                variant="outline"
              >
                {t('common.cancel')}
              </Button>
            ) : state.status === 'ready' ? (
              <Button
                onPress={() =>
                  alert.confirm({
                    title: t('settings.voice.model.delete', { name: 'SenseVoiceSmall' }),
                    confirmLabel: t('common.delete'),
                    role: 'destructive',
                    onConfirm: () => run(model.remove()),
                  })
                }
                size="sm"
                testID="voice-model-delete"
                variant="tonal"
              >
                {t('common.delete')}
              </Button>
            ) : (
              <Button
                disabled={busy || unavailable || !status.data}
                onPress={() => run(model.download())}
                size="sm"
                testID="voice-model-download"
              >
                {state.status === 'failed' ? t('common.retry') : t('settings.voice.model.download')}
              </Button>
            )}
          </View>
        </View>
        {state.status === 'downloading' ? (
          <View
            accessibilityLabel={t('settings.voice.model.downloading')}
            accessibilityRole="progressbar"
            accessibilityValue={{ max: 100, min: 0, now: percent }}
            className="h-1 overflow-hidden rounded-full bg-secondary"
          >
            <View className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
          </View>
        ) : null}
      </View>
    </Section.Item>
  );
}
