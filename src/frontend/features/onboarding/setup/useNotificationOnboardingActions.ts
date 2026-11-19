import { useToast } from '@cherrystudio/ui/components';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { NotificationPermissionStatusLike } from '@/shared/notifications/notificationPermission';

import type { OnboardingProgress } from './useOnboardingProgress';

export function useNotificationOnboardingActions({
  progress,
  notifications,
  setPermission,
}: {
  progress: OnboardingProgress;
  notifications: boolean;
  setPermission: (permission: NotificationPermissionStatusLike) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isActing, setIsActing] = useState(false);
  const activeAction = useRef<{ kind: 'settings' | 'permission' } | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeAction.current = null;
    };
  }, []);

  const run = async (
    kind: 'settings' | 'permission',
    work: (isCurrent: () => boolean) => Promise<unknown>,
  ) => {
    if (!mounted.current || activeAction.current || progress.isSaving) return;
    const action = { kind };
    activeAction.current = action;
    const isCurrent = () => activeAction.current === action;
    setIsActing(true);
    try {
      await work(isCurrent);
    } catch {
      if (isCurrent()) toast.show({ label: t('onboarding.saveFailed'), variant: 'danger' });
    } finally {
      if (isCurrent()) {
        activeAction.current = null;
        setIsActing(false);
      }
    }
  };

  const act = (work: () => Promise<unknown>) => run('settings', work);
  const continueOnboarding = () =>
    run('permission', async (isCurrent) => {
      if (notifications) {
        let next = await getPermissionsAsync();
        if (!isCurrent()) return;
        if (next.status === 'undetermined') {
          next = await requestPermissionsAsync();
          if (!isCurrent()) return;
        }
        setPermission(next);
      }
      await progress.advance('login');
    });

  const skip = async () => {
    if (!mounted.current || progress.isSaving) return;
    if (activeAction.current?.kind === 'permission') {
      activeAction.current = null;
      setIsActing(false);
    }
    await progress.advance('login');
  };

  return { act, continue: continueOnboarding, skip, isActing };
}
