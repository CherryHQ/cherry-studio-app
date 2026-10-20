import { ActionMenu, Button, ContentState, Input, TextField } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type {
  VoiceModelSelection,
  VoiceOperation,
  VoiceProviderOption,
} from '@/shared/contracts/voice';

const MODEL_SUGGESTIONS = {
  speech: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'],
  transcription: ['whisper-1', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe'],
};

export function VoiceModelFields({
  disabled,
  operation,
  providers,
  selection,
  onChange,
}: {
  disabled: boolean;
  operation: VoiceOperation;
  providers: readonly VoiceProviderOption[];
  selection: VoiceModelSelection;
  onChange: (selection: VoiceModelSelection) => void;
}) {
  const { t } = useTranslation();
  const provider = providers.find((item) => item.id === selection.providerId);
  if (!providers.length)
    return (
      <ContentState.Empty title={t('voice.noProviders')} description={t('voice.providerHelp')} />
    );
  return (
    <View className="gap-3">
      <TextField disabled={disabled}>
        <TextField.Label>{t('voice.provider')}</TextField.Label>
        <ActionMenu
          items={providers.map((item) => ({
            id: item.id,
            label: item.name,
            onPress: () => onChange({ ...selection, providerId: item.id }),
          }))}
        >
          <Button disabled={disabled} variant="outline">
            {provider?.name ?? t('voice.chooseProvider')}
          </Button>
        </ActionMenu>
      </TextField>
      <TextField disabled={disabled}>
        <TextField.Label>{t('voice.model')}</TextField.Label>
        <Input
          accessibilityLabel={t('voice.model')}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={256}
          onChangeText={(modelId) => onChange({ ...selection, modelId })}
          value={selection.modelId}
        />
      </TextField>
      <ActionMenu
        items={MODEL_SUGGESTIONS[operation].map((modelId) => ({
          id: modelId,
          label: modelId,
          onPress: () => onChange({ ...selection, modelId }),
        }))}
      >
        <Button disabled={disabled} size="sm" variant="ghost">
          {t('voice.modelSuggestions')}
        </Button>
      </ActionMenu>
      <Text className="text-muted-foreground text-sm">{t('voice.usageUnavailable')}</Text>
    </View>
  );
}
