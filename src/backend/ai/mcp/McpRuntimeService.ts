import type { ListToolsResult, MCPClient } from '@ai-sdk/mcp';
import { createMCPClient } from '@ai-sdk/mcp';
import type { Tool, ToolSet } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

import { BaseService, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import { mcpServerService } from '@/backend/data/services/McpServerService';
import type {
  McpConnectionConfig,
  McpModule,
  McpServerInfo,
  McpServerRuntimeSummary,
  McpToolSummary,
} from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { McpServer } from '@/shared/data/types/mcpServer';

const logger = loggerService.withContext('McpRuntimeService');

/** Ceiling for connect + tools/list, enforced through abort signals the SDK
 * forwards to the transport (native support since `@ai-sdk/mcp@1.0.66`).
 * Without it a server that accepts the socket then stalls would pin a client
 * slot indefinitely. */
const TOOLS_FETCH_TIMEOUT_MS = 15 * 1000;
type McpServerRuntimeSnapshot = Omit<McpServerRuntimeSummary, 'lastError' | 'state'> & {
  endpointUrl: string;
};

type ServerRuntimeState = {
  /** Cancels every in-flight request of the current generation; replaced on
   * reset so later work runs under a fresh signal. */
  abort: AbortController;
  client?: MCPClient;
  connectionPromise?: Promise<MCPClient>;
  endpointUrl: string;
  generation: number;
  runtimeError?: string;
  serverId: string;
};

/** Distinguishes "we gave up waiting" from a real transport error. */
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

async function listAllTools(client: MCPClient, signal: AbortSignal): Promise<ToolSet> {
  const definitions: ListToolsResult['tools'] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const page = await client.listTools({
      options: { signal },
      ...(cursor ? { params: { cursor } } : {}),
    });
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

/** On failure — including an aborted initialize — the SDK closes its own
 * transport before rethrowing, so callers never inherit a half-open client. */
function createHttpClient(config: McpConnectionConfig, signal: AbortSignal): Promise<MCPClient> {
  return createMCPClient({
    clientName: 'Cherry Studio',
    initializationOptions: { signal },
    transport: {
      type: 'http',
      url: config.endpointUrl,
      fetch: expoFetch as unknown as typeof fetch,
    },
  });
}

function hasRunnableUrl(server: McpServer): boolean {
  return /^https?:\/\//i.test(server.endpointUrl);
}

/**
 * A timeout signal composed with upstream signals a settings request must obey
 * (state eviction or caller cancellation).
 *
 * The SDK forwards the composed signal to the transport, so timing out — or
 * evicting — genuinely cancels the network request. Rejections are then
 * classified by inspecting our own signals rather than the SDK's error types,
 * which are not exported and are free to change across SDK majors.
 *
 * `AbortSignal.timeout`/`AbortSignal.any` are installed on the native runtime
 * by Expo's winter `installAbortSignalPatch`.
 */
type BoundedSignal = {
  didTimeout: () => boolean;
  /** Settle the bound: clears the pending timer once the work is over. */
  done: () => void;
  signal: AbortSignal;
};

function boundedSignal(
  timeoutMs: number,
  ...upstream: readonly (AbortSignal | undefined)[]
): BoundedSignal {
  const timeoutController = new AbortController();
  let timedOut = false;
  const handle = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, timeoutMs);

  const signals = [timeoutController.signal, ...upstream.filter((signal) => signal !== undefined)];
  return {
    didTimeout: () => timedOut,
    done: () => clearTimeout(handle),
    signal: signals.length === 1 ? timeoutController.signal : AbortSignal.any(signals),
  };
}

/**
 * Runtime MCP client manager (remote Streamable HTTP servers only).
 *
 * Every read fetches `tools/list` live, bounded by `TOOLS_FETCH_TIMEOUT_MS`.
 * Fetches reconnect once; tool calls are never replayed.
 *
 * ## TODO: design a mobile caching strategy
 *
 * The tool cache this service used to carry was ported from desktop
 * (`MCPService.ts`'s `withCache(..., 5 * 60 * 1000)`) and then patched with
 * mobile-only behaviour — stale-while-revalidate, failure backoff, startup and
 * post-save prewarming, a cache-only chat path. That stack was never designed
 * against mobile constraints, so it was removed wholesale rather than tuned.
 * What replaces it has to answer, for a phone on cellular:
 * - The settings list reports `connected` from a live client, so a row that has
 *   never been read this session shows `connecting` until something reads it.
 * - Nothing rate-limits a dead server anymore; that was the backoff's job.
 *
 * Connection reuse (`runtimeStates`) deliberately stayed so repeated settings
 * reads do not reconnect for every tools/list request.
 *
 * ## AI SDK v7 migration seams
 *
 * `castMcpToolSet` and the `schemaBrand.test.ts` canary are the only package-copy
 * compatibility seam; both become obsolete once `ai` and `@ai-sdk/mcp` share a
 * `provider-utils` version.
 */
@Injectable('McpRuntimeService')
@ServicePhase(Phase.PostReady)
export class McpRuntimeService extends BaseService implements McpModule {
  private readonly runtimeStates = new Map<string, ServerRuntimeState>();
  private readonly runtimeSnapshots = new Map<string, McpServerRuntimeSnapshot>();

  /** Runtime metadata for the settings list, reported from live client state. */
  getRuntimeSummaries(
    servers: readonly McpServer[],
  ): Promise<Record<string, McpServerRuntimeSummary>> {
    return Promise.resolve(
      Object.fromEntries(servers.map((server) => [server.id, this.getRuntimeSummary(server)])),
    );
  }

  /** Tool list for the server edit screen. */
  async listTools(serverId: string): Promise<McpToolSummary[]> {
    const server = await mcpServerService.getById(serverId);
    if (!hasRunnableUrl(server)) {
      throw new Error(`MCP server ${server.name} has no valid HTTP URL`);
    }

    const rawTools = await this.fetchToolsWithRetry(server, this.getRuntimeState(server));
    return Object.entries(rawTools).map(([name, tool]) => ({
      description: toolDescription(tool),
      name,
    }));
  }

  /** Initialization metadata used to name a server before its first save. */
  async getServerInfo(config: McpConnectionConfig): Promise<McpServerInfo> {
    return this.withTemporaryClient(config, 'MCP server info', (client) => ({
      name: client.serverInfo.name,
      title: client.serverInfo.title,
      version: client.serverInfo.version,
    }));
  }

  /**
   * Drop every server's runtime. Without it the pooled clients stay open
   * against a service nothing will read again.
   */
  protected onStop(): void {
    for (const state of [...this.runtimeStates.values()]) {
      this.retireState(state);
    }

    this.runtimeSnapshots.clear();
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
   * The endpoint URL is the whole transport config, so it doubles as the
   * identity that retires a pooled client when the user edits it. A snapshot
   * outlives its connection — `invalidateServer(id, { preserveSnapshot: true })`
   * leaves a disabled server's behind — so it carries the URL it was taken
   * against and is discarded once that no longer matches.
   */
  private getRuntimeState(server: McpServer): ServerRuntimeState {
    if (this.runtimeSnapshots.get(server.id)?.endpointUrl !== server.endpointUrl) {
      this.runtimeSnapshots.delete(server.id);
    }
    const current = this.runtimeStates.get(server.id);
    if (current?.endpointUrl === server.endpointUrl) {
      return current;
    }

    const generation = current ? current.generation + 1 : 0;
    if (current) {
      this.retireState(current);
    }

    const state: ServerRuntimeState = {
      abort: new AbortController(),
      endpointUrl: server.endpointUrl,
      generation,
      serverId: server.id,
    };
    this.runtimeStates.set(server.id, state);
    return state;
  }

  private getRuntimeSummary(server: McpServer): McpServerRuntimeSummary {
    const storedSnapshot = this.runtimeSnapshots.get(server.id);
    const snapshot =
      storedSnapshot?.endpointUrl === server.endpointUrl
        ? {
            lastConnectedAt: storedSnapshot.lastConnectedAt,
            serverName: storedSnapshot.serverName,
            serverTitle: storedSnapshot.serverTitle,
            serverVersion: storedSnapshot.serverVersion,
            toolCount: storedSnapshot.toolCount,
          }
        : {};

    if (!server.isEnabled) {
      return { ...snapshot, state: 'disabled' };
    }
    if (!hasRunnableUrl(server)) {
      return { ...snapshot, lastError: 'Invalid MCP server URL', state: 'error' };
    }

    const state = this.runtimeStates.get(server.id);
    if (state?.runtimeError) {
      return { ...snapshot, lastError: state.runtimeError, state: 'error' };
    }
    if (state?.client) {
      return { ...snapshot, state: 'connected' };
    }
    return { ...snapshot, state: 'connecting' };
  }

  private recordRuntimeError(state: ServerRuntimeState, error: unknown): void {
    state.runtimeError = errorMessage(error);
  }

  private async getClient(
    server: McpServer,
    state: ServerRuntimeState,
    signal: AbortSignal,
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
    const initPromise: Promise<MCPClient> = createHttpClient(server, signal)
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
    const bound = boundedSignal(TOOLS_FETCH_TIMEOUT_MS);
    let client: MCPClient | undefined;
    try {
      client = await createHttpClient(config, bound.signal);
      return await operation(client);
    } catch (error) {
      if (bound.didTimeout()) {
        throw new McpTimeoutError(`${label} timed out after ${TOOLS_FETCH_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      bound.done();
      if (client) {
        this.closeQuietly(client);
      }
    }
  }

  private resetConnection(state: ServerRuntimeState): void {
    if (!this.isCurrentState(state)) {
      return;
    }

    state.generation += 1;
    state.abort.abort();
    state.abort = new AbortController();
    state.connectionPromise = undefined;
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
    state.abort.abort();
    state.connectionPromise = undefined;
    if (state.client) {
      this.closeQuietly(state.client);
      state.client = undefined;
    }
  }

  private isCurrentState(state: ServerRuntimeState, generation = state.generation): boolean {
    return this.runtimeStates.get(state.serverId) === state && state.generation === generation;
  }

  private async fetchToolsWithRetry(
    server: McpServer,
    state: ServerRuntimeState,
  ): Promise<ToolSet> {
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

  private async fetchRawTools(server: McpServer, state: ServerRuntimeState): Promise<ToolSet> {
    const generation = state.generation;
    // One bound covers connect + full pagination, matching the old wall-clock
    // ceiling. Eviction rides the same composed signal.
    const bound = boundedSignal(TOOLS_FETCH_TIMEOUT_MS, state.abort.signal);
    let rawTools: ToolSet;
    try {
      const client = await this.getClient(server, state, bound.signal);
      rawTools = await listAllTools(client, bound.signal);
    } catch (error) {
      if (error instanceof McpEvictedError) {
        throw error;
      }
      if (!this.isCurrentState(state, generation)) {
        throw new McpEvictedError(`MCP server ${server.name} was invalidated while listing tools`);
      }
      if (bound.didTimeout()) {
        this.resetConnection(state);
        throw new McpTimeoutError(
          `MCP server ${server.name} timed out after ${TOOLS_FETCH_TIMEOUT_MS}ms`,
        );
      }
      throw error;
    } finally {
      bound.done();
    }
    if (!this.isCurrentState(state, generation)) {
      throw new McpEvictedError(`MCP server ${server.name} was invalidated while listing tools`);
    }

    const client = state.client;
    state.runtimeError = undefined;
    this.runtimeSnapshots.set(server.id, {
      lastConnectedAt: Date.now(),
      endpointUrl: state.endpointUrl,
      serverName: client?.serverInfo.name,
      serverTitle: client?.serverInfo.title,
      serverVersion: client?.serverInfo.version,
      toolCount: Object.keys(rawTools).length,
    });
    return rawTools;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
