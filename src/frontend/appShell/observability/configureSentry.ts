import { loggerService } from '@logger';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { getCrashReporting, type CrashReportingStatus } from '../../../../modules/crash-reporting';
import policy from '../../../../modules/crash-reporting/reportingPolicy.json';
import {
  isExpectedSentryError,
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
  sentryIdentifier,
} from './sentryEvent';

// Bump when the displayed collection scope changes. Previous grants then stop authorizing reports.
export const SENTRY_CONSENT_VERSION = policy.consentVersion;

type SentryConsentStatus = CrashReportingStatus & { available: boolean };
type SentryRuntime = { dsn: string | undefined; environment: string; isProduction: boolean };

let status: SentryConsentStatus = { enabled: false, active: false, available: false };
const listeners = new Set<() => void>();
let nativeReporting: ReturnType<typeof getCrashReporting> = null;
let runtime: SentryRuntime = { dsn: undefined, environment: '', isProduction: false };
let removeErrorReporter: (() => void) | undefined;
let javaScriptReportingInitialized = false;
let configureGeneration = 0;

export function recordSentryBreadcrumb(code: string): void {
  if (!status.active || !policy.breadcrumbCodes.includes(code)) return;
  try {
    // RN SDK 7.11 synchronizes isolation-scope breadcrumbs to native during init.
    Sentry.addBreadcrumb({ category: 'app.diagnostic', message: code, level: 'info' });
  } catch {
    // Diagnostics must not interrupt startup or navigation.
  }
}

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
  Sentry.getCurrentScope().clearBreadcrumbs();
  Sentry.getIsolationScope().clearBreadcrumbs();
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
 * Install JS capture synchronously when native startup has already established a current grant.
 * Older clients fall back to asynchronous native configuration and remain closed until it answers.
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

  let native: ReturnType<typeof getCrashReporting>;
  try {
    native = getCrashReporting();
    if (!native) {
      return Promise.resolve();
    }
    const current = native.getStatus();
    if (current.consentVersion === SENTRY_CONSENT_VERSION && current.initialization === 'ready') {
      nativeReporting = native;
      publishStatus({ ...current, available: true });
      if (status.active) resumeJavaScriptReporting();
    }
  } catch {
    return Promise.resolve();
  }

  return Promise.resolve()
    .then(() => {
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
      if (generation !== configureGeneration) return;
      pauseJavaScriptReporting();
      publishStatus({ enabled: false, active: false, available: false });
      nativeReporting = null;
    });
}

function resumeJavaScriptReporting() {
  try {
    initializeJavaScriptReporting();
  } catch {
    pauseJavaScriptReporting();
  }
}

function initializeJavaScriptReporting() {
  if (javaScriptReportingInitialized) {
    const client = Sentry.getClient();
    if (!client) throw new Error('Sentry client unavailable');
    client.getOptions().enabled = true;
  } else {
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
      maxBreadcrumbs: policy.maxBreadcrumbs,
      beforeBreadcrumb: sanitizeSentryBreadcrumb,
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
          ? sanitizeSentryEvent(event, hint.originalException)
          : null,
    });

    const client = Sentry.getClient();
    if (!client) throw new Error('Sentry client unavailable');
    // Envelopes can carry attachments independently of beforeSend's event payload.
    client.on('beforeEnvelope', (envelope) => {
      envelope[1] = envelope[1].filter(
        ([header]) => status.active && header.type === 'event',
      ) as (typeof envelope)[1];
    });
    javaScriptReportingInitialized = true;
    recordSentryBreadcrumb('startup.javascript');
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
