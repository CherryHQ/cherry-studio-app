import type { Href } from 'expo-router';

import { parseBackgroundTaskUrl } from '@/shared/backgroundActivity/taskLink';

/** Maps a task link to the route that owns it; anything else opens nothing. */
export function backgroundActivityHref(url: unknown, scheme: string): Href | undefined {
  const link = parseBackgroundTaskUrl(url, scheme);
  switch (link?.kind) {
    case 'chat':
      return { pathname: '/', params: { agentId: link.agentId, sessionId: link.sessionId } };
    case 'painting':
      return { pathname: '/paintings/[paintingId]', params: { paintingId: link.paintingId } };
    default:
      return undefined;
  }
}
