import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

import { observe } from './configureObserve';

/**
 * Preserve first-render timing above app providers. `Sentry.wrap` adds only its touch, profiler,
 * and feedback roots, not an error boundary; render failures are contained by `AppErrorBoundary`.
 */
export function wrapReportingRoot<P extends Record<string, unknown>>(component: ComponentType<P>) {
  return Sentry.wrap(observe ? observe.ObserveRoot.wrap(component) : component);
}
