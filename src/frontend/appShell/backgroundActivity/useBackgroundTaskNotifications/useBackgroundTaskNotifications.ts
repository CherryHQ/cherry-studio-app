import type { BackgroundTaskLink } from '@/shared/backgroundActivity/taskLink';

import { useVisibleBackgroundTask } from './useVisibleBackgroundTask';

/**
 * iOS has no local task notifications: a Live Activity owns its own
 * presentation and is retired by the backend once its task becomes visible.
 */
export function useBackgroundTaskNotifications(
  task: BackgroundTaskLink | undefined,
  enabled = true,
): void {
  useVisibleBackgroundTask(task, enabled);
}
