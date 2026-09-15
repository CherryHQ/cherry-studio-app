import LockIcon from '@cherrystudio/app-icons/icons/lock';
import { Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { setSentryConsent, useSentryConsent } from '@/frontend/appShell/observability';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

export default function PrivacySettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { enabled, active, available } = useSentryConsent();
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
    <SettingsScrollPage
      contentClassName="gap-6"
      headerProps={{ title: t('settings.privacy.title') }}
    >
      <Section footer={t('settings.privacy.description')}>
        <Section.SwitchItem
          disabled={!available || isSaving}
          label={t('settings.privacy.sendReports')}
          leading={<LockIcon className="size-5 text-foreground" />}
          onValueChange={(value) => {
            void changeConsent(value);
          }}
          value={enabled}
        />
      </Section>
      <Section footer={t('settings.privacy.nativeDisclosure')}>
        <Section.Item
          label={t('settings.privacy.status')}
          description={t(
            !available
              ? 'settings.privacy.unavailable'
              : active
                ? 'settings.privacy.active'
                : enabled
                  ? 'settings.privacy.productionOnly'
                  : 'settings.privacy.disabled',
          )}
        />
      </Section>
    </SettingsScrollPage>
  );
}
