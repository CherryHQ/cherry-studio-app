import { resolveScheme } from 'expo-linking';

import type { ForegroundActivityAttention } from '@/shared/backgroundActivity/attention';
import {
  type BackgroundTaskLink,
  createBackgroundTaskUrl,
  isSameBackgroundTask,
} from '@/shared/backgroundActivity/taskLink';

type AttentionListener = (attention: ForegroundActivityAttention) => void;
type VisibleTaskListener = (deepLinkUrl: string | undefined) => void;
const listeners = new Set<AttentionListener>();
const visibleTaskListeners = new Set<VisibleTaskListener>();
let visibleTask: BackgroundTaskLink | undefined;

/** Only a focused, foreground task surface registers itself as visible. */
export function registerVisibleBackgroundTask(task: BackgroundTaskLink): () => void {
  visibleTask = task;
  publishVisibleTask();
  return () => {
    if (visibleTask !== task) return;
    visibleTask = undefined;
    publishVisibleTask();
  };
}

export function isBackgroundTaskVisible(task: BackgroundTaskLink | undefined): boolean {
  return isSameBackgroundTask(visibleTask, task);
}

/**
 * Bootstrap injects this port so background surfaces can retire what the user
 * has already seen. The deep link is the identity both sides already share.
 */
export function subscribeVisibleBackgroundTask(listener: VisibleTaskListener): () => void {
  visibleTaskListeners.add(listener);
  return () => {
    visibleTaskListeners.delete(listener);
  };
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

function publishVisibleTask(): void {
  if (visibleTaskListeners.size === 0) return;
  const deepLinkUrl = visibleTask
    ? createBackgroundTaskUrl(resolveScheme({}), visibleTask)
    : undefined;
  for (const listener of visibleTaskListeners) listener(deepLinkUrl);
}
