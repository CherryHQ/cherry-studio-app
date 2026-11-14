import { BottomSheet, Section, useToast } from '@cherrystudio/ui/components';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { useBackendModule, usePreference } from '@/frontend/data';
import { useDictationSetup } from '@/frontend/hooks/useDictationSetup';
import {
  VOICE_ENGINE_PREFERENCE,
  VOICE_ENGINES,
  type VoiceEngineId,
  type VoiceEngineStatus,
} from '@/shared/contracts/voice';

/** Unsupported engines stay visible but cannot be chosen, so the device limit is explained. */
export function VoiceEngineSection({
  capability,
  effectiveEngine,
  children,
}: {
  capability: 'dictation' | 'transcription' | 'speech';
  effectiveEngine: VoiceEngineId | null;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { toast } = useToast();
  const voice = useBackendModule('voice');
  const queryClient = useQueryClient();
  const [appLanguage] = usePreference('app.language');
  const [language] = usePreference(
    capability === 'dictation'
      ? 'feature.voice.dictation_language'
      : capability === 'transcription'
        ? 'feature.voice.transcription_language'
        : 'app.language',
  );
  const showDictationSetup = useDictationSetup();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const engines = VOICE_ENGINES.filter(
    (engine) => capability !== 'speech' || engine !== 'sensevoice',
  );
  const engineLabel = t(
    capability === 'speech' ? 'settings.voice.speech.engine' : 'settings.voice.engine.title',
  );
  const [, setSelected] = usePreference(VOICE_ENGINE_PREFERENCE[capability]);
  const statuses = useQuery({
    queryKey: ['voice', 'engine-status', capability, language, appLanguage],
    queryFn: async ({ signal }) =>
      Object.fromEntries(
        await Promise.all(
          VOICE_ENGINES.map(
            async (engine) =>
              [engine, await voice.getEngineStatus(capability, engine, { signal })] as const,
          ),
        ),
      ) as Record<VoiceEngineId, VoiceEngineStatus>,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  const describe = (engine: VoiceEngineId) => {
    const status = statuses.data?.[engine];
    if (status === 'needs-service') return t('deepseek.setupRequired');
    if (status === 'needs-setup')
      return t(
        capability === 'transcription'
          ? 'voice.error.offlineRecognitionUnavailable'
          : 'settings.voice.dictation.setupRequired',
      );
    if (status === 'unsupported' && capability === 'transcription' && engine === 'system')
      return t('voice.error.unsupported');
    if (status === 'unsupported')
      return t(
        engine === 'system' && capability === 'dictation'
          ? 'settings.voice.dictation.systemUnavailable'
          : 'settings.voice.engine.unavailable',
      );
    return undefined;
  };
  const select = (engine: VoiceEngineId | null) => {
    if (capability === 'transcription' && engine === null) return;
    void setSelected(engine)
      .then(() => queryClient.invalidateQueries({ queryKey: ['voice'] }))
      .catch(() => {
        toast.show({ label: t('settings.voice.saveFailed'), variant: 'danger' });
      });
  };
  return (
    <>
      <Section
        title={t(
          capability === 'dictation'
            ? 'settings.voice.dictation.title'
            : capability === 'transcription'
              ? 'settings.voice.transcription.title'
              : 'settings.voice.speech.title',
        )}
      >
        <Section.SelectItem
          description={effectiveEngine ? describe(effectiveEngine) : undefined}
          label={engineLabel}
          onPress={() => setIsPickerOpen(true)}
          testID={`settings-voice-${capability}-engine`}
          value={
            effectiveEngine
              ? t(`settings.voice.engine.${effectiveEngine}`)
              : t('settings.voice.engine.off')
          }
        />
        {children}
        {effectiveEngine === 'deepseek' ? (
          <Section.Item
            label={t('deepseek.title')}
            description={t('deepseek.voiceDescription')}
            onPress={() => router.push('/settings/deepseek')}
          />
        ) : null}
        {capability === 'transcription' && effectiveEngine !== 'deepseek' ? (
          <Section.Item
            description={t('settings.voice.transcription.description')}
            label={t('settings.voice.transcription.offline')}
          />
        ) : null}
        {capability === 'dictation' && effectiveEngine === 'system' && Platform.OS === 'android' ? (
          <Section.Item
            label={t('settings.voice.dictation.systemSettings')}
            onPress={() => showDictationSetup(statuses.data?.system)}
            testID="settings-voice-dictation-system-settings"
          />
        ) : null}
      </Section>
      <BottomSheet
        onClose={() => setIsPickerOpen(false)}
        open={isPickerOpen}
        size="compact"
        title={engineLabel}
      >
        <Section variant="plain">
          {capability === 'dictation' ? (
            <Section.RadioItem
              label={t('settings.voice.engine.off')}
              onPress={() => {
                select(null);
                setIsPickerOpen(false);
              }}
              selected={effectiveEngine === null}
              testID="settings-voice-dictation-off"
            />
          ) : null}
          {engines.map((engine) => (
            <Section.RadioItem
              description={describe(engine)}
              disabled={!statuses.data || statuses.data[engine] === 'unsupported'}
              key={engine}
              label={t(`settings.voice.engine.${engine}`)}
              onPress={() => {
                select(engine);
                setIsPickerOpen(false);
              }}
              selected={effectiveEngine === engine}
              testID={`settings-voice-${capability}-${engine}`}
            />
          ))}
        </Section>
      </BottomSheet>
    </>
  );
}
