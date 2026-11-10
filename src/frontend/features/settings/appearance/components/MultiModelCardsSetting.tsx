import { Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data/hooks';

export function MultiModelCardsSetting() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isEnabled, setIsEnabled] = usePreference('chat.multi_model.cards_enabled');
  const [isSaving, setIsSaving] = useState(false);

  const changeEnabled = async (value: boolean) => {
    setIsSaving(true);
    try {
      await setIsEnabled(value);
    } catch {
      toast.show({ label: t('settings.multiModelCards.saveFailed'), variant: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Section.SwitchItem
      disabled={isSaving}
      label={t('settings.multiModelCards.title')}
      onValueChange={(value) => {
        void changeEnabled(value);
      }}
      testID="settings-multi-model-cards"
      value={isEnabled}
    />
  );
}
