import type { LiveActivityDismissalPolicy, LiveActivityFactory } from 'expo-widgets';

import {
  BACKGROUND_ACTIVITY_LINGER_MS,
  type BackgroundActivityBaseProps,
} from '@/shared/backgroundActivity/types';

import { fitLiveActivityProps } from './liveActivityPayload';
import { type BackgroundActivityPresenter, noopBackgroundActivityPresenter } from './presenter';

/**
 * Wraps a feature-registered expo-widgets Live Activity factory as a presenter.
 * The factory arrives through composition; platforms whose activity module
 * resolves to `undefined` fall back to the no-op presenter.
 */
export function createLiveActivityPresenter<Props extends BackgroundActivityBaseProps & object>(
  factory: LiveActivityFactory<Props> | undefined,
): BackgroundActivityPresenter<Props> {
  if (!factory) return noopBackgroundActivityPresenter();

  return {
    // A Live Activity speaks for the time the user cannot see the app; ActivityKit
    // also refuses to create one from the background, so the manager's hidden
    // window (the app resigning active) is the only moment it can be requested.
    presentWhile: 'app-hidden',
    shouldHoldLeaseUntilDelivery: false,
    clearOrphans: async () => {
      const activities = factory.getInstances();
      await Promise.all(activities.map((activity) => activity.end('immediate')));
      return activities.length;
    },
    start: (props, deepLinkUrl) => {
      // expo-widgets prunes ended native handles only when enumerating instances.
      // Sweep before each start so a long-lived factory cannot accumulate them.
      factory.getInstances();
      const activity = factory.start(fitLiveActivityProps(props, deepLinkUrl), deepLinkUrl);
      return {
        // Check before retiring/recreating a surface so a user-dismissed task
        // stays dismissed. The factory exposes active and stale instances only.
        isActive: () =>
          factory.getInstances().some((current) => current.getId() === activity.getId()),
        // An ended activity stays on the Lock Screen until its dismissal date.
        // Ending it again retires it as soon as the user has seen the result.
        dismiss: () => activity.end('immediate'),
        end: async (policy, endProps) => {
          const finishedAt = endProps.finishedAtEpochMs ?? Date.now();
          // `default` would leave a settled reply on the Lock Screen for up to
          // four hours, and a dead process could no longer retire it. The
          // library's `after()` helper builds this value, but importing it
          // would resolve the native module on every platform.
          const dismissal: LiveActivityDismissalPolicy =
            policy === 'immediate'
              ? 'immediate'
              : { after: new Date(finishedAt + BACKGROUND_ACTIVITY_LINGER_MS) };
          let boundedProps: typeof endProps;
          try {
            boundedProps = fitLiveActivityProps(endProps, deepLinkUrl);
          } catch (error) {
            // Invalid final metadata must not leave a running card behind.
            await activity.end('immediate');
            throw error;
          }
          return activity.end(dismissal, boundedProps, new Date(finishedAt));
        },
        update: async (updateProps) =>
          activity.update(fitLiveActivityProps(updateProps, deepLinkUrl)),
      };
    },
  };
}
