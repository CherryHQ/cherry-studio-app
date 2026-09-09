import { Button, Section, Spinner, useAlert, useToast } from '@cherrystudio/ui/components';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useDevicePermissionStatuses } from '@/frontend/hooks/useDevicePermissionStatuses';
import type { DevicePermissionScope } from '@/shared/contracts';

import { SettingsScrollPage } from '../components/SettingsScrollPage';
import {
  healthPermissionProvider,
  healthSettingsNeedInstructions,
  photoSaveNeedsPermission,
  supportsCalendarWriteOnly,
  visiblePermissionKinds,
} from './components/PermissionListPresentation/PermissionListPresentation';
import {
  getPermissionAction,
  getPermissionStatusKey,
  isPermissionSupported,
  type PermissionKind,
  permissionConfig,
} from './permissionConfig';

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
  const { alert } = useAlert();
  const { toast } = useToast();
  const permissions = useBackendModule('permissions');
  const config = permissionConfig[kind];
  const { statuses, refresh } = useDevicePermissionStatuses(config.scopes);
  const [pendingScope, setPendingScope] = useState<DevicePermissionScope | 'settings' | null>(null);
  const supported = isPermissionSupported(kind, statuses);
  const scopes = config.scopes.filter(
    (scope) =>
      scope !== 'reminders.write' && (supportsCalendarWriteOnly || scope !== 'calendar.write'),
  );
  const isHealth = kind === 'health';
  const healthStatus = statuses['health.steps.read'];
  const hasHealthService =
    healthStatus?.state !== 'unavailable' && healthStatus?.reason !== 'native-unavailable';

  const openSettings = async () => {
    if (isHealth && healthSettingsNeedInstructions) {
      alert.show({
        title: t('settings.permissions.health.manage'),
        description: t('settings.permissions.health.appleInstructions'),
      });
      return;
    }
    await permissions.openSystemSettings(config.permission);
  };

  const handlePress = async (scope: DevicePermissionScope | 'settings') => {
    if (pendingScope) return;
    setPendingScope(scope);
    try {
      const action = scope === 'settings' ? 'open-settings' : getPermissionAction(statuses[scope]);
      if (action === 'request' && scope !== 'settings') {
        await permissions.request([scope]);
      } else if (action === 'open-settings') {
        await openSettings();
      }
      await refresh();
    } catch {
      toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' });
    } finally {
      setPendingScope(null);
    }
  };

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
      {supported ? (
        <>
          {(!isHealth || hasHealthService) && (
            <Section>
              {scopes.map((scope) => {
                const status = statuses[scope];
                const action =
                  scope === 'photos.write' && !photoSaveNeedsPermission
                    ? undefined
                    : getPermissionAction(status);
                const label =
                  kind === 'calendar' && !supportsCalendarWriteOnly
                    ? t('settings.permissions.calendar.fullAccess')
                    : t(`settings.permissions.scope.${scope}`);
                return (
                  <Section.Item
                    key={scope}
                    label={label}
                    description={
                      status
                        ? t(
                            scope === 'photos.write' && status.state === 'granted'
                              ? 'settings.permissions.photos.canSave'
                              : getPermissionStatusKey(kind, status),
                          )
                        : t('settings.permissions.checking')
                    }
                    trailing={
                      status ? (
                        action ? (
                          <Button
                            disabled={pendingScope !== null}
                            onPress={() => void handlePress(scope)}
                            size="sm"
                            variant="secondary"
                            loading={pendingScope === scope}
                            accessibilityLabel={`${label}: ${t(`settings.permissions.action.${action}`)}`}
                          >
                            {t(`settings.permissions.action.${action}`)}
                          </Button>
                        ) : undefined
                      ) : (
                        <Spinner size="sm" />
                      )
                    }
                  />
                );
              })}
            </Section>
          )}
          {isHealth && (
            <View className="gap-3">
              <Text className="text-sm text-muted-foreground">
                {t('settings.permissions.health.dataUse')}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {t('settings.permissions.health.noData')}
              </Text>
              {healthStatus?.reason && (
                <Text className="text-base text-muted-foreground">
                  {t(getPermissionStatusKey(kind, healthStatus))}
                </Text>
              )}
              {healthStatus && healthStatus.reason !== 'native-unavailable' && (
                <Button
                  disabled={pendingScope !== null}
                  loading={pendingScope === 'settings'}
                  onPress={() => void handlePress('settings')}
                  variant="secondary"
                >
                  {t(
                    healthStatus.reason === 'install-required'
                      ? 'settings.permissions.health.install'
                      : 'settings.permissions.health.manage',
                  )}
                </Button>
              )}
            </View>
          )}
        </>
      ) : (
        <Text className="text-base text-muted-foreground">
          {t('settings.permissions.reason.unsupported')}
        </Text>
      )}
    </SettingsScrollPage>
  );
}
