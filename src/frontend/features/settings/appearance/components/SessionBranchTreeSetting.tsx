import { Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePreference } from '@/frontend/data/hooks';

export function SessionBranchTreeSetting() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isEnabled, setIsEnabled] = usePreference('ui.sidebar.session_tree_enabled');
  const [isSaving, setIsSaving] = useState(false);

  const changeEnabled = async (value: boolean) => {
    setIsSaving(true);
    try {
      await setIsEnabled(value, { optimistic: false });
    } catch {
      toast.show({ label: t('settings.sessionBranchTree.saveFailed'), variant: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Section.SwitchItem
      disabled={isSaving}
      label={t('settings.sessionBranchTree.title')}
      onValueChange={(value) => {
        void changeEnabled(value);
      }}
      testID="settings-session-branch-tree"
      value={isEnabled}
    />
  );
}
