import type { BackgroundTaskLink } from '@/shared/backgroundActivity/taskLink';

/** iOS Live Activities retain their own presentation lifecycle. */
export function useBackgroundTaskNotifications(
  _task: BackgroundTaskLink | undefined,
  _enabled = true,
): void {}
