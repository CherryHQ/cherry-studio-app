/**
 * Deep-link contract between background task surfaces and app routes. The
 * backend builds every task URL here; App Shell parses them here and maps the
 * result to a route. Nothing else needs to know the URL shape.
 */
export type BackgroundTaskLink =
  | { kind: 'chat'; agentId: string; sessionId: string }
  | { kind: 'painting'; paintingId: string };

const PAINTINGS_SEGMENT = 'paintings';

/** Builds the URL a task notification or Live Activity opens. */
export function createBackgroundTaskUrl(scheme: string, link: BackgroundTaskLink): string {
  switch (link.kind) {
    case 'chat':
      return `${scheme}:///?agentId=${encodeURIComponent(link.agentId)}&sessionId=${encodeURIComponent(link.sessionId)}`;
    case 'painting':
      return `${scheme}://${PAINTINGS_SEGMENT}/${encodeURIComponent(link.paintingId)}`;
  }
}

/** Reads a URL produced by `createBackgroundTaskUrl`; any other URL is `undefined`. */
export function parseBackgroundTaskUrl(
  url: unknown,
  scheme: string,
): BackgroundTaskLink | undefined {
  if (typeof url !== 'string') return undefined;
  const prefix = `${scheme}://`;
  if (!url.startsWith(prefix)) return undefined;
  const [pathPart, query] = splitOnce(url.slice(prefix.length), '?');
  const segments = pathPart.split('/').filter(Boolean);
  try {
    if (segments.length === 0) {
      const params = parseQuery(query);
      const agentId = params.get('agentId');
      const sessionId = params.get('sessionId');
      return agentId && sessionId ? { agentId, kind: 'chat', sessionId } : undefined;
    }
    if (segments.length === 2 && segments[0] === PAINTINGS_SEGMENT) {
      const paintingId = decodeURIComponent(segments[1] ?? '');
      return paintingId ? { kind: 'painting', paintingId } : undefined;
    }
  } catch {
    // Malformed percent-encoding is not one of our links.
  }
  return undefined;
}

function parseQuery(query: string): Map<string, string> {
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [key, value] = splitOnce(pair, '=');
    params.set(decodeURIComponent(key), decodeURIComponent(value));
  }
  return params;
}

function splitOnce(value: string, separator: string): [string, string] {
  const index = value.indexOf(separator);
  return index === -1 ? [value, ''] : [value.slice(0, index), value.slice(index + 1)];
}
