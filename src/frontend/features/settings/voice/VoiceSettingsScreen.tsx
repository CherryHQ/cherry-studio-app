import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule, usePreference } from '@/frontend/data';
import { VOICE_ENGINE_PREFERENCE, type VoiceCapability } from '@/shared/contracts/voice';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { DictationLanguageSetting } from './components/DictationLanguageSetting';
import { OfflineModelSetting } from './components/OfflineModelSetting';
import { SpeechVoiceSetting } from './components/SpeechVoiceSetting';
import { VoiceEngineSection } from './components/VoiceEngineSection';

function useEffectiveEngine(capability: VoiceCapability) {
  const voice = useBackendModule('voice');
  const [selected] = usePreference(VOICE_ENGINE_PREFERENCE[capability]);
  return useQuery({
    queryKey: ['voice', 'effective-engine', capability, selected],
    queryFn: ({ signal }) => voice.getEffectiveEngine(capability, { signal }),
    // Keep the current engine's controls until the new choice resolves instead of blanking them.
    placeholderData: keepPreviousData,
  }).data;
}

/** Keep the system voice controls beside their corresponding capability. */
export default function VoiceSettingsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Installed system services and voices can change while the user is in device settings.
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
        {dictationEngine === 'sensevoice' ? <OfflineModelSetting /> : null}
      </VoiceEngineSection>
      <VoiceEngineSection capability="speech" effectiveEngine={speechEngine ?? null}>
        {speechEngine ? <SpeechVoiceSetting engine={speechEngine} key={speechEngine} /> : null}
      </VoiceEngineSection>
    </SettingsScrollPage>
  );
}
