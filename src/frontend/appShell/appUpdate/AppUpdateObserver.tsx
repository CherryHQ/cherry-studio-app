import { useToast } from '@cherrystudio/ui/components';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useStartupCoverVisible } from '@/frontend/appShell/startup';
import { appUpdateQueryOptions, useAppUpdateDownload } from '@/frontend/data/appUpdate';
import { useBackendModule } from '@/frontend/data/BackendProvider';
import { cacheService } from '@/frontend/data/CacheService';

import { useAppUpdateActions } from './AppUpdateProvider';

const REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Passive reminders never interrupt an active conversation or restart the application. */
export function AppUpdateObserver() {
  const appUpdate = useBackendModule('appUpdate');
  const { data } = useQuery(appUpdateQueryOptions(appUpdate));
  const transfer = useAppUpdateDownload(appUpdate);
  const actions = useAppUpdateActions();
  const { t } = useTranslation();
  const { toast } = useToast();
  const coverVisible = useStartupCoverVisible();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const lastTransfer = useRef(transfer);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!active || coverVisible || data?.status !== 'available' || transfer.status !== 'idle')
      return;
    const previous = cacheService.getPersist('app_update.last_reminder');
    const now = Date.now();
    if (
      previous?.releaseId === data.id &&
      now >= previous.remindedAt &&
      now - previous.remindedAt < REMINDER_INTERVAL_MS
    )
      return;
    cacheService.setPersist('app_update.last_reminder', { releaseId: data.id, remindedAt: now });
    toast.show({
      label: t('appUpdate.confirmTitle'),
      duration: 10_000,
      actions: [{ label: t('appUpdate.view'), onPress: () => actions.showRelease(data) }],
    });
  }, [active, coverVisible, data, transfer.status, actions, t, toast]);

  useEffect(() => {
    if (!active || coverVisible || lastTransfer.current === transfer) return;
    lastTransfer.current = transfer;
    if (transfer.status === 'ready') {
      toast.show({
        label: t('appUpdate.ready'),
        duration: 10_000,
        actions: [{ label: t('appUpdate.install'), onPress: actions.confirmInstall }],
      });
    } else if (transfer.status === 'failed') {
      toast.show({
        label: t(
          transfer.reason === 'verification'
            ? 'appUpdate.verificationFailed'
            : 'appUpdate.downloadFailed',
        ),
        variant: 'danger',
        duration: 10_000,
        actions: [
          { label: t('common.retry'), onPress: () => actions.showRelease(transfer.release) },
        ],
      });
    } else if (transfer.status === 'downloading' && transfer.receivedBytes === 0) {
      toast.show({ label: t('appUpdate.downloadStarted') });
    }
  }, [active, coverVisible, transfer, actions, t, toast]);

  return null;
}
