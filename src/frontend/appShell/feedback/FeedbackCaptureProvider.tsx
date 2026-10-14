import { usePathname, useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { usePrivacyConsentPending } from '@/frontend/appShell/privacy';
import { usePreference } from '@/frontend/data/hooks';

import { removeFeedbackScreenshot, type FeedbackScreenshot } from './feedbackScreenshot';
import { useShakeFeedback } from './useShakeFeedback';

const FeedbackCaptureContext = createContext<{
  screenshot?: FeedbackScreenshot;
  captureFailed: boolean;
  clearScreenshot: () => void;
} | null>(null);

/** App-wide capture owns temporary pixels; the feedback page owns editing and submission. */
export function FeedbackCaptureProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const consentPending = usePrivacyConsentPending();
  const [isShakeEnabled] = usePreference('app.feedback.shake_enabled');
  const [screenshot, setScreenshot] = useState<FeedbackScreenshot>();
  const [captureFailed, setCaptureFailed] = useState(false);
  const owned = useRef<FeedbackScreenshot>(undefined);
  const clearScreenshot = useCallback(() => {
    if (owned.current) removeFeedbackScreenshot(owned.current);
    owned.current = undefined;
    setScreenshot(undefined);
    setCaptureFailed(false);
  }, []);

  const previousPath = useRef(pathname);
  useEffect(() => {
    if (
      previousPath.current === '/settings/about/feedback/new' &&
      pathname !== previousPath.current
    )
      clearScreenshot();
    previousPath.current = pathname;
  }, [pathname, clearScreenshot]);

  useEffect(
    () => () => {
      if (owned.current) removeFeedbackScreenshot(owned.current);
    },
    [],
  );

  useShakeFeedback({
    enabled:
      isShakeEnabled &&
      !consentPending &&
      pathname !== '/settings/about/feedback/new' &&
      !pathname.startsWith('/onboarding'),
    route: pathname,
    onCaptured: (image) => {
      clearScreenshot();
      owned.current = image;
      setScreenshot(image);
      setCaptureFailed(!image);
      router.push('/settings/about/feedback/new');
    },
  });

  const value = useMemo(
    () => ({ screenshot, captureFailed, clearScreenshot }),
    [screenshot, captureFailed, clearScreenshot],
  );
  return <FeedbackCaptureContext value={value}>{children}</FeedbackCaptureContext>;
}

export function useFeedbackCapture() {
  const value = useContext(FeedbackCaptureContext);
  if (!value) throw new Error('FeedbackCaptureProvider is missing');
  return value;
}
