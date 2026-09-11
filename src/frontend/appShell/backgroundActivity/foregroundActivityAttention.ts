import type { ForegroundActivityAttention } from '@/shared/backgroundActivity/attention';
import {
  type BackgroundTaskLink,
  isSameBackgroundTask,
} from '@/shared/backgroundActivity/taskLink';

type AttentionListener = (attention: ForegroundActivityAttention) => void;
const listeners = new Set<AttentionListener>();
let visibleTask: BackgroundTaskLink | undefined;

/** Only a focused, foreground task surface registers itself as visible. */
export function registerVisibleBackgroundTask(task: BackgroundTaskLink): () => void {
  visibleTask = task;
  return () => {
    if (visibleTask === task) visibleTask = undefined;
  };
}

export function isBackgroundTaskVisible(task: BackgroundTaskLink | undefined): boolean {
  return isSameBackgroundTask(visibleTask, task);
}

/** Bootstrap injects this presentation port; backend code never imports the app shell. */
export function publishForegroundActivityAttention(attention: ForegroundActivityAttention): void {
  for (const listener of listeners) listener(attention);
}

export function subscribeForegroundActivityAttention(listener: AttentionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
