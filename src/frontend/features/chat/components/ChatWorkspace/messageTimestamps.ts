import type { MessageListItem } from '@/frontend/components/Message';
const MESSAGE_TIME_INTERVAL_MS = 5 * 60 * 1000;

export function getTimestampMessageIds(messages: readonly MessageListItem[]): ReadonlySet<string> {
  const ids = new Set<string>();
  let previousTimestamp: number | undefined;

  for (const message of messages) {
    if (message.role === 'system' || !message.createdAt) continue;

    const timestamp = new Date(message.createdAt).getTime();
    if (Number.isNaN(timestamp)) continue;

    if (
      previousTimestamp === undefined ||
      timestamp - previousTimestamp >= MESSAGE_TIME_INTERVAL_MS
    ) {
      ids.add(message.id);
    }
    previousTimestamp = timestamp;
  }

  return ids;
}
