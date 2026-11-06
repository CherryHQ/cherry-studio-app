import { useAlert, useToast } from '@cherrystudio/ui/components';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type PropsWithChildren,
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data/BackendProvider';
import { cacheService } from '@/frontend/data/CacheService';
import type { AppUpdateRelease } from '@/shared/contracts/appUpdate';

import { AppUpdateDialog, type AppUpdateOrigin } from './AppUpdateDialog';
import { appUpdateQueryOptions } from './appUpdateQueries';

const UNAVAILABLE_KEYS = {
  unsupported: 'appUpdate.unsupported',
  unknownVersion: 'appUpdate.unknownVersion',
  noRelease: 'appUpdate.noRelease',
  nativeUnavailable: 'appUpdate.nativeUnavailable',
} as const;

type AppUpdateActions = {
  /** A manual check: opens the dialog for a known or newly found update, otherwise reports why not. */
  check(): Promise<void>;
  /** Presents one release in the update dialog and records it as this release's reminder. */
  open(release: AppUpdateRelease, origin?: AppUpdateOrigin): void;
};
const AppUpdateActionsContext = createContext<AppUpdateActions | null>(null);

/**
 * Shared decisions and the update dialog for a known release.
 * Availability and transfer subscriptions remain in leaf consumers.
 */
export function AppUpdateProvider({ children }: PropsWithChildren) {
  const appUpdate = useBackendModule('appUpdate');
  const queryClient = useQueryClient();
  const { alert } = useAlert();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [presentation, setPresentation] = useState<{
    release: AppUpdateRelease;
    origin: AppUpdateOrigin;
  } | null>(null);
  const pendingCheck = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!presentation) return;
    cacheService.setPersist('app_update.last_reminder', {
      releaseId: presentation.release.id,
      remindedAt: Date.now(),
    });
  }, [presentation]);

  const dialog = useMemo(() => {
    const close = () => setPresentation(null);

    const install = async () => {
      try {
        const result = await appUpdate.install();
        // A rejected package returns the transfer to failed, which the dialog already shows.
        if (result === 'invalidPackage') return;
        close();
        if (result === 'opened') return;
        alert.confirm({
          title: t('appUpdate.installPermissionTitle'),
          description: t('appUpdate.installPermissionDescription'),
          confirmLabel: t('appUpdate.openSettings'),
          onConfirm: async () => {
            try {
              if (
                !(await appUpdate.requestInstallPermission()) ||
                (await appUpdate.install()) === 'permissionRequired'
              ) {
                toast.show({ label: t('appUpdate.installPermissionDenied'), variant: 'warning' });
              }
            } catch {
              toast.show({ label: t('appUpdate.installFailed'), variant: 'danger' });
            }
          },
        });
      } catch {
        toast.show({ label: t('appUpdate.installFailed'), variant: 'danger' });
      }
    };

    const start = (target: AppUpdateRelease) => {
      if (target.channel === 'apk') {
        // Transfer failures land in the download state; only a refused start rejects.
        void appUpdate.download(target).catch(() => {
          toast.show({ label: t('appUpdate.downloadFailed'), variant: 'danger' });
        });
        return;
      }
      close();
      void appUpdate.openStore(target).catch(() => {
        toast.show({ label: t('appUpdate.openFailed'), variant: 'danger' });
      });
    };

    /** A failed package may have been replaced or withdrawn, so a retry asks for the latest. */
    const retry = async () => {
      try {
        const result = await queryClient.fetchQuery({
          ...appUpdateQueryOptions(appUpdate),
          staleTime: 0,
        });
        if (result.status === 'available') {
          setPresentation({ release: result, origin: 'manual' });
          start(result);
          return;
        }
        close();
        toast.show({
          label:
            result.status === 'upToDate'
              ? t('appUpdate.upToDate', { version: result.currentVersion })
              : t(UNAVAILABLE_KEYS[result.reason]),
        });
      } catch {
        toast.show({ label: t('appUpdate.failed'), variant: 'danger' });
      }
    };

    return { cancel: appUpdate.cancelDownload, close, install, retry, start };
  }, [appUpdate, queryClient, alert, toast, t]);

  const actions = useMemo<AppUpdateActions>(() => {
    const open = (next: AppUpdateRelease, origin: AppUpdateOrigin = 'manual') => {
      // Never replace a prompt already being read, including two opens in the same render.
      setPresentation((current) => current ?? { release: next, origin });
    };

    const check = async () => {
      const transfer = appUpdate.getDownload();
      if (transfer.status !== 'idle') {
        open(transfer.release);
        return;
      }
      const options = appUpdateQueryOptions(appUpdate);
      const recorded = queryClient.getQueryData(options.queryKey);
      if (recorded?.status === 'available') {
        open(recorded);
        return;
      }
      toast.show({ label: t('appUpdate.checking') });
      try {
        const result = await queryClient.fetchQuery({ ...options, staleTime: 0 });
        if (result.status === 'available') open(result);
        else if (result.status === 'upToDate') {
          toast.show({ label: t('appUpdate.upToDate', { version: result.currentVersion }) });
        } else toast.show({ label: t(UNAVAILABLE_KEYS[result.reason]) });
      } catch {
        toast.show({ label: t('appUpdate.failed'), variant: 'danger' });
      }
    };

    return {
      check: () => {
        // Share the complete action, including its feedback, across repeated taps and rerenders.
        pendingCheck.current ??= check().finally(() => {
          pendingCheck.current = null;
        });
        return pendingCheck.current;
      },
      open,
    };
  }, [appUpdate, queryClient, toast, t]);

  return (
    <AppUpdateActionsContext value={actions}>
      {children}
      <AppUpdateDialog
        actions={dialog}
        release={presentation?.release ?? null}
        origin={presentation?.origin ?? null}
      />
    </AppUpdateActionsContext>
  );
}

export function useAppUpdateActions() {
  const actions = use(AppUpdateActionsContext);
  if (!actions) throw new Error('AppUpdateProvider is missing');
  return actions;
}
