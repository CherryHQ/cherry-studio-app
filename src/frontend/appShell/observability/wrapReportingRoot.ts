import * as Sentry from '@sentry/react-native';
import { ObserveRoot } from 'expo-observe';
import type { ComponentType } from 'react';

/** Preserve first-render timing above app providers and Sentry's React error boundary. */
export function wrapReportingRoot<P extends Record<string, unknown>>(component: ComponentType<P>) {
  return Sentry.wrap(ObserveRoot.wrap(component));
}
