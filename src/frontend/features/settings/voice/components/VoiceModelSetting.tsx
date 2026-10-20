import {
  Input,
  OptionPickerBottomSheet,
  Section,
  TextField,
  useToast,
} from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule, usePreference } from '@/frontend/data';

const MODEL_PREFERENCE = {
  transcription: 'feature.voice.transcription_model',
  speech: 'feature.voice.speech_model',
} as const;
/** Prefilled when an account is first chosen; any model the gateway exposes can replace it. */
const DEFAULT_MODEL_IDS = { transcription: 'gpt-4o-mini-transcribe', speech: 'gpt-4o-mini-tts' };

/** An account plus a free-form model ID: audio models are not part of the chat model list. */
export function VoiceModelSetting({ purpose }: { purpose: 'transcription' | 'speech' }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const voice = useBackendModule('voice');
  const [selection, setSelection] = usePreference(MODEL_PREFERENCE[purpose]);
  const [modelId, setModelId] = useState(selection?.modelId ?? '');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const providers = useQuery({
    queryKey: ['voice', 'providers'],
    queryFn: ({ signal }) => voice.listProviders({ signal }),
  });
  const provider = providers.data?.find((item) => item.id === selection?.providerId);

  const save = (providerId: string | undefined, nextModelId: string) => {
    const trimmed = nextModelId.trim();
    void setSelection(providerId && trimmed ? { providerId, modelId: trimmed } : null).catch(() => {
      toast.show({ label: t('settings.voice.saveFailed'), variant: 'danger' });
    });
  };
  const chooseProvider = (providerId: string) => {
    const nextModelId = modelId.trim() || DEFAULT_MODEL_IDS[purpose];
    setModelId(nextModelId);
    save(providerId, nextModelId);
  };

  return (
    <>
      <Section.SelectItem
        description={providers.data?.length === 0 ? t('settings.voice.noProviders') : undefined}
        disabled={!providers.data?.length}
        label={t(`settings.voice.model.${purpose}`)}
        onPress={() => setIsPickerOpen(true)}
        testID={`settings-voice-${purpose}-provider`}
        value={provider?.name ?? t('settings.voice.model.none')}
      />
      {provider ? (
        <Section.Item>
          <TextField>
            <TextField.Label>{t('settings.voice.model.id')}</TextField.Label>
            <Input
              accessibilityLabel={t('settings.voice.model.id')}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={256}
              onChangeText={setModelId}
              onEndEditing={() => save(provider.id, modelId)}
              placeholder={DEFAULT_MODEL_IDS[purpose]}
              returnKeyType="done"
              testID={`settings-voice-${purpose}-model`}
              value={modelId}
            />
          </TextField>
        </Section.Item>
      ) : null}
      <OptionPickerBottomSheet<string>
        onClose={() => setIsPickerOpen(false)}
        onValueChange={chooseProvider}
        open={isPickerOpen}
        options={(providers.data ?? []).map((item) => ({ value: item.id, label: item.name }))}
        selectedValue={selection?.providerId ?? ''}
        size="compact"
        title={t(`settings.voice.model.${purpose}`)}
      />
    </>
  );
}
