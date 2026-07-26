import type { MCPClient } from '@ai-sdk/mcp';
import { createMCPClient } from '@ai-sdk/mcp';
import type { Tool, ToolSet } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

import { loggerService } from '@/core/logger/LoggerService';
import type { McpServerService } from '@/data/services/McpServerService';
import { DataApiError, ErrorCode } from '@/data/types/apiTypes';
import type { Assistant } from '@/data/types/assistant';
import { DEFAULT_MCP_TIMEOUT_SECONDS, type McpServer } from '@/data/types/mcpServer';

import type { McpCallToolResult } from './mcpResult';
import { mcpResultToTextSummary } from './mcpResult';
import { isMcpToolDisabledBySource, isMcpToolForcePromptBySource } from './mcpSourcePolicy';
import { buildFunctionCallToolName } from './mcpToolName';
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

type ServerRuntimeState = {
  client?: MCPClient;
  connectionPromise?: Promise<MCPClient>;
  failure?: ToolsRefreshFailure;
  generation: number;
  refreshPromise?: Promise<void>;
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

function hasRunnableUrl(server: McpServer): boolean {
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
 * The chat hot path is **cache-only**: `getToolSetForAssistant` never connects,
 * so a dead or slow server cannot delay sending a message. Connecting is owned
 * by the background refresh and by `listToolsForServer`, which the settings
 * screen calls — and, for the one case that cannot be answered from cache, the
 * approval sheet: clearing a server-wide auto-approve rule rewrites it as one
 * entry per remaining tool, so it needs the full list or it silently drops the
 * rules of the tools it is missing. Both are timeout-bounded.
 *
 * Background refresh preserves the last good cache and backs off after failure.
 * Explicit tool listings reconnect once; tool calls are never replayed.
 */
export class McpService {
  constructor(private readonly deps: { mcpServer: McpServerService }) {}

  private readonly runtimeStates = new Map<string, ServerRuntimeState>();

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
    const servers = resolveServersForAssistant(assistant, activeServers).filter(hasRunnableUrl);

    const result: ToolSet = {};
    for (const server of servers) {
      const cached = this.readCachedTools(server);
      if (!cached) {
        continue;
      }

      for (const [rawName, rawTool] of Object.entries(cached.rawTools)) {
        if (isMcpToolDisabledBySource(server, { name: rawName })) {
          continue;
        }

        const key = buildFunctionCallToolName(server.name, rawName);
        if (result[key]) {
          logger.warn('Duplicate MCP tool key, skipping', { key, server: server.name });
          continue;
        }

        result[key] = this.wrapTool(rawTool, server, rawName, cached.state);
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
      for (const server of items.filter(hasRunnableUrl)) {
        this.refreshToolsInBackground(server);
      }
    } catch (error) {
      logger.warn('Failed to prewarm MCP servers', { error });
    }
  }

  /** Tool list for the server edit screen — connects, unlike the chat path. */
  async listToolsForServer(server: McpServer): Promise<McpToolSummary[]> {
    if (!hasRunnableUrl(server)) {
      throw new Error(`MCP server ${server.name} has no valid HTTP URL`);
    }
    const rawTools = await this.fetchToolsWithRetry(server);

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
    let client: MCPClient | undefined;
    let acceptClient = true;
    const request = createHttpClient(config).then(async (createdClient) => {
      if (!acceptClient) {
        this.closeQuietly(createdClient);
        throw new McpEvictedError('MCP connection test already ended');
      }
      client = createdClient;
      return castMcpToolSet(await createdClient.tools());
    });

    try {
      const rawTools = await withTimeout(
        request,
        TOOLS_FETCH_TIMEOUT_MS,
        'MCP connection test',
        () => {
          acceptClient = false;
        },
      );
      return Object.entries(rawTools).map(([name, tool]) => ({
        description: toolDescription(tool),
        name,
      }));
    } finally {
      acceptClient = false;
      if (client) {
        this.closeQuietly(client);
      }
    }
  }

  /** Drop one server's runtime after transport change, disable, or delete. */
  invalidateServer(serverId: string): void {
    const state = this.runtimeStates.get(serverId);
    if (state) {
      this.retireState(state);
    }
  }

  private transportFingerprint(config: McpConnectionConfig): string {
    const headers = Object.entries(config.headers ?? {}).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return JSON.stringify([config.baseUrl, headers]);
  }

  private getRuntimeState(server: McpServer): ServerRuntimeState {
    const transportFingerprint = this.transportFingerprint(server);
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

  /** Cached tools if we have any, serving stale while a refresh runs. */
  private readCachedTools(
    server: McpServer,
  ): { rawTools: ToolSet; state: ServerRuntimeState } | undefined {
    const state = this.getRuntimeState(server);
    const entry = state.toolsCache;
    if (!entry || Date.now() - entry.fetchedAt >= TOOLS_CACHE_TTL_MS) {
      this.refreshToolsInBackground(server, state);
    }
    return entry ? { rawTools: entry.rawTools, state } : undefined;
  }

  private refreshToolsInBackground(server: McpServer, state = this.getRuntimeState(server)): void {
    if (state.refreshPromise || this.isBackingOff(state)) {
      return;
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
        this.recordFailure(state);
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

  private recordFailure(state: ServerRuntimeState): void {
    state.failure = {
      consecutive: (state.failure?.consecutive ?? 0) + 1,
      failedAt: Date.now(),
    };
  }

  private async getClient(server: McpServer, state: ServerRuntimeState): Promise<MCPClient> {
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

  private async fetchToolsWithRetry(server: McpServer): Promise<ToolSet> {
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
        }
        throw retryError;
      }
    }
  }

  private async fetchRawTools(server: McpServer, state: ServerRuntimeState): Promise<ToolSet> {
    const generation = state.generation;
    const rawTools = await withTimeout(
      (async () => {
        const client = await this.getClient(server, state);
        return castMcpToolSet(await client.tools());
      })(),
      TOOLS_FETCH_TIMEOUT_MS,
      `MCP server ${server.name}`,
      () => this.resetConnection(state),
      state.timeoutCancellations,
    );
    if (!this.isCurrentState(state, generation)) {
      throw new McpEvictedError(`MCP server ${server.name} was invalidated while listing tools`);
    }

    state.failure = undefined;
    state.toolsCache = { fetchedAt: Date.now(), rawTools };
    return rawTools;
  }

  /**
   * Re-read the server so a tool call honours changes made after this ToolSet
   * was built — one send can run up to 20 tool steps, and the user may disable
   * a tool or the whole server in between.
   */
  private async assertToolStillAllowed(server: McpServer, rawToolName: string): Promise<McpServer> {
    let current: McpServer;
    try {
      current = await this.deps.mcpServer.getById(server.id);
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
    server: McpServer,
    rawToolName: string,
    state: ServerRuntimeState,
  ): Tool {
    const execute = rawTool.execute;
    if (!execute) {
      return rawTool;
    }

    const wrappedExecute = async (
      ...callArgs: Parameters<typeof execute>
    ): Promise<McpCallToolResult> => {
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

      return result;
    };

    return {
      ...rawTool,
      description: rawTool.description || rawToolName,
      metadata: {
        cherry: {
          // `rawName` is the server's own name for the tool. The key this tool
          // is registered under is the camelCased wire id, which the rule lists
          // can't be matched against — so it has to travel with the part for
          // the approval sheet to be able to write a per-tool rule.
          tool: {
            rawName: rawToolName,
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
        let current: McpServer;
        try {
          current = await this.deps.mcpServer.getById(server.id);
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
