import { useOverlayNavigation, useToast } from '@cherrystudio/ui/components';
import { usePathname } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { usePrivacyConsentPending } from '@/frontend/appShell/privacy';

import { supportsDiagnosticMotion } from '../../../../modules/diagnostics';
import { useShakeFeedbackPreference } from './useShakeFeedbackPreference';

type FeedbackHint = { show: (bottomOffset: number) => void; hide: () => void };
const FeedbackHintContext = createContext<FeedbackHint | null>(null);

/** App-session discovery only; showing a hint never opts the user into sensing. */
export function FeedbackHintProvider({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const overlays = useOverlayNavigation();
  const pathname = usePathname();
  const consentPending = usePrivacyConsentPending();
  const { enabled, decision, setEnabled, ignoreHint } = useShakeFeedbackPreference();
  const hasShown = useRef(false);
  const toastId = useRef<string | undefined>(undefined);
  const isSaving = useRef(false);
  const hide = useCallback(() => {
    if (toastId.current) toast.hide(toastId.current);
    toastId.current = undefined;
  }, [toast]);

  useEffect(() => hide, [hide, pathname]);
  useEffect(() => {
    if (enabled || decision !== 'unseen' || consentPending) hide();
  }, [enabled, decision, consentPending, hide]);
  useEffect(() => {
    const stop = overlays.subscribe(() => {
      if (overlays.hasOverlays()) hide();
    });
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') hide();
    });
    return () => {
      stop();
      appState.remove();
    };
  }, [hide, overlays]);

  const show = useCallback(
    (bottomOffset: number) => {
      async function choose(enable: boolean) {
        if (isSaving.current) return;
        isSaving.current = true;
        try {
          if (enable) {
            await setEnabled(true);
            toast.show({ label: t('feedback.shakeHint.enabled'), variant: 'success' });
          } else {
            await ignoreHint();
          }
        } catch {
          toast.show({ label: t('settings.privacy.saveFailed'), variant: 'danger' });
        } finally {
          isSaving.current = false;
        }
      }

      if (
        hasShown.current ||
        enabled ||
        decision !== 'unseen' ||
        consentPending ||
        AppState.currentState !== 'active' ||
        overlays.hasOverlays() ||
        !supportsDiagnosticMotion()
      )
        return;
      hasShown.current = true;
      toastId.current = toast.show({
        label: t('feedback.shakeHint.message'),
        duration: 12000,
        placement: 'bottom',
        bottomOffset,
        dismissLabel: t('common.close'),
        actions: [
          {
            label: t('feedback.shakeHint.enable'),
            onPress: () => {
              void choose(true);
            },
          },
          {
            label: t('feedback.shakeHint.ignore'),
            onPress: () => {
              void choose(false);
            },
          },
        ],
      });
    },
    [enabled, decision, consentPending, overlays, setEnabled, ignoreHint, t, toast],
  );
  const value = useMemo(() => ({ show, hide }), [show, hide]);
  return <FeedbackHintContext value={value}>{children}</FeedbackHintContext>;
}

export function useFeedbackHint() {
  const value = use(FeedbackHintContext);
  if (!value) throw new Error('FeedbackHintProvider is missing');
  return value;
}
