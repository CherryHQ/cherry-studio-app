import {
  Client,
  type FetchLike,
  ProtocolError,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';

import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClient, PluginClientContext } from '../pluginDefinition';

const CONNECTION_TIMEOUT_MS = 15_000;

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
  // The SDK settles a cut-off call without our fetch error, so the call records its own submission.
  const pendingCalls: { name: string; submitted: boolean }[] = [];
  const fetch: FetchLike = async (input, init) => {
    let toolName: string | undefined;
    let isWrite = false;
    let submitted = false;
    try {
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
          toolName = name;
          isWrite = context.tools[name] === 'write';
        }
      }
      init?.signal?.throwIfAborted();
      const credential = await context
        .getCredential(init?.signal ?? undefined)
        .catch((error: unknown) => {
          if (error instanceof PluginError) throw error;
          throw new PluginError(
            'authorization',
            'The plugin authorization is no longer available.',
          );
        });
      init?.signal?.throwIfAborted();
      const headers = new Headers(init?.headers);
      await context.authorization.apply(credential, {
        url,
        headers,
        signal: init?.signal ?? undefined,
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
      init?.signal?.throwIfAborted();
      submitted = true;
      const call = pendingCalls.find((entry) => entry.name === toolName && !entry.submitted);
      if (call) call.submitted = true;
      const response = await expoFetch(url.href, {
        ...init,
        headers,
        redirect: 'error',
        signal: init?.signal ?? AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      });
      try {
        await connection.inspectResponse?.(response, init?.signal ?? undefined);
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
      if (init?.signal?.aborted) {
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
  await withPluginError(() =>
    client.connect(transport, { signal: context.signal, timeout: CONNECTION_TIMEOUT_MS }),
  );
  const serverInfo = client.getServerVersion();
  if (!serverInfo) {
    await client.close();
    throw new PluginError('unavailable', 'The official MCP service did not return its identity.');
  }
  return {
    serverInfo,
    // One raw page per call: plugin discovery owns pagination and its cursor checks.
    listTools: (input) =>
      withPluginError(() =>
        client.request(
          { method: 'tools/list', params: input?.params },
          { signal: input?.options?.signal },
        ),
      ),
    async callTool({ name, args, options }) {
      const call = { name, submitted: false };
      pendingCalls.push(call);
      try {
        return await withPluginError(() =>
          client.callTool({ name, arguments: args }, { signal: options?.abortSignal }),
        );
      } catch (error) {
        if (error instanceof PluginError || ProtocolError.isInstance(error)) throw error;
        // Cancelling or closing does not stop a write the service may already have committed.
        if (call.submitted && context.tools[name] === 'write') {
          throw unknownWriteError(context.pluginId);
        }
        if (options?.abortSignal?.aborted) {
          throw new PluginError('cancelled', 'The plugin request was cancelled.');
        }
        throw error;
      } finally {
        pendingCalls.splice(pendingCalls.indexOf(call), 1);
      }
    },
    close: () => client.close(),
  };
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
