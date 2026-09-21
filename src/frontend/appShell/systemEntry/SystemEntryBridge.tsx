import { useToast } from '@cherrystudio/ui/components';
import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import type { SystemEntrySession } from '@/shared/contracts';

import { createSystemEntryHandoff } from './systemEntryHandoff';

/** One consumer handles both cold-start claims and foreground notifications after bootstrap opens. */
export function SystemEntryBridge() {
  const module = useBackendModule('systemEntry');
  const router = useRouter();
  const navigation = useRootNavigationState();
  const { t } = useTranslation();
  const { toast } = useToast();

  useEffect(() => {
    if (!navigation?.key) return;
    let stopped = false;
    let draining = false;
    let pendingNotification = false;
    let active: SystemEntrySession | null = null;
    const drain = async () => {
      if (stopped || AppState.currentState !== 'active') return;
      if (draining) {
        pendingNotification = true;
        return;
      }
      draining = true;
      pendingNotification = false;
      try {
        // The cleanup and native callbacks mutate this condition while each awaited claim runs.
        // oxlint-disable-next-line eslint/no-unmodified-loop-condition
        while (!stopped && AppState.currentState === 'active') {
          const session = await module.claimNext();
          if (!session) break;
          if (stopped) {
            await session.dispose();
            break;
          }
          active = session;
          try {
            router.push({
              pathname: '/system-share',
              params: { handoff: createSystemEntryHandoff(session) },
            });
          } catch {
            if (!stopped) toast.show({ label: t('systemEntry.failed'), variant: 'danger' });
            await session.dismiss().catch(() => session.dispose());
          }
          await session.settled;
          active = null;
        }
      } catch {
        if (!stopped) toast.show({ label: t('systemEntry.failed'), variant: 'danger' });
      } finally {
        draining = false;
        // A native notification may arrive while the last empty claim is crossing the bridge.
        if (pendingNotification && !stopped) void drain();
      }
    };
    const stopPending = module.subscribePending(() => {
      void drain();
    });
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') void drain();
    });
    void drain();
    return () => {
      stopped = true;
      stopPending();
      foreground.remove();
      void active?.dispose();
    };
  }, [module, navigation?.key, router, t, toast]);

  return null;
}
