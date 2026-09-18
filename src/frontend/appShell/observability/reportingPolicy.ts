import Constants from 'expo-constants';

import services from './reportingServices.json';

export type ReportingService = keyof typeof services;

/** Runtime eligibility only; native binary gates and Sentry consent remain authoritative. */
export function getReportingPolicy(service: ReportingService) {
  const config = Constants.expoConfig?.extra?.reporting;
  const environment = typeof config?.environment === 'string' ? config.environment : 'unknown';
  const reason = __DEV__
    ? 'development'
    : process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true'
      ? 'storybook'
      : environment !== 'production'
        ? 'non-production'
        : !services[service].enabled || config?.services?.[service] !== true
          ? 'disabled'
          : null;

  return { environment, enabled: reason === null, reason };
}
