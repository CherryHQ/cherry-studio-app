import { Section } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { useBackendModule, usePreference } from '@/frontend/data';
import { VOICE_ENGINE_PREFERENCE, type VoiceCapability } from '@/shared/contracts/voice';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { SpeechVoiceSetting } from './components/SpeechVoiceSetting';
import { VoiceEngineSection } from './components/VoiceEngineSection';
import { VoiceModelSetting } from './components/VoiceModelSetting';

function useEffectiveEngine(capability: VoiceCapability) {
  const voice = useBackendModule('voice');
  const [selected] = usePreference(VOICE_ENGINE_PREFERENCE[capability]);
  return useQuery({
    queryKey: ['voice', 'effective-engine', capability, selected],
    queryFn: ({ signal }) => voice.getEffectiveEngine(capability, { signal }),
  }).data;
}

/** Interim layout: engines per capability, then the AI models they and audio attachments use. */
export default function VoiceSettingsScreen() {
  const { t } = useTranslation();
  const dictationEngine = useEffectiveEngine('dictation');
  const speechEngine = useEffectiveEngine('speech');
  return (
    <SettingsScrollPage contentClassName="gap-6" headerProps={{ title: t('settings.voice.title') }}>
      <VoiceEngineSection capability="dictation" effectiveEngine={dictationEngine ?? null} />
      <VoiceEngineSection capability="speech" effectiveEngine={speechEngine ?? null} />
      {speechEngine ? (
        <Section>
          <SpeechVoiceSetting engine={speechEngine} />
        </Section>
      ) : null}
      <Section footer={t('settings.voice.model.footer')} title={t('settings.voice.model.title')}>
        <VoiceModelSetting purpose="transcription" />
        <VoiceModelSetting purpose="speech" />
      </Section>
    </SettingsScrollPage>
  );
}
