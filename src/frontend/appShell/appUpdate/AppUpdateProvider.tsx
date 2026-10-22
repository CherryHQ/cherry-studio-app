import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { appUpdateQueryOptions } from '@/frontend/data/appUpdate';
import { useBackendModule } from '@/frontend/data/BackendProvider';
import type { AppUpdateRelease } from '@/shared/contracts/appUpdate';

const UNAVAILABLE_KEYS = {
  unsupported: 'appUpdate.unsupported',
  unknownVersion: 'appUpdate.unknownVersion',
  noRelease: 'appUpdate.noRelease',
  nativeUnavailable: 'appUpdate.nativeUnavailable',
} as const;

type AppUpdateActions = {
  check(): Promise<void>;
  showRelease(release: AppUpdateRelease): void;
  confirmInstall(): void;
  cancelDownload(): Promise<void>;
};
const AppUpdateActionsContext = createContext<AppUpdateActions | null>(null);

/** Shared decisions and feedback. Availability and transfer subscriptions remain in leaf consumers. */
export function AppUpdateProvider({ children }: PropsWithChildren) {
  const appUpdate = useBackendModule('appUpdate');
  const queryClient = useQueryClient();
  const { alert } = useAlert();
  const { toast } = useToast();
  const { t } = useTranslation();

  const actions = useMemo(() => {
    const install = async () => {
      try {
        if ((await appUpdate.install()) === 'permissionRequired') {
          alert.confirm({
            title: t('appUpdate.installPermissionTitle'),
            description: t('appUpdate.installPermissionDescription'),
            confirmLabel: t('appUpdate.openSettings'),
            onConfirm: async () => {
              try {
                if (!(await appUpdate.requestInstallPermission())) {
                  toast.show({ label: t('appUpdate.installPermissionDenied'), variant: 'warning' });
                  return;
                }
                if ((await appUpdate.install()) === 'permissionRequired') {
                  toast.show({ label: t('appUpdate.installPermissionDenied'), variant: 'warning' });
                }
              } catch {
                toast.show({ label: t('appUpdate.installFailed'), variant: 'danger' });
              }
            },
          });
        }
      } catch {
        toast.show({ label: t('appUpdate.installFailed'), variant: 'danger' });
      }
    };

    const confirmInstall = () => {
      alert.confirm({
        title: t('appUpdate.ready'),
        description: t('appUpdate.installDescription'),
        confirmLabel: t('appUpdate.install'),
        onConfirm: install,
      });
    };

    const showRelease = (release: AppUpdateRelease) => {
      const transfer = appUpdate.getDownload();
      if (transfer.status === 'ready' && transfer.release.id === release.id) {
        confirmInstall();
        return;
      }
      if (transfer.status === 'downloading' || transfer.status === 'verifying') {
        toast.show({ label: t('appUpdate.downloading') });
        return;
      }
      const versions = release.latestVersion
        ? t('appUpdate.versions', {
            current: release.currentVersion,
            latest: release.latestVersion,
          })
        : t('appUpdate.storeAvailable');
      alert.confirm({
        title: t('appUpdate.confirmTitle'),
        description: `${versions}\n\n${t(release.channel === 'apk' ? 'appUpdate.downloadDescription' : 'appUpdate.storeDescription')}`,
        confirmLabel: t(release.channel === 'apk' ? 'appUpdate.download' : 'appUpdate.openStore'),
        onConfirm: () => {
          if (release.channel === 'apk') {
            // Do not retain the decision dialog for the transfer's lifetime.
            void appUpdate.download(release).catch(() => {
              toast.show({ label: t('appUpdate.downloadFailed'), variant: 'danger' });
            });
          } else {
            void appUpdate.openStore(release).catch(() => {
              toast.show({ label: t('appUpdate.openFailed'), variant: 'danger' });
            });
          }
        },
      });
    };

    const check = async () => {
      const transfer = appUpdate.getDownload();
      if (transfer.status === 'ready') {
        confirmInstall();
        return;
      }
      if (transfer.status === 'failed') {
        showRelease(transfer.release);
        return;
      }
      const options = appUpdateQueryOptions(appUpdate);
      const recorded = queryClient.getQueryData(options.queryKey);
      if (recorded?.status === 'available') {
        showRelease(recorded);
        return;
      }
      toast.show({ label: t('appUpdate.checking') });
      try {
        const result = await queryClient.fetchQuery({ ...options, staleTime: 0 });
        if (result.status === 'available') showRelease(result);
        else if (result.status === 'upToDate') {
          toast.show({ label: t('appUpdate.upToDate', { version: result.currentVersion }) });
        } else toast.show({ label: t(UNAVAILABLE_KEYS[result.reason]) });
      } catch {
        toast.show({ label: t('appUpdate.failed'), variant: 'danger' });
      }
    };

    return { check, showRelease, confirmInstall, cancelDownload: appUpdate.cancelDownload };
  }, [appUpdate, queryClient, alert, toast, t]);

  return <AppUpdateActionsContext value={actions}>{children}</AppUpdateActionsContext>;
}

export function useAppUpdateActions() {
  const actions = use(AppUpdateActionsContext);
  if (!actions) throw new Error('AppUpdateProvider is missing');
  return actions;
}
