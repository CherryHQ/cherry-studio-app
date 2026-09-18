import Constants from 'expo-constants';

import services from './reportingServices.json';

/** Runtime eligibility only; native binary gates and Sentry consent remain authoritative. */
export function getReportingPolicy(service: keyof typeof services) {
  const config = Constants.expoConfig?.extra?.reporting;
  const environment = typeof config?.environment === 'string' ? config.environment : 'unknown';
  return {
    environment,
    enabled:
      !__DEV__ &&
      process.env.EXPO_PUBLIC_STORYBOOK_ENABLED !== 'true' &&
      environment === 'production' &&
      services[service].enabled &&
      config?.services?.[service] === true,
  };
}
