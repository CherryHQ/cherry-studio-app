import { Section } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import {
  BellRingIcon,
  CalendarIcon,
  ChevronRightIcon,
  HeartPulseIcon,
  MapPinIcon,
  type PngIconProps,
} from 'lucide-uniwind/png';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, ScrollView, Text, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';
import { Image } from '@/frontend/components/nativePrimitives';

import { usePermissionPolicies } from './hooks/usePermissionPolicies';
import { usePermissionSystemStatuses } from './hooks/usePermissionSystemStatuses';
import { getPermissionSummaryKey, type PermissionKind, permissionConfig } from './permissionConfig';

const permissionIcons: Record<PermissionKind, ComponentType<PngIconProps>> = {
  calendar: CalendarIcon,
  health: HeartPulseIcon,
  location: MapPinIcon,
  reminders: BellRingIcon,
};

const iosPermissionImages: Record<PermissionKind, number> = {
  calendar: require('../../../../../assets/permissions/ios/calendar.png'),
  health: require('../../../../../assets/permissions/ios/health.png'),
  location: require('../../../../../assets/permissions/ios/location.png'),
  reminders: require('../../../../../assets/permissions/ios/reminders.png'),
};

export default function PermissionsSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const policies = usePermissionPolicies();
  const visibleKinds =
    Platform.OS === 'android'
      ? (['location', 'calendar', 'health'] as const)
      : (['location', 'calendar', 'reminders', 'health'] as const);
  const { statuses } = usePermissionSystemStatuses();

  const items = visibleKinds.map((kind) => {
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

    const Icon = permissionIcons[kind];

    return {
      id: kind,
      label: t(`settings.permissions.type.${kind}`),
      leading:
        Platform.OS === 'ios' ? (
          <Image
            cachePolicy="memory-disk"
            className="size-5"
            contentFit="contain"
            source={iosPermissionImages[kind]}
          />
        ) : (
          <Icon className="size-5 text-foreground" strokeWidth={2} />
        ),
      onPress: () => router.push(`/settings/permissions/${kind}`),
      trailing: (
        <View className="flex-row items-center gap-2">
          <Text className="text-base text-default-foreground" numberOfLines={1}>
            {t(summaryKey)}
          </Text>
          <ChevronRightIcon className="size-5 text-default-foreground" strokeWidth={2} />
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
