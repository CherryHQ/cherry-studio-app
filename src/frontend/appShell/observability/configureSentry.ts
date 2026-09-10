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
    // Console arguments and request URLs can contain chat data or provider credentials.
    integrations: [Sentry.breadcrumbsIntegration({ console: false, fetch: false, xhr: false })],
  });
}
