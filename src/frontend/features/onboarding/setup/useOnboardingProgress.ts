import { useToast } from '@cherrystudio/ui/components';
import { useFocusEffect } from 'expo-router';
import { useIsFocused } from 'expo-router/react-navigation';
import { useCallback, useRef, useState } from 'react';
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
  const [{ status }, save] = useMultiplePreferences(PREFERENCES);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const busy = useRef(false);
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
    if (busy.current || !focused.current) return false;
    busy.current = true;
    setIsSaving(true);
    setSaveFailed(false);
    try {
      await save(
        { status: next, ...(next === 'login' ? { guidanceSeen: true } : {}) },
        { optimistic: false },
      );
      return focused.current;
    } catch {
      setSaveFailed(true);
      if (focused.current) toast.show({ label: t('onboarding.saveFailed'), variant: 'danger' });
      return false;
    } finally {
      busy.current = false;
      setIsSaving(false);
    }
  };
  return { advance, isSaving, saveFailed, status };
}

export type OnboardingProgress = ReturnType<typeof useOnboardingProgress>;
