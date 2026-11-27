import { Section, useToast, type SectionItemPressProps } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data';

export function BackgroundReadingSetting({ ...pressProps }: SectionItemPressProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [enabled, setBackgroundReading] = usePreference('feature.voice.background_reading');
  const [isSaving, setIsSaving] = useState(false);

  const handleValueChange = async (value: boolean) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await setBackgroundReading(value, { optimistic: false });
    } catch {
      toast.show({ label: t('settings.voice.saveFailed'), variant: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Section.SwitchItem
      {...pressProps}
      description={t('settings.voice.speech.backgroundDescription')}
      disabled={isSaving}
      label={t('settings.voice.speech.background')}
      onValueChange={(value) => void handleValueChange(value)}
      testID="settings-voice-speech-background"
      value={enabled}
    />
  );
}
BackgroundReadingSetting.sectionItem = true as const;
