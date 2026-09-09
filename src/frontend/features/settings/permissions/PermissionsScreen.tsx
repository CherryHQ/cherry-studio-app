import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Section, Spinner } from '@cherrystudio/ui/components';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import {
  PermissionListLeading,
  visiblePermissionKinds,
} from './components/PermissionListPresentation/PermissionListPresentation';
import { usePermissionSystemStatuses } from './hooks/usePermissionSystemStatuses';
import {
  getPermissionStatus,
  getPermissionStatusKey,
  isPermissionSupported,
} from './permissionConfig';

export default function PermissionsSettingsScreen() {
  const { t } = useTranslation();
  const { statuses } = usePermissionSystemStatuses();

  return (
    <SettingsScrollPage
      contentClassName="gap-4"
      headerProps={{ title: t('settings.permissions.title') }}
    >
      <Text className="text-sm text-muted-foreground">{t('settings.permissions.description')}</Text>
      <Section>
        {visiblePermissionKinds
          .filter((kind) => isPermissionSupported(kind, statuses))
          .map((kind) => {
            const status = getPermissionStatus(kind, statuses);
            return (
              <Section.Item
                key={kind}
                label={t(`settings.permissions.type.${kind}`)}
                leading={<PermissionListLeading kind={kind} />}
                onPress={() =>
                  router.push({
                    pathname: '/settings/permissions/[permission]',
                    params: { permission: kind },
                  })
                }
                trailing={
                  <View className="flex-row items-center gap-2">
                    {status ? (
                      <Text className="text-sm text-muted-foreground">
                        {t(getPermissionStatusKey(kind, status))}
                      </Text>
                    ) : (
                      <Spinner accessibilityLabel={t('settings.permissions.checking')} size="sm" />
                    )}
                    <ChevronRightIcon className="size-5 text-muted-foreground" />
                  </View>
                }
              />
            );
          })}
      </Section>
    </SettingsScrollPage>
  );
}
