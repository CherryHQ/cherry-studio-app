import { BottomSheet, Button, ContentState } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { MAX_VOICE_RECORDING_SECONDS } from '@/shared/contracts/voice';

import { useVoiceInput } from './useVoiceInput';
import { VoiceModelFields } from './VoiceModelFields';

export function VoiceInputSheet(props: {
  onClose: () => void;
  onTranscribed: (text: string) => void;
}) {
  const { t } = useTranslation();
  const {
    model,
    request,
    input,
    isRecording,
    recorderState,
    startRecording,
    stopRecording,
    chooseFile,
    transcribe,
    close,
  } = useVoiceInput(props);

  return (
    <BottomSheet
      open
      onClose={close}
      size="large"
      title={t('voice.input')}
      testID="voice-input-sheet"
      footer={
        <View className="gap-2">
          <Button
            disabled={!model.isValid || !input || isRecording || request.isRunning}
            loading={request.isRunning}
            onPress={transcribe}
          >
            {t('voice.transcribe')}
          </Button>
          <Button onPress={close} variant="ghost">
            {t('common.cancel')}
          </Button>
        </View>
      }
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="gap-4 px-4 pb-4">
        {model.providers.isPending ? (
          <ContentState.Loading title={t('settings.provider.catalog.loading')} />
        ) : model.providers.isError ? (
          <ContentState.Error
            title={t('voice.failed')}
            primaryAction={{
              children: t('common.retry'),
              onPress: () => void model.providers.refetch(),
            }}
          />
        ) : (
          <VoiceModelFields
            disabled={request.isRunning || isRecording}
            operation="transcription"
            providers={model.providers.data ?? []}
            selection={model.selection}
            onChange={model.setSelection}
          />
        )}
        <Text className="text-muted-foreground text-sm">{t('voice.recordingLimit')}</Text>
        {isRecording ? (
          <Text className="text-foreground text-base">
            {t('voice.recordingTime', {
              seconds: Math.min(
                MAX_VOICE_RECORDING_SECONDS,
                Math.floor(recorderState.durationMillis / 1000),
              ),
            })}
          </Text>
        ) : null}
        {input ? (
          <Text className="text-foreground text-base" numberOfLines={2}>
            {input.name}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          <Button
            disabled={request.isRunning}
            onPress={isRecording ? stopRecording : startRecording}
            variant="secondary"
          >
            {t(isRecording ? 'voice.stopRecording' : 'voice.record')}
          </Button>
          <Button
            disabled={request.isRunning || isRecording}
            onPress={chooseFile}
            variant="outline"
          >
            {t('voice.chooseFile')}
          </Button>
        </View>
        <Text className="text-muted-foreground text-sm">{t('voice.cloudNotice')}</Text>
        <Text className="text-muted-foreground text-sm">{t('voice.reviewNotice')}</Text>
      </ScrollView>
    </BottomSheet>
  );
}
