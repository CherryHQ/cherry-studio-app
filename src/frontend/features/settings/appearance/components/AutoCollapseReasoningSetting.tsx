import { Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data/hooks';

export function AutoCollapseReasoningSetting() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoCollapseEnabled, setIsAutoCollapseEnabled] = usePreference(
    'chat.reasoning.auto_collapse',
  );

  const changeAutoCollapse = async (value: boolean) => {
    setIsSaving(true);
    try {
      await setIsAutoCollapseEnabled(value);
    } catch {
      toast.show({ label: t('settings.autoCollapseReasoning.saveFailed'), variant: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Section.SwitchItem
      description={t('settings.autoCollapseReasoning.description')}
      disabled={isSaving}
      label={t('settings.autoCollapseReasoning.title')}
      onValueChange={(value) => {
        void changeAutoCollapse(value);
      }}
      testID="settings-auto-collapse-reasoning"
      value={isAutoCollapseEnabled}
    />
  );
}
