import type { BackgroundTaskLink } from '@/shared/backgroundActivity/taskLink';

import { useVisibleBackgroundTask } from './useVisibleBackgroundTask';

/**
 * Reports the focused task surface. The backend owns every task card and notice and retires them
 * once their task becomes visible, on both platforms.
 */
export function useBackgroundTaskNotifications(
  task: BackgroundTaskLink | undefined,
  enabled = true,
): void {
  useVisibleBackgroundTask(task, enabled);
}
