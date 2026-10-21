import { createHttpClient } from '@/backend/services/http';

const JSON_LIMIT_BYTES = 4 * 1024 * 1024;

/** The enterprise product API, authenticated with an Accounts Portal product token. */
export interface EnterpriseApi {
  getConfiguration(signal?: AbortSignal): Promise<unknown>;
  setupAgent(agentId: number, signal?: AbortSignal): Promise<unknown>;
  downloadLibraryItem(
    itemId: number,
    maxBytes: number,
    signal?: AbortSignal,
  ): Promise<{ data: ArrayBuffer; contentType?: string }>;
}

export function createEnterpriseApi(options: {
  /** Normalized service address, including any deployment API prefix. */
  baseUrl: string;
  getToken(): Promise<string>;
}): EnterpriseApi {
  const client = createHttpClient({ baseUrl: options.baseUrl, timeoutMs: 30_000 });
  const authorized = async (signal?: AbortSignal) => ({
    headers: { Authorization: `Bearer ${await options.getToken()}` },
    credentials: 'omit' as const,
    redirect: 'error' as const,
    signal,
  });
  return {
    async getConfiguration(signal) {
      const response = await client.request<unknown>({
        ...(await authorized(signal)),
        method: 'GET',
        path: '/configurations',
        maxResponseBytes: JSON_LIMIT_BYTES,
      });
      return response.data;
    },
    async setupAgent(agentId, signal) {
      const response = await client.request<unknown>({
        ...(await authorized(signal)),
        method: 'POST',
        path: `/agents/${agentId}/setup`,
        maxResponseBytes: JSON_LIMIT_BYTES,
      });
      return response.data;
    },
    async downloadLibraryItem(itemId, maxBytes, signal) {
      // Built locally rather than following the setup task's URL, so credentials stay on this origin.
      const response = await client.request<ArrayBuffer>({
        ...(await authorized(signal)),
        method: 'GET',
        path: `/library-items/${itemId}/download`,
        responseType: 'arraybuffer',
        maxResponseBytes: maxBytes,
      });
      return { data: response.data, contentType: response.headers['content-type'] };
    },
  };
}
