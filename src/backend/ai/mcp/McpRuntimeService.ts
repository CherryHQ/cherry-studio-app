import type { ListToolsResult, MCPClient } from '@ai-sdk/mcp';
import { createMCPClient } from '@ai-sdk/mcp';
import { resolveServersForAssistant } from '@cherrystudio/ai-runtime/tools';
import type { McpCallToolResult } from '@cherrystudio/universal/ai/tools/mcpResult';
import { mcpResultToTextSummary } from '@cherrystudio/universal/ai/tools/mcpResult';
import { buildFunctionCallToolName } from '@cherrystudio/universal/ai/tools/mcpToolName';
import type { Tool, ToolSet } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

import type { ToolEntry } from '@/backend/ai/tools';
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
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import type { Assistant } from '@/shared/data/types/assistant';
import type { McpServer } from '@/shared/data/types/mcpServer';

const logger = loggerService.withContext('McpRuntimeService');

/** Ceiling for connect + tools/list, enforced through abort signals the SDK
 * forwards to the transport (native support since `@ai-sdk/mcp@1.0.66`).
 * Without it a server that accepts the socket then stalls would pin a client
 * slot indefinitely. */
const TOOLS_FETCH_TIMEOUT_MS = 15 * 1000;
/** Ceiling for one tool call. Fixed application policy: the table stores the
 * connection, not per-server tuning. */
const TOOL_CALL_TIMEOUT_MS = 60 * 1000;

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
 * A timeout signal composed with the upstream signals a request must also obey
 * (state eviction, the chat turn's own abort).
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
 * - `getToolEntriesForAssistant` runs on every message. A live `initialize` +
 *   `tools/list` per enabled server now sits in front of every send, and an
 *   unreachable server costs the full `TOOLS_FETCH_TIMEOUT_MS` each time.
 * - The settings list reports `connected` off a live client, so a row that has
 *   never been read this session shows `connecting` until something reads it.
 * - Nothing rate-limits a dead server anymore; that was the backoff's job.
 *
 * Connection reuse (`runtimeStates`) deliberately stayed: the SDK builds each
 * tool's `execute` as a closure over its client, and one send can run up to 20
 * tool steps, so the client has to outlive the ToolSet that borrowed it.
 * Replacing the pool means giving connections a request-scoped lifetime with an
 * explicit dispose, which is a design change rather than a deletion.
 *
 * ## AI SDK v7 migration seams
 *
 * Everything version-sensitive is pinned to a single site, so moving to
 * `ai@7` + `@ai-sdk/mcp@2` touches exactly:
 * - `wrapTool`'s `needsApproval: true` — v7 replaces the tool property with a
 *   `toolApproval` setting on the generation call.
 * - `castMcpToolSet` and the `schemaBrand.test.ts` canary — obsolete once both
 *   packages share one `provider-utils`.
 * - This file and `preboot/abortSignal.ts` are the only `@ai-sdk/mcp` imports.
 * Persisted shapes (`metadata.cherry.tool`, result `output.metadata`, the
 * `mcp__{server}__{tool}` name mint) are frozen and migrate as-is.
 */
@Injectable('McpRuntimeService')
@ServicePhase(Phase.PostReady)
export class McpRuntimeService extends BaseService implements McpModule {
  private readonly runtimeStates = new Map<string, ServerRuntimeState>();
  private readonly runtimeSnapshots = new Map<string, McpServerRuntimeSnapshot>();

  /**
   * Request-scoped registry entries keyed `mcp__{server}__{tool}`.
   *
   * Fetches every server's tools live and in parallel. A server that fails or
   * times out drops out of this turn rather than failing the send, so MCP
   * problems never surface as chat errors.
   */
  async getToolEntriesForAssistant(
    assistant: Assistant,
    selectedToolIds?: readonly string[],
  ): Promise<ToolEntry[]> {
    let enabledServers: McpServer[];
    try {
      ({ items: enabledServers } = await mcpServerService.list({ isEnabled: true }));
    } catch (error) {
      logger.warn('Failed to list MCP servers for assistant', { error });
      return [];
    }

    // Outside the try: this is a pure filter over what we just read, so a throw
    // from it is a bug, not an unreachable server, and must not be swallowed.
    const servers = resolveServersForAssistant(assistant, enabledServers).filter(hasRunnableUrl);
    const fetched = await Promise.all(
      servers.map(async (server) => {
        const state = this.getRuntimeState(server);
        try {
          // One attempt only: a reconnect would double what an unreachable
          // server costs the send. The settings screen retries, this does not.
          return { rawTools: await this.fetchRawTools(server, state), server, state };
        } catch (error) {
          if (!(error instanceof McpEvictedError)) {
            logger.warn('MCP tools unavailable for this turn', { error, server: server.name });
          }
          return undefined;
        }
      }),
    );

    const selectedToolIdSet = selectedToolIds ? new Set(selectedToolIds) : undefined;
    const entries: ToolEntry[] = [];
    const registeredNames = new Set<string>();
    for (const entry of fetched) {
      if (!entry) {
        continue;
      }
      const { rawTools, server, state } = entry;
      // A save or disable during the fetch retires this request's transport.
      // The next request reads the new row.
      if (!this.isCurrentState(state)) {
        continue;
      }

      const disabledTools = new Set(server.disabledTools);
      for (const [rawName, rawTool] of Object.entries(rawTools)) {
        if (disabledTools.has(rawName)) {
          continue;
        }

        const key = buildFunctionCallToolName(server.name, rawName);
        if (selectedToolIdSet && !selectedToolIdSet.has(key)) {
          continue;
        }
        if (registeredNames.has(key)) {
          logger.warn('Duplicate MCP tool key, skipping', { key, server: server.name });
          continue;
        }

        registeredNames.add(key);
        entries.push({
          // Every MCP tool is approval-gated, and `tool_invoke` refuses to run
          // an approval-gated tool, so deferring one would make it unreachable.
          defer: 'never',
          description: toolDescription(rawTool) ?? rawName,
          name: key,
          namespace: `mcp:${server.name}`,
          tool: this.wrapTool(rawTool, server, rawName, state),
        });
      }
    }

    return entries;
  }

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

  /**
   * Re-read the server so a tool call honours changes made after this ToolSet
   * was built — one send can run up to 20 tool steps, and the user may disable
   * or delete the server in between.
   */
  private async assertToolStillAllowed(server: McpServer, rawToolName: string): Promise<McpServer> {
    let current: McpServer;
    try {
      current = await mcpServerService.getById(server.id);
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

    if (!current.isEnabled) {
      throw new Error(`MCP server ${current.name} is not enabled`);
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
      input: Parameters<typeof execute>[0],
      callOptions: Parameters<typeof execute>[1],
    ): Promise<McpCallToolResult & { metadata: McpResultSource }> => {
      const current = await this.assertToolStillAllowed(server, rawToolName);
      if (this.getRuntimeState(current) !== state) {
        throw new Error(`MCP server ${current.name} was reconfigured before the tool call`);
      }

      const label = `${current.name}/${rawToolName}`;
      const callerSignal = callOptions?.abortSignal;
      const bound = boundedSignal(TOOL_CALL_TIMEOUT_MS, state.abort.signal, callerSignal);

      let result: McpCallToolResult;
      try {
        result = (await execute(input, {
          ...callOptions,
          abortSignal: bound.signal,
        })) as McpCallToolResult;
        bound.done();
      } catch (error) {
        bound.done();
        if (callerSignal?.aborted) {
          // The chat turn itself was aborted. The transport cancelled this one
          // request cleanly, so the pooled client is not suspect.
          throw error;
        }
        // Any transport/protocol failure means the pooled client is suspect;
        // dropping it here keeps a dead session from being handed to the next
        // caller. The call itself is not retried — MCP tool calls are not
        // guaranteed idempotent.
        this.resetConnection(state);
        this.recordRuntimeError(state, error);
        if (bound.didTimeout()) {
          // Cancelled client-side only — the server may have received the
          // request and still be working. Say so, or the model retries a write
          // it already made.
          throw new Error(
            `MCP tool ${label} timed out after ${TOOL_CALL_TIMEOUT_MS}ms. The server may still be processing it — do not repeat this call without checking its effect first.`,
            { cause: error },
          );
        }
        throw new Error(`MCP tool ${label} failed: ${errorMessage(error)}`, { cause: error });
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
      // Fixed application policy, not per-server configuration: a remote server
      // gets to run code on the user's behalf, so every call asks first.
      // Approval rides on the AI SDK's native gate — when this is true the SDK
      // emits a `tool-approval-request` instead of executing and the turn ends
      // cleanly, so MCP tools must stay in the native toolset.
      needsApproval: true,
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
