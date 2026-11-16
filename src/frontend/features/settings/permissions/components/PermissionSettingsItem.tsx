import { Button, Section, Spinner } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import {
  getPermissionStatusKey,
  type PermissionKind,
  useDevicePermissionAction,
} from '@/frontend/hooks/devicePermission';
import type { PermissionStatuses } from '@/shared/contracts';

import { PermissionListLeading } from './PermissionListPresentation/PermissionListPresentation';

export function PermissionSettingsItem({
  kind,
  statuses,
  refresh,
}: {
  kind: PermissionKind;
  statuses: PermissionStatuses;
  refresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { status, action, pending, handlePress } = useDevicePermissionAction({
    kind,
    statuses,
    refresh,
  });
  const label = t(`settings.permissions.type.${kind}`);
  const actionLabel = action ? t(`settings.permissions.action.${action}`) : '';

  return (
    <Section.Item
      label={label}
      leading={<PermissionListLeading kind={kind} />}
      description={
        status ? t(getPermissionStatusKey(kind, status)) : t('settings.permissions.checking')
      }
      trailing={
        !status ? (
          <Spinner accessibilityLabel={t('settings.permissions.checking')} size="sm" />
        ) : action ? (
          <Button
            disabled={pending}
            loading={pending}
            onPress={() => void handlePress()}
            size="sm"
            variant="secondary"
            accessibilityLabel={`${label}: ${actionLabel}`}
          >
            {actionLabel}
          </Button>
        ) : undefined
      }
    />
  );
}
