import { loggerService } from '@logger';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { getCrashReporting, type CrashReportingStatus } from '../../../../modules/crash-reporting';
import { isExpectedSentryError, sanitizeSentryEvent, sentryIdentifier } from './sentryEvent';

// Bump when the displayed collection scope changes. Previous grants then stop authorizing reports.
export const SENTRY_CONSENT_VERSION = '20260915';

type SentryConsentStatus = CrashReportingStatus & { available: boolean };
let status: SentryConsentStatus = { enabled: false, active: false, available: false };
const listeners = new Set<() => void>();
let nativeReporting: ReturnType<typeof getCrashReporting> = null;
let removeErrorReporter: (() => void) | undefined;

export function getSentryConsentStatus(): SentryConsentStatus {
  return status;
}

export function subscribeSentryConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publishStatus(next: SentryConsentStatus) {
  if (
    next.enabled === status.enabled &&
    next.active === status.active &&
    next.available === status.available
  )
    return;
  status = next;
  listeners.forEach((listener) => listener());
}

function pauseJavaScriptReporting() {
  const client = Sentry.getClient();
  if (client) client.getOptions().enabled = false;
  removeErrorReporter?.();
  removeErrorReporter = undefined;
}

export async function setSentryConsent(enabled: boolean): Promise<void> {
  if (!nativeReporting) throw new Error('Native crash reporting is unavailable');
  const previousEnabled = status.enabled;
  if (!enabled) {
    // Close the JS gate synchronously, before crossing the native bridge or touching disk.
    pauseJavaScriptReporting();
    publishStatus({ ...status, enabled: false, active: false });
  }
  try {
    const next = await nativeReporting.setConsent(enabled);
    publishStatus({ ...next, available: true });
  } catch (error) {
    // A failed bridge call must not reopen the JS gate after a disable request.
    if (enabled) publishStatus({ ...nativeReporting.getStatus(), available: true });
    else publishStatus({ ...status, enabled: previousEnabled, active: false });
    throw error;
  }
}

export function configureSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const environment = Constants.expoConfig?.extra?.sentryEnvironment;
  const isProduction = environment === 'production' && Boolean(dsn) && !__DEV__;

  pauseJavaScriptReporting();
  publishStatus({ enabled: false, active: false, available: false });
  try {
    nativeReporting = getCrashReporting();
    if (!nativeReporting) return;
    const next = nativeReporting.configure(dsn ?? '', isProduction, SENTRY_CONSENT_VERSION);
    publishStatus({
      ...next,
      active: isProduction && next.active,
      available: true,
    });
  } catch {
    // Missing native code, unreadable consent, or failed cache cleanup must fail closed.
    nativeReporting = null;
    return;
  }
  if (!isProduction || !status.active) return;

  Sentry.init({
    dsn,
    enabled: true,
    enableNative: true,
    enableNativeCrashHandling: true,
    // CrashReporting initialized both native SDKs with their own consent and filtering callbacks.
    autoInitializeNativeSdk: false,
    environment,
    sendDefaultPii: false,
    sendClientReports: false,
    enableAutoSessionTracking: false,
    enableAutoPerformanceTracing: false,
    enableAppStartTracking: false,
    enableNativeFramesTracking: false,
    enableStallTracking: false,
    enableLogs: false,
    tracePropagationTargets: [],
    maxBreadcrumbs: 0,
    defaultIntegrations: false,
    integrations: [
      Sentry.reactNativeErrorHandlersIntegration(),
      Sentry.nativeLinkedErrorsIntegration(),
      Sentry.inboundFiltersIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.nativeReleaseIntegration(),
      Sentry.deviceContextIntegration(),
      Sentry.sdkInfoIntegration(),
      Sentry.createReactNativeRewriteFrames(),
    ],
    beforeSend: (event, hint) =>
      status.active && !isExpectedSentryError(hint.originalException)
        ? sanitizeSentryEvent(event)
        : null,
  });

  // Envelopes can carry attachments independently of beforeSend's event payload.
  Sentry.getClient()?.on('beforeEnvelope', (envelope) => {
    envelope[1] = envelope[1].filter(([header]) => header.type === 'event');
  });

  removeErrorReporter = loggerService.setErrorReporter((error, context) => {
    if (!status.active || isExpectedSentryError(error)) return;
    Sentry.captureException(error, {
      tags: {
        module: sentryIdentifier(context.module),
        operation: sentryIdentifier(context.operation),
      },
    });
  });
}
