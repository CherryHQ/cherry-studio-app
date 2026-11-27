import type { useApiClient } from '@/frontend/data';
import { collectToolCitationSources, type CitationSource } from '@/frontend/utils/messageCitations';
import type { AgentMessageView } from '@/shared/contracts/agent';
import type {
  AgentSessionMessagePage,
  ListAgentSessionMessagesQueryParams,
} from '@/shared/data/api/schemas/agentSessionMessages';

import { toAgentMessageListItem } from './agentMessageProjection';

const MAX_CITATION_SCAN_PAGES = 25;
const MAX_CACHED_PAGES = 200;

type CitationMessagesClient = Pick<ReturnType<typeof useApiClient>, 'get'>;

type CachedCitationPage = {
  entries: readonly { id: string; sources: readonly CitationSource[] }[];
  nextCursor?: string;
};

type InFlightPage = {
  controller: AbortController;
  promise: Promise<CachedCitationPage>;
  waiters: Set<symbol>;
};

function toAbortError(signal: AbortSignal): unknown {
  try {
    signal.throwIfAborted();
  } catch (error) {
    return error;
  }
  return Object.assign(new Error('Aborted'), { name: 'AbortError' });
}

function summarizePage(page: AgentSessionMessagePage): CachedCitationPage {
  return {
    entries: page.items.map((message) => ({
      id: message.id,
      sources: collectToolCitationSources(toAgentMessageListItem(message)?.data.parts ?? []),
    })),
    nextCursor: page.nextCursor,
  };
}

/**
 * Resolves earlier citation sources for one session with bounded page scans,
 * settled-page caching, and in-flight deduplication across concurrent readers.
 */
export function createLocalCitationReader(
  apiClient: CitationMessagesClient,
  sessionId: string,
): (
  messageId: string,
  ids: readonly string[],
  signal: AbortSignal,
  liveMessages?: readonly AgentMessageView[],
) => Promise<CitationSource[]> {
  const pageCache = new Map<string, CachedCitationPage>();
  const inFlight = new Map<string, InFlightPage>();

  const rememberPage = (cacheKey: string, page: CachedCitationPage) => {
    if (pageCache.has(cacheKey)) pageCache.delete(cacheKey);
    else if (pageCache.size >= MAX_CACHED_PAGES) {
      const oldest = pageCache.keys().next().value;
      if (oldest !== undefined) pageCache.delete(oldest);
    }
    pageCache.set(cacheKey, page);
  };

  const fetchPage = async (
    query: ListAgentSessionMessagesQueryParams,
    cacheKey: string | undefined,
    inFlightKey: string,
    signal: AbortSignal,
  ): Promise<CachedCitationPage> => {
    signal.throwIfAborted();
    if (cacheKey) {
      const cached = pageCache.get(cacheKey);
      if (cached) {
        rememberPage(cacheKey, cached);
        return cached;
      }
    }

    let entry = inFlight.get(inFlightKey);
    if (!entry) {
      const controller = new AbortController();
      const created: InFlightPage = {
        controller,
        waiters: new Set(),
        promise: apiClient
          .get(`/agent-sessions/${sessionId}/messages`, {
            query: { ...query, limit: 200 },
            signal: controller.signal,
          })
          .then((page) => {
            const summarized = summarizePage(page);
            if (cacheKey) rememberPage(cacheKey, summarized);
            return summarized;
          })
          .finally(() => {
            if (inFlight.get(inFlightKey) === created) inFlight.delete(inFlightKey);
          }),
      };
      inFlight.set(inFlightKey, created);
      entry = created;
    }

    const waiter = Symbol();
    entry.waiters.add(waiter);
    return new Promise<CachedCitationPage>((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        entry.waiters.delete(waiter);
        if (entry.waiters.size === 0) {
          entry.controller.abort(signal.reason);
        }
        reject(toAbortError(signal));
      };
      signal.addEventListener('abort', onAbort, { once: true });

      entry.promise.then(
        (page) => {
          signal.removeEventListener('abort', onAbort);
          entry.waiters.delete(waiter);
          if (settled) return;
          settled = true;
          if (signal.aborted) {
            reject(toAbortError(signal));
            return;
          }
          resolve(page);
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          entry.waiters.delete(waiter);
          if (settled) return;
          settled = true;
          reject(signal.aborted ? toAbortError(signal) : error);
        },
      );
    });
  };

  return async (messageId, ids, signal, liveMessages = []) => {
    signal.throwIfAborted();
    const missing = new Set(ids);
    if (!missing.size) return [];
    const sources: CitationSource[] = [];
    let before = liveMessages.some(
      (message) => message.id === messageId && message.status === 'streaming',
    );
    let query: ListAgentSessionMessagesQueryParams = before
      ? {}
      : { aroundMessageId: messageId, aroundMode: 'exact' };
    let cacheKey: string | undefined = before ? undefined : `around:${messageId}`;
    let inFlightKey = cacheKey ?? 'head';
    const visited = new Set<string>();

    for (let scanned = 0; missing.size && scanned < MAX_CITATION_SCAN_PAGES; scanned++) {
      const page = await fetchPage(query, cacheKey, inFlightKey, signal);
      signal.throwIfAborted();
      for (const entry of page.entries) {
        if (entry.id === messageId) {
          before = true;
          continue;
        }
        if (!before) continue;
        for (const source of entry.sources) {
          if (missing.delete(source.id)) sources.push(source);
        }
        if (!missing.size) break;
      }
      if (!page.nextCursor || visited.has(page.nextCursor)) break;
      visited.add(page.nextCursor);
      query = { cursor: page.nextCursor, direction: 'older' };
      cacheKey = `cursor:${page.nextCursor}`;
      inFlightKey = cacheKey;
    }

    return sources;
  };
}
