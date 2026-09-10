import { createMCPClient, type MCPClient, type MCPClientConfig } from '@ai-sdk/mcp';
import { fetch as expoFetch } from 'expo/fetch';
import * as z from 'zod';

import { pluginAuthorizationService } from '@/backend/data/services/PluginAuthorizationService';
import { PluginError } from '@/shared/contracts/plugins';
import type { PluginId } from '@/shared/data/types/plugin';

const CONNECTION_TIMEOUT_MS = 15_000;
type HttpTransportConfig = Extract<MCPClientConfig['transport'], { type: 'http' | 'sse' }>;

// Admission only: names, schemas, descriptions and execution come from the official server.
// Adding an upstream tool does not automatically grant it to existing Agents.
const CONNECTIONS = {
  github: {
    url: 'https://api.githubcopilot.com/mcp/',
    tools: {
      get_me: 'read',
      search_repositories: 'read',
      search_issues: 'read',
      search_pull_requests: 'read',
      get_file_contents: 'read',
      list_pull_requests: 'read',
      issue_read: 'read',
      pull_request_read: 'read',
      issue_write: 'write',
      add_issue_comment: 'write',
      create_pull_request: 'write',
    },
  },
  amap: {
    url: 'https://mcp.amap.com/mcp',
    tools: {
      maps_text_search: 'read',
      maps_around_search: 'read',
      maps_geo: 'read',
      maps_regeocode: 'read',
      maps_direction_driving: 'read',
      maps_direction_walking: 'read',
      maps_direction_transit_integrated: 'read',
      maps_weather: 'read',
    },
  },
} as const;

export function isBuiltInMcpToolAllowed(pluginId: PluginId, name: string): boolean {
  return Object.hasOwn(CONNECTIONS[pluginId].tools, name);
}

/** Bind a pooled client to one durable grant, rechecking it before every network request. */
export function createBuiltInMcpClient(
  pluginId: PluginId,
  authorizationId: string,
  signal: AbortSignal,
): Promise<MCPClient> {
  return createClient(
    pluginId,
    async () =>
      (await pluginAuthorizationService.getCredentialGrant(pluginId, authorizationId)).credential,
    signal,
  );
}

function createClient(
  pluginId: PluginId,
  getCredential: () => Promise<string>,
  signal: AbortSignal,
): Promise<MCPClient> {
  const connection = CONNECTIONS[pluginId];
  const fetch: NonNullable<HttpTransportConfig['fetch']> = async (input, init) => {
    let isWrite = false;
    try {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.href !== connection.url) {
        throw new PluginError('request', 'The plugin request target is not allowed.');
      }
      if (typeof init?.body === 'string') {
        const message = JSON.parse(init.body);
        if (message.method === 'tools/call') {
          const name = message.params?.name;
          if (typeof name !== 'string' || !isBuiltInMcpToolAllowed(pluginId, name)) {
            throw new PluginError('access', 'The plugin tool is not admitted.');
          }
          isWrite = (connection.tools as Record<string, string>)[name] === 'write';
        }
      }
      init?.signal?.throwIfAborted();
      const credential = await getCredential().catch(() => {
        throw new PluginError('authorization', 'The plugin authorization is no longer available.');
      });
      init?.signal?.throwIfAborted();
      const headers = new Headers(init?.headers);
      if (pluginId === 'github') {
        headers.set('Authorization', `Bearer ${credential}`);
        headers.set('X-MCP-Tools', Object.keys(connection.tools).join(','));
      } else {
        // Keep the credential out of the SDK endpoint, persistence and diagnostics.
        url.searchParams.set('key', credential);
      }
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
          throw unknownWriteError();
        }
        throw new PluginError('request', 'The official MCP request failed.');
      }
      return response;
    } catch (error) {
      if (init?.signal?.aborted) {
        throw new PluginError('cancelled', 'The plugin request was cancelled.');
      }
      if (error instanceof PluginError) throw error;
      if (isWrite) throw unknownWriteError();
      throw new PluginError('network', 'Could not reach the official MCP service.');
    }
  };
  return createMCPClient({
    clientName: 'Cherry Studio',
    initializationOptions: { signal },
    maxRetries: 0,
    // No authProvider: a 401 must not replay a possibly committed write.
    transport: { type: 'http', url: connection.url, fetch, redirect: 'error' },
  });
}

function unknownWriteError(): PluginError {
  return new PluginError(
    'unknown-write',
    'The GitHub write outcome is unknown. Check GitHub before retrying.',
  );
}

/** Verify a new credential through a read-only official tool before committing it. */
export async function validatePluginCredential(
  pluginId: PluginId,
  credential: string,
  signal?: AbortSignal,
): Promise<string> {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), CONNECTION_TIMEOUT_MS);
  const operationSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  let client: MCPClient | undefined;
  try {
    operationSignal.throwIfAborted();
    client = await createClient(pluginId, async () => credential, operationSignal);
    const name = pluginId === 'github' ? 'get_me' : 'maps_weather';
    const cursors = new Set<string>();
    let cursor: string | undefined;
    while (true) {
      const page = await client.listTools({
        options: { signal: operationSignal },
        ...(cursor ? { params: { cursor } } : {}),
      });
      const definition = page.tools.find((tool) => tool.name === name);
      if (definition) {
        const tool = client.toolsFromDefinitions({ tools: [definition] })[name];
        const output = await tool!.execute(pluginId === 'github' ? {} : { city: '110000' }, {
          abortSignal: operationSignal,
          messages: [],
          toolCallId: 'plugin-authorization',
        });
        const result = z
          .object({
            isError: z.boolean().optional(),
            structuredContent: z.unknown().optional(),
            content: z
              .array(z.object({ type: z.string(), text: z.string().optional() }))
              .optional(),
          })
          .parse(output);
        if (result.isError) {
          throw new PluginError(
            'request',
            'Credential validation failed. Check service access and quota.',
          );
        }
        const text = result.content?.find((item) => item.type === 'text')?.text;
        const value = result.structuredContent ?? (text ? JSON.parse(text) : undefined);
        operationSignal.throwIfAborted();
        if (pluginId === 'github')
          return z.object({ login: z.string().min(1).max(100) }).parse(value).login;
        z.object({ forecasts: z.array(z.unknown()).min(1) }).parse(value);
        return 'Web Service';
      }
      if (!page.nextCursor || cursors.has(page.nextCursor)) {
        throw new PluginError('request', 'The official MCP validation tool is unavailable.');
      }
      cursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
  } catch (error) {
    if (signal?.aborted) throw new PluginError('cancelled', 'Plugin connection cancelled.');
    if (deadline.signal.aborted) throw new PluginError('network', 'Plugin connection timed out.');
    if (error instanceof PluginError) throw error;
    throw new PluginError('request', 'Could not validate the official MCP connection.');
  } finally {
    clearTimeout(timer);
    await client?.close().catch(() => undefined);
  }
}
