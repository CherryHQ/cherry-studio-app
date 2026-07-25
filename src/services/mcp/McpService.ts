import type { MCPClient } from '@ai-sdk/mcp';
import { createMCPClient } from '@ai-sdk/mcp';
import type { Tool, ToolSet } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

import { isMcpToolDisabledBySource } from '@/ai/tools/mcpSourcePolicy';
import { buildFunctionCallToolName } from '@/ai/tools/mcpToolName';
import { loggerService } from '@/core/logger/LoggerService';
import type { McpServerService } from '@/data/services/McpServerService';
import { DataApiError, ErrorCode } from '@/data/types/apiTypes';
import type { Assistant } from '@/data/types/assistant';
import { DEFAULT_MCP_TIMEOUT_SECONDS, type McpServer } from '@/data/types/mcpServer';

import type { McpCallToolResult } from './mcpResult';
import { mcpResultToTextSummary } from './mcpResult';
import { resolveServersForAssistant } from './resolveAssistantMcpServers';

const logger = loggerService.withContext('McpService');

const TOOLS_CACHE_TTL_MS = 5 * 60 * 1000;
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
  enabled: boolean;
  name: string;
};

type ToolsCacheEntry = {
  fetchedAt: number;
  rawTools: ToolSet;
};

/** Refresh-failure streak for a server, kept so `readCachedTools` backs off
 * instead of retrying a dead one on every message. */
type ToolsRefreshFailure = {
  consecutive: number;
  failedAt: number;
};

/** Distinguishes "we gave up waiting" from a real transport error, so the
 * message reaching the model can warn that the call may still be running. */
class McpTimeoutError extends Error {}

/** Thrown when a connect is superseded by `invalidateServer` mid-flight. Not a
 * server failure, so it must not count towards the refresh backoff. */
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
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => {
      onTimeout();
      reject(new McpTimeoutError(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(handle);
        resolve(value);
      },
      (error) => {
        clearTimeout(handle);
        reject(error);
      },
    );
  });
}

/**
 * Runtime MCP client manager (remote Streamable HTTP servers only).
 *
 * The chat hot path is **cache-only**: `getToolSetForAssistant` never connects,
 * so a dead or slow server cannot delay sending a message. Connecting is owned
 * by the background refresh and by the explicit settings-screen calls, both of
 * which are timeout-bounded.
 *
 * There is no ping API, so staleness is handled fail-and-drop: any failure from
 * `tools()` or from a tool call closes the client and the next use reconnects.
 * `invalidateServer` must be called after config changes.
 */
export class McpService {
  constructor(private readonly deps: { mcpServer: McpServerService }) {}

  private readonly clients = new Map<string, MCPClient>();
  private readonly pendingClients = new Map<string, Promise<MCPClient>>();
  private readonly pendingRefreshes = new Map<string, Promise<void>>();
  private readonly toolsCache = new Map<string, ToolsCacheEntry>();
  private readonly failures = new Map<string, ToolsRefreshFailure>();
  /** Per-server, bumped by `invalidateServer` so a fetch already in flight
   * cannot write its pre-invalidation tool list back into the cache that was
   * just cleared. Per-server rather than global: invalidating one server must
   * not discard the prewarm results of every other one. */
  private readonly epochs = new Map<string, number>();

  /**
   * AI SDK ToolSet for one chat request, keyed `mcp__{server}__{tool}`.
   *
   * Reads cached tools only and kicks a background refresh for anything missing
   * or stale, so a server contributes nothing until it has answered once.
   * Returns undefined when nothing applies. Never throws, never blocks on I/O.
   */
  async getToolSetForAssistant(assistant: Assistant): Promise<ToolSet | undefined> {
    let activeServers: McpServer[];
    try {
      ({ items: activeServers } = await this.deps.mcpServer.list({ isActive: true }));
    } catch (error) {
      logger.warn('Failed to list MCP servers for assistant', { error });
      return undefined;
    }

    // Outside the try: this is a pure filter over what we just read, so a throw
    // from it is a bug, not an unreachable server, and must not be swallowed.
    const servers = resolveServersForAssistant(assistant, activeServers);

    const result: ToolSet = {};
    for (const server of servers) {
      const rawTools = this.readCachedTools(server);
      if (!rawTools) {
        continue;
      }

      for (const [rawName, rawTool] of Object.entries(rawTools)) {
        if (isMcpToolDisabledBySource(server, { name: rawName })) {
          continue;
        }

        const key = buildFunctionCallToolName(server.name, rawName);
        if (result[key]) {
          logger.warn('Duplicate MCP tool key, skipping', { key, server: server.name });
          continue;
        }

        result[key] = this.wrapTool(rawTool, server, rawName);
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }

  /**
   * Warm the tool cache for every active server so the next chat request can
   * offer their tools. Fire-and-forget; failures are logged, never surfaced.
   */
  async prewarmActiveServers(): Promise<void> {
    try {
      const { items } = await this.deps.mcpServer.list({ isActive: true });
      for (const server of items) {
        this.refreshToolsInBackground(server);
      }
    } catch (error) {
      logger.warn('Failed to prewarm MCP servers', { error });
    }
  }

  /** Tool list for the server edit screen — connects, unlike the chat path. */
  async listToolsForServer(server: McpServer): Promise<McpToolSummary[]> {
    const rawTools = await this.fetchToolsWithRetry(server);

    return Object.entries(rawTools).map(([name, tool]) => ({
      description: toolDescription(tool),
      enabled: !isMcpToolDisabledBySource(server, { name }),
      name,
    }));
  }

  /**
   * Connection test against unsaved form values: a throwaway client that never
   * enters the pool.
   */
  async testConnection(config: McpConnectionConfig): Promise<{ tools: McpToolSummary[] }> {
    const client = await createHttpClient(config);
    try {
      const rawTools = await withTimeout(
        client.tools().then(castMcpToolSet),
        TOOLS_FETCH_TIMEOUT_MS,
        'MCP connection test',
        () => undefined,
      );
      return {
        tools: Object.entries(rawTools).map(([name, tool]) => ({
          description: toolDescription(tool),
          enabled: true,
          name,
        })),
      };
    } finally {
      client.close().catch(() => undefined);
    }
  }

  /** Drop the pooled client and tools cache after config change/delete. */
  invalidateServer(serverId: string): void {
    // An in-flight connect or tools fetch would otherwise repopulate the pool
    // and the cache moments after this call, from the superseded config.
    this.epochs.set(serverId, (this.epochs.get(serverId) ?? 0) + 1);
    for (const key of [...this.clients.keys()]) {
      if (key.startsWith(`${serverId}:`)) {
        this.closeQuietly(key);
      }
    }
    for (const key of [...this.pendingClients.keys()]) {
      if (key.startsWith(`${serverId}:`)) {
        this.pendingClients.delete(key);
      }
    }
    for (const key of [...this.pendingRefreshes.keys()]) {
      // Leaving this entry in place would make the dedupe guard swallow every
      // new refresh until the superseded one finishes — whose result the epoch
      // check then discards, so nothing would refill the cache at all.
      if (key.startsWith(`${serverId}:`)) {
        this.pendingRefreshes.delete(key);
      }
    }
    for (const key of [...this.toolsCache.keys()]) {
      if (key.startsWith(`${serverId}:`)) {
        this.toolsCache.delete(key);
      }
    }
    for (const key of [...this.failures.keys()]) {
      // Reconfiguring is the user's way of saying "try again now".
      if (key.startsWith(`${serverId}:`)) {
        this.failures.delete(key);
      }
    }
  }

  private serverKey(server: McpServer): string {
    // Config changes naturally mint a new key; invalidateServer matches on the
    // id prefix so stale-config entries are dropped too.
    return `${server.id}:${JSON.stringify([server.baseUrl, server.headers, server.timeout])}`;
  }

  /** Cached tools if we have any, serving stale while a refresh runs. */
  private readCachedTools(server: McpServer): ToolSet | undefined {
    const entry = this.toolsCache.get(this.serverKey(server));
    if (!entry || Date.now() - entry.fetchedAt >= TOOLS_CACHE_TTL_MS) {
      this.refreshToolsInBackground(server);
    }
    return entry?.rawTools;
  }

  private refreshToolsInBackground(server: McpServer): void {
    const key = this.serverKey(server);
    if (this.pendingRefreshes.has(key) || this.isBackingOff(key)) {
      return;
    }

    const refresh: Promise<void> = this.fetchRawTools(server, key)
      .then(() => {
        this.failures.delete(key);
      })
      .catch((error: unknown) => {
        if (error instanceof McpEvictedError) {
          // The user changed the config; backing off would punish them for it.
          return;
        }
        this.recordFailure(key);
        logger.warn('MCP tools refresh failed', { error, server: server.name });
        // Deliberately neither closes the client nor drops the cache. Every
        // cached tool's `execute` closes over its client, and `@ai-sdk/mcp`
        // rejects any request on a closed one, so evicting the client alone
        // would leave the model holding handles that cannot succeed. Keeping
        // both means a transient blip doesn't strip a working server's tools;
        // a session that is really dead gets dropped by the tool call itself,
        // and a wedged one by `withTimeout`'s `dropClient`.
      })
      .finally(() => {
        // `invalidateServer` may have evicted this entry and a newer refresh
        // taken the slot — don't unregister someone else's.
        if (this.pendingRefreshes.get(key) === refresh) {
          this.pendingRefreshes.delete(key);
        }
      });

    this.pendingRefreshes.set(key, refresh);
  }

  private isBackingOff(key: string): boolean {
    const failure = this.failures.get(key);
    if (!failure) {
      return false;
    }
    const wait = Math.min(
      REFRESH_BACKOFF_BASE_MS * 2 ** (failure.consecutive - 1),
      REFRESH_BACKOFF_MAX_MS,
    );
    return Date.now() - failure.failedAt < wait;
  }

  private recordFailure(key: string): void {
    this.failures.set(key, {
      consecutive: (this.failures.get(key)?.consecutive ?? 0) + 1,
      failedAt: Date.now(),
    });
  }

  private async getClient(server: McpServer): Promise<MCPClient> {
    const key = this.serverKey(server);

    const existing = this.clients.get(key);
    if (existing) {
      return existing;
    }

    const pending = this.pendingClients.get(key);
    if (pending) {
      return pending;
    }

    const initPromise: Promise<MCPClient> = createHttpClient(server)
      .then((client) => {
        if (this.pendingClients.get(key) !== initPromise) {
          // Invalidated mid-connect — don't resurrect the evicted entry. Fail
          // rather than hand back the closed client: every request on it would
          // reject anyway, just with a misleading transport error.
          client.close().catch(() => undefined);
          throw new McpEvictedError(`MCP server ${server.name} was reconfigured while connecting`);
        }
        this.clients.set(key, client);
        return client;
      })
      .finally(() => {
        if (this.pendingClients.get(key) === initPromise) {
          this.pendingClients.delete(key);
        }
      });

    this.pendingClients.set(key, initPromise);
    return initPromise;
  }

  private closeQuietly(key: string): void {
    this.clients
      .get(key)
      ?.close()
      .catch(() => undefined);
    this.clients.delete(key);
  }

  private dropClient(server: McpServer): void {
    const key = this.serverKey(server);
    this.closeQuietly(key);
    this.pendingClients.delete(key);
    this.toolsCache.delete(key);
  }

  private async fetchToolsWithRetry(server: McpServer): Promise<ToolSet> {
    const key = this.serverKey(server);
    try {
      return await this.fetchRawTools(server, key);
    } catch (error) {
      // Fail-and-drop: the pooled client may be stale (backgrounded socket,
      // expired session) — rebuild once before giving up.
      logger.warn('MCP tools() failed, reconnecting once', { error, server: server.name });
      this.dropClient(server);
      return this.fetchRawTools(server, key);
    }
  }

  private async fetchRawTools(server: McpServer, key: string): Promise<ToolSet> {
    const epoch = this.epochs.get(server.id) ?? 0;
    const rawTools = await withTimeout(
      (async () => {
        const client = await this.getClient(server);
        return castMcpToolSet(await client.tools());
      })(),
      TOOLS_FETCH_TIMEOUT_MS,
      `MCP server ${server.name}`,
      () => this.dropClient(server),
    );
    if ((this.epochs.get(server.id) ?? 0) === epoch) {
      this.toolsCache.set(key, { fetchedAt: Date.now(), rawTools });
    }
    return rawTools;
  }

  /**
   * Re-read the server so a tool call honours changes made after this ToolSet
   * was built — one send can run up to 20 tool steps, and the user may disable
   * a tool or the whole server in between.
   */
  private async assertToolStillAllowed(
    server: McpServer,
    rawToolName: string,
    label: string,
  ): Promise<void> {
    let current: McpServer;
    try {
      current = await this.deps.mcpServer.getById(server.id);
    } catch (error) {
      if (error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND) {
        throw new Error(`MCP server ${server.name} is no longer registered`);
      }
      // A locked or broken database is not a deleted server — saying so would
      // send the model, and the user, looking in the wrong place.
      throw new Error(`MCP tool ${label} could not verify its server: ${errorMessage(error)}`, {
        cause: error,
      });
    }

    if (!current.isActive) {
      throw new Error(`MCP server ${server.name} is not active`);
    }
    if (isMcpToolDisabledBySource(current, { name: rawToolName })) {
      throw new Error(`MCP tool ${label} is disabled`);
    }
  }

  private wrapTool(rawTool: Tool, server: McpServer, rawToolName: string): Tool {
    // `|| DEFAULT` rather than `??`: a stored 0 means "unset" here, matching
    // desktop. Treating it as a real timeout would fail every call instantly.
    const timeoutMs = (server.timeout || DEFAULT_MCP_TIMEOUT_SECONDS) * 1000;
    const execute = rawTool.execute;
    if (!execute) {
      return rawTool;
    }

    const label = `${server.name}/${rawToolName}`;

    const wrappedExecute = async (
      ...callArgs: Parameters<typeof execute>
    ): Promise<McpCallToolResult> => {
      await this.assertToolStillAllowed(server, rawToolName, label);

      let result: McpCallToolResult;
      try {
        result = (await withTimeout(
          Promise.resolve(execute(...callArgs)),
          timeoutMs,
          `MCP tool ${label}`,
          // A timed-out connection may be wedged — don't let later calls reuse it.
          () => this.dropClient(server),
        )) as McpCallToolResult;
      } catch (error) {
        // Any transport/protocol failure means the pooled client is suspect;
        // dropping here is what keeps a dead session from sticking around for
        // the rest of the cache TTL. The call itself is not retried — MCP tool
        // calls are not guaranteed idempotent.
        this.dropClient(server);
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
        this.dropClient(server);
        throw new Error(`MCP tool ${label} returned no result`);
      }
      if (result.isError) {
        throw new Error(`MCP tool ${label} failed: ${mcpResultToTextSummary(result)}`);
      }

      return result;
    };

    return {
      ...rawTool,
      description: rawTool.description || rawToolName,
      metadata: {
        cherry: {
          tool: { serverId: server.id, serverName: server.name, type: 'mcp' },
        },
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
