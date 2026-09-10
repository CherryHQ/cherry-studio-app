import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

export function configureSentry() {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  const isEnabled = Boolean(dsn) && !__DEV__;

  Sentry.init({
    dsn,
    enabled: isEnabled,
    enableNative: isEnabled,
    environment: Constants.expoConfig?.extra?.sentryEnvironment,
    sendDefaultPii: false,
    // Also reaches the native SDKs, so iOS request URLs cannot become crash breadcrumbs.
    maxBreadcrumbs: 0,
    // Avoid instrumenting JS console and requests when breadcrumbs are disabled.
    integrations: [Sentry.breadcrumbsIntegration({ console: false, fetch: false, xhr: false })],
  });
}
