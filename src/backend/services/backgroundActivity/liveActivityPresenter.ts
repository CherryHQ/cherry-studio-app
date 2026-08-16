import type { LiveActivityFactory } from 'expo-widgets';

import type { BackgroundActivityBaseProps } from '@/shared/backgroundActivity/types';

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
    clearOrphans: async () => {
      const activities = factory.getInstances();
      await Promise.all(activities.map((activity) => activity.end('immediate')));
      return activities.length;
    },
    start: (props, deepLinkUrl) => {
      const activity = factory.start(props, deepLinkUrl);
      return {
        end: (policy, endProps) =>
          activity.end(policy, endProps, new Date(endProps.finishedAtEpochMs ?? Date.now())),
        update: (updateProps) => activity.update(updateProps),
      };
    },
  };
}
