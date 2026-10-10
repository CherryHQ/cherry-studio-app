import type { ListToolsResult } from '@ai-sdk/mcp';
import {
  Client,
  StreamableHTTPClientTransport,
  type McpSubscription,
  type Tool,
} from '@modelcontextprotocol/client';
import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';

import type { PluginClient } from '@/backend/services/builtInMcp';
import type { McpOAuthRuntime } from '@/backend/services/mcp';
import {
  McpAuthorizationError,
  type McpConnectionConfig,
  type McpProtocolInfo,
} from '@/shared/contracts/mcp';
import { normalizeMcpHeaders } from '@/shared/utils/mcpConnectionConfig';

const LEGACY_CATALOG_TTL_MS = 5 * 60 * 1000;
const MAX_CATALOG_TTL_MS = 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/** Optional protocol features do not burden the bundled, tool-only API adapters. */
export type McpRuntimeClient = Pick<
  PluginClient,
  'serverInfo' | 'listTools' | 'close' | 'discoveryWarnings'
> & {
  listResources?: Client['listResources'];
  listResourceTemplates?: Client['listResourceTemplates'];
  readResource?: Client['readResource'];
  listPrompts?: Client['listPrompts'];
  getPrompt?: Client['getPrompt'];
  readonly protocolInfo?: McpProtocolInfo;
  readonly catalogExpiresAt?: number;
  readonly needsReconnect?: boolean;
  setForeground?(active: boolean): void;
};

/** One SDK instance per connection/grant; no cache is shared across authorities. */
export async function createRemoteMcpClient(input: {
  config: McpConnectionConfig;
  signal: AbortSignal;
  foreground: boolean;
  elicit?: (
    params: unknown,
    signal: AbortSignal,
  ) => Promise<import('@/shared/contracts/mcpInteraction').McpElicitationResponse>;
  authorization: Pick<McpOAuthRuntime, 'token' | 'rejected'>;
  onToolsChanged?: () => void;
}): Promise<
  McpRuntimeClient & {
    callTool: (input: {
      name: string;
      args: Record<string, unknown>;
      options: { abortSignal: AbortSignal };
    }) => Promise<unknown>;
  }
> {
  let foreground = input.foreground;
  let closed = false;
  let legacyEventsInterrupted = false;
  let eventsAbort = new AbortController();
  let subscription: McpSubscription | undefined;
  let subscriptionPending = false;
  let subscriptionGeneration = 0;
  let catalogExpiresAt = 0;
  let interactiveRequests = 0;
  const interactive = async <T>(operation: () => Promise<T>): Promise<T> => {
    interactiveRequests += 1;
    try {
      return await operation();
    } finally {
      interactiveRequests -= 1;
    }
  };
  const connectionAbort = new AbortController();
  const tools = new Map<string, Tool>();
  const client = new Client(
    { name: 'Cherry Studio', version: Constants.expoConfig?.version ?? 'unknown' },
    {
      versionNegotiation: { mode: 'auto', probe: { maxRetries: 0, timeoutMs: 15_000 } },
      capabilities: {
        extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
        ...(input.elicit ? { elicitation: { form: {}, url: {} } } : {}),
      },
      inputRequired: { autoFulfill: Boolean(input.elicit), maxRounds: 8 },
      // Cherry owns refresh, persistence, and the immutable catalog used by each turn.
      listChanged: {
        tools: {
          autoRefresh: false,
          onChanged: () => {
            catalogExpiresAt = 0;
            if (foreground && !closed) input.onToolsChanged?.();
          },
        },
      },
    },
  );
  if (input.elicit)
    client.setRequestHandler('elicitation/create', async (request, context) =>
      interactiveRequests > 0
        ? input.elicit!(request.params, AbortSignal.any([input.signal, context.mcpReq.signal]))
        : { action: 'cancel' as const },
    );
  const transport = new StreamableHTTPClientTransport(new URL(input.config.endpointUrl), {
    requestInit: { headers: normalizeMcpHeaders(input.config.headers), redirect: 'error' },
    // Do not give the transport an authProvider: its 401 recovery can replay a write.
    onInsufficientScope: 'throw',
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
    fetch: async (url, init) => {
      if (init?.method === 'GET' && !foreground) return new Response(null, { status: 405 });
      const signal = AbortSignal.any([
        connectionAbort.signal,
        ...(init?.signal ? [init.signal] : []),
      ]);
      if (new URL(String(url)).href !== new URL(input.config.endpointUrl).href)
        throw new McpAuthorizationError('configuration');
      const token = await input.authorization.token(input.config, signal);
      const headers = new Headers(init?.headers);
      if (token) headers.set('Authorization', `Bearer ${token}`);
      const request = { ...init, headers, signal };
      let response: Response;
      if (init?.method === 'GET') {
        response = await expoFetch(url as string, {
          ...request,
          signal: AbortSignal.any([eventsAbort.signal, signal]),
        });
      } else {
        response = await expoFetch(url as string, request);
      }
      if (
        token &&
        (response.status === 401 ||
          (response.status === 403 &&
            response.headers.get('www-authenticate')?.includes('insufficient_scope')))
      ) {
        await input.authorization.rejected(input.config, token, response);
        await response.body?.cancel().catch(() => undefined);
        throw new McpAuthorizationError('reauthorize');
      }
      const method = typeof init?.body === 'string' ? JSON.parse(init.body).method : undefined;
      // Subscriptions are long-lived streams; ordinary RPC responses have a total byte budget.
      if (!response.body || init?.method === 'GET' || method === 'subscriptions/listen')
        return response;
      let bytes = 0;
      return new Response(
        response.body.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              bytes += chunk.byteLength;
              if (bytes > MAX_RESPONSE_BYTES)
                throw new Error('The MCP response exceeds the size limit.');
              controller.enqueue(chunk);
            },
          }),
        ),
        { status: response.status, statusText: response.statusText, headers: response.headers },
      );
    },
  });

  const stopSubscription = () => {
    subscriptionGeneration += 1;
    const current = subscription ?? client.autoOpenedSubscription;
    subscription = undefined;
    void current?.close().catch(() => undefined);
  };
  const startSubscription = () => {
    if (
      closed ||
      !foreground ||
      subscription ||
      subscriptionPending ||
      client.getProtocolEra() !== 'modern' ||
      !client.getServerCapabilities()?.tools?.listChanged
    )
      return;
    const generation = subscriptionGeneration;
    subscriptionPending = true;
    void client
      .listen({ toolsListChanged: true }, { timeout: 15_000 })
      .then((value) => {
        if (closed || !foreground || generation !== subscriptionGeneration) {
          void value.close().catch(() => undefined);
        } else {
          subscription = value;
          void value.closed.then(() => {
            if (subscription === value) subscription = undefined;
          });
        }
      })
      .catch(() => {
        // TTL reconciliation remains available when the server cannot keep a stream open.
      })
      .finally(() => {
        subscriptionPending = false;
        if (generation !== subscriptionGeneration && foreground && !closed) startSubscription();
      });
  };

  try {
    await client.connect(transport, { signal: input.signal, timeout: 15_000 });
    input.signal.throwIfAborted();
    subscription = client.autoOpenedSubscription;
    const opened = subscription;
    if (opened)
      void opened.closed.then(() => {
        if (subscription === opened) subscription = undefined;
      });
    if (!foreground) stopSubscription();
  } catch (error) {
    closed = true;
    connectionAbort.abort();
    eventsAbort.abort();
    await client.close().catch(() => undefined);
    throw error;
  }
  const serverInfo = client.getServerVersion();
  if (!serverInfo) {
    await client.close();
    throw new Error('The MCP server did not return its identity.');
  }
  const capabilities = client.getServerCapabilities();
  return {
    serverInfo,
    listResources: client.listResources.bind(client),
    listResourceTemplates: client.listResourceTemplates.bind(client),
    readResource: (...args) => interactive(() => client.readResource(...args)),
    listPrompts: client.listPrompts.bind(client),
    getPrompt: (...args) => interactive(() => client.getPrompt(...args)),
    protocolInfo: {
      version: transport.protocolVersion ?? '',
      tools: Boolean(capabilities?.tools),
      resources: Boolean(capabilities?.resources),
      prompts: Boolean(capabilities?.prompts),
    },
    get catalogExpiresAt() {
      return catalogExpiresAt;
    },
    get needsReconnect() {
      return foreground && legacyEventsInterrupted;
    },
    setForeground(active) {
      foreground = active;
      if (!active) {
        eventsAbort.abort();
        legacyEventsInterrupted = client.getProtocolEra() === 'legacy';
        stopSubscription();
      } else {
        eventsAbort = new AbortController();
        startSubscription();
      }
    },
    async listTools(options): Promise<ListToolsResult> {
      const result = capabilities?.tools
        ? await client.listTools(undefined, { ...options?.options, cacheMode: 'refresh' })
        : { tools: [] };
      tools.clear();
      for (const tool of result.tools) tools.set(tool.name, tool);
      const hintedTtl =
        'ttlMs' in result && typeof result.ttlMs === 'number' ? result.ttlMs : undefined;
      const ttl = hintedTtl ?? (client.getProtocolEra() === 'legacy' ? LEGACY_CATALOG_TTL_MS : 0);
      catalogExpiresAt = Date.now() + Math.max(0, Math.min(ttl, MAX_CATALOG_TTL_MS));
      return result;
    },
    async callTool({ name, args, options }) {
      const toolDefinition = tools.get(name);
      if (!toolDefinition) throw new Error('The MCP tool is no longer available.');
      return interactive(() =>
        client.callTool(
          { name, arguments: args },
          {
            signal: options.abortSignal,
            timeout: input.elicit ? 10 * 60 * 1000 : 60_000,
            // A pinned definition also disables the SDK's HEADER_MISMATCH refresh-and-retry path.
            toolDefinition,
          },
        ),
      );
    },
    async close() {
      closed = true;
      connectionAbort.abort();
      eventsAbort.abort();
      stopSubscription();
      await client.close();
    },
  };
}
