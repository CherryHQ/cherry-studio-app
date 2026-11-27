import { useAlert, useToast } from '@cherrystudio/ui/components';
import { isCancelledError, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePrivacyConsentPending } from '@/frontend/appShell/privacy';
import { useStartupCoverVisible } from '@/frontend/appShell/startup';
import { queryKeys, useBackendModule } from '@/frontend/data';
import type { AppUpdateRelease } from '@/shared/contracts/appUpdate';

import { AppUpdateDialog } from './AppUpdateDialog';
import { appUpdateQueryOptions } from './appUpdateQueries';

const UNAVAILABLE_KEYS = {
  unsupported: 'appUpdate.unsupported',
  unknownVersion: 'appUpdate.unknownVersion',
  noRelease: 'appUpdate.noRelease',
  nativeUnavailable: 'appUpdate.nativeUnavailable',
  storefrontUnavailable: 'appUpdate.failed',
} as const;

type AppUpdateActions = {
  /** A manual check: opens the dialog for a known or newly found update, otherwise reports why not. */
  check(): Promise<void>;
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
  const [release, setRelease] = useState<AppUpdateRelease | null>(null);
  const pendingCheck = useRef<Promise<void> | null>(null);

  const privacyPending = usePrivacyConsentPending();
  const coverVisible = useStartupCoverVisible();
  const { data: requiredVersion = null } = useQuery({
    queryKey: queryKeys.appUpdate.requiredVersion,
    queryFn: appUpdate.checkRequiredVersion,
    enabled: appUpdate.isEnabled && !privacyPending && !coverVisible,
    staleTime: 'static',
    gcTime: Infinity,
    retry: false,
  });

  const dialog = useMemo(() => {
    const close = () => setRelease(null);

    const install = async () => {
      try {
        const result = await appUpdate.install();
        // A rejected package returns the transfer to failed, which the dialog already shows.
        if (result === 'invalidPackage') return;
        if (!requiredVersion) close();
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
      if (!requiredVersion) close();
      void appUpdate.openStore(target).catch(() => {
        toast.show({ label: t('appUpdate.openFailed'), variant: 'danger' });
      });
    };

    /** Resolve the current release when the user starts an update or retries a failed transfer. */
    const checkAndStart = async () => {
      try {
        const result = await queryClient.fetchQuery(
          appUpdateQueryOptions(appUpdate, { force: true }),
        );
        if (result.status === 'available') {
          setRelease(result);
          start(result);
          return;
        }
        close();
        toast.show({
          label:
            result.status === 'upToDate'
              ? requiredVersion
                ? t('appUpdate.noRelease')
                : t('appUpdate.upToDate', { version: result.currentVersion })
              : t(UNAVAILABLE_KEYS[result.reason]),
        });
      } catch (error) {
        if (!isCancelledError(error))
          toast.show({ label: t('appUpdate.failed'), variant: 'danger' });
      }
    };

    const cancel = async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.appUpdate.latest(appUpdate.channel) }),
        appUpdate.cancelDownload(),
      ]);
    };
    return { cancel, close, install, checkAndStart, start };
  }, [appUpdate, queryClient, alert, toast, t, requiredVersion]);

  const actions = useMemo<AppUpdateActions>(() => {
    const open = (next: AppUpdateRelease) => {
      // Never replace a prompt already being read, including two opens in the same render.
      setRelease((current) => current ?? next);
    };

    const check = async () => {
      const transfer = appUpdate.getDownload();
      if (transfer.status !== 'idle') {
        open(transfer.release);
        return;
      }
      const options = appUpdateQueryOptions(appUpdate);
      const recorded = queryClient.getQueryData(options.queryKey);
      if (recorded?.status === 'available' && recorded.channel !== 'app-store') {
        open(recorded);
        return;
      }
      toast.show({ label: t('appUpdate.checking') });
      try {
        const result = await queryClient.fetchQuery(
          appUpdateQueryOptions(appUpdate, { force: true }),
        );
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
    };
  }, [appUpdate, queryClient, toast, t]);

  return (
    <AppUpdateActionsContext value={actions}>
      {children}
      <AppUpdateDialog actions={dialog} release={release} requiredVersion={requiredVersion} />
    </AppUpdateActionsContext>
  );
}

export function useAppUpdateActions() {
  const actions = use(AppUpdateActionsContext);
  if (!actions) throw new Error('AppUpdateProvider is missing');
  return actions;
}
