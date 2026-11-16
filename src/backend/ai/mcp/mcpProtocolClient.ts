import {
  Client,
  InsufficientScopeError,
  ProtocolError,
  ProtocolErrorCode,
  SdkHttpError,
  SdkError,
  SdkErrorCode,
  StreamableHTTPClientTransport,
  type ListToolsResult,
  type McpSubscription,
  type Tool,
} from '@modelcontextprotocol/client';
import Constants from 'expo-constants';
import { fetch as expoFetch } from 'expo/fetch';

import type { PluginClient } from '@/backend/services/builtInMcp';
import type { McpOAuthRuntime } from '@/backend/services/mcp';
import {
  McpAuthorizationError,
  McpLegacyFallbackError,
  McpRedirectError,
  type McpFailureStage,
  type McpConnectionFailure,
  type McpConnectionConfig,
  type McpProtocolInfo,
} from '@/shared/contracts/mcp';
import { attachMcpFailureFacts, withMcpFailureFacts } from '@/shared/data/api/mcpFailureFacts';
import { normalizeMcpHeaders } from '@/shared/utils/mcpConnectionConfig';

import { MCP_CONNECTION_ERROR_KIND, normalizeMcpConnectionFailure } from './mcpConnectionFailure';
import { McpRuntimeToolError } from './mcpRuntimeAdapter';

/** A catalog is revalidated on use at most this often; push notifications cover faster changes. */
const MIN_CATALOG_TTL_MS = 5 * 60 * 1000;
const MAX_CATALOG_TTL_MS = 60 * 60 * 1000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/** The transport's own same-origin rule: one origin, or its https form on default ports. */
function isWithinOrigin(from: URL, to: URL): boolean {
  if (from.protocol === to.protocol && from.host === to.host) return true;
  return (
    from.protocol === 'http:' &&
    to.protocol === 'https:' &&
    from.hostname === to.hostname &&
    !from.port &&
    !to.port
  );
}

/** Version negotiation wraps what the fetch boundary threw; callers match on the original. */
function boundaryError(error: unknown): unknown {
  for (let current = error, depth = 0; current instanceof Error && depth < 4; depth += 1) {
    if (current instanceof McpAuthorizationError || current instanceof McpRedirectError)
      return current;
    current = current.cause;
  }
  return error;
}

/**
 * A failure that proves the server refused the call without running it, as the exact error
 * the model should see. `staleCatalog` marks a refusal of the tool or its arguments, which
 * the cached catalog may no longer describe.
 */
export function classifyMcpCallRejection(
  error: unknown,
): { failure: McpRuntimeToolError; staleCatalog: boolean } | undefined {
  if (error instanceof McpAuthorizationError)
    return {
      failure: new McpRuntimeToolError(
        'mcp_tool_unavailable',
        'The MCP connection must be authorized again before this tool can run.',
        false,
      ),
      staleCatalog: false,
    };
  if (error instanceof McpRedirectError)
    return {
      failure: new McpRuntimeToolError(
        'mcp_tool_unavailable',
        `The MCP server moved to ${error.location}. The user must update the connection address.`,
        false,
      ),
      staleCatalog: false,
    };
  if (
    ProtocolError.isInstance(error) &&
    (error.code === ProtocolErrorCode.InvalidParams ||
      error.code === ProtocolErrorCode.MethodNotFound)
  )
    return {
      failure: new McpRuntimeToolError(
        'mcp_tool_call_failed',
        `The MCP server rejected the call: ${error.message.slice(0, 500)}`,
        false,
      ),
      staleCatalog: true,
    };
  // An HTTP client error answers the request itself, such as an expired session.
  if (
    SdkHttpError.isInstance(error) &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408
  )
    return {
      failure: new McpRuntimeToolError(
        'mcp_tool_call_failed',
        'The MCP server refused the request. The tool did not run.',
        true,
      ),
      staleCatalog: false,
    };
  return undefined;
}

/** Optional protocol features do not burden the bundled, tool-only API adapters. */
export type McpRuntimeClient = Pick<PluginClient, 'serverInfo' | 'close' | 'discoveryWarnings'> & {
  listTools(
    input?: Parameters<PluginClient['listTools']>[0] & {
      onFailure?: (facts: McpConnectionFailure) => void;
    },
  ): Promise<ListToolsResult>;
  listResources?: Client['listResources'];
  listResourceTemplates?: Client['listResourceTemplates'];
  readResource?: Client['readResource'];
  listPrompts?: Client['listPrompts'];
  getPrompt?: Client['getPrompt'];
  readonly protocolInfo?: McpProtocolInfo;
  readonly catalogExpiresAt?: number;
  setForeground?(active: boolean): void;
};

/** One SDK instance per connection/grant; no cache is shared across authorities. */
type RemoteMcpClientInput = {
  config: McpConnectionConfig;
  signal: AbortSignal;
  foreground: boolean;
  elicit?: (
    params: unknown,
    signal: AbortSignal,
  ) => Promise<import('@/shared/contracts/mcpInteraction').McpElicitationResponse>;
  authorization: Pick<McpOAuthRuntime, 'token' | 'rejected'>;
  onCatalogChanged?: () => void;
  onConnectionFailure?: (facts: McpConnectionFailure) => void;
  onConnectionStage?: (stage: McpFailureStage) => void;
  shouldUseLegacyProtocol?: boolean;
  onLegacyPreferenceChanged?: (shouldUseLegacyProtocol: boolean) => void;
};

type RemoteMcpRuntimeClient = McpRuntimeClient & {
  callTool: (input: {
    name: string;
    args: Record<string, unknown>;
    options: { abortSignal: AbortSignal };
  }) => Promise<unknown>;
};

export async function createRemoteMcpClient(
  input: RemoteMcpClientInput,
): Promise<RemoteMcpRuntimeClient> {
  input.signal.throwIfAborted();
  let snapshot: McpConnectionFailure | undefined;
  const publish = (facts: McpConnectionFailure) => {
    try {
      void Promise.resolve(input.onConnectionFailure?.(facts)).catch(() => undefined);
    } catch {
      /* Preserve the connection outcome. */
    }
  };
  const attemptInput = {
    ...input,
    onConnectionFailure: (facts: McpConnectionFailure) => {
      snapshot = facts;
      publish(facts);
    },
  };
  const shouldUseLegacyProtocol = input.shouldUseLegacyProtocol === true;
  try {
    return await connectRemoteMcpClient(attemptInput, shouldUseLegacyProtocol ? 'legacy' : 'auto');
  } catch (error) {
    if (
      isNonRetryableConnectionError(error, input.signal, snapshot) ||
      (!shouldUseLegacyProtocol &&
        (!SdkError.isInstance(error) ||
          (error.code !== SdkErrorCode.EraNegotiationFailed &&
            !(
              error.code === SdkErrorCode.RequestTimeout &&
              snapshot?.kind === 'refused-or-unreachable'
            ))))
    )
      throw error;
    // Forget a failed preference even if the fresh negotiation also fails.
    if (shouldUseLegacyProtocol) input.onLegacyPreferenceChanged?.(false);
    // Snapshot before the next attempt can reuse the same rejection object.
    const firstFacts = snapshot ?? {
      stage: shouldUseLegacyProtocol ? ('initialize' as const) : ('negotiation' as const),
      kind: 'unknown' as const,
    };
    snapshot = undefined;
    let retryConnected = false;
    const retryInput = {
      ...input,
      onConnectionFailure: (facts: McpConnectionFailure) => {
        if (retryConnected) publish(facts);
        else snapshot = facts;
      },
    };
    let client: RemoteMcpRuntimeClient;
    try {
      client = await connectRemoteMcpClient(
        retryInput,
        shouldUseLegacyProtocol ? 'auto' : 'legacy',
      );
    } catch (retryError) {
      const secondFacts = snapshot ?? {
        stage: shouldUseLegacyProtocol ? ('negotiation' as const) : ('initialize' as const),
        kind: 'unknown' as const,
      };
      const negotiation = shouldUseLegacyProtocol ? secondFacts : firstFacts;
      const legacy = shouldUseLegacyProtocol ? firstFacts : secondFacts;
      const failure = isNonRetryableConnectionError(retryError, input.signal, snapshot)
        ? retryError
        : new McpLegacyFallbackError(
            shouldUseLegacyProtocol ? retryError : error,
            shouldUseLegacyProtocol ? error : retryError,
          );
      const facts: McpConnectionFailure = {
        ...(legacy.kind === 'unknown' ? negotiation : legacy),
        fallback: { negotiation, legacy },
      };
      publish(facts);
      if (failure !== retryError) attachMcpFailureFacts(failure, facts);
      throw failure;
    }
    retryConnected = true;
    if (input.signal.aborted) {
      await client.close().catch(() => undefined);
      input.signal.throwIfAborted();
    }
    try {
      if (!shouldUseLegacyProtocol) input.onLegacyPreferenceChanged?.(true);
    } catch (publicationError) {
      await client.close().catch(() => undefined);
      throw publicationError;
    }
    return client;
  }
}

function isNonRetryableConnectionError(
  error: unknown,
  signal: AbortSignal,
  facts?: McpConnectionFailure,
): boolean {
  return (
    signal.aborted ||
    error instanceof McpAuthorizationError ||
    error instanceof InsufficientScopeError ||
    error instanceof McpRedirectError ||
    (error instanceof Error && error.name === 'AbortError') ||
    // Legacy handshakes use ClientHttpNotImplemented for ordinary 401/403 replies.
    (SdkHttpError.isInstance(error) && (error.status === 401 || error.status === 403)) ||
    (SdkError.isInstance(error) &&
      (error.code === SdkErrorCode.ClientHttpAuthentication ||
        error.code === SdkErrorCode.ClientHttpForbidden ||
        (error.code === SdkErrorCode.RequestTimeout && facts?.kind !== 'refused-or-unreachable')))
  );
}

async function connectRemoteMcpClient(
  input: RemoteMcpClientInput,
  mode: 'auto' | 'legacy',
): Promise<RemoteMcpRuntimeClient> {
  input.signal.throwIfAborted();
  let stage: McpFailureStage = mode === 'auto' ? 'negotiation' : 'initialize';
  input.onConnectionStage?.(stage);
  // Only facts captured by this attempt may classify its rejection graph.
  const attemptFacts = new WeakMap<object, McpConnectionFailure>();
  const transportFailures = new WeakSet<object>();
  const publish = (facts: McpConnectionFailure) => {
    input.onConnectionFailure?.(facts);
  };
  const observe = (error: unknown, requestStage = stage) => {
    const detail = normalizeMcpConnectionFailure(error, {
      stage: requestStage,
      didTimeout: false,
      timeoutMs: 15000,
      readFacts: (value) => attemptFacts.get(value),
      isTransportFailure: (value) => transportFailures.has(value),
    });
    const facts =
      detail.kind === 'timeout' &&
      detail.timeoutMs !== 15_000 &&
      SdkError.isInstance(error) &&
      error.code === SdkErrorCode.RequestTimeout
        ? { ...detail, timeoutMs: 15_000 }
        : detail;
    if (error && typeof error === 'object') attemptFacts.set(error, facts);
    return facts;
  };
  const transportFailure = (error: unknown, signal: AbortSignal, requestStage = stage) => {
    if (
      error &&
      typeof error === 'object' &&
      !signal.aborted &&
      !(error instanceof Error && error.name === 'AbortError')
    ) {
      transportFailures.add(error);
      attemptFacts.delete(error);
    }
    const facts = observe(error, requestStage);
    // Connection failure is published once when the attempt settles. Live requests
    // publish their own terminal failure, independently of reused rejection identities.
    if (connectionSettled && !signal.aborted) publish(facts);
    return facts;
  };
  let foreground = input.foreground;
  let closed = false;
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
  // Tools and prompts form one catalog with one refresh path.
  const catalogChanged = () => {
    catalogExpiresAt = 0;
    if (foreground && !closed) input.onCatalogChanged?.();
  };
  const connectionAbort = new AbortController();
  let connectionSettled = false;
  const requests = new Map<string | number, () => void>();
  const toolRequests = new Map<
    string | number,
    {
      resolve: () => void;
      reject: (error: unknown) => void;
    }
  >();
  const toolStreamFacts = new WeakMap<object, McpConnectionFailure>();
  let rejectHandshake!: (error: unknown) => void;
  const handshakeFailure = new Promise<never>((_resolve, reject) => {
    rejectHandshake = reject;
  });
  const tools = new Map<string, Tool>();
  const client = new Client(
    { name: 'Cherry Studio', version: Constants.expoConfig?.version ?? 'unknown' },
    {
      versionNegotiation:
        mode === 'auto'
          ? { mode: 'auto', probe: { maxRetries: 0, timeoutMs: 15_000 } }
          : { mode: 'legacy' },
      capabilities: {
        extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } },
        ...(input.elicit ? { elicitation: { form: {}, url: {} } } : {}),
      },
      inputRequired: { autoFulfill: Boolean(input.elicit), maxRounds: 8 },
      // Cherry owns refresh, persistence, and the immutable catalog used by each turn.
      listChanged: {
        tools: { autoRefresh: false, onChanged: catalogChanged },
        prompts: { autoRefresh: false, onChanged: catalogChanged },
      },
    },
  );
  if (input.elicit)
    client.setRequestHandler('elicitation/create', async (request, context) =>
      // The connection can outlive the operation that opened it; the owner scopes the question.
      interactiveRequests > 0
        ? input.elicit!(request.params, context.mcpReq.signal)
        : { action: 'cancel' as const },
    );
  const endpoint = new URL(input.config.endpointUrl);
  // The transport follows a redirect that stays within the endpoint's origin and keeps the
  // method, which is how servers canonicalize a path. Nothing here leaves that origin.
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: normalizeMcpHeaders(input.config.headers) },
    // Do not give the transport an authProvider: its 401 recovery can replay a write.
    onInsufficientScope: 'throw',
    reconnectionOptions: {
      maxRetries: 0,
      initialReconnectionDelay: 1000,
      maxReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1,
    },
    fetch: async (url, init) => {
      const rpc = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const method = rpc?.method;
      if (method === 'server/discover' || method === 'initialize') {
        const nextStage = method === 'server/discover' ? 'negotiation' : 'initialize';
        if (stage !== nextStage) {
          stage = nextStage;
          input.onConnectionStage?.(stage);
        }
      }
      if (init?.method === 'GET' && !foreground) return new Response(null, { status: 405 });
      const signal = AbortSignal.any([
        connectionAbort.signal,
        ...(init?.signal ? [init.signal] : []),
      ]);
      const requestStage = method === 'tools/list' ? 'tools-list' : stage;
      const isHandshake =
        rpc?.id !== undefined && (method === 'server/discover' || method === 'initialize');
      let observing = true;
      const finish = () => {
        observing = false;
        signal.removeEventListener('abort', finish);
        if (rpc?.id !== undefined) toolRequests.get(rpc.id)?.resolve();
        if (rpc?.id !== undefined && requests.get(rpc.id) === finish) requests.delete(rpc.id);
      };
      if (rpc?.id !== undefined) requests.set(rpc.id, finish);
      signal.addEventListener('abort', finish, { once: true });
      try {
        if (!isWithinOrigin(endpoint, new URL(String(url)))) {
          const error = new McpAuthorizationError('configuration');
          observe(error);
          throw error;
        }
        const token = await input.authorization.token(input.config, signal);
        const headers = new Headers(init?.headers);
        if (token) headers.set('Authorization', `Bearer ${token}`);
        const request = {
          ...init,
          headers,
          signal: init?.method === 'GET' ? AbortSignal.any([eventsAbort.signal, signal]) : signal,
        };
        let response: Response;
        try {
          response = await expoFetch(url as string, request);
        } catch (error) {
          transportFailure(error, request.signal, requestStage);
          finish();
          throw error;
        }
        if (
          token &&
          (response.status === 401 ||
            (response.status === 403 &&
              response.headers.get('www-authenticate')?.includes('insufficient_scope')))
        ) {
          await input.authorization.rejected(input.config, token, response);
          await response.body?.cancel().catch(() => undefined);
          const error = Object.assign(new McpAuthorizationError('reauthorize'), {
            status: response.status,
          });
          observe(error);
          throw error;
        }
        const location =
          response.status >= 300 && response.status < 400 ? response.headers.get('location') : null;
        if (location) {
          const target = new URL(location, String(url));
          if (!isWithinOrigin(endpoint, target)) {
            await response.body?.cancel().catch(() => undefined);
            target.username = target.password = target.search = target.hash = '';
            const error = Object.assign(new McpRedirectError(target.href), {
              status: response.status,
            });
            observe(error);
            throw error;
          }
        }
        // Subscriptions are long-lived streams; ordinary RPC responses have a total byte budget.
        if (!response.body || init?.method === 'GET' || method === 'subscriptions/listen') {
          finish();
          return response;
        }
        let bytes = 0;
        const source = response.body.getReader();
        const failStream = (
          error: unknown,
          facts: McpConnectionFailure,
          canRetryHandshake = false,
        ) => {
          if (!observing) return;
          // The SDK discards SSE errors. Settle the handshake or the send promise
          // for this exact request before its eventual SDK deadline hides the cause.
          if (
            isHandshake &&
            !connectionSettled &&
            response.headers.get('content-type')?.includes('text/event-stream')
          ) {
            const failure =
              mode === 'auto' && canRetryHandshake
                ? new SdkError(SdkErrorCode.EraNegotiationFailed, 'MCP handshake stream failed', {
                    cause: error,
                  })
                : error;
            if (failure && typeof failure === 'object') attemptFacts.set(failure, facts);
            rejectHandshake(failure);
          }
          const pending = rpc?.id !== undefined ? toolRequests.get(rpc.id) : undefined;
          if (pending) {
            const failure = withMcpFailureFacts(error, facts);
            if (failure && typeof failure === 'object') toolStreamFacts.set(failure, facts);
            pending.reject(failure);
          }
          finish();
        };
        // Observe failures even when the SDK stops pulling with bytes still queued.
        const streamFailure = source.closed
          .catch(async (error) => {
            // Let the SDK dispatch bytes already read through its SSE transforms.
            // Its matching response calls finish(), suppressing a late stream failure.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            if (
              !observing ||
              request.signal.aborted ||
              closed ||
              (isHandshake && connectionSettled)
            )
              return;
            failStream(error, transportFailure(error, request.signal, requestStage), true);
          })
          .catch(() => undefined);
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            let result: ReadableStreamReadResult<Uint8Array>;
            try {
              result = await source.read();
            } catch (error) {
              await streamFailure;
              finish();
              controller.error(error);
              return;
            }
            if (result.done) {
              finish();
              source.releaseLock();
              controller.close();
              return;
            }
            bytes += result.value.byteLength;
            if (bytes > MAX_RESPONSE_BYTES) {
              const error = Object.assign(new Error('The MCP response exceeds the size limit.'), {
                [MCP_CONNECTION_ERROR_KIND]: 'size-limit' as const,
              });
              failStream(error, observe(error, requestStage));
              controller.error(error);
              await source.cancel(error).catch(() => undefined);
              return;
            }
            controller.enqueue(result.value);
          },
          cancel(reason) {
            finish();
            return source.cancel(reason);
          },
        });
        // React Native's Response constructor stringifies streams instead of consuming them.
        if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
          Object.defineProperty(response, 'body', { value: body });
          return response;
        }
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let text = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          reader.releaseLock();
        }
        return new Response([204, 205, 304].includes(response.status) ? null : text, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        finish();
        throw error;
      }
    },
  });

  // Keep each tools/list send pending through its response stream so the SDK's
  // own request handler receives a stream rejection for the matching RPC ID.
  const send = transport.send;
  transport.send = (message, options) => {
    if ('method' in message && message.method === 'notifications/cancelled')
      requests.get(message.params!.requestId as string | number)?.();
    if (!('method' in message) || message.method !== 'tools/list' || !('id' in message))
      return send.call(transport, message, options);
    const id = message.id;
    const completion = new Promise<void>((resolve, reject) => {
      toolRequests.set(id, { resolve, reject });
    });
    return Promise.all([send.call(transport, message, options), completion])
      .then(() => undefined)
      .finally(() => toolRequests.delete(id));
  };

  // The SDK replaces onmessage during its probe window. Intercept assignments so
  // every JSON-RPC response settles its own observation before the SDK advances.
  let onmessage: typeof transport.onmessage;
  Object.defineProperty(transport, 'onmessage', {
    configurable: true,
    get: () => onmessage,
    set: (handler: typeof transport.onmessage) => {
      onmessage =
        handler &&
        ((message) => {
          if (
            'id' in message &&
            message.id !== undefined &&
            ('result' in message || 'error' in message)
          )
            requests.get(message.id)?.();
          handler(message);
        });
    },
  });

  const stopSubscription = () => {
    subscriptionGeneration += 1;
    const current = subscription ?? client.autoOpenedSubscription;
    subscription = undefined;
    void current?.close().catch(() => undefined);
  };
  const startSubscription = () => {
    const capabilities = client.getServerCapabilities();
    if (
      closed ||
      !foreground ||
      subscription ||
      subscriptionPending ||
      client.getProtocolEra() !== 'modern' ||
      (!capabilities?.tools?.listChanged && !capabilities?.prompts?.listChanged)
    )
      return;
    const generation = subscriptionGeneration;
    subscriptionPending = true;
    void client
      .listen(
        {
          ...(capabilities?.tools?.listChanged ? { toolsListChanged: true } : {}),
          ...(capabilities?.prompts?.listChanged ? { promptsListChanged: true } : {}),
        },
        { timeout: 15_000 },
      )
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
    await Promise.race([
      client.connect(transport, { signal: input.signal, timeout: 15_000 }),
      handshakeFailure,
    ]);
    connectionSettled = true;
    for (const finish of requests.values()) finish();
    input.signal.throwIfAborted();
    subscription = client.autoOpenedSubscription;
    const opened = subscription;
    if (opened)
      void opened.closed.then(() => {
        if (subscription === opened) subscription = undefined;
      });
    if (!foreground) stopSubscription();
    input.signal.throwIfAborted();
  } catch (error) {
    connectionSettled = true;
    for (const finish of requests.values()) finish();
    const facts = observe(error);
    publish(facts);
    closed = true;
    connectionAbort.abort();
    eventsAbort.abort();
    await client.close().catch(() => undefined);
    throw boundaryError(error);
  }
  const serverInfo = client.getServerVersion();
  if (!serverInfo) {
    await client.close();
    const error = Object.assign(new Error('The MCP server did not return its identity.'), {
      [MCP_CONNECTION_ERROR_KIND]: 'missing-identity' as const,
    });
    const facts = observe(error);
    publish(facts);
    throw error;
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
    setForeground(active) {
      foreground = active;
      if (!active) {
        eventsAbort.abort();
        stopSubscription();
      } else {
        eventsAbort = new AbortController();
        startSubscription();
      }
    },
    async listTools(options): Promise<ListToolsResult> {
      stage = 'tools-list';
      input.onConnectionStage?.(stage);
      let result: ListToolsResult;
      try {
        result = capabilities?.tools
          ? await client.listTools(undefined, { ...options?.options, cacheMode: 'refresh' })
          : { tools: [] };
      } catch (error) {
        const facts = normalizeMcpConnectionFailure(error, {
          stage: 'tools-list',
          didTimeout: false,
          timeoutMs: 15_000,
          readFacts: (value) => toolStreamFacts.get(value),
          isTransportFailure: (value) => transportFailures.has(value),
        });
        options?.onFailure?.(facts);
        throw error;
      }
      tools.clear();
      for (const tool of result.tools) tools.set(tool.name, tool);
      const hintedTtl =
        'ttlMs' in result && typeof result.ttlMs === 'number' ? result.ttlMs : undefined;
      catalogExpiresAt =
        Date.now() +
        Math.max(MIN_CATALOG_TTL_MS, Math.min(hintedTtl ?? MIN_CATALOG_TTL_MS, MAX_CATALOG_TTL_MS));
      return result;
    },
    async callTool({ name, args, options }) {
      const toolDefinition = tools.get(name);
      if (!toolDefinition)
        throw new McpRuntimeToolError(
          'mcp_tool_unavailable',
          'The MCP tool is no longer available.',
          false,
        );
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
