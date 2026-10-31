import { BottomSheet, Button, ContentState, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useOpenFileEntry } from '@/frontend/components/FileEntryPreview';
import { useBackendModule } from '@/frontend/data';
import { voiceErrorLabelKey } from '@/frontend/utils/voiceErrorLabel';
import { VoiceError } from '@/shared/contracts/voice';

import type { AudioTranscriptionState } from '../hooks/useAudioTranscription';

export function AudioTranscriptionSheet({
  state,
  onClose,
  onRetry,
}: {
  state: AudioTranscriptionState;
  onClose(): void;
  onRetry(): void;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const files = useBackendModule('file');
  const { openFileEntry } = useOpenFileEntry();
  const { toast } = useToast();
  const needsSettings =
    state.status === 'failed' &&
    state.error instanceof VoiceError &&
    ['model-not-downloaded', 'offline-recognition-unavailable', 'unsupported'].includes(
      state.error.code,
    );
  const progress = state.status === 'running' ? state.progress : undefined;
  const fraction = progress ? Math.min(1, progress.completedSeconds / progress.totalSeconds) : 0;
  const openResult = async () => {
    if (state.status !== 'complete') return;
    try {
      const uri = await files.getUri(state.result.entry.id);
      if (!uri) throw new Error('Transcript unavailable');
      onClose();
      openFileEntry({ entry: state.result.entry, uri });
    } catch {
      toast.show({ label: t('filePreview.openFailed'), variant: 'danger' });
    }
  };
  return (
    <BottomSheet
      open
      onClose={onClose}
      size="compact"
      title={t('library.transcription.title')}
      footer={
        state.status === 'running' ? (
          <Button onPress={onClose} variant="outline">
            {t('common.cancel')}
          </Button>
        ) : state.status === 'complete' ? (
          <Button onPress={() => void openResult()}>{t('library.transcription.open')}</Button>
        ) : (
          <Button
            onPress={
              needsSettings
                ? () => {
                    onClose();
                    router.push('/settings/voice');
                  }
                : onRetry
            }
          >
            {needsSettings ? t('settings.voice.title') : t('common.retry')}
          </Button>
        )
      }
    >
      <ScrollView contentContainerClassName="gap-4 px-4 py-2">
        <Text className="font-medium text-base text-foreground">{state.file.name}</Text>
        {state.status === 'running' ? (
          <>
            <ContentState.Loading title={t('library.transcription.running')} />
            {progress ? (
              <View
                accessibilityRole="progressbar"
                accessibilityLabel={t('library.transcription.running')}
                accessibilityValue={{ min: 0, max: 100, now: Math.floor(fraction * 100) }}
              >
                <Text className="text-sm text-muted-foreground">
                  {fraction.toLocaleString(i18n.resolvedLanguage, {
                    style: 'percent',
                    maximumFractionDigits: 0,
                  })}
                </Text>
              </View>
            ) : null}
            <Text className="text-sm text-muted-foreground">
              {t('library.transcription.offline')}
            </Text>
          </>
        ) : state.status === 'complete' ? (
          <Text className="text-base text-foreground">
            {t('library.transcription.saved', { name: state.result.entry.filename })}
          </Text>
        ) : (
          <ContentState.Error title={t(voiceErrorLabelKey(state.error))} />
        )}
      </ScrollView>
    </BottomSheet>
  );
}
