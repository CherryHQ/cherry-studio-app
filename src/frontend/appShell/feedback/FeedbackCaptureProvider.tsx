import { useOverlayNavigation } from '@cherrystudio/ui/components';
import { usePathname, useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  use,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';

import { usePrivacyConsentPending } from '@/frontend/appShell/privacy';
import { usePreference } from '@/frontend/data/hooks';
import type { DiagnosticFeedbackContext } from '@/shared/contracts/diagnostics';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { canCaptureFeedbackRoute } from './feedbackCapturePolicy';
import { feedbackFeatureForRoute, type FeedbackContextInput } from './feedbackContext';
import { removeFeedbackScreenshot, type FeedbackScreenshot } from './feedbackScreenshot';
import { useShakeFeedback } from './useShakeFeedback';

const logger = loggerService.withContext('FeedbackCapture');
type FeedbackHandoff = {
  context: DiagnosticFeedbackContext;
  controller?: AbortController;
  navigated: boolean;
};

const FeedbackCaptureContext = createContext<{
  screenshot?: FeedbackScreenshot;
  captureFailed: boolean;
  context?: DiagnosticFeedbackContext;
} | null>(null);

const FeedbackActionsContext = createContext<{
  openFeedback: (context: FeedbackContextInput) => Promise<void>;
  registerSource: (route: string, read: () => FeedbackContextInput) => () => void;
} | null>(null);

/** App-wide capture owns temporary pixels; the feedback page owns editing and submission. */
export function FeedbackCaptureProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const { prepareForNavigation, canNavigate } = useOverlayNavigation();
  const pathname = usePathname();
  const captureScreenshot = canCaptureFeedbackRoute(pathname);
  const consentPending = usePrivacyConsentPending();
  const [isShakeEnabled] = usePreference('app.feedback.shake_enabled');
  const [screenshot, setScreenshot] = useState<FeedbackScreenshot>();
  const [captureFailed, setCaptureFailed] = useState(false);
  const [context, setContext] = useState<DiagnosticFeedbackContext>();
  const source = useRef<{ route: string; read: () => FeedbackContextInput }>(undefined);
  const handoff = useRef<FeedbackHandoff>(undefined);
  const latest = useRef({ pathname, router, prepareForNavigation, canNavigate });
  useLayoutEffect(() => {
    latest.current = { pathname, router, prepareForNavigation, canNavigate };
  });
  const owned = useRef<FeedbackScreenshot>(undefined);
  const clearScreenshot = useCallback(() => {
    if (owned.current) removeFeedbackScreenshot(owned.current);
    owned.current = undefined;
    setScreenshot(undefined);
    setCaptureFailed(false);
  }, []);
  const clearContext = useCallback(() => setContext(undefined), []);
  const registerSource = useCallback((route: string, read: () => FeedbackContextInput) => {
    const registered = { route, read };
    source.current = registered;
    return () => {
      if (source.current === registered) source.current = undefined;
    };
  }, []);

  const openFeedback = useCallback(
    async (input: FeedbackContextInput) => {
      const current = latest.current;
      if (
        handoff.current ||
        current.pathname === '/settings/about/feedback/new' ||
        AppState.currentState !== 'active' ||
        !current.canNavigate()
      )
        return;
      const controller = new AbortController();
      const captured: DiagnosticFeedbackContext = {
        ...input,
        entry: 'error',
        capturedAt: new Date().toISOString(),
      };
      const pending: FeedbackHandoff = { context: captured, controller, navigated: false };
      handoff.current = pending;
      try {
        const ready = await current.prepareForNavigation(controller.signal);
        if (
          !ready ||
          controller.signal.aborted ||
          current.pathname !== latest.current.pathname ||
          AppState.currentState !== 'active'
        )
          return;
        clearScreenshot();
        setContext(captured);
        current.router.push('/settings/about/feedback/new');
        pending.navigated = true;
      } catch (error) {
        logger.warn('Failed to open feedback', { error });
      } finally {
        if (handoff.current === pending && !pending.navigated) handoff.current = undefined;
      }
    },
    [clearScreenshot],
  );

  useEffect(() => {
    const route = pathname;
    return () => {
      handoff.current?.controller?.abort();
      handoff.current = undefined;
      if (
        route === '/settings/about/feedback/new' ||
        latest.current.pathname !== '/settings/about/feedback/new'
      ) {
        clearScreenshot();
        clearContext();
      }
    };
  }, [pathname, clearScreenshot, clearContext]);

  useEffect(
    () => () => {
      if (owned.current) removeFeedbackScreenshot(owned.current);
      handoff.current?.controller?.abort();
    },
    [],
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') handoff.current?.controller?.abort();
    });
    return () => subscription.remove();
  }, []);

  useShakeFeedback({
    enabled:
      isShakeEnabled &&
      !consentPending &&
      pathname !== '/settings/about/feedback/new' &&
      !pathname.startsWith('/onboarding'),
    route: pathname,
    prepareForNavigation,
    canStart: () => !handoff.current && canNavigate(),
    captureScreenshot,
    onCaptureStarted: () => {
      const input =
        source.current?.route === pathname
          ? source.current.read()
          : { feature: feedbackFeatureForRoute(pathname) };
      const pending: FeedbackHandoff = {
        context: { ...input, entry: 'shake', capturedAt: new Date().toISOString() },
        navigated: false,
      };
      handoff.current = pending;
      return () => {
        if (handoff.current === pending && !pending.navigated) handoff.current = undefined;
      };
    },
    onCaptured: (image) => {
      clearScreenshot();
      owned.current = image;
      setScreenshot(image);
      setCaptureFailed(captureScreenshot && !image);
      setContext(handoff.current?.context);
      router.push('/settings/about/feedback/new');
      if (handoff.current) handoff.current.navigated = true;
    },
  });

  const value = useMemo(
    () => ({ screenshot, captureFailed, context }),
    [screenshot, captureFailed, context],
  );
  const actions = useMemo(() => ({ openFeedback, registerSource }), [openFeedback, registerSource]);
  return (
    <FeedbackActionsContext value={actions}>
      <FeedbackCaptureContext value={value}>{children}</FeedbackCaptureContext>
    </FeedbackActionsContext>
  );
}

export function useFeedbackActions() {
  const value = use(FeedbackActionsContext);
  if (!value) throw new Error('FeedbackCaptureProvider is missing');
  return value;
}

export function useFeedbackCapture() {
  const value = use(FeedbackCaptureContext);
  if (!value) throw new Error('FeedbackCaptureProvider is missing');
  return value;
}
