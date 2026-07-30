import type { ListToolsResult, MCPClient } from '@ai-sdk/mcp';
import { createMCPClient } from '@ai-sdk/mcp';
import type { Tool, ToolSet } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';
import type { ToolEntry } from '@/backend/infrastructure/ai/tools';
import type { McpServerService } from '@/backend/infrastructure/services/McpServerService';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { DataApiError, ErrorCode } from '@/shared/data/api/types';
import type { Assistant } from '@/shared/data/types/assistant';
import {
  DEFAULT_MCP_TIMEOUT_SECONDS,
  type StreamableHttpMcpServer,
} from '@/shared/data/types/mcpServer';

import { fnv1a32 } from './fnv1a';
import type { McpCallToolResult } from './mcpResult';
import { mcpResultToTextSummary } from './mcpResult';
import { isMcpToolDisabledBySource, isMcpToolForcePromptBySource } from './mcpSourcePolicy';
import { buildFunctionCallToolName } from './mcpToolName';
import { resolveServersForAssistant } from './resolveAssistantMcpServers';

const logger = loggerService.withContext('McpService');

const TOOLS_CACHE_TTL_MS = 5 * 60 * 1000;
const ACTIVE_PREWARM_CONCURRENCY = 3;
const ASSISTANT_WARM_TIMEOUT_MS = 3 * 1000;
/** Ceiling for connect + tools/list. `@ai-sdk/mcp` implements no request timeout
 * of its own: `RequestOptions.timeout` is declared but never read, and neither
 * `initialize` nor `tools()` forwards a signal. Without this a server that
 * accepts the socket then stalls would pin a client slot indefinitely. */
const TOOLS_FETCH_TIMEOUT_MS = 15 * 1000;
/** Backoff after a failed refresh, doubling per consecutive failure. Without it
 * a permanently-rejecting server costs a full connect attempt on every message,
 * forever, on a phone. */
const REFRESH_BACKOFF_BASE_MS = 30 * 1000;
const REFRESH_BACKOFF_MAX_MS = 10 * 60 * 1000;

export type McpConnectionConfig = {
  baseUrl: string;
  headers?: Record<string, string>;
};

export type McpToolSummary = {
  description?: string;
  name: string;
};

export type McpServerInfo = {
  instructions?: string;
  name: string;
  title?: string;
  version: string;
};

export type McpServerRuntimeSummary = {
  lastConnectedAt?: number;
  lastError?: string;
  serverName?: string;
  serverTitle?: string;
  serverVersion?: string;
  state: 'connected' | 'connecting' | 'disabled' | 'error';
  toolCount?: number;
};

type ToolsCacheEntry = {
  fetchedAt: number;
  rawTools: ToolSet;
};

/**
 * Stamped on every MCP result, mirroring what desktop's `mcpTools.ts` puts on
 * its own — so a tool part persisted by either end carries the same
 * `output.metadata`. Not the same carrier as the tool definition's `metadata`:
 * this one only exists once the call has produced a result.
 */
type McpResultSource = {
  serverId: string;
  serverName: string;
  type: 'mcp';
};

/** Refresh-failure streak for a server, kept so `readCachedTools` backs off
 * instead of retrying a dead one on every message. */
type ToolsRefreshFailure = {
  consecutive: number;
  failedAt: number;
};

type McpServerRuntimeSnapshot = Omit<McpServerRuntimeSummary, 'lastError' | 'state'> & {
  transportFingerprint: string;
};

type ServerRuntimeState = {
  client?: MCPClient;
  connectionPromise?: Promise<MCPClient>;
  failure?: ToolsRefreshFailure;
  generation: number;
  refreshPromise?: Promise<void>;
  runtimeError?: string;
  serverId: string;
  timeoutCancellations: Set<() => void>;
  toolsCache?: ToolsCacheEntry;
  transportFingerprint: string;
};

/** Distinguishes "we gave up waiting" from a real transport error, so the
 * message reaching the model can warn that the call may still be running. */
class McpTimeoutError extends Error {}

/** Runtime work superseded by invalidation; it must not count as a server failure. */
class McpEvictedError extends Error {}

/**
 * `@ai-sdk/mcp` resolves a nested `@ai-sdk/provider-utils` copy, so its tools are
 * nominally foreign to `ai`'s `ToolSet`. Both copies brand schemas with the same
 * `Symbol.for('vercel.ai.schema')` from the global registry, so the shapes are
 * identical at runtime. Kept as the single cast site — see the brand canary in
 * `__tests__/schemaBrand.test.ts`, which fails if that assumption ever breaks.
 */
function castMcpToolSet(tools: Awaited<ReturnType<MCPClient['tools']>>): ToolSet {
  return tools as ToolSet;
}

/** Tool.description may be a lazy function in ai v6 — summaries only take strings. */
function toolDescription(tool: Tool): string | undefined {
  return typeof tool.description === 'string' ? tool.description : undefined;
}

async function listAllTools(client: MCPClient): Promise<ToolSet> {
  const definitions: ListToolsResult['tools'] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const page = await client.listTools(cursor ? { params: { cursor } } : undefined);
    definitions.push(...page.tools);

    if (!page.nextCursor) {
      break;
    }
    if (seenCursors.has(page.nextCursor)) {
      throw new Error(`MCP tools/list returned a repeated cursor: ${page.nextCursor}`);
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  return castMcpToolSet(client.toolsFromDefinitions({ tools: definitions }));
}

function createHttpClient(config: McpConnectionConfig): Promise<MCPClient> {
  return createMCPClient({
    clientName: 'Cherry Studio',
    transport: {
      type: 'http',
      url: config.baseUrl,
      ...(config.headers && Object.keys(config.headers).length > 0 && { headers: config.headers }),
      fetch: expoFetch as unknown as typeof fetch,
    },
  });
}

function hasRunnableUrl(server: StreamableHttpMcpServer): boolean {
  return /^https?:\/\//i.test(server.baseUrl);
}

/**
 * Race a promise against a wall clock, running `onTimeout` when it wins.
 *
 * Not `AbortSignal.timeout` — Expo's winter runtime does install it, but the
 * awaited work here (`client.tools()`, `rawTool.execute`) exposes no seam to
 * pass a signal into, and eviction has to happen as a side effect either way.
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  onTimeout: () => void,
  cancellations?: Set<() => void>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let handle: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(handle);
      cancellations?.delete(cancel);
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new McpEvictedError(`${label} was invalidated`));
    };

    handle = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      onTimeout();
      reject(new McpTimeoutError(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    cancellations?.add(cancel);

    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}

/**
 * Runtime MCP client manager (remote Streamable HTTP servers only).
 *
 * The chat hot path serves existing tools cache-only. A cold cache gets one
 * bounded warm before the request is built; dead or slow servers can delay the
 * first request by at most `ASSISTANT_WARM_TIMEOUT_MS`. Connecting is otherwise
 * owned by background refresh and by `listToolsForServer`, which the settings
 * screen calls — and, for the one case that cannot be answered from cache, the
 * approval sheet: clearing a server-wide auto-approve rule rewrites it as one
 * entry per remaining tool, so it needs the full list or it silently drops the
 * rules of the tools it is missing. All live reads are timeout-bounded.
 *
 * Background refresh preserves the last good cache and backs off after failure.
 * Explicit tool listings reconnect once; tool calls are never replayed.
 */
export class McpService {
  constructor(private readonly deps: { mcpServer: McpServerService }) {}

  private readonly runtimeStates = new Map<string, ServerRuntimeState>();
  private readonly runtimeSnapshots = new Map<string, McpServerRuntimeSnapshot>();
  private activePrewarmPromise?: Promise<void>;

  /**
   * Request-scoped registry entries keyed `mcp__{server}__{tool}`.
   *
   * Gives cold servers one shared, bounded warm before reading the cache. Stale
   * tools are returned immediately while they refresh in the background.
   * Returns an empty list when nothing applies and never surfaces MCP failures.
   */
  async getToolEntriesForAssistant(assistant: Assistant): Promise<ToolEntry[]> {
    let activeServers: StreamableHttpMcpServer[];
    try {
      ({ items: activeServers } = await this.deps.mcpServer.list({
        isActive: true,
        type: 'streamableHttp',
      }));
    } catch (error) {
      logger.warn('Failed to list MCP servers for assistant', { error });
      return [];
    }

    // Outside the try: this is a pure filter over what we just read, so a throw
    // from it is a bug, not an unreachable server, and must not be swallowed.
    const servers = resolveServersForAssistant(assistant, activeServers).filter(hasRunnableUrl);
    const preparedServers = servers.map((server) => ({
      server,
      state: this.getRuntimeState(server),
    }));
    await this.warmColdToolCaches(preparedServers);

    const entries: ToolEntry[] = [];
    const registeredNames = new Set<string>();
    for (const { server, state } of preparedServers) {
      // A save/disable while the bounded warm was running invalidates this
      // request's transport snapshot. The next request will read the new row.
      if (!this.isCurrentState(state)) {
        continue;
      }
      const cached = this.readCachedTools(server, state);
      if (!cached) {
        continue;
      }

      for (const [rawName, rawTool] of Object.entries(cached.rawTools)) {
        if (isMcpToolDisabledBySource(server, { name: rawName })) {
          continue;
        }

        const key = buildFunctionCallToolName(server.name, rawName);
        if (registeredNames.has(key)) {
          logger.warn('Duplicate MCP tool key, skipping', { key, server: server.name });
          continue;
        }

        registeredNames.add(key);
        entries.push({
          defer: isMcpToolForcePromptBySource(server, { name: rawName }) ? 'never' : 'auto',
          description: toolDescription(rawTool) ?? rawName,
          name: key,
          namespace: `mcp:${server.name}`,
          tool: this.wrapTool(rawTool, server, rawName, cached.state),
        });
      }
    }

    return entries;
  }

  /**
   * Warm the tool cache for every active server so the next chat request can
   * offer their tools. Calls share one concurrency-limited run and failures are
   * logged rather than surfaced.
   */
  prewarmActiveServers(): Promise<void> {
    if (this.activePrewarmPromise) {
      return this.activePrewarmPromise;
    }

    const task = this.prewarmActiveServerTools().finally(() => {
      if (this.activePrewarmPromise === task) {
        this.activePrewarmPromise = undefined;
      }
    });
    this.activePrewarmPromise = task;
    return task;
  }

  /** Runtime metadata for the settings list. Active servers share the existing
   * concurrency-limited prewarm instead of opening one connection per row. */
  async getRuntimeSummaries(
    servers: readonly StreamableHttpMcpServer[],
  ): Promise<Record<string, McpServerRuntimeSummary>> {
    if (servers.some((server) => server.isActive && hasRunnableUrl(server))) {
      await this.prewarmActiveServers();
    }

    return Object.fromEntries(servers.map((server) => [server.id, this.getRuntimeSummary(server)]));
  }

  /** Warm one stored server without exposing transport failures to callers. */
  async warmToolsCache(server: StreamableHttpMcpServer): Promise<void> {
    if (!server.isActive || !hasRunnableUrl(server)) {
      return;
    }

    const state = this.getRuntimeState(server);
    const cache = state.toolsCache;
    if (cache && Date.now() - cache.fetchedAt < TOOLS_CACHE_TTL_MS) {
      return;
    }

    await this.refreshToolsInBackground(server, state);
  }

  private async prewarmActiveServerTools(): Promise<void> {
    try {
      const { items } = await this.deps.mcpServer.list({
        isActive: true,
        type: 'streamableHttp',
      });
      const servers = items.filter(hasRunnableUrl);
      for (let index = 0; index < servers.length; index += ACTIVE_PREWARM_CONCURRENCY) {
        const batch = servers.slice(index, index + ACTIVE_PREWARM_CONCURRENCY);
        await Promise.allSettled(batch.map((server) => this.warmToolsCache(server)));
      }
    } catch (error) {
      logger.warn('Failed to prewarm MCP servers', { error });
    }
  }

  /** Tool list for the server edit screen — connects, unlike the chat path. */
  async listToolsForServer(server: StreamableHttpMcpServer): Promise<McpToolSummary[]> {
    if (!hasRunnableUrl(server)) {
      throw new Error(`MCP server ${server.name} has no valid HTTP URL`);
    }
    const state = this.getRuntimeState(server);
    const cacheBeforeRefresh = state.toolsCache;
    if (state.refreshPromise) {
      await state.refreshPromise;
      if (!this.isCurrentState(state)) {
        throw new McpEvictedError(`MCP server ${server.name} was invalidated while listing tools`);
      }
    }

    // Reuse a successful in-flight warm. If that warm failed, do one explicit
    // reconnect attempt so the settings screen still surfaces the live error.
    const rawTools =
      state.toolsCache && state.toolsCache !== cacheBeforeRefresh
        ? state.toolsCache.rawTools
        : await this.fetchToolsWithRetry(server);

    return Object.entries(rawTools).map(([name, tool]) => ({
      description: toolDescription(tool),
      name,
    }));
  }

  /**
   * Connection test against unsaved form values: a throwaway client that never
   * enters the pool.
   */
  async testConnection(config: McpConnectionConfig): Promise<McpToolSummary[]> {
    const rawTools = await this.withTemporaryClient(config, 'MCP connection test', listAllTools);
    return Object.entries(rawTools).map(([name, tool]) => ({
      description: toolDescription(tool),
      name,
    }));
  }

  /** Initialization metadata used to name a server before its first save. */
  async getServerInfo(config: McpConnectionConfig): Promise<McpServerInfo> {
    return this.withTemporaryClient(config, 'MCP server info', (client) => ({
      ...(client.instructions && { instructions: client.instructions }),
      name: client.serverInfo.name,
      title: client.serverInfo.title,
      version: client.serverInfo.version,
    }));
  }

  /**
   * Drop every server's runtime. Called when the data layer goes away: without it
   * the pooled clients stay open and the refresh timers keep firing against a
   * service nothing will read again.
   */
  dispose(): void {
    for (const state of [...this.runtimeStates.values()]) {
      this.retireState(state);
    }

    this.runtimeSnapshots.clear();
    this.activePrewarmPromise = undefined;
  }

  /** Drop one server's runtime after transport change, disable, or delete. */
  invalidateServer(serverId: string, options: { preserveSnapshot?: boolean } = {}): void {
    const state = this.runtimeStates.get(serverId);
    if (state) {
      this.retireState(state);
    }
    if (!options.preserveSnapshot) {
      this.runtimeSnapshots.delete(serverId);
    }
  }

  /**
   * Identifies the transport config so a changed one retires its pooled client.
   *
   * The headers are digested rather than kept: they carry bearer tokens, and this
   * string outlives the connection — `invalidateServer(id, { preserveSnapshot: true })`
   * leaves a deactivated server's snapshot behind, fingerprint included. It is only
   * ever compared for equality, so a digest is all it has to be. The base URL is not
   * a secret and stays readable, which also makes a URL change exactly detected.
   */
  private transportFingerprint(config: McpConnectionConfig): string {
    const headers = Object.entries(config.headers ?? {}).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    const headersDigest = fnv1a32(JSON.stringify(headers)).toString(16).padStart(8, '0');
    return JSON.stringify([config.baseUrl, headersDigest]);
  }

  private getRuntimeState(server: StreamableHttpMcpServer): ServerRuntimeState {
    const transportFingerprint = this.transportFingerprint(server);
    if (this.runtimeSnapshots.get(server.id)?.transportFingerprint !== transportFingerprint) {
      this.runtimeSnapshots.delete(server.id);
    }
    const current = this.runtimeStates.get(server.id);
    if (current?.transportFingerprint === transportFingerprint) {
      return current;
    }

    const generation = current ? current.generation + 1 : 0;
    if (current) {
      this.retireState(current);
    }

    const state: ServerRuntimeState = {
      generation,
      serverId: server.id,
      timeoutCancellations: new Set(),
      transportFingerprint,
    };
    this.runtimeStates.set(server.id, state);
    return state;
  }

  private getRuntimeSummary(server: StreamableHttpMcpServer): McpServerRuntimeSummary {
    const transportFingerprint = this.transportFingerprint(server);
    const storedSnapshot = this.runtimeSnapshots.get(server.id);
    const snapshot =
      storedSnapshot?.transportFingerprint === transportFingerprint
        ? {
            lastConnectedAt: storedSnapshot.lastConnectedAt,
            serverName: storedSnapshot.serverName,
            serverTitle: storedSnapshot.serverTitle,
            serverVersion: storedSnapshot.serverVersion,
            toolCount: storedSnapshot.toolCount,
          }
        : {};

    if (!server.isActive) {
      return { ...snapshot, state: 'disabled' };
    }
    if (!hasRunnableUrl(server)) {
      return { ...snapshot, lastError: 'Invalid MCP server URL', state: 'error' };
    }

    const state = this.runtimeStates.get(server.id);
    if (state?.runtimeError) {
      return { ...snapshot, lastError: state.runtimeError, state: 'error' };
    }
    if (state?.toolsCache) {
      return { ...snapshot, state: 'connected' };
    }
    return { ...snapshot, state: 'connecting' };
  }

  /** Cached tools if we have any, serving stale while a refresh runs. */
  private readCachedTools(
    server: StreamableHttpMcpServer,
    state = this.getRuntimeState(server),
  ): { rawTools: ToolSet; state: ServerRuntimeState } | undefined {
    const entry = state.toolsCache;
    if (!entry || Date.now() - entry.fetchedAt >= TOOLS_CACHE_TTL_MS) {
      this.refreshToolsInBackground(server, state);
    }
    return entry ? { rawTools: entry.rawTools, state } : undefined;
  }

  /** Cold-cache warm shared by all of an assistant's servers. The underlying
   * refreshes survive the cap; only the current request stops waiting. */
  private async warmColdToolCaches(
    servers: readonly { server: StreamableHttpMcpServer; state: ServerRuntimeState }[],
  ): Promise<void> {
    const coldServers = servers.filter(({ state }) => !state.toolsCache);
    if (coldServers.length === 0) {
      return;
    }

    const warm = Promise.all(coldServers.map(({ server }) => this.warmToolsCache(server)));
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timeoutHandle = setTimeout(resolve, ASSISTANT_WARM_TIMEOUT_MS);
    });

    await Promise.race([warm.then(() => undefined), timeout]);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }

  private refreshToolsInBackground(
    server: StreamableHttpMcpServer,
    state = this.getRuntimeState(server),
  ): Promise<void> | undefined {
    if (state.refreshPromise) {
      return state.refreshPromise;
    }
    if (this.isBackingOff(state)) {
      return undefined;
    }

    const refresh = this.fetchRawTools(server, state)
      .then(() => undefined)
      .catch((error: unknown) => {
        if (error instanceof McpEvictedError) {
          return;
        }
        if (!this.isCurrentState(state)) {
          return;
        }
        this.recordFailure(state, error);
        logger.warn('MCP tools refresh failed', { error, server: server.name });
        // Keep the last good cache and its client through transient refresh
        // failures; tool-call failures and timeouts reset both.
      })
      .finally(() => {
        if (state.refreshPromise === refresh) {
          state.refreshPromise = undefined;
        }
      });

    state.refreshPromise = refresh;
    return refresh;
  }

  private isBackingOff(state: ServerRuntimeState): boolean {
    const failure = state.failure;
    if (!failure) {
      return false;
    }
    const wait = Math.min(
      REFRESH_BACKOFF_BASE_MS * 2 ** (failure.consecutive - 1),
      REFRESH_BACKOFF_MAX_MS,
    );
    return Date.now() - failure.failedAt < wait;
  }

  private recordFailure(state: ServerRuntimeState, error: unknown): void {
    state.failure = {
      consecutive: (state.failure?.consecutive ?? 0) + 1,
      failedAt: Date.now(),
    };
    state.runtimeError = errorMessage(error);
  }

  private recordRuntimeError(state: ServerRuntimeState, error: unknown): void {
    state.runtimeError = errorMessage(error);
  }

  private async getClient(
    server: StreamableHttpMcpServer,
    state: ServerRuntimeState,
  ): Promise<MCPClient> {
    if (!this.isCurrentState(state)) {
      throw new McpEvictedError(`MCP server ${server.name} was invalidated`);
    }

    if (state.client) {
      return state.client;
    }
    if (state.connectionPromise) {
      return state.connectionPromise;
    }

    const generation = state.generation;
    const initPromise: Promise<MCPClient> = createHttpClient(server)
      .then((client) => {
        if (state.connectionPromise !== initPromise || !this.isCurrentState(state, generation)) {
          this.closeQuietly(client);
          throw new McpEvictedError(`MCP server ${server.name} was reconfigured while connecting`);
        }
        state.client = client;
        return client;
      })
      .finally(() => {
        if (state.connectionPromise === initPromise) {
          state.connectionPromise = undefined;
        }
      });

    state.connectionPromise = initPromise;
    return initPromise;
  }

  private closeQuietly(client: MCPClient): void {
    client.close().catch(() => undefined);
  }

  private async withTemporaryClient<TValue>(
    config: McpConnectionConfig,
    label: string,
    operation: (client: MCPClient) => Promise<TValue> | TValue,
  ): Promise<TValue> {
    let client: MCPClient | undefined;
    let acceptClient = true;
    const request = createHttpClient(config).then(async (createdClient) => {
      if (!acceptClient) {
        this.closeQuietly(createdClient);
        throw new McpEvictedError(`${label} already ended`);
      }
      client = createdClient;
      return operation(createdClient);
    });

    try {
      return await withTimeout(request, TOOLS_FETCH_TIMEOUT_MS, label, () => {
        acceptClient = false;
      });
    } finally {
      acceptClient = false;
      if (client) {
        this.closeQuietly(client);
      }
    }
  }

  private cancelTimeouts(state: ServerRuntimeState): void {
    const cancellations = [...state.timeoutCancellations];
    state.timeoutCancellations.clear();
    for (const cancel of cancellations) {
      cancel();
    }
  }

  private resetConnection(state: ServerRuntimeState): void {
    if (!this.isCurrentState(state)) {
      return;
    }

    state.generation += 1;
    this.cancelTimeouts(state);
    state.connectionPromise = undefined;
    state.toolsCache = undefined;
    if (state.client) {
      this.closeQuietly(state.client);
      state.client = undefined;
    }
  }

  private retireState(state: ServerRuntimeState): void {
    if (this.runtimeStates.get(state.serverId) === state) {
      this.runtimeStates.delete(state.serverId);
    }
    state.generation += 1;
    this.cancelTimeouts(state);
    state.connectionPromise = undefined;
    state.refreshPromise = undefined;
    state.failure = undefined;
    state.toolsCache = undefined;
    if (state.client) {
      this.closeQuietly(state.client);
      state.client = undefined;
    }
  }

  private isCurrentState(state: ServerRuntimeState, generation = state.generation): boolean {
    return this.runtimeStates.get(state.serverId) === state && state.generation === generation;
  }

  private async fetchToolsWithRetry(server: StreamableHttpMcpServer): Promise<ToolSet> {
    const state = this.getRuntimeState(server);
    try {
      return await this.fetchRawTools(server, state);
    } catch (error) {
      if (error instanceof McpEvictedError) {
        throw error;
      }
      // Fail-and-drop: the pooled client may be stale (backgrounded socket,
      // expired session) — rebuild once before giving up.
      logger.warn('MCP tools() failed, reconnecting once', { error, server: server.name });
      this.resetConnection(state);
      try {
        return await this.fetchRawTools(server, state);
      } catch (retryError) {
        if (!(retryError instanceof McpEvictedError)) {
          this.resetConnection(state);
          this.recordRuntimeError(state, retryError);
        }
        throw retryError;
      }
    }
  }

  private async fetchRawTools(
    server: StreamableHttpMcpServer,
    state: ServerRuntimeState,
  ): Promise<ToolSet> {
    const generation = state.generation;
    const rawTools = await withTimeout(
      (async () => {
        const client = await this.getClient(server, state);
        return listAllTools(client);
      })(),
      TOOLS_FETCH_TIMEOUT_MS,
      `MCP server ${server.name}`,
      () => this.resetConnection(state),
      state.timeoutCancellations,
    );
    if (!this.isCurrentState(state, generation)) {
      throw new McpEvictedError(`MCP server ${server.name} was invalidated while listing tools`);
    }

    const fetchedAt = Date.now();
    const client = state.client;
    state.failure = undefined;
    state.runtimeError = undefined;
    state.toolsCache = { fetchedAt, rawTools };
    this.runtimeSnapshots.set(server.id, {
      lastConnectedAt: fetchedAt,
      serverName: client?.serverInfo.name,
      serverTitle: client?.serverInfo.title,
      serverVersion: client?.serverInfo.version,
      toolCount: Object.keys(rawTools).length,
      transportFingerprint: state.transportFingerprint,
    });
    return rawTools;
  }

  /**
   * Re-read the server so a tool call honours changes made after this ToolSet
   * was built — one send can run up to 20 tool steps, and the user may disable
   * a tool or the whole server in between.
   */
  private async assertToolStillAllowed(
    server: StreamableHttpMcpServer,
    rawToolName: string,
  ): Promise<StreamableHttpMcpServer> {
    let current: StreamableHttpMcpServer;
    try {
      current = await this.deps.mcpServer.getById(server.id, 'streamableHttp');
    } catch (error) {
      if (error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND) {
        throw new Error(`MCP server ${server.name} is no longer registered`);
      }
      // A locked or broken database is not a deleted server — saying so would
      // send the model, and the user, looking in the wrong place.
      throw new Error(
        `MCP tool ${server.name}/${rawToolName} could not verify its server: ${errorMessage(error)}`,
        { cause: error },
      );
    }

    if (!current.isActive) {
      throw new Error(`MCP server ${current.name} is not active`);
    }
    if (isMcpToolDisabledBySource(current, { name: rawToolName })) {
      throw new Error(`MCP tool ${current.name}/${rawToolName} is disabled`);
    }
    return current;
  }

  private wrapTool(
    rawTool: Tool,
    server: StreamableHttpMcpServer,
    rawToolName: string,
    state: ServerRuntimeState,
  ): Tool {
    const execute = rawTool.execute;
    if (!execute) {
      return rawTool;
    }

    const wrappedExecute = async (
      ...callArgs: Parameters<typeof execute>
    ): Promise<McpCallToolResult & { metadata: McpResultSource }> => {
      const current = await this.assertToolStillAllowed(server, rawToolName);
      if (this.getRuntimeState(current) !== state) {
        throw new Error(`MCP server ${current.name} was reconfigured before the tool call`);
      }

      const label = `${current.name}/${rawToolName}`;
      // `|| DEFAULT` rather than `??`: a stored 0 means "unset" here, matching
      // desktop. Treating it as a real timeout would fail every call instantly.
      const timeoutMs = (current.timeout || DEFAULT_MCP_TIMEOUT_SECONDS) * 1000;

      let result: McpCallToolResult;
      try {
        result = (await withTimeout(
          Promise.resolve(execute(...callArgs)),
          timeoutMs,
          `MCP tool ${label}`,
          // A timed-out connection may be wedged — don't let later calls reuse it.
          () => this.resetConnection(state),
          state.timeoutCancellations,
        )) as McpCallToolResult;
      } catch (error) {
        // Any transport/protocol failure means the pooled client is suspect;
        // dropping here is what keeps a dead session from sticking around for
        // the rest of the cache TTL. The call itself is not retried — MCP tool
        // calls are not guaranteed idempotent.
        this.resetConnection(state);
        this.recordRuntimeError(state, error);
        if (error instanceof McpTimeoutError) {
          // Nothing was cancelled: no signal reaches the server, so the work may
          // still be running. Say so, or the model retries a write it already made.
          throw new Error(
            `${error.message}. The server may still be processing it — do not repeat this call without checking its effect first.`,
          );
        }
        throw new Error(`MCP tool ${label} failed: ${errorMessage(error)}`);
      }

      if (result === undefined || result === null) {
        // Returning this would be reported to the model as an empty success,
        // which reads as a confident "nothing found".
        this.resetConnection(state);
        throw new Error(`MCP tool ${label} returned no result`);
      }
      if (result.isError) {
        throw new Error(`MCP tool ${label} failed: ${mcpResultToTextSummary(result)}`);
      }

      // `toModelOutput` below summarises `content` alone, so this rides along
      // to the persisted part without ever reaching the model.
      return {
        ...result,
        metadata: { serverId: server.id, serverName: server.name, type: 'mcp' },
      };
    };

    return {
      ...rawTool,
      description: rawTool.description || rawToolName,
      metadata: {
        cherry: {
          // The SDK copies this onto the part as `toolMetadata`, which is the
          // only way `McpToolPart` can title the card with the server's real
          // name: the key this tool is registered under is a camelCased,
          // ASCII-only, length-capped mint of it and cannot be reversed.
          tool: {
            serverId: server.id,
            serverName: server.name,
            type: 'mcp',
          },
        },
      },
      // Approval rides on the AI SDK's native gate: when this resolves true the
      // SDK emits a `tool-approval-request` instead of executing, and the turn
      // ends cleanly. (ai-core's promptToolUsePlugin would bypass this gate by
      // pulling tools out of the toolset — it is opt-in and never registered
      // here; keep it that way.) Re-read the server so flipping the setting
      // mid-turn is honoured, like `assertToolStillAllowed`. A failed read
      // asks rather than assumes: falling back to the wrap-time snapshot would
      // run a tool the user just put behind approval.
      needsApproval: async () => {
        let current: StreamableHttpMcpServer;
        try {
          current = await this.deps.mcpServer.getById(server.id, 'streamableHttp');
        } catch (error) {
          if (error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND) {
            // No server, no tool: let the call through to `wrappedExecute`,
            // which fails with the real reason instead of asking the user to
            // approve something that cannot run.
            return false;
          }

          logger.warn('Approval lookup failed; requiring approval for this call', {
            cause: error,
            serverId: server.id,
            tool: rawToolName,
          });
          return true;
        }

        return isMcpToolForcePromptBySource(current, { name: rawToolName });
      },
      execute: wrappedExecute,
      toModelOutput: ({ output }) => ({
        type: 'text',
        value: mcpResultToTextSummary(output as McpCallToolResult | undefined),
      }),
    } as Tool;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
