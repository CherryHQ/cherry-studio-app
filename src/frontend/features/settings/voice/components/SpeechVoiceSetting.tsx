import { OptionPickerBottomSheet, Section, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule, usePreference } from '@/frontend/data';
import type { VoiceEngineId } from '@/shared/contracts/voice';

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
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const voices = useQuery({
    queryKey: ['voice', 'voices', engine, i18n.resolvedLanguage],
    queryFn: ({ signal }) => voice.listVoices(engine, { signal }),
  });
  const options = [
    ...(engine === 'system' ? [{ value: '', label: t('settings.voice.defaultVoice') }] : []),
    ...speechVoiceOptions(voices.data ?? []),
  ];
  const change = (value: string) => {
    void setSelected(value).catch(() => {
      toast.show({ label: t('settings.voice.saveFailed'), variant: 'danger' });
    });
  };
  return (
    <>
      <Section.SelectItem
        label={t('settings.voice.voice')}
        onPress={() => setIsPickerOpen(true)}
        testID="settings-voice-speech-voice"
        value={options.find((option) => option.value === selected)?.label ?? selected}
      />
      <OptionPickerBottomSheet<string>
        onClose={() => setIsPickerOpen(false)}
        onValueChange={change}
        open={isPickerOpen}
        options={options}
        selectedValue={selected}
        size="medium"
        title={t('settings.voice.voice')}
      />
    </>
  );
}
