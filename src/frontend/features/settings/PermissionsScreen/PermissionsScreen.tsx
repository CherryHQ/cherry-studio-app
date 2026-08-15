import { ChevronRightIcon } from '@cherrystudio/app-icons';
import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';

import { usePermissionPolicies } from './hooks/usePermissionPolicies';
import { usePermissionSystemStatuses } from './hooks/usePermissionSystemStatuses';
import { getPermissionSummaryKey, permissionConfig } from './permissionConfig';
import { PermissionListLeading, visiblePermissionKinds } from './PermissionListPresentation';

export default function PermissionsSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const policies = usePermissionPolicies();
  const { statuses } = usePermissionSystemStatuses();

  const items = visiblePermissionKinds.map((kind) => {
    const config = permissionConfig[kind];
    const hasConfiguredPolicy =
      policies[config.readKey] !== 'never' ||
      (config.writeKey ? policies[config.writeKey] !== 'never' : false);
    const configuredKeys = [config.readKey, config.writeKey].filter(
      (key): key is NonNullable<typeof key> => Boolean(key && policies[key] !== 'never'),
    );
    const summaryKey =
      hasConfiguredPolicy &&
      configuredKeys.some((key) => statuses[key] !== undefined && statuses[key] !== 'granted')
        ? 'settings.permissions.accessRequired'
        : getPermissionSummaryKey(kind, policies);

    return {
      id: kind,
      label: t(`settings.permissions.type.${kind}`),
      leading: <PermissionListLeading kind={kind} />,
      onPress: () => router.push(`/settings/permissions/${kind}`),
      trailing: (
        <View className="flex-row items-center gap-2">
          <Text className="text-base text-foreground" numberOfLines={1}>
            {t(summaryKey)}
          </Text>
          <ChevronRightIcon className="size-5 text-foreground" />
        </View>
      ),
    };
  });

  return (
    <>
      <BackHeader title={t('settings.permissions.title')} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-4 py-5">
          <Section>
            {items.map(({ id, ...item }) => (
              <Section.Item key={id} {...item} />
            ))}
          </Section>
        </View>
      </ScrollView>
    </>
  );
}
