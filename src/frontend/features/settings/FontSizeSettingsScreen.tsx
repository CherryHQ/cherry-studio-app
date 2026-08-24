import { Slider, useAlert } from '@cherrystudio/ui/components';
import { normalizeFontSizeStep } from '@cherrystudio/ui/utils';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { MarkdownText } from '@/frontend/components/markdown';
import { usePreference } from '@/frontend/data/hooks';
import { applyFontSizeStepPreference } from '@/frontend/utils/theme';

import { SettingsScrollPage } from './components/SettingsScrollPage';
import { FONT_SIZE_STEP_LABEL_KEYS } from './utils/fontSizeOptions';

export default function FontSizeSettingsScreen() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const [storedStep, setStoredStep] = usePreference('ui.font_size_step');
  const [draftStep, setDraftStep] = useState(() => normalizeFontSizeStep(storedStep));
  const persistenceVersionRef = useRef(0);

  const handleChange = (value: number) => {
    const nextStep = normalizeFontSizeStep(value);
    const persistenceVersion = ++persistenceVersionRef.current;

    setDraftStep(nextStep);
    applyFontSizeStepPreference(nextStep);

    void setStoredStep(nextStep, { optimistic: true }).catch(() => {
      if (persistenceVersion !== persistenceVersionRef.current) {
        return;
      }

      const restoredStep = normalizeFontSizeStep(storedStep);
      setDraftStep(restoredStep);
      applyFontSizeStepPreference(restoredStep);
      alert.show({ title: t('settings.fontSize.saveFailed') });
    });
  };

  return (
    <SettingsScrollPage
      contentClassName="gap-6"
      headerProps={{ title: t('settings.fontSize.title') }}
    >
      <View className="gap-4 rounded-xl bg-grouped-surface px-4 py-5">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="font-medium text-foreground text-base">
            {t('settings.fontSize.title')}
          </Text>
          <Text className="text-foreground text-sm">{t(FONT_SIZE_STEP_LABEL_KEYS[draftStep])}</Text>
        </View>
        <Slider
          accessibilityLabel={t('settings.fontSize.sliderLabel')}
          max={2}
          maximumValueLabel={t(FONT_SIZE_STEP_LABEL_KEYS[2])}
          min={0}
          minimumValueLabel={t(FONT_SIZE_STEP_LABEL_KEYS[0])}
          onValueChange={handleChange}
          step={1}
          value={draftStep}
        />
      </View>

      <View className="gap-2">
        <Text className="px-1 font-medium text-foreground text-sm">
          {t('settings.fontSize.previewTitle')}
        </Text>
        <View className="rounded-xl bg-grouped-surface px-4 py-5">
          <MarkdownText
            fontSizeStep={draftStep}
            markdown={t('settings.fontSize.previewMarkdown')}
          />
        </View>
      </View>
    </SettingsScrollPage>
  );
}
