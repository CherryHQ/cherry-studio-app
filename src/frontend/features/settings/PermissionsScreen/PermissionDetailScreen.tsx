import type {
  PermissionMode,
  PermissionPreferenceKey,
} from '@cherrystudio/universal/data/preference';
import { useLocalSearchParams } from 'expo-router';
import { cn } from 'heroui-native/utils';
import { CheckIcon, SettingsIcon } from 'lucide-uniwind/png';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { BackHeader } from '@/frontend/components/headers';
import { Section } from '@/frontend/components/Section';
import { useBackendModule } from '@/frontend/data';
import { usePreference } from '@/frontend/data/hooks';

import { usePermissionPolicies } from './hooks/usePermissionPolicies';
import { usePermissionSystemStatuses } from './hooks/usePermissionSystemStatuses';
import { isPermissionKind, type PermissionKind, permissionConfig } from './permissionConfig';

const permissionModes = ['never', 'ask', 'always'] as const satisfies readonly PermissionMode[];

export default function PermissionDetailSettingsScreen() {
  const { permission: rawPermission } = useLocalSearchParams<{ permission?: string }>();
  const kind = isPermissionKind(rawPermission) ? rawPermission : 'location';
  const { t } = useTranslation();
  const config = permissionConfig[kind];
  const policies = usePermissionPolicies();
  const { refresh, statuses } = usePermissionSystemStatuses();
  const hasConfiguredPolicy =
    policies[config.readKey] !== 'never' ||
    (config.writeKey ? policies[config.writeKey] !== 'never' : false);
  const configuredKeys = [config.readKey, config.writeKey].filter(
    (key): key is NonNullable<typeof key> => Boolean(key && policies[key] !== 'never'),
  );
  const shouldShowRecovery =
    hasConfiguredPolicy &&
    configuredKeys.some((key) => statuses[key] !== undefined && statuses[key] !== 'granted');

  return (
    <>
      <BackHeader title={t(`settings.permissions.type.${kind}`)} />
      <ScrollView
        alwaysBounceVertical={false}
        className="flex-1"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-6 px-4 py-5">
          <PermissionModeGroup
            preferenceKey={config.readKey}
            title={t('settings.permissions.readAccess')}
            onSystemStatusChange={refresh}
          />
          {config.writeKey ? (
            <PermissionModeGroup
              preferenceKey={config.writeKey}
              title={t('settings.permissions.writeAccess')}
              onSystemStatusChange={refresh}
            />
          ) : null}
          {shouldShowRecovery ? (
            <OpenSettingsSection
              configuredKeys={configuredKeys}
              kind={kind}
              onSystemStatusChange={refresh}
            />
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

function PermissionModeGroup({
  onSystemStatusChange,
  preferenceKey,
  title,
}: {
  onSystemStatusChange: () => Promise<void>;
  preferenceKey: PermissionPreferenceKey;
  title: string;
}) {
  const { t } = useTranslation();
  const [mode] = usePreference(preferenceKey);
  const permissions = useBackendModule('permissions');
  const [isUpdating, setIsUpdating] = useState(false);

  const selectMode = async (nextMode: PermissionMode) => {
    if (nextMode === mode || isUpdating) {
      return;
    }

    setIsUpdating(true);
    try {
      await permissions.setPolicy(preferenceKey, nextMode);
      await onSystemStatusChange();
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <View className="gap-2">
      <Text className="px-1 font-medium text-default-foreground text-sm">{title}</Text>
      <View className="overflow-hidden rounded-xl bg-settings-grouped-surface">
        {permissionModes.map((option, index) => {
          const selected = option === mode;
          return (
            <Pressable
              accessibilityLabel={t(`settings.permissions.mode.${option}`)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: isUpdating }}
              className={cn(
                'min-h-12 flex-row items-center justify-between px-4 py-3 active:opacity-60',
                isUpdating ? 'opacity-50' : null,
              )}
              disabled={isUpdating}
              key={option}
              onPress={() => void selectMode(option)}
            >
              <Text className="text-base text-foreground">
                {t(`settings.permissions.mode.${option}`)}
              </Text>
              {selected ? <CheckIcon className="size-6 text-primary" strokeWidth={2.5} /> : null}
              {index < permissionModes.length - 1 ? (
                <View className="absolute right-4 bottom-0 left-4 h-px bg-border" />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function OpenSettingsSection({
  configuredKeys,
  kind,
  onSystemStatusChange,
}: {
  configuredKeys: PermissionPreferenceKey[];
  kind: PermissionKind;
  onSystemStatusChange: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const permissions = useBackendModule('permissions');
  const recoverAccess = async () => {
    await permissions.recover(configuredKeys);
    await onSystemStatusChange();
  };

  return (
    <Section
      items={[
        {
          icon: SettingsIcon,
          title: t('settings.permissions.openSystemSettings'),
          onPress: () => void recoverAccess(),
        },
      ]}
      title={t('settings.permissions.accessRequiredFor', {
        permission: t(`settings.permissions.type.${kind}`),
      })}
    />
  );
}
