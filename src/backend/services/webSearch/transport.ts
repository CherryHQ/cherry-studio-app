import { WebSearchTransportError, type WebSearchTransport } from '@cherrystudio/web-search';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { defaultAppHeaders } from '@/backend/utils/defaultAppHeaders';

export const mobileWebSearchTransport: WebSearchTransport = {
  async request(request) {
    try {
      request.signal?.throwIfAborted();
      const target = new URL(request.url);
      const client = createHttpClient({
        baseUrl: target.origin,
        headers: defaultAppHeaders(),
        statusPolicy: 'all',
      });
      const options = {
        headers: request.headers,
        path: target.pathname + target.search,
        // Provider paths can contain the search query or the complete source URL.
        logPath: '/web-search',
        responseType: 'text' as const,
        signal: request.signal,
        timeoutMs: request.timeoutMs,
      };
      const response = await client.request<string>(
        request.method === 'GET'
          ? { ...options, method: 'GET' }
          : { ...options, method: 'POST', body: request.body },
      );
      request.signal?.throwIfAborted();
      if (typeof response.data !== 'string') {
        throw new WebSearchTransportError('invalid_response', 'Expected a text response.');
      }
      return { status: response.status, headers: response.headers, bodyText: response.data };
    } catch (cause) {
      if (cause instanceof WebSearchTransportError) throw cause;
      const kind = request.signal?.aborted
        ? 'cancelled'
        : isHttpError(cause) && cause.kind !== 'http' && cause.kind !== 'internal'
          ? cause.kind
          : 'unknown';
      throw new WebSearchTransportError(kind, `Web search transport failed (${kind})`, { cause });
    }
  },
};
