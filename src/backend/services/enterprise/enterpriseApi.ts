import {
  createHttpClient,
  type HttpInterceptor,
  type HttpRequest,
  isHttpError,
} from '@/backend/services/http';

const JSON_LIMIT_BYTES = 4 * 1024 * 1024;
const CONFIGURATION_PATH = '/configurations';
const BEARER = 'Bearer ';

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

/** The account an enterprise route authenticates as. */
export interface EnterpriseSession {
  getProductToken(): Promise<string>;
  /**
   * The server answered 401 to `token`. A private session rotates it once; any other session must
   * sign in again. Sign-in flows omit it: their errors go to the caller.
   */
  refuseProductToken?(token: string): Promise<void>;
  /** The organization refused this session; the user must sign in again. */
  reportRejected?(): void;
}

/**
 * Turns a refused session into account state; the request's own failure still reaches its caller.
 * Only a 401, or a 403 on the organization's configuration, refuses the session. A 403 elsewhere
 * denies one resource, such as a Skill package the user's role cannot download.
 */
function sessionRefusalInterceptor(session: EnterpriseSession): HttpInterceptor {
  return {
    async onError(error, request) {
      if (error.status === 401) {
        const token = request.headers?.Authorization?.slice(BEARER.length) ?? '';
        // A rotation that cannot reach the server leaves the session for the next request.
        await session.refuseProductToken?.(token).catch(() => {});
      } else if (error.status === 403 && request.path === CONFIGURATION_PATH) {
        session.reportRejected?.();
      }
      return error;
    },
  };
}

export function createEnterpriseApi(options: {
  /** Normalized service address, including any deployment API prefix. */
  baseUrl: string;
  session: EnterpriseSession;
}): EnterpriseApi {
  const { session } = options;
  const client = createHttpClient({
    baseUrl: options.baseUrl,
    timeoutMs: 30_000,
    interceptors: [sessionRefusalInterceptor(session)],
  });
  // Token reads stay outside the transport, so account errors reach callers unchanged.
  const send = async <T>(input: HttpRequest) =>
    client.request<T>({
      ...input,
      headers: { Authorization: `${BEARER}${await session.getProductToken()}` },
      credentials: 'omit',
      redirect: 'error',
    });
  const request = async <T>(input: HttpRequest) => {
    try {
      return await send<T>(input);
    } catch (error) {
      if (!session.refuseProductToken || !isHttpError(error) || error.status !== 401) throw error;
      input.signal?.throwIfAborted();
      // Replayed once after a private rotation. A refused session fails reading its token.
      return send<T>(input);
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
        path: CONFIGURATION_PATH,
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
