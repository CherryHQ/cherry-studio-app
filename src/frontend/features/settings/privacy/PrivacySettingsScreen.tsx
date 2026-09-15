import { Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { setSentryConsent, useSentryConsent } from '@/frontend/appShell/observability';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

export default function PrivacySettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { enabled, available } = useSentryConsent();
  const [isSaving, setIsSaving] = useState(false);

  const changeConsent = async (value: boolean) => {
    setIsSaving(true);
    try {
      await setSentryConsent(value);
    } catch {
      toast.show({ label: t('settings.privacy.saveFailed'), variant: 'danger' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsScrollPage headerProps={{ title: t('settings.privacy.title') }}>
      <Section>
        <Section.SwitchItem
          disabled={!available || isSaving}
          label={t('settings.privacy.sendReports')}
          onValueChange={(value) => {
            void changeConsent(value);
          }}
          value={enabled}
        />
      </Section>
    </SettingsScrollPage>
  );
}
