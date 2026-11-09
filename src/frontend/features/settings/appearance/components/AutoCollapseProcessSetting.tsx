import { Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data/hooks';

export function AutoCollapseProcessSetting() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoCollapseEnabled, setIsAutoCollapseEnabled] = usePreference(
    'chat.process.auto_collapse',
  );

  const changeAutoCollapse = async (value: boolean) => {
    setIsSaving(true);
    try {
      await setIsAutoCollapseEnabled(value);
    } catch {
      toast.show({ label: t('settings.autoCollapseProcess.saveFailed'), variant: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Section.SwitchItem
      disabled={isSaving}
      label={t('settings.autoCollapseProcess.title')}
      onValueChange={(value) => {
        void changeAutoCollapse(value);
      }}
      testID="settings-auto-collapse-process"
      value={isAutoCollapseEnabled}
    />
  );
}
