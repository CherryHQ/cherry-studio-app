import { Observe } from 'expo-observe';

import { getReportingPolicy } from './reportingPolicy';

// Configure before screens mount: useObserve requires a stable Router integration flag.
// Local timing remains available in every build; dispatch is production-only.
export function configureObserve() {
  const policy = getReportingPolicy('observe');
  Observe.configure({
    environment: policy.environment,
    dispatchingEnabled: policy.enabled,
    dispatchInDebug: false,
    integrations: { 'expo-router': true },
  });
}
