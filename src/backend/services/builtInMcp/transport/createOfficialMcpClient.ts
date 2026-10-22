import {
  Client,
  type FetchLike,
  ProtocolError,
  type RequestOptions,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';

import { linkAbortSignals } from '@/backend/utils/linkAbortSignals';
import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClient, PluginClientContext } from '../pluginDefinition';

const CONNECTION_TIMEOUT_MS = 15_000;
// Local correlation only; removed before authorization or network transmission.
const REQUEST_ID_HEADER = 'X-Cherry-Plugin-Request';

type OfficialMcpConnection = {
  readonly url: string;
  /** Provider-owned authorization challenges can appear in HTTP or JSON-RPC error envelopes. */
  readonly inspectResponse?: (response: Response, signal?: AbortSignal) => Promise<void>;
};

/** Shared fixed-endpoint HTTP mechanics; platform authorization belongs to the plugin. */
export async function createOfficialMcpClient(
  context: PluginClientContext,
  connection: OfficialMcpConnection,
): Promise<PluginClient> {
  const endpoint = new URL(connection.url);
  let nextRequestId = 0;
  const requests = new Map<string, { signal: AbortSignal; submitted: boolean }>();
  const fetch: FetchLike = async (input, init) => {
    let isWrite = false;
    let submitted = false;
    let signal = init?.signal ?? undefined;
    try {
      const headers = new Headers(init?.headers);
      const requestId = headers.get(REQUEST_ID_HEADER);
      headers.delete(REQUEST_ID_HEADER);
      const request = requestId === null ? undefined : requests.get(requestId);
      // Cancellation can settle the SDK call before its asynchronous send reaches fetch.
      if (requestId !== null && !request)
        throw new PluginError('cancelled', 'The plugin request was cancelled.');
      if (request) {
        // Legacy MCP only sends a cancellation notification; also cancel this HTTP request.
        // The request scope always aborts on completion, releasing these links and its stream.
        signal = linkAbortSignals([request.signal, ...(signal ? [signal] : [])]).signal;
      }
      const url = new URL(input);
      if (url.href !== connection.url) {
        throw new PluginError('request', 'The plugin request target is not allowed.');
      }
      if (typeof init?.body === 'string') {
        const message = JSON.parse(init.body);
        if (message.method === 'tools/call') {
          const name = message.params?.name;
          if (typeof name !== 'string' || !Object.hasOwn(context.tools, name)) {
            throw new PluginError('access', 'The plugin tool is not admitted.');
          }
          isWrite = context.tools[name] === 'write';
        }
      }
      signal?.throwIfAborted();
      const credential = await context.getCredential(signal).catch((error: unknown) => {
        if (error instanceof PluginError) throw error;
        throw new PluginError('authorization', 'The plugin authorization is no longer available.');
      });
      signal?.throwIfAborted();
      await context.authorization.apply(credential, {
        url,
        headers,
        signal,
      });
      if (
        url.origin !== endpoint.origin ||
        url.pathname !== endpoint.pathname ||
        url.username ||
        url.password ||
        url.hash
      ) {
        throw new PluginError('request', 'The plugin authorization changed the request target.');
      }
      await context.assertAuthorized().catch(() => {
        throw new PluginError('authorization', 'The plugin authorization is no longer available.');
      });
      signal?.throwIfAborted();
      submitted = true;
      if (request) request.submitted = true;
      const response = await expoFetch(url.href, {
        ...init,
        headers,
        redirect: 'error',
        signal: signal ?? AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      });
      try {
        await connection.inspectResponse?.(response, signal);
      } catch (error) {
        void response.body?.cancel().catch(() => undefined);
        throw error;
      }
      // Optional inbound SSE and session cleanup may be unsupported by the server.
      if (!response.ok && !(init?.method === 'GET' && response.status === 405)) {
        void response.body?.cancel().catch(() => undefined);
        if (response.status === 401) {
          await context.rejectCredential?.(credential).catch(() => undefined);
          throw new PluginError(
            'authorization',
            'The official MCP service rejected the credential.',
            { statusCode: response.status },
          );
        }
        if (response.status === 403) {
          throw new PluginError('access', 'The official MCP service denied access.', {
            statusCode: response.status,
          });
        }
        if (response.status === 429) {
          throw new PluginError('quota', 'The official MCP service rate limit was reached.', {
            statusCode: response.status,
          });
        }
        if (isWrite && (response.status === 408 || response.status >= 500)) {
          throw unknownWriteError(context.pluginId, response.status);
        }
        throw new PluginError('request', 'The official MCP request failed.', {
          statusCode: response.status,
        });
      }
      return response;
    } catch (error) {
      if (signal?.aborted) {
        // Closing the client also aborts a submitted write, which the service may have committed.
        throw isWrite && submitted
          ? unknownWriteError(context.pluginId)
          : new PluginError('cancelled', 'The plugin request was cancelled.');
      }
      if (error instanceof PluginError) throw error;
      if (isWrite && submitted) throw unknownWriteError(context.pluginId);
      throw new PluginError('network', 'Could not reach the official MCP service.');
    }
  };
  const client = new Client({
    name: 'Cherry Studio',
    version: Constants.expoConfig?.version ?? 'unknown',
  });
  const transport = new StreamableHTTPClientTransport(endpoint, {
    fetch,
    requestInit: { redirect: 'error' },
    // No authProvider: a 401 must not replay a possibly committed write.
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
  });
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), CONNECTION_TIMEOUT_MS);
  const connecting = linkAbortSignals([context.signal, deadline.signal]);
  let onAbort!: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(connecting.signal.reason);
    connecting.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    connecting.signal.throwIfAborted();
    // SDK connect options only bound initialize, not the following initialized notification.
    await withPluginError(() =>
      Promise.race([
        client.connect(transport, { signal: connecting.signal, timeout: CONNECTION_TIMEOUT_MS }),
        interrupted,
      ]),
    );
    connecting.signal.throwIfAborted();
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    connecting.signal.removeEventListener('abort', onAbort);
    connecting.dispose();
  }
  const serverInfo = client.getServerVersion();
  if (!serverInfo) {
    await client.close();
    throw new PluginError('unavailable', 'The official MCP service did not return its identity.');
  }
  return {
    serverInfo,
    // One raw page per call: plugin discovery owns pagination and its cursor checks.
    listTools: (input) =>
      withRequest(input?.options?.signal, (options) =>
        client.request({ method: 'tools/list', params: input?.params }, options),
      ),
    callTool: ({ name, args, options }) =>
      withRequest(
        options?.abortSignal,
        (requestOptions) => client.callTool({ name, arguments: args }, requestOptions),
        context.tools[name] === 'write',
      ),
    close: () => client.close(),
  };

  async function withRequest<TResult>(
    caller: AbortSignal | undefined,
    operation: (options: RequestOptions) => Promise<TResult>,
    isWrite = false,
  ): Promise<TResult> {
    const controller = new AbortController();
    const linked = linkAbortSignals([controller.signal, ...(caller ? [caller] : [])]);
    const requestId = String(nextRequestId++);
    const request = { signal: linked.signal, submitted: false };
    requests.set(requestId, request);
    try {
      return await withPluginError(() =>
        operation({ signal: request.signal, headers: { [REQUEST_ID_HEADER]: requestId } }),
      );
    } catch (error) {
      if (error instanceof PluginError || ProtocolError.isInstance(error)) throw error;
      if (isWrite && request.submitted) throw unknownWriteError(context.pluginId);
      if (request.signal.aborted)
        throw new PluginError('cancelled', 'The plugin request was cancelled.');
      throw error;
    } finally {
      // Also stop a delayed send after the SDK times out or rejects its result.
      controller.abort();
      linked.dispose();
      requests.delete(requestId);
    }
  }
}

/** The SDK wraps what the fetch boundary threw; plugin callers match on the original. */
async function withPluginError<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation();
  } catch (error) {
    for (let current = error, depth = 0; current instanceof Error && depth < 4; depth += 1) {
      if (current instanceof PluginError) throw current;
      current = current.cause;
    }
    throw error;
  }
}

function unknownWriteError(pluginId: string, statusCode?: number): PluginError {
  return new PluginError(
    'unknown-write',
    `The ${pluginId} write outcome is unknown. Check the service before retrying.`,
    { statusCode },
  );
}
