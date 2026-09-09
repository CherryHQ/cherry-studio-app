import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import { canRequestDevicePermission, canUseDevicePermission } from '@/shared/contracts';

/** Shared recovery for camera entry points in chat and avatars. */
export function useCameraAccess() {
  const permissions = useBackendModule('permissions');
  const { alert } = useAlert();
  const { toast } = useToast();
  const { t } = useTranslation();

  return useCallback(async () => {
    try {
      let statuses = await permissions.getStatuses(['camera.read']);
      if (canRequestDevicePermission(statuses['camera.read'])) {
        statuses = await permissions.request(['camera.read']);
      }
      if (canUseDevicePermission('camera.read', statuses['camera.read'])) return true;
      if (statuses['camera.read']?.state === 'denied' && !statuses['camera.read']?.canAskAgain) {
        alert.confirm({
          title: t('settings.permissions.accessRequired'),
          description: t('settings.permissions.camera.denied'),
          confirmLabel: t('settings.permissions.openSystemSettings'),
          onConfirm: () =>
            permissions.openSystemSettings('camera').catch(() => {
              toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' });
            }),
        });
      } else if (statuses['camera.read']?.state === 'denied') {
        toast.show({ label: t('settings.permissions.camera.notAllowed'), variant: 'danger' });
      } else {
        toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' });
      }
    } catch {
      toast.show({ label: t('settings.permissions.actionFailed'), variant: 'danger' });
    }
    return false;
  }, [alert, permissions, t, toast]);
}
