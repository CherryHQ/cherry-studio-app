import {
  BottomSheet,
  Button,
  Input,
  OptionPickerBottomSheet,
  Section,
  TextField,
  useToast,
} from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useBackendModule, usePreference } from '@/frontend/data';
import type { SpeechModelOptions, VoiceEngineId } from '@/shared/contracts/voice';

import { speechVoiceOptions } from './speechVoiceOptions';

const VOICE_PREFERENCE = {
  system: 'feature.voice.system_voice',
  ai: 'feature.voice.ai_voice',
} as const;

/** Voices belong to an engine, so the list follows the engine that reads aloud. */
export function SpeechVoiceSetting({ engine }: { engine: VoiceEngineId }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const voice = useBackendModule('voice');
  const [selected, setSelected] = usePreference(VOICE_PREFERENCE[engine]);
  const [model] = usePreference('feature.voice.speech_model');
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [customVoice, setCustomVoice] = useState('');
  const voices = useQuery<SpeechModelOptions>({
    queryKey: ['voice', 'voices', engine, engine === 'ai' ? model : null, i18n.resolvedLanguage],
    enabled: engine === 'system' || model !== null,
    queryFn: async ({ signal }) => {
      if (engine === 'ai' && model) return voice.getSpeechModelOptions(model, { signal });
      return { voices: await voice.listVoices(engine, { signal }), acceptsCustomVoice: false };
    },
  });
  const automaticLabel =
    engine === 'system'
      ? t('settings.voice.defaultVoice')
      : voices.data?.defaultVoice
        ? t('settings.voice.automaticVoice', { voice: voices.data.defaultVoice })
        : undefined;
  const options = [
    ...(automaticLabel ? [{ value: '', label: automaticLabel }] : []),
    ...speechVoiceOptions(voices.data?.voices ?? []),
  ];
  const change = (value: string) => {
    void setSelected(value).catch(() => {
      toast.show({ label: t('settings.voice.saveFailed'), variant: 'danger' });
    });
  };
  const invalid = Boolean(
    selected &&
    voices.data &&
    !voices.data.acceptsCustomVoice &&
    !options.some((option) => option.value === selected),
  );
  const open = () => {
    if (voices.isError) {
      void voices.refetch();
    } else if (voices.data?.acceptsCustomVoice) {
      setCustomVoice(selected);
      setIsPickerOpen(true);
    } else {
      setIsPickerOpen(true);
    }
  };
  return (
    <>
      <Section.SelectItem
        label={t('settings.voice.voice')}
        description={
          voices.isError
            ? t('settings.voice.loadVoicesFailed')
            : invalid
              ? t('voice.error.invalidVoice')
              : voices.data?.acceptsCustomVoice
                ? t('settings.voice.customVoiceDescription')
                : undefined
        }
        disabled={(engine === 'ai' && !model) || voices.isLoading}
        onPress={open}
        testID="settings-voice-speech-voice"
        value={
          options.find((option) => option.value === selected)?.label ??
          (selected || t('settings.voice.model.none'))
        }
      />
      {voices.data?.acceptsCustomVoice ? (
        <BottomSheet
          avoidKeyboard
          footer={
            <Button
              disabled={!customVoice.trim()}
              onPress={() => {
                change(customVoice.trim());
                setIsPickerOpen(false);
              }}
            >
              {t('common.save')}
            </Button>
          }
          onClose={() => setIsPickerOpen(false)}
          open={isPickerOpen}
          size="medium"
          title={t('settings.voice.voice')}
        >
          <View className="px-4">
            <TextField>
              <TextField.Label>{t('settings.voice.voice')}</TextField.Label>
              <Input
                accessibilityLabel={t('settings.voice.voice')}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                maxLength={256}
                onChangeText={setCustomVoice}
                value={customVoice}
              />
              <TextField.Description>
                {t('settings.voice.customVoiceDescription')}
              </TextField.Description>
            </TextField>
          </View>
        </BottomSheet>
      ) : (
        <OptionPickerBottomSheet<string>
          onClose={() => setIsPickerOpen(false)}
          onValueChange={change}
          open={isPickerOpen}
          options={options}
          selectedValue={selected}
          size="medium"
          title={t('settings.voice.voice')}
        />
      )}
    </>
  );
}
