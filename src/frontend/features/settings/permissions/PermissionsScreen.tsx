import { Section } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { isPermissionSupported } from '@/frontend/hooks/devicePermission/permissionConfig';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import { visiblePermissionKinds } from './components/PermissionListPresentation/PermissionListPresentation';
import { PermissionSettingsItem } from './components/PermissionSettingsItem';
import { usePermissionSystemStatuses } from './hooks/usePermissionSystemStatuses';

export default function PermissionsSettingsScreen() {
  const { t } = useTranslation();
  const { statuses, refresh } = usePermissionSystemStatuses();

  return (
    <SettingsScrollPage headerProps={{ title: t('settings.permissions.title') }}>
      <Section footer={t('settings.permissions.description')}>
        {visiblePermissionKinds
          .filter((kind) => isPermissionSupported(kind, statuses))
          .map((kind) => (
            <PermissionSettingsItem key={kind} kind={kind} statuses={statuses} refresh={refresh} />
          ))}
      </Section>
    </SettingsScrollPage>
  );
}
