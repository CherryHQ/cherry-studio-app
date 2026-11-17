import { Section, useToast } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { useAppIcon } from '@/frontend/appShell/branding';

export function AppIconSetting() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { appIcon, state } = useAppIcon();
  if (!state.isSupported) return null;

  const change = (enabled: boolean) => {
    void appIcon.setFollowAccount(enabled).catch(() => {
      toast.show({ label: t('settings.appIcon.failed'), variant: 'danger' });
    });
  };

  return (
    <Section
      title={t('settings.appIcon.title')}
      footer={Platform.OS === 'ios' ? t('settings.appIcon.iosNotice') : undefined}
    >
      <Section.SwitchItem
        label={t('settings.appIcon.followAccount')}
        description={t('settings.appIcon.description')}
        value={state.followsAccount}
        disabled={state.isBusy}
        onValueChange={change}
        testID="settings-app-icon-follow-account"
      />
    </Section>
  );
}
