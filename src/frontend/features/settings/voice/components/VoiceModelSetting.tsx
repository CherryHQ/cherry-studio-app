import { Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelAvatar } from '@/frontend/components/Avatar';
import {
  ModelPickerDrawer,
  type ModelPickerModelItem,
  useModelPickerData,
} from '@/frontend/components/ModelPicker';
import { usePreference } from '@/frontend/data';

const MODEL_PREFERENCE = {
  transcription: 'feature.voice.transcription_model',
  speech: 'feature.voice.speech_model',
} as const;
const EMPTY_MODEL_KEYS = {
  transcription: 'settings.voice.model.emptyTranscription',
  speech: 'settings.voice.model.emptySpeech',
} as const;

/** Voice models use the same catalog and account configuration as other model settings. */
export function VoiceModelSetting({ purpose }: { purpose: 'transcription' | 'speech' }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selection, setSelection] = usePreference(MODEL_PREFERENCE[purpose]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { getModelItem, isLoading, modelItems } = useModelPickerData({ modelType: purpose });
  const selectedModelId = selection ? `${selection.providerId}::${selection.modelId}` : null;
  const selected = getModelItem(selectedModelId);
  const select = (item: ModelPickerModelItem) => {
    if (isSaving) return;
    setIsSaving(true);
    setIsPickerOpen(false);
    void setSelection(
      item.modelId === selectedModelId
        ? null
        : { providerId: item.provider.id, modelId: item.model.modelId },
    )
      .catch(() => {
        toast.show({ label: t('settings.voice.saveFailed'), variant: 'danger' });
      })
      .finally(() => setIsSaving(false));
  };

  return (
    <>
      <Section.SelectItem
        description={
          !isLoading && modelItems.length === 0 ? t(EMPTY_MODEL_KEYS[purpose]) : undefined
        }
        disabled={isSaving}
        label={t(`settings.voice.model.${purpose}`)}
        onPress={() => setIsPickerOpen(true)}
        testID={`settings-voice-${purpose}-model`}
        value={selected?.model.name ?? selection?.modelId ?? t('settings.voice.model.none')}
        valueLeading={
          selected ? <ModelAvatar model={selected.model} provider={selected.provider} /> : undefined
        }
      />
      {isPickerOpen ? (
        <ModelPickerDrawer
          emptyText={t(EMPTY_MODEL_KEYS[purpose])}
          modelType={purpose}
          onClose={() => setIsPickerOpen(false)}
          onSelect={select}
          open
          selectedModelId={selectedModelId}
          title={t(`settings.voice.model.${purpose}`)}
        />
      ) : null}
    </>
  );
}
