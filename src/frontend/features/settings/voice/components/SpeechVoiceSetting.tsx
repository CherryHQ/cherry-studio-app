import { OptionPickerBottomSheet, Section, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule, usePreference } from '@/frontend/data';
import type { VoiceEngineId } from '@/shared/contracts/voice';

import { speechVoiceOptions } from './speechVoiceOptions';

/** Lists installed system voices for the app language. */
export function SpeechVoiceSetting({ engine }: { engine: VoiceEngineId }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const voice = useBackendModule('voice');
  const [systemVoice, setSystemVoice] = usePreference('feature.voice.system_voice');
  const [deepseek, setDeepseek] = usePreference('feature.deepseek.services');
  const selected = engine === 'deepseek' ? deepseek.voice : systemVoice;
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const status = useQuery({
    queryKey: ['voice', 'engine-status', 'speech', engine],
    queryFn: ({ signal }) => voice.getEngineStatus('speech', engine, { signal }),
  });
  const unavailable = status.data === 'unsupported' || status.data === 'needs-service';
  const voices = useQuery({
    queryKey: ['voice', 'voices', engine, i18n.resolvedLanguage],
    queryFn: ({ signal }) => voice.listVoices(engine, { signal }),
    enabled: status.data === 'ready',
  });
  const options = [
    ...(engine === 'deepseek' ? [] : [{ value: '', label: t('settings.voice.defaultVoice') }]),
    ...speechVoiceOptions(voices.data ?? []),
  ];
  const change = (value: string) => {
    const save =
      engine === 'deepseek' && (value === 'stella' || value === 'tide')
        ? setDeepseek({ ...deepseek, voice: value })
        : setSystemVoice(value);
    void save.catch(() => {
      toast.show({ label: t('settings.voice.saveFailed'), variant: 'danger' });
    });
  };
  const invalid = Boolean(
    selected && voices.data && !options.some((option) => option.value === selected),
  );
  return (
    <>
      <Section.SelectItem
        label={t('settings.voice.voice')}
        description={
          status.data === 'needs-service'
            ? t('deepseek.setupRequired')
            : unavailable
              ? t('settings.voice.speech.systemUnavailable')
              : status.isError || voices.isError
                ? t('settings.voice.loadVoicesFailed')
                : invalid
                  ? t('voice.error.invalidVoice')
                  : undefined
        }
        disabled={status.isPending || voices.isLoading || unavailable}
        onPress={() => {
          if (status.isError) void status.refetch();
          else if (voices.isError) void voices.refetch();
          else setIsPickerOpen(true);
        }}
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
