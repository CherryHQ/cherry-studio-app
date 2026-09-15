import { loggerService } from '@logger';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { getCrashReporting, type CrashReportingStatus } from '../../../../modules/crash-reporting';
import { isExpectedSentryError, sanitizeSentryEvent, sentryIdentifier } from './sentryEvent';

// Bump when the displayed collection scope changes. Previous grants then stop authorizing reports.
export const SENTRY_CONSENT_VERSION = '20260915';

type SentryConsentStatus = CrashReportingStatus & { available: boolean };
type SentryRuntime = { dsn: string | undefined; environment: string; isProduction: boolean };

let status: SentryConsentStatus = { enabled: false, active: false, available: false };
const listeners = new Set<() => void>();
let nativeReporting: ReturnType<typeof getCrashReporting> = null;
let runtime: SentryRuntime = { dsn: undefined, environment: '', isProduction: false };
let removeErrorReporter: (() => void) | undefined;
let javaScriptReportingInitialized = false;
let configureGeneration = 0;

export function getSentryConsentStatus(): SentryConsentStatus {
  return status;
}

export function subscribeSentryConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publishStatus(next: SentryConsentStatus) {
  // Native may report an active SDK in any build; JavaScript only treats production as active.
  const active = runtime.isProduction && next.active;
  if (
    next.enabled === status.enabled &&
    active === status.active &&
    next.available === status.available
  )
    return;
  status = { enabled: next.enabled, active, available: next.available };
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
    if (status.active) resumeJavaScriptReporting();
  } catch (error) {
    // A failed bridge call must not reopen the JS gate after a disable request.
    if (enabled) publishStatus({ ...nativeReporting.getStatus(), available: true });
    else publishStatus({ ...status, enabled: previousEnabled, active: false });
    throw error;
  }
}

/**
 * Starts consent lookup, cache cleanup, and native SDK startup off the JS thread. The returned
 * promise settles once JavaScript reporting is configured; callers at module scope may ignore it.
 */
export function configureSentry(): Promise<void> {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const environment = Constants.expoConfig?.extra?.sentryEnvironment;
  runtime = {
    dsn,
    environment,
    isProduction: environment === 'production' && Boolean(dsn) && !__DEV__,
  };
  const generation = ++configureGeneration;

  pauseJavaScriptReporting();
  nativeReporting = null;
  publishStatus({ enabled: false, active: false, available: false });

  return Promise.resolve()
    .then(() => {
      const native = getCrashReporting();
      if (!native) return;
      return native
        .configure(dsn ?? '', runtime.isProduction, SENTRY_CONSENT_VERSION)
        .then((next) => {
          // A JS reload may have started a newer configuration while this one was pending.
          if (generation !== configureGeneration) return;
          nativeReporting = native;
          publishStatus({ ...next, available: true });
          if (status.active) resumeJavaScriptReporting();
        });
    })
    .catch(() => {
      // Missing native code, unreadable consent, or failed cache cleanup must fail closed.
    });
}

function resumeJavaScriptReporting() {
  if (javaScriptReportingInitialized) {
    const client = Sentry.getClient();
    if (client) client.getOptions().enabled = true;
  } else {
    javaScriptReportingInitialized = true;
    Sentry.init({
      dsn: runtime.dsn,
      enabled: true,
      enableNative: true,
      enableNativeCrashHandling: true,
      // CrashReporting initialized both native SDKs with their own consent and filtering callbacks.
      autoInitializeNativeSdk: false,
      environment: runtime.environment,
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
      envelope[1] = envelope[1].filter(
        ([header]) => header.type === 'event',
      ) as (typeof envelope)[1];
    });
  }

  removeErrorReporter?.();
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
