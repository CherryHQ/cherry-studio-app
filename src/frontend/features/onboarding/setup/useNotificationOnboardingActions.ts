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
  const acting = useRef(false);
  const actionBusy = useRef(false);
  const permissionGeneration = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      permissionGeneration.current += 1;
    };
  }, []);

  const act = async (work: () => Promise<unknown>) => {
    if (!mounted.current || actionBusy.current || acting.current || progress.isSaving) return;
    actionBusy.current = true;
    try {
      await work();
    } catch {
      if (mounted.current) toast.show({ label: t('onboarding.saveFailed'), variant: 'danger' });
    } finally {
      actionBusy.current = false;
    }
  };

  const continueOnboarding = async () => {
    if (!mounted.current || acting.current || progress.isSaving) return;
    const current = ++permissionGeneration.current;
    const isCurrent = () => mounted.current && permissionGeneration.current === current;
    acting.current = true;
    setIsActing(true);
    try {
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
    } catch {
      if (isCurrent()) toast.show({ label: t('onboarding.saveFailed'), variant: 'danger' });
    } finally {
      if (isCurrent()) {
        acting.current = false;
        setIsActing(false);
      }
    }
  };

  const skip = async () => {
    if (!mounted.current || progress.isSaving) return;
    permissionGeneration.current += 1;
    acting.current = false;
    setIsActing(false);
    await progress.advance('login');
  };

  return { act, continue: continueOnboarding, skip, isActing };
}
