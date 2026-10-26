import { Section } from '@cherrystudio/ui/components';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule, usePreference } from '@/frontend/data';
import { VOICE_ENGINE_PREFERENCE, type VoiceCapability } from '@/shared/contracts/voice';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { DictationLanguageSetting } from './components/DictationLanguageSetting';
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

/** Keep each engine's controls together; transcription also serves audio attachments. */
export default function VoiceSettingsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Account and model settings live on other routes. Re-read their current voice capabilities
  // when returning here, including changes that do not alter the saved model reference.
  useFocusEffect(
    useCallback(() => {
      void queryClient.invalidateQueries({ queryKey: ['voice'] });
    }, [queryClient]),
  );
  const dictationEngine = useEffectiveEngine('dictation');
  const speechEngine = useEffectiveEngine('speech');
  return (
    <SettingsScrollPage contentClassName="gap-6" headerProps={{ title: t('settings.voice.title') }}>
      <VoiceEngineSection capability="dictation" effectiveEngine={dictationEngine ?? null}>
        {dictationEngine === 'system' ? <DictationLanguageSetting /> : null}
      </VoiceEngineSection>
      <VoiceEngineSection capability="speech" effectiveEngine={speechEngine ?? null}>
        {speechEngine === 'ai' ? <VoiceModelSetting purpose="speech" /> : null}
        {speechEngine ? <SpeechVoiceSetting engine={speechEngine} key={speechEngine} /> : null}
      </VoiceEngineSection>
      <Section
        footer={t('settings.voice.model.footer')}
        title={t('settings.voice.model.transcription')}
      >
        <VoiceModelSetting purpose="transcription" />
      </Section>
    </SettingsScrollPage>
  );
}
