import {
  Button,
  Input,
  OptionPickerBottomSheet,
  Section,
  Slider,
  TextField,
  useToast,
} from '@cherrystudio/ui/components';
import { deriveThinkingOptions, nearestThinkingOption } from '@cherrystudio/universal/ai/reasoning';
import type { ReasoningEffortOption } from '@cherrystudio/universal/types/aiSdk';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { TranslationLanguagePicker } from '@/frontend/components/Translation';
import { useMultiplePreferences, usePreference } from '@/frontend/data';
import { useModelById } from '@/frontend/hooks/chat';
import { PreferenceDefaults } from '@/shared/data/preference';
import { isUniqueModelId } from '@/shared/data/types/model';

import { SettingsScrollPage } from '../../components/SettingsScrollPage';

const PREFERENCES = {
  prompt: 'feature.translate.model_prompt',
  reasoningEffort: 'feature.translate.reasoning_effort',
  enableTemperature: 'feature.translate.enable_temperature',
  temperature: 'feature.translate.temperature',
  enableTopP: 'feature.translate.enable_top_p',
  topP: 'feature.translate.top_p',
  targetLanguage: 'feature.translate.target_language',
} as const;

const REASONING_LABELS = {
  default: 'chat.reasoning.default',
  none: 'chat.reasoning.off',
  auto: 'chat.reasoning.auto',
  minimal: 'chat.reasoning.minimal',
  low: 'chat.reasoning.low',
  medium: 'chat.reasoning.medium',
  high: 'chat.reasoning.high',
  xhigh: 'chat.reasoning.xhigh',
  max: 'chat.reasoning.max',
} as const satisfies Record<ReasoningEffortOption, string>;

export function TranslationSettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [preferences, savePreferences] = useMultiplePreferences(PREFERENCES);
  const [draft, setDraft] = useState(preferences);
  const [isSaving, setIsSaving] = useState(false);
  const [isReasoningPickerOpen, setIsReasoningPickerOpen] = useState(false);
  const [modelId] = usePreference('feature.translate.model_id');
  const { model } = useModelById(modelId && isUniqueModelId(modelId) ? modelId : null);
  const efforts = model ? (deriveThinkingOptions(model) ?? []) : [];
  const displayedEffort = efforts.includes(draft.reasoningEffort)
    ? draft.reasoningEffort
    : draft.reasoningEffort === 'none' || draft.reasoningEffort === 'auto'
      ? 'default'
      : (nearestThinkingOption(
          draft.reasoningEffort,
          efforts.filter((effort) => effort !== 'none' && effort !== 'auto'),
        ) ?? 'default');

  const save = async () => {
    if (isSaving || !draft.prompt.trim()) return;
    setIsSaving(true);
    try {
      await savePreferences(draft);
      toast.show({ label: t('translation.settings.saved'), variant: 'success' });
      router.back();
    } catch {
      toast.show({ label: t('translation.settings.saveFailed'), variant: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <SettingsScrollPage
        contentClassName="gap-6"
        headerProps={{ title: t('translation.settings.title') }}
        keyboardShouldPersistTaps="handled"
      >
        <Section>
          <TranslationLanguagePicker
            allowDefault
            disabled={isSaving}
            value={draft.targetLanguage}
            onChange={(targetLanguage) => setDraft((value) => ({ ...value, targetLanguage }))}
          />
          {efforts.length > 1 ? (
            <Section.SelectItem
              label={t('chat.reasoning.title')}
              value={t(REASONING_LABELS[displayedEffort])}
              disabled={isSaving}
              onPress={() => setIsReasoningPickerOpen(true)}
            />
          ) : null}
          <Section.SwitchItem
            label={t('translation.settings.temperature')}
            description={draft.enableTemperature ? draft.temperature.toFixed(1) : undefined}
            value={draft.enableTemperature}
            disabled={isSaving}
            onValueChange={(enableTemperature) =>
              setDraft((value) => ({ ...value, enableTemperature }))
            }
          />
          {draft.enableTemperature ? (
            <Section.Item>
              <Slider
                accessibilityLabel={t('translation.settings.temperature')}
                disabled={isSaving}
                min={0}
                max={2}
                step={0.1}
                value={draft.temperature}
                onValueChange={(temperature) => setDraft((value) => ({ ...value, temperature }))}
              />
            </Section.Item>
          ) : null}
          <Section.SwitchItem
            label={t('translation.settings.topP')}
            description={draft.enableTopP ? draft.topP.toFixed(2) : undefined}
            value={draft.enableTopP}
            disabled={isSaving}
            onValueChange={(enableTopP) => setDraft((value) => ({ ...value, enableTopP }))}
          />
          {draft.enableTopP ? (
            <Section.Item>
              <Slider
                accessibilityLabel={t('translation.settings.topP')}
                disabled={isSaving}
                min={0}
                max={1}
                step={0.05}
                value={draft.topP}
                onValueChange={(topP) => setDraft((value) => ({ ...value, topP }))}
              />
            </Section.Item>
          ) : null}
        </Section>
        <TextField disabled={isSaving}>
          <TextField.Label>{t('translation.settings.prompt')}</TextField.Label>
          <Input
            accessibilityLabel={t('translation.settings.prompt')}
            autoCorrect={false}
            multiline
            maxLength={8000}
            value={draft.prompt}
            onChangeText={(prompt) => setDraft((value) => ({ ...value, prompt }))}
          />
          <TextField.Description>
            {t('translation.settings.promptHint', {
              languagePlaceholder: '{{target_language}}',
              textPlaceholder: '{{text}}',
            })}
          </TextField.Description>
        </TextField>
        <Button
          variant="secondary"
          disabled={isSaving}
          onPress={() =>
            setDraft((value) => ({
              ...value,
              prompt: PreferenceDefaults['feature.translate.model_prompt'],
            }))
          }
        >
          {t('translation.settings.resetPrompt')}
        </Button>
        <Button
          disabled={isSaving || !draft.prompt.trim()}
          loading={isSaving}
          onPress={() => void save()}
        >
          {t('common.save')}
        </Button>
      </SettingsScrollPage>
      <OptionPickerBottomSheet<ReasoningEffortOption>
        open={isReasoningPickerOpen}
        onClose={() => setIsReasoningPickerOpen(false)}
        title={t('chat.reasoning.title')}
        selectedValue={displayedEffort}
        options={efforts.map((value) => ({ value, label: t(REASONING_LABELS[value]) }))}
        onValueChange={(reasoningEffort) => setDraft((value) => ({ ...value, reasoningEffort }))}
        size="compact"
      />
    </>
  );
}
