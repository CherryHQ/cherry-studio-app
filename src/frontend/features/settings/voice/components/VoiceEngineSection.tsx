import { BottomSheet, Section, useToast } from '@cherrystudio/ui/components';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { useBackendModule, usePreference } from '@/frontend/data';
import { useDictationSetup } from '@/frontend/hooks/useDictationSetup';
import {
  VOICE_ENGINE_PREFERENCE,
  VOICE_ENGINES,
  type VoiceCapability,
  type VoiceEngineId,
  type VoiceEngineStatus,
} from '@/shared/contracts/voice';

/** Unsupported engines stay visible but cannot be chosen, so the device limit is explained. */
export function VoiceEngineSection({
  capability,
  effectiveEngine,
  children,
}: {
  capability: VoiceCapability;
  effectiveEngine: VoiceEngineId | null;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const voice = useBackendModule('voice');
  const showDictationSetup = useDictationSetup();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [, setSelected] = usePreference(VOICE_ENGINE_PREFERENCE[capability]);
  const engines = capability === 'speech' ? (['system'] as const) : VOICE_ENGINES;
  const statuses = useQuery({
    queryKey: ['voice', 'engine-status', capability],
    queryFn: async ({ signal }) =>
      Object.fromEntries(
        await Promise.all(
          engines.map(
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
    if (status === 'needs-setup') return t('settings.voice.dictation.setupRequired');
    if (status === 'needs-model') return t('voice.error.modelNotDownloaded');
    if (status === 'unsupported')
      return t(
        engine === 'system'
          ? `settings.voice.${capability}.systemUnavailable`
          : 'settings.voice.engine.unavailable',
      );
    return t(`settings.voice.engine.${engine}Description`);
  };
  const select = (engine: VoiceEngineId | null) => {
    void setSelected(engine).catch(() => {
      toast.show({ label: t('settings.voice.saveFailed'), variant: 'danger' });
    });
  };
  return (
    <>
      <Section title={t(`settings.voice.${capability}.title`)}>
        <Section.SelectItem
          description={effectiveEngine ? describe(effectiveEngine) : undefined}
          label={t('settings.voice.engine.title')}
          onPress={() => setIsPickerOpen(true)}
          testID={`settings-voice-${capability}-engine`}
          value={
            effectiveEngine
              ? t(`settings.voice.engine.${effectiveEngine}`)
              : capability === 'dictation'
                ? t('settings.voice.engine.off')
                : '—'
          }
        />
        {capability === 'dictation' && Platform.OS === 'android' ? (
          <Section.Item
            description={
              statuses.data?.system === 'needs-setup'
                ? t('settings.voice.dictation.setupRequired')
                : statuses.data?.system === 'unsupported'
                  ? t('settings.voice.dictation.systemUnavailable')
                  : t('settings.voice.dictation.systemSettingsDescription')
            }
            label={t('settings.voice.dictation.systemSettings')}
            onPress={() => showDictationSetup(statuses.data?.system)}
            testID="settings-voice-dictation-system-settings"
          />
        ) : null}
        {children}
      </Section>
      <BottomSheet
        onClose={() => setIsPickerOpen(false)}
        open={isPickerOpen}
        size="compact"
        title={t(`settings.voice.${capability}.title`)}
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
