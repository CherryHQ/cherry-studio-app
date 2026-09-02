import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import { Section, Spinner, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { SettingsScrollPage } from '@/frontend/components/settings';
import { useBackendModule } from '@/frontend/data';
import type { SystemPermissionState } from '@/shared/contracts';

import { usePermissionSystemStatuses } from './hooks/usePermissionSystemStatuses';
import {
  getPermissionAction,
  getPermissionStatus,
  type PermissionAction,
  type PermissionKind,
  permissionConfig,
} from './permissionConfig';
import {
  PermissionListLeading,
  visiblePermissionKinds,
} from './PermissionListPresentation/PermissionListPresentation';

export default function PermissionsSettingsScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const permissions = useBackendModule('permissions');
  const [activePermissionKind, setActivePermissionKind] = useState<PermissionKind | null>(null);
  const { refresh, statuses } = usePermissionSystemStatuses();

  const handlePermissionPress = async (kind: PermissionKind, action: PermissionAction) => {
    if (activePermissionKind) return;

    setActivePermissionKind(kind);
    let hasFailed = false;
    try {
      const config = permissionConfig[kind];
      if (action === 'request') {
        await permissions.request(config.requestScope);
      } else {
        await permissions.openSystemSettings(config.permission);
      }
    } catch {
      hasFailed = true;
    } finally {
      try {
        await refresh();
      } catch {
        hasFailed = true;
      }
      setActivePermissionKind(null);
      if (hasFailed) {
        toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' });
      }
    }
  };

  const items = visiblePermissionKinds.map((kind) => {
    const status = getPermissionStatus(kind, statuses);
    const action = getPermissionAction(status);
    const isUpdating = activePermissionKind === kind;
    const accessibilityHint =
      action === 'request'
        ? t('settings.permissions.requestHint')
        : action === 'open-settings'
          ? t('settings.permissions.openSystemSettingsHint')
          : undefined;

    return {
      accessibilityHint,
      accessibilityState: { busy: isUpdating },
      disabled: action !== undefined && activePermissionKind !== null,
      id: kind,
      label: t(`settings.permissions.type.${kind}`),
      leading: <PermissionListLeading kind={kind} />,
      onPress: action ? () => void handlePermissionPress(kind, action) : undefined,
      trailing: (
        <PermissionStatus
          isActionable={action !== undefined}
          isUpdating={isUpdating}
          status={status}
        />
      ),
    };
  });

  return (
    <SettingsScrollPage headerProps={{ title: t('settings.permissions.title') }}>
      <Section>
        {items.map(({ id, ...item }) => (
          <Section.Item key={id} {...item} />
        ))}
      </Section>
    </SettingsScrollPage>
  );
}

function PermissionStatus({
  isActionable,
  isUpdating,
  status,
}: {
  isActionable: boolean;
  isUpdating: boolean;
  status: SystemPermissionState | undefined;
}) {
  const { t } = useTranslation();

  if (isUpdating || status === undefined) {
    return <Spinner accessibilityLabel={t('settings.permissions.checking')} size="sm" />;
  }

  return (
    <View className="flex-row items-center gap-2">
      <Text
        className={
          status === 'unavailable' ? 'text-base text-muted-foreground' : 'text-base text-foreground'
        }
        numberOfLines={1}
      >
        {t(`settings.permissions.status.${status}`)}
      </Text>
      {status === 'granted' ? <CheckIcon className="size-5 text-foreground" /> : null}
      {isActionable ? <ChevronRightIcon className="size-5 text-muted-foreground" /> : null}
    </View>
  );
}
