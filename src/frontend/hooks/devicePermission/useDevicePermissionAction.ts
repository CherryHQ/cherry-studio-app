import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import type { PermissionStatuses } from '@/shared/contracts';

import {
  getPermissionAction,
  getPermissionStatus,
  type PermissionKind,
  permissionConfig,
} from './permissionConfig';

/** The existing settings action, shared without its presentation. */
export function useDevicePermissionAction({
  kind,
  statuses,
  refresh,
}: {
  kind: PermissionKind;
  statuses: PermissionStatuses;
  refresh: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const permissions = useBackendModule('permissions');
  const [pending, setPending] = useState(false);
  const config = permissionConfig[kind];
  const status = getPermissionStatus(kind, statuses);
  // An add-only calendar grant can still be upgraded by a system request.
  const action = getPermissionAction(kind === 'calendar' ? statuses['calendar.read'] : status);

  const handlePress = async () => {
    if (pending || !action) return;
    setPending(true);
    try {
      if (action === 'request') {
        await permissions.request([...config.requestScopes]);
      } else if (action === 'open-settings') {
        if (kind === 'health') {
          alert.show({
            title: t('settings.permissions.health.manage'),
            description: t('settings.permissions.health.appleInstructions'),
          });
        } else {
          await permissions.openSystemSettings(config.permission);
        }
      }
      await refresh();
    } catch {
      toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' });
    } finally {
      setPending(false);
    }
  };

  return { status, action, pending, handlePress };
}
