import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { appUpdateQueryOptions } from '@/frontend/data/appUpdate';
import { useBackendModule } from '@/frontend/data/BackendProvider';
import type { AppUpdateResult } from '@/shared/contracts/appUpdate';

const UNAVAILABLE_KEYS = {
  unsupported: 'settings.update.unsupported',
  unknownVersion: 'settings.update.unknownVersion',
  noRelease: 'settings.update.noRelease',
} as const;

type AvailableAppUpdate = Extract<AppUpdateResult, { status: 'available' }>;

/** About reads the startup result and refetches on tap; download confirmation stays here. */
export function useAppUpdateCheck() {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { toast } = useToast();
  const appUpdate = useBackendModule('appUpdate');
  const { data, isFetching, refetch } = useQuery({
    ...appUpdateQueryOptions(appUpdate),
    enabled: false,
  });
  // Preserve a known newer version if a later background refresh fails.
  const available = data?.status === 'available' ? data : undefined;

  const confirmDownload = (release: AvailableAppUpdate) => {
    alert.confirm({
      title: t('settings.update.confirmTitle'),
      description: t('settings.update.confirmDescription', {
        current: release.currentVersion,
        latest: release.latestVersion,
      }),
      confirmLabel: t('settings.update.download'),
      onConfirm: async () => {
        try {
          await appUpdate.openDownload(release.downloadUrl);
        } catch {
          toast.show({ label: t('settings.update.openFailed'), variant: 'danger' });
        }
      },
    });
  };

  const checkForUpdates = async () => {
    if (available) {
      confirmDownload(available);
      return;
    }
    if (isFetching) {
      toast.show({ label: t('settings.update.checking') });
      return;
    }
    toast.show({ label: t('settings.update.checking') });
    const result = await refetch();
    if (result.isError || !result.data) {
      toast.show({ label: t('settings.update.failed'), variant: 'danger' });
    } else if (result.data.status === 'available') {
      confirmDownload(result.data);
    } else if (result.data.status === 'upToDate') {
      toast.show({ label: t('settings.update.upToDate', { version: result.data.currentVersion }) });
    } else {
      toast.show({ label: t(UNAVAILABLE_KEYS[result.data.reason]) });
    }
  };

  return {
    checkForUpdates,
    hasAvailableUpdate: Boolean(available),
    isEnabled: appUpdate.isEnabled,
    isFetching,
  };
}
