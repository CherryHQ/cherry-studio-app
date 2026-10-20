import { BottomSheet, Button, ContentState, Input, TextField } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { useSpeech } from './useSpeech';
import { VoiceModelFields } from './VoiceModelFields';

export function SpeechSheet(props: { text: string; onClose: () => void }) {
  const { t } = useTranslation();
  const {
    model,
    request,
    text,
    setText,
    voiceId,
    setVoiceId,
    audio,
    status,
    textTooLong,
    generate,
    play,
    stop,
    close,
  } = useSpeech(props);

  return (
    <BottomSheet
      open
      size="large"
      onClose={close}
      title={t('voice.speech')}
      testID="voice-speech-sheet"
      footer={
        <View className="gap-2">
          {audio ? (
            <Button
              disabled={request.isRunning}
              onPress={status.playing ? stop : play}
              variant="secondary"
            >
              {t(status.playing ? 'voice.stop' : 'voice.play')}
            </Button>
          ) : null}
          <Button
            disabled={
              !model.isValid || !voiceId.trim() || !text.trim() || textTooLong || request.isRunning
            }
            loading={request.isRunning}
            onPress={generate}
          >
            {t('voice.generate')}
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
            disabled={request.isRunning}
            operation="speech"
            providers={model.providers.data ?? []}
            selection={model.selection}
            onChange={model.setSelection}
          />
        )}
        <TextField disabled={request.isRunning}>
          <TextField.Label>{t('voice.voice')}</TextField.Label>
          <Input
            accessibilityLabel={t('voice.voice')}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={80}
            value={voiceId}
            onChangeText={setVoiceId}
          />
        </TextField>
        <TextField disabled={request.isRunning} invalid={textTooLong}>
          <TextField.Label>{t('voice.text')}</TextField.Label>
          <Input
            accessibilityLabel={t('voice.text')}
            multiline
            value={text}
            onChangeText={setText}
          />
          {textTooLong ? <TextField.Error>{t('voice.textTooLong')}</TextField.Error> : null}
        </TextField>
        <Text className="text-muted-foreground text-sm">{t('voice.cloudNotice')}</Text>
      </ScrollView>
    </BottomSheet>
  );
}
