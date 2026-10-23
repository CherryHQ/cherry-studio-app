import { createHttpClient, type HttpRequest, isHttpError } from '@/backend/services/http';

const JSON_LIMIT_BYTES = 4 * 1024 * 1024;

/** The enterprise product API, authenticated with a cloud product or private access token. */
export interface EnterpriseApi {
  getUser(signal?: AbortSignal): Promise<unknown>;
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
  /** Refresh once after a 401. Null means this session does not support private refresh. */
  refreshToken?(rejectedToken: string): Promise<string | null>;
}): EnterpriseApi {
  const client = createHttpClient({ baseUrl: options.baseUrl, timeoutMs: 30_000 });
  const request = async <T>(input: HttpRequest) => {
    const token = await options.getToken();
    const send = (accessToken: string) =>
      client.request<T>({
        ...input,
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'omit',
        redirect: 'error',
      });
    try {
      return await send(token);
    } catch (error) {
      if (!isHttpError(error) || error.status !== 401 || input.signal?.aborted) throw error;
      const refreshed = await options.refreshToken?.(token);
      if (!refreshed) throw error;
      // Only authenticated reads and agent setup are replayed, once, after an explicit rejection.
      return send(refreshed);
    }
  };
  return {
    async getUser(signal) {
      const response = await request<unknown>({
        method: 'GET',
        path: '/users/me',
        signal,
        maxResponseBytes: JSON_LIMIT_BYTES,
      });
      return response.data;
    },
    async getConfiguration(signal) {
      const response = await request<unknown>({
        signal,
        method: 'GET',
        path: '/configurations',
        maxResponseBytes: JSON_LIMIT_BYTES,
      });
      return response.data;
    },
    async setupAgent(agentId, signal) {
      const response = await request<unknown>({
        signal,
        method: 'POST',
        path: `/agents/${agentId}/setup`,
        maxResponseBytes: JSON_LIMIT_BYTES,
      });
      return response.data;
    },
    async downloadLibraryItem(itemId, maxBytes, signal) {
      // Built locally rather than following the setup task's URL, so credentials stay on this origin.
      const response = await request<ArrayBuffer>({
        signal,
        method: 'GET',
        path: `/library-items/${itemId}/download`,
        responseType: 'arraybuffer',
        maxResponseBytes: maxBytes,
      });
      return { data: response.data, contentType: response.headers['content-type'] };
    },
  };
}
