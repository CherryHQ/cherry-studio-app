import { Section, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useShakeFeedbackPreference } from '@/frontend/appShell/feedback';
import { setSentryConsent, useSentryConsent } from '@/frontend/appShell/observability';
import { usePreference } from '@/frontend/data/hooks';

import { SettingsScrollPage } from '../components/SettingsScrollPage';

export default function PrivacySettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { enabled, available } = useSentryConsent();
  const [isSaving, setIsSaving] = useState(false);
  const [isShakeSaving, setIsShakeSaving] = useState(false);
  const { enabled: isShakeEnabled, setEnabled: setIsShakeEnabled } = useShakeFeedbackPreference();
  const [dataCollectionEnabled, setDataCollectionEnabled] = usePreference(
    'app.privacy.data_collection.enabled',
  );

  const changeDataCollection = async (value: boolean) => {
    try {
      await setDataCollectionEnabled(value);
    } catch {
      toast.show({ label: t('settings.privacy.saveFailed'), variant: 'danger' });
    }
  };

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

  const changeShakeFeedback = async (value: boolean) => {
    setIsShakeSaving(true);
    try {
      // Starting sensor observation waits for a durable opt-in, not an optimistic value.
      await setIsShakeEnabled(value);
    } catch {
      toast.show({ label: t('settings.privacy.saveFailed'), variant: 'danger' });
    } finally {
      setIsShakeSaving(false);
    }
  };

  return (
    <SettingsScrollPage headerProps={{ title: t('settings.privacy.title') }}>
      <Section>
        <Section.SwitchItem
          disabled={isShakeSaving}
          label={t('settings.privacy.shakeFeedback')}
          description={t('settings.privacy.shakeFeedbackDescription')}
          onValueChange={(value) => {
            void changeShakeFeedback(value);
          }}
          value={isShakeEnabled}
          testID="settings-shake-feedback"
        />
        <Section.SwitchItem
          disabled={!available || isSaving}
          label={t('settings.privacy.sendReports')}
          onValueChange={(value) => {
            void changeConsent(value);
          }}
          value={enabled}
        />
        <Section.SwitchItem
          description={t('settings.privacy.dataCollectionDescription')}
          label={t('settings.privacy.dataCollection')}
          onValueChange={(value) => {
            void changeDataCollection(value);
          }}
          value={dataCollectionEnabled}
        />
      </Section>
    </SettingsScrollPage>
  );
}
