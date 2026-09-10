import { parse } from 'expo-linking';
import type { Href } from 'expo-router';

/** Expo parses the URL; Cherry limits task notification destinations to its own routes. */
export function backgroundActivityHref(url: unknown, scheme: string): Href | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    const link = parse(url);
    if (link.scheme !== scheme) return undefined;
    const path = [link.hostname, link.path].filter(Boolean).join('/');
    if (!path) {
      const { agentId, sessionId } = link.queryParams ?? {};
      if (typeof agentId === 'string' && agentId && typeof sessionId === 'string' && sessionId) {
        return { pathname: '/', params: { agentId, sessionId } };
      }
    }
    const [route, paintingId, extra] = path.split('/');
    if (route === 'paintings' && paintingId && extra === undefined) {
      return {
        pathname: '/paintings/[paintingId]',
        params: { paintingId: decodeURIComponent(paintingId) },
      };
    }
  } catch {
    return undefined;
  }
  return undefined;
}
