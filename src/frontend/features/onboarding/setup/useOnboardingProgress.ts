import { useToast } from '@cherrystudio/ui/components';
import { useFocusEffect, useRouter } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useMultiplePreferences } from '@/frontend/data';
import type { PreferenceSchema } from '@/shared/data/preference/preferenceSchema';

export type OnboardingStatus = PreferenceSchema['app.onboarding.status'];
const PREFERENCES = {
  status: 'app.onboarding.status',
  guidanceSeen: 'app.background_run_guidance.seen',
} as const;

export function useOnboardingProgress() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [{ status }, save] = useMultiplePreferences(PREFERENCES);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isFocused = useIsFocused();
  const focused = useRef(isFocused);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const advance = async (next: OnboardingStatus) => {
    if (busy.current || !mounted.current) return false;
    busy.current = true;
    setIsSaving(true);
    setSaveFailed(false);
    try {
      await save(
        { status: next, ...(next === 'login' ? { guidanceSeen: true } : {}) },
        { optimistic: false },
      );
      return true;
    } catch {
      if (mounted.current) {
        setSaveFailed(true);
        toast.show({ label: t('onboarding.saveFailed'), variant: 'danger' });
      }
      return false;
    } finally {
      busy.current = false;
      if (mounted.current) setIsSaving(false);
    }
  };
  const skip = async () => {
    if ((await advance('skipped')) && mounted.current && focused.current) router.replace('/');
  };
  return { advance, skip, isSaving, saveFailed, status };
}

export type OnboardingProgress = ReturnType<typeof useOnboardingProgress>;
