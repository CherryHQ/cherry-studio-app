import { getObserve } from './getObserve';
import { getReportingPolicy } from './reportingPolicy';

// Configure before screens mount: useObserve requires a stable Router integration flag.
export function configureObserve() {
  const observe = getObserve();
  if (!observe) return;
  const policy = getReportingPolicy('observe');
  observe.Observe.configure({
    environment: policy.environment,
    dispatchingEnabled: policy.enabled,
    dispatchInDebug: false,
    integrations: { 'expo-router': true },
  });
}
