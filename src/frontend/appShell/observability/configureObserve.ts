import { requireOptionalNativeModule } from 'expo';

import { getReportingPolicy } from './reportingPolicy';

// A non-production binary has no Observe module. Never evaluate the SDK entry in that case.
export const observe = requireOptionalNativeModule('ExpoObserve')
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native dependency
    (require('expo-observe') as typeof import('expo-observe'))
  : null;

// Configure before screens mount: useObserve requires a stable Router integration flag.
export function configureObserve() {
  if (!observe) return;
  const policy = getReportingPolicy('observe');
  observe.Observe.configure({
    environment: policy.environment,
    dispatchingEnabled: policy.enabled,
    dispatchInDebug: false,
    integrations: { 'expo-router': true },
  });
}
