import { Section } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { visiblePermissionKinds } from './components/PermissionListPresentation/PermissionListPresentation';
import { PermissionSettingsItem } from './components/PermissionSettingsItem';
import { usePermissionSystemStatuses } from './hooks/usePermissionSystemStatuses';
import { isPermissionSupported } from './permissionConfig';

export default function PermissionsSettingsScreen() {
  const { t } = useTranslation();
  const { statuses, refresh } = usePermissionSystemStatuses();

  return (
    <SettingsScrollPage
      contentClassName="gap-4"
      headerProps={{ title: t('settings.permissions.title') }}
    >
      <Text className="text-sm text-muted-foreground">{t('settings.permissions.description')}</Text>
      <Section>
        {visiblePermissionKinds
          .filter((kind) => isPermissionSupported(kind, statuses))
          .map((kind) => (
            <PermissionSettingsItem key={kind} kind={kind} statuses={statuses} refresh={refresh} />
          ))}
      </Section>
    </SettingsScrollPage>
  );
}
