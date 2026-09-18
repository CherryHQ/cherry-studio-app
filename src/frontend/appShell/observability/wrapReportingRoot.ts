import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

import { getObserve } from './getObserve';

/** Preserve first-render timing above app providers and Sentry's React error boundary. */
export function wrapReportingRoot<P extends Record<string, unknown>>(component: ComponentType<P>) {
  const observe = getObserve();
  return Sentry.wrap(observe ? observe.ObserveRoot.wrap(component) : component);
}
