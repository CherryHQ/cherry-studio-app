import { Button } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useComposerState } from '@/frontend/components/Composer';
import { useBackendModule, usePreference } from '@/frontend/data';
import { isAudioMediaType } from '@/shared/utils/audioFileTypes';

/** Local chat owns transcription guidance; remote attachments keep their server's capabilities. */
export function AudioAttachmentNotice() {
  const { attachments } = useComposerState();
  return attachments.some((attachment) => isAudioMediaType(attachment.mediaType)) ? (
    <TranscriptionAvailability />
  ) : null;
}

function useTranscriptionAvailability() {
  const voice = useBackendModule('voice');
  const [engine] = usePreference('feature.voice.transcription_engine');
  const [language] = usePreference('feature.voice.transcription_language');
  const [appLanguage] = usePreference('app.language');
  return useQuery({
    // Voice settings invalidate this family after model downloads/removals.
    queryKey: ['voice', 'transcription-status', engine, language, appLanguage],
    queryFn: ({ signal }) => voice.getTranscriptionStatus({ signal }),
    staleTime: 0,
    retry: false,
  });
}

function TranscriptionAvailability() {
  const { t } = useTranslation();
  const router = useRouter();
  const status = useTranscriptionAvailability();
  const needsModel = status.data === 'needs-model';
  const needsSettings = !status.isPending && status.data !== 'ready';
  const label = status.isPending
    ? t('settings.voice.model.checking')
    : needsModel
      ? t('attachments.audio.needsModel')
      : status.data === 'ready'
        ? t('attachments.audio.ready')
        : status.data === 'needs-setup'
          ? t('voice.error.offlineRecognitionUnavailable')
          : t('voice.error.unsupported');
  return (
    <View className="gap-2 px-1 pb-2">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      {needsSettings ? (
        <View className="self-start">
          <Button size="sm" variant="outline" onPress={() => router.push('/settings/voice')}>
            {t('settings.voice.title')}
          </Button>
        </View>
      ) : null}
    </View>
  );
}
