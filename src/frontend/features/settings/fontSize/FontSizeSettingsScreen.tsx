import { Section, Slider, useToast } from '@cherrystudio/ui/components';
import { normalizeFontSizeStep } from '@cherrystudio/ui/utils';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { MarkdownText } from '@/frontend/components/MarkdownText';
import { usePreference } from '@/frontend/data/hooks';
import { applyFontSizeStepPreference } from '@/frontend/utils/theme';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { FONT_SIZE_STEP_LABEL_KEYS } from '../utils/fontSizeOptions';

export default function FontSizeSettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
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
      toast.show({ label: t('settings.fontSize.saveFailed'), variant: 'danger' });
    });
  };

  return (
    <SettingsScrollPage
      contentClassName="gap-6"
      headerProps={{ title: t('settings.fontSize.title') }}
    >
      <Section>
        <Section.Item density="comfortable">
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
        </Section.Item>
      </Section>

      <Section title={t('settings.fontSize.previewTitle')}>
        <Section.Item density="comfortable">
          <MarkdownText
            fontSizeStep={draftStep}
            markdown={t('settings.fontSize.previewMarkdown')}
          />
        </Section.Item>
      </Section>
    </SettingsScrollPage>
  );
}
