import { Section } from '@cherrystudio/ui/components';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { useDevicePermissionStatuses } from '@/frontend/hooks/useDevicePermissionStatuses';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import {
  healthPermissionProvider,
  visiblePermissionKinds,
} from './components/PermissionListPresentation/PermissionListPresentation';
import { PermissionSettingsItem } from './components/PermissionSettingsItem';
import { isPermissionSupported, type PermissionKind, permissionConfig } from './permissionConfig';

export default function PermissionDetailsScreen() {
  const { permission } = useLocalSearchParams<{ permission: string }>();
  const kind = visiblePermissionKinds.find((candidate) => candidate === permission);
  const { t } = useTranslation();
  return kind ? (
    <PermissionDetails kind={kind} />
  ) : (
    <SettingsScrollPage headerProps={{ title: t('settings.permissions.title') }}>
      <Text className="text-base text-muted-foreground">
        {t('settings.permissions.reason.unsupported')}
      </Text>
    </SettingsScrollPage>
  );
}

function PermissionDetails({ kind }: { kind: PermissionKind }) {
  const { t } = useTranslation();
  const { statuses, refresh } = useDevicePermissionStatuses(permissionConfig[kind].scopes);
  const isHealth = kind === 'health';

  return (
    <SettingsScrollPage
      contentClassName="gap-4"
      headerProps={{ title: t(`settings.permissions.type.${kind}`) }}
    >
      <Text className="text-base text-muted-foreground">
        {t(
          isHealth
            ? `settings.permissions.health.${healthPermissionProvider}Description`
            : `settings.permissions.purpose.${kind}`,
        )}
      </Text>
      {isPermissionSupported(kind, statuses) ? (
        <Section>
          <PermissionSettingsItem kind={kind} statuses={statuses} refresh={refresh} />
        </Section>
      ) : (
        <Text className="text-base text-muted-foreground">
          {t('settings.permissions.reason.unsupported')}
        </Text>
      )}
      {isHealth && (
        <Text className="text-sm text-muted-foreground">
          {t('settings.permissions.health.dataUse')}
        </Text>
      )}
    </SettingsScrollPage>
  );
}
