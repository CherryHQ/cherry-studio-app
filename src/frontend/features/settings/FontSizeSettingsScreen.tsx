import { Slider } from 'heroui-native/slider';
import { useToast } from 'heroui-native/toast';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';
import { MarkdownText } from '@/frontend/components/markdown';
import { usePreference } from '@/frontend/data/hooks';
import { applyFontSizeStepPreference } from '@/frontend/utils/theme';
import { normalizeFontSizeStep } from '@/frontend/utils/typographyScale';
import { FONT_SIZE_STEPS, type FontSizeStep } from '@/shared/data/preference';

import { FONT_SIZE_STEP_LABEL_KEYS } from './utils/fontSizeOptions';

export default function FontSizeSettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [storedStep, setStoredStep] = usePreference('ui.font_size_step');
  const [draftStep, setDraftStep] = useState(() => normalizeFontSizeStep(storedStep));

  const handleChange = (value: number | number[]) => {
    const nextStep = readSliderStep(value);
    setDraftStep(nextStep);
    applyFontSizeStepPreference(nextStep);
  };

  const handleChangeEnd = (value: number | number[]) => {
    const nextStep = readSliderStep(value);

    void setStoredStep(nextStep, { optimistic: true }).catch(() => {
      const restoredStep = normalizeFontSizeStep(storedStep);
      setDraftStep(restoredStep);
      applyFontSizeStepPreference(restoredStep);
      toast.show({ label: t('settings.fontSize.saveFailed'), variant: 'danger' });
    });
  };

  return (
    <>
      <BackHeader title={t('settings.fontSize.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-4 py-5"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-4 rounded-xl bg-settings-grouped-surface px-4 py-5">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="font-medium text-foreground text-base">
              {t('settings.fontSize.title')}
            </Text>
            <Text className="text-default-foreground text-sm">
              {t(FONT_SIZE_STEP_LABEL_KEYS[draftStep])}
            </Text>
          </View>
          <Slider
            accessibilityLabel={t('settings.fontSize.sliderLabel')}
            maxValue={2}
            minValue={0}
            onChange={handleChange}
            onChangeEnd={handleChangeEnd}
            step={1}
            value={draftStep}
          >
            <Slider.Track>
              <Slider.Fill />
              <View
                className="absolute inset-y-0 left-[14px] right-[14px] flex-row items-center justify-between"
                pointerEvents="none"
              >
                {FONT_SIZE_STEPS.map((step) => (
                  <View className="h-2 w-1 rounded-full bg-default-foreground/25" key={step} />
                ))}
              </View>
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
          <View className="h-6 flex-row items-start justify-between">
            {FONT_SIZE_STEPS.map((step) => (
              <Text
                className={
                  step === draftStep
                    ? 'font-medium text-foreground text-xs'
                    : 'text-default-foreground text-xs'
                }
                key={step}
              >
                {t(FONT_SIZE_STEP_LABEL_KEYS[step])}
              </Text>
            ))}
          </View>
        </View>

        <View className="gap-2">
          <Text className="px-1 font-medium text-default-foreground text-sm">
            {t('settings.fontSize.previewTitle')}
          </Text>
          <View className="rounded-xl bg-settings-grouped-surface px-4 py-5">
            <MarkdownText
              fontSizeStep={draftStep}
              markdown={t('settings.fontSize.previewMarkdown')}
            />
          </View>
        </View>
      </ScrollView>
    </>
  );
}

function readSliderStep(value: number | number[]): FontSizeStep {
  return normalizeFontSizeStep(Array.isArray(value) ? value[0] : value);
}
