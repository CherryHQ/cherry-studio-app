import * as Sentry from '@sentry/react-native';
import type { ComponentType } from 'react';

import { observe } from './configureObserve';

/** Preserve first-render timing above app providers and Sentry's React error boundary. */
export function wrapReportingRoot<P extends Record<string, unknown>>(component: ComponentType<P>) {
  return Sentry.wrap(observe ? observe.ObserveRoot.wrap(component) : component);
}
