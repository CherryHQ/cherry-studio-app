import { createMCPClient, type MCPClient, type MCPClientConfig } from '@ai-sdk/mcp';
import { fetch as expoFetch } from 'expo/fetch';

import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClientContext } from './pluginDefinition';

const CONNECTION_TIMEOUT_MS = 15_000;
type HttpTransportConfig = Extract<MCPClientConfig['transport'], { type: 'http' | 'sse' }>;

type OfficialMcpConnection = {
  readonly url: string;
  readonly authorization: {
    apply(
      credential: string,
      request: { url: URL; headers: Headers; signal?: AbortSignal },
    ): void | Promise<void>;
    invalidate?(): void;
  };
};

/** Shared fixed-endpoint HTTP mechanics; platform authorization belongs to the plugin. */
export function createOfficialMcpClient(
  context: PluginClientContext,
  connection: OfficialMcpConnection,
): Promise<MCPClient> {
  const endpoint = new URL(connection.url);
  const fetch: NonNullable<HttpTransportConfig['fetch']> = async (input, init) => {
    let isWrite = false;
    let submitted = false;
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
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
      init?.signal?.throwIfAborted();
      const credential = await context.getCredential().catch(() => {
        throw new PluginError('authorization', 'The plugin authorization is no longer available.');
      });
      init?.signal?.throwIfAborted();
      const headers = new Headers(init?.headers);
      await connection.authorization.apply(credential, {
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
      const currentCredential = await context.getCredential().catch(() => undefined);
      if (currentCredential !== credential) {
        connection.authorization.invalidate?.();
        throw new PluginError('authorization', 'The plugin authorization is no longer available.');
      }
      init?.signal?.throwIfAborted();
      submitted = true;
      const response = await expoFetch(url.href, {
        ...init,
        headers,
        redirect: 'error',
        signal: init?.signal ?? AbortSignal.timeout(CONNECTION_TIMEOUT_MS),
      });
      // Optional inbound SSE and session cleanup may be unsupported by the server.
      if (!response.ok && !(init?.method === 'GET' && response.status === 405)) {
        void response.body?.cancel().catch(() => undefined);
        if (response.status === 401) {
          connection.authorization.invalidate?.();
          throw new PluginError(
            'authorization',
            'The official MCP service rejected the credential.',
          );
        }
        if (response.status === 403) {
          throw new PluginError('access', 'The official MCP service denied access.');
        }
        if (response.status === 429) {
          throw new PluginError('quota', 'The official MCP service rate limit was reached.');
        }
        if (isWrite && (response.status === 408 || response.status >= 500)) {
          throw unknownWriteError(context.pluginId);
        }
        throw new PluginError('request', 'The official MCP request failed.');
      }
      return response;
    } catch (error) {
      if (init?.signal?.aborted) {
        throw new PluginError('cancelled', 'The plugin request was cancelled.');
      }
      if (error instanceof PluginError) throw error;
      if (isWrite && submitted) throw unknownWriteError(context.pluginId);
      throw new PluginError('network', 'Could not reach the official MCP service.');
    }
  };
  return createMCPClient({
    clientName: 'Cherry Studio',
    initializationOptions: { signal: context.signal },
    maxRetries: 0,
    // No authProvider: a 401 must not replay a possibly committed write.
    transport: { type: 'http', url: connection.url, fetch, redirect: 'error' },
  });
}

function unknownWriteError(pluginId: string): PluginError {
  return new PluginError(
    'unknown-write',
    `The ${pluginId} write outcome is unknown. Check the service before retrying.`,
  );
}
