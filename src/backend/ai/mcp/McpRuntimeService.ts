import type { ListToolsResult, MCPClient } from '@ai-sdk/mcp';
import { createMCPClient } from '@ai-sdk/mcp';
import { fetch as expoFetch } from 'expo/fetch';

import type { RuntimeJsonValue, RuntimeTool, RuntimeToolRef } from '@/backend/ai/agent';
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
import { isSameMcpConnectionConfig, normalizeMcpHeaders } from '@/shared/utils/mcpConnectionConfig';

import {
  createBoundedSignal,
  createMcpRuntimeTools,
  type McpExecutableToolDescriptor,
  type McpRuntimeToolSelection,
  McpRuntimeToolError,
  prepareMcpInputSchema,
} from './mcpRuntimeAdapter';

const logger = loggerService.withContext('McpRuntimeService');

/** Ceiling for connect + tools/list, enforced through abort signals the SDK
 * forwards to the transport (native support since `@ai-sdk/mcp@1.0.66`).
 * Without it a server that accepts the socket then stalls would pin a client
 * slot indefinitely. */
const TOOLS_FETCH_TIMEOUT_MS = 15 * 1000;
type McpServerRuntimeSnapshot = Omit<McpServerRuntimeSummary, 'lastError' | 'state'> & {
  connectionConfig: McpConnectionConfig;
};

type McpToolCallingClient = MCPClient & {
  callTool(input: {
    args: Record<string, unknown>;
    name: string;
    options: { abortSignal: AbortSignal };
  }): Promise<unknown>;
};

type ServerRuntimeState = {
  /** Cancels every in-flight request of the current generation; replaced on
   * reset so later work runs under a fresh signal. */
  abort: AbortController;
  client?: MCPClient;
  connectionConfig: McpConnectionConfig;
  connectionPromise?: Promise<MCPClient>;
  discoveredToolNames: Set<string>;
  generation: number;
  runtimeError?: string;
  serverId: string;
};

/** Distinguishes "we gave up waiting" from a real transport error. */
class McpTimeoutError extends Error {}

/** Runtime work superseded by invalidation; it must not count as a server failure. */
class McpEvictedError extends Error {}

function unavailableToolError(): McpRuntimeToolError {
  return new McpRuntimeToolError(
    'mcp_tool_unavailable',
    'The MCP tool is no longer available.',
    false,
  );
}

async function listAllTools(
  client: MCPClient,
  signal: AbortSignal,
): Promise<ListToolsResult['tools']> {
  const definitions: ListToolsResult['tools'] = [];
  const seenCursors = new Set<string>();
  const seenToolNames = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const page = await client.listTools({
      options: { signal },
      ...(cursor ? { params: { cursor } } : {}),
    });
    for (const tool of page.tools) {
      if (seenToolNames.has(tool.name)) {
        throw new McpRuntimeToolError(
          'mcp_tool_unavailable',
          'The MCP tool catalog contains a duplicate tool identity.',
          false,
        );
      }
      seenToolNames.add(tool.name);
      definitions.push(tool);
    }

    if (!page.nextCursor) {
      break;
    }
    if (seenCursors.has(page.nextCursor)) {
      throw new McpRuntimeToolError(
        'mcp_tool_unavailable',
        'The MCP tool catalog returned a repeated page cursor.',
        false,
      );
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  return definitions;
}

/** On failure — including an aborted initialize — the SDK closes its own
 * transport before rethrowing, so callers never inherit a half-open client. */
function createHttpClient(config: McpConnectionConfig, signal: AbortSignal): Promise<MCPClient> {
  const headers = normalizeMcpHeaders(config.headers);
  return createMCPClient({
    clientName: 'Cherry Studio',
    initializationOptions: { signal },
    transport: {
      type: 'http',
      url: config.endpointUrl,
      fetch: expoFetch as unknown as typeof fetch,
      ...(Object.keys(headers).length > 0 && { headers }),
    },
  });
}

function hasRunnableUrl(server: McpServer): boolean {
  return /^https?:\/\//i.test(server.endpointUrl);
}

function isMcpToolCallingClient(client: MCPClient): client is McpToolCallingClient {
  return typeof (client as { callTool?: unknown }).callTool === 'function';
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
 */
@Injectable('McpRuntimeService')
@ServicePhase(Phase.PostReady)
export class McpRuntimeService extends BaseService implements McpModule {
  private nextGeneration = 0;
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
    return rawTools.map((tool) => ({
      description: tool.description,
      name: tool.name,
    }));
  }

  /** Raw, JSON-safe definitions used by the Host-facing Runtime projection. */
  async listExecutableToolDescriptors(serverId: string): Promise<McpExecutableToolDescriptor[]> {
    const server = await mcpServerService.getById(serverId);
    if (!server.isEnabled || !hasRunnableUrl(server)) {
      throw new McpRuntimeToolError(
        'mcp_tool_unavailable',
        'The MCP server is not executable.',
        false,
      );
    }

    let definitions: ListToolsResult['tools'];
    try {
      definitions = await this.fetchToolsWithRetry(server, this.getRuntimeState(server));
    } catch (error) {
      if (error instanceof McpRuntimeToolError) {
        throw error;
      }
      throw new McpRuntimeToolError(
        'mcp_tool_unavailable',
        'The MCP tool catalog is unavailable.',
        true,
      );
    }
    const disabledTools = new Set(server.disabledTools);
    const state = this.runtimeStates.get(server.id);
    if (!state) {
      throw unavailableToolError();
    }
    return definitions
      .filter((tool) => !disabledTools.has(tool.name))
      .map((tool) => ({
        description: tool.description ?? '',
        displayName: tool.title ?? tool.annotations?.title ?? tool.name,
        // Pin the catalog to both its endpoint and live connection generation;
        // edits, invalidation, or reconnects cannot retarget a frozen tool.
        endpointUrl: server.endpointUrl,
        generation: state.generation,
        inputSchema: prepareMcpInputSchema(tool.inputSchema),
        rawToolName: tool.name,
        serverId: server.id,
      }));
  }

  /** Adapt an already selected catalog without reading Agent bindings or injecting the Host. */
  createRuntimeTools(selections: readonly McpRuntimeToolSelection[]): RuntimeTool[] {
    return createMcpRuntimeTools(selections, {
      invoke: (ref, input, signal, discoveredEndpointUrl, discoveredGeneration) =>
        this.invokeTool(ref, input, signal, discoveredEndpointUrl, discoveredGeneration),
    });
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
   * URL and headers form the transport identity that retires a pooled client
   * when the user edits either. A snapshot outlives its connection, so it keeps
   * the config it was taken against and is discarded once that no longer matches.
   */
  private getRuntimeState(server: McpServer): ServerRuntimeState {
    const connectionConfig = toMcpConnectionConfig(server);
    const snapshot = this.runtimeSnapshots.get(server.id);
    if (snapshot && !isSameMcpConnectionConfig(snapshot.connectionConfig, connectionConfig)) {
      this.runtimeSnapshots.delete(server.id);
    }
    const current = this.runtimeStates.get(server.id);
    if (current && isSameMcpConnectionConfig(current.connectionConfig, connectionConfig)) {
      return current;
    }

    if (current) {
      this.retireState(current);
    }

    const state: ServerRuntimeState = {
      abort: new AbortController(),
      connectionConfig,
      discoveredToolNames: new Set(),
      generation: this.allocateGeneration(),
      serverId: server.id,
    };
    this.runtimeStates.set(server.id, state);
    return state;
  }

  private getRuntimeSummary(server: McpServer): McpServerRuntimeSummary {
    const storedSnapshot = this.runtimeSnapshots.get(server.id);
    const snapshot =
      storedSnapshot &&
      isSameMcpConnectionConfig(storedSnapshot.connectionConfig, toMcpConnectionConfig(server))
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
    state.runtimeError =
      error instanceof McpTimeoutError
        ? 'MCP request timed out.'
        : error instanceof McpRuntimeToolError
          ? error.message
          : 'MCP connection failed.';
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
    const initPromise: Promise<MCPClient> = createHttpClient(state.connectionConfig, signal)
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
    const bound = createBoundedSignal(TOOLS_FETCH_TIMEOUT_MS);
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

    state.generation = this.allocateGeneration();
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
    state.generation = this.allocateGeneration();
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

  private allocateGeneration(): number {
    const generation = this.nextGeneration;
    this.nextGeneration += 1;
    return generation;
  }

  private async invokeTool(
    ref: Extract<RuntimeToolRef, { source: 'mcp' }>,
    input: RuntimeJsonValue,
    signal: AbortSignal,
    discoveredEndpointUrl: string,
    discoveredGeneration: number,
  ): Promise<unknown> {
    if (input === null || Array.isArray(input) || typeof input !== 'object') {
      throw new McpRuntimeToolError(
        'mcp_tool_input_invalid',
        'The MCP tool input did not match its JSON Schema.',
        false,
      );
    }

    let server: McpServer;
    try {
      server = await mcpServerService.getById(ref.serverId);
    } catch {
      throw unavailableToolError();
    }
    if (
      !server.isEnabled ||
      !hasRunnableUrl(server) ||
      server.disabledTools.includes(ref.rawToolName)
    ) {
      throw unavailableToolError();
    }
    // An endpoint edit retargets the server row, but never a frozen catalog:
    // the tool the user saw and approved fails unavailable instead.
    if (server.endpointUrl !== discoveredEndpointUrl) {
      throw unavailableToolError();
    }

    const state = this.runtimeStates.get(server.id);
    if (
      !state ||
      !isSameMcpConnectionConfig(state.connectionConfig, toMcpConnectionConfig(server)) ||
      state.generation !== discoveredGeneration ||
      !state.discoveredToolNames.has(ref.rawToolName)
    ) {
      throw unavailableToolError();
    }
    const generation = state.generation;
    const invocationSignal = AbortSignal.any([signal, state.abort.signal]);
    try {
      const client = await this.getClient(server, state, invocationSignal);
      if (!this.isCurrentState(state, generation)) {
        throw unavailableToolError();
      }
      if (!isMcpToolCallingClient(client)) {
        throw unavailableToolError();
      }

      const result = await client.callTool({
        args: input,
        name: ref.rawToolName,
        options: { abortSignal: invocationSignal },
      });
      if (!this.isCurrentState(state, generation)) {
        throw unavailableToolError();
      }
      signal.throwIfAborted();
      return result;
    } catch (error) {
      if (error instanceof McpRuntimeToolError || !this.isCurrentState(state, generation)) {
        throw error instanceof McpRuntimeToolError ? error : unavailableToolError();
      }
      if (!signal.aborted) {
        this.resetConnection(state);
      }
      throw error;
    }
  }

  private async fetchToolsWithRetry(
    server: McpServer,
    state: ServerRuntimeState,
  ): Promise<ListToolsResult['tools']> {
    try {
      return await this.fetchRawTools(server, state);
    } catch (error) {
      if (error instanceof McpEvictedError || error instanceof McpRuntimeToolError) {
        throw error;
      }
      // Fail-and-drop: the pooled client may be stale (backgrounded socket,
      // expired session) — rebuild once before giving up.
      logger.warn('MCP tools() failed, reconnecting once', { serverId: server.id });
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
    server: McpServer,
    state: ServerRuntimeState,
  ): Promise<ListToolsResult['tools']> {
    const generation = state.generation;
    // One bound covers connect + full pagination, matching the old wall-clock
    // ceiling. Eviction rides the same composed signal.
    const bound = createBoundedSignal(TOOLS_FETCH_TIMEOUT_MS, state.abort.signal);
    let rawTools: ListToolsResult['tools'];
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
    state.discoveredToolNames = new Set(rawTools.map((tool) => tool.name));
    this.runtimeSnapshots.set(server.id, {
      connectionConfig: state.connectionConfig,
      lastConnectedAt: Date.now(),
      serverName: client?.serverInfo.name,
      serverTitle: client?.serverInfo.title,
      serverVersion: client?.serverInfo.version,
      toolCount: rawTools.length,
    });
    return rawTools;
  }
}

function toMcpConnectionConfig(server: McpServer): McpConnectionConfig {
  return {
    endpointUrl: server.endpointUrl,
    ...(server.headers && { headers: { ...server.headers } }),
  };
}
