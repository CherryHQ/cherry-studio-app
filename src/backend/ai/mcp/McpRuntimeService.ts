import type { ListToolsResult } from '@ai-sdk/mcp';
import { createMCPClient } from '@ai-sdk/mcp';
import { fetch as expoFetch } from 'expo/fetch';

import type { RuntimeJsonValue, RuntimeTool, RuntimeToolRef } from '@/backend/ai/agent';
import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import { mcpServerService } from '@/backend/data/services/McpServerService';
import {
  createBuiltInMcpClient,
  getBuiltInMcpToolEffect,
  PluginAuthorizationManager,
  isBuiltInMcpToolAllowed,
  type PluginClient,
  type PluginToolCatalog,
} from '@/backend/services/builtInMcp';
import type {
  McpConnectionConfig,
  McpModule,
  McpServerInfo,
  McpServerRuntimeSummary,
  McpToolSummary,
} from '@/shared/contracts';
import { PluginError } from '@/shared/contracts/plugins';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { McpServer } from '@/shared/data/types/mcpServer';
import type { PluginId } from '@/shared/data/types/plugin';
import { isSameMcpConnectionConfig, normalizeMcpHeaders } from '@/shared/utils/mcpConnectionConfig';

import type { TraceRecorder } from '../observability';
import { endMcpTrace } from './endMcpTrace';
import {
  createBoundedSignal,
  createMcpRuntimeTools,
  type McpExecutableToolDescriptor,
  type McpRuntimeToolSelection,
  McpRuntimeToolError,
  prepareMcpInputSchema,
} from './mcpRuntimeAdapter';
import {
  createMcpConnectionKey,
  deleteMcpToolCatalog,
  readMcpToolCatalog,
  writeMcpToolCatalog,
} from './mcpToolCatalogStore';

const logger = loggerService.withContext('McpRuntimeService');

/** Ceiling for connect + tools/list, enforced through abort signals the SDK
 * forwards to the transport (native support since `@ai-sdk/mcp@1.0.66`).
 * Without it a server that accepts the socket then stalls would pin a client
 * slot indefinitely. */
const TOOLS_FETCH_TIMEOUT_MS = 15 * 1000;

/** A failed discovery is not retried on the send path until this much time
 * has passed; doubled per consecutive failure so a dead server costs one
 * timeout, then nothing, while the settings screens can still probe it. */
const DISCOVERY_BACKOFF_MS = 30 * 1000;
const DISCOVERY_BACKOFF_MAX_MS = 5 * 60 * 1000;

type McpRuntimeConnectionConfig =
  | McpConnectionConfig
  | {
      origin: 'builtin';
      endpointUrl: null;
      builtinId: PluginId;
      authorizationId: string;
      headers?: never;
    };

type McpServerRuntimeSnapshot = Omit<McpServerRuntimeSummary, 'lastError' | 'state'> & {
  connectionConfig: McpRuntimeConnectionConfig;
};

type McpRuntimeClient = Pick<
  PluginClient,
  'serverInfo' | 'listTools' | 'close' | 'discoveryWarnings'
>;

type McpToolCallingClient = McpRuntimeClient & {
  callTool(input: {
    args: Record<string, unknown>;
    name: string;
    options: { abortSignal: AbortSignal };
  }): Promise<unknown>;
};

type ServerToolCatalog = {
  /** Partial-discovery warnings that describe this catalog; empty when complete. */
  discoveryWarnings: readonly string[];
  /** A live catalog was discovered in this process, including plugin setup. */
  source: 'live' | 'stored';
  tools: ListToolsResult['tools'];
};

type ServerRuntimeState = {
  /** Cancels every in-flight request of the current generation; replaced on
   * reset so later work runs under a fresh signal. */
  abort: AbortController;
  /** Last catalog for this connection configuration. Reused by every later
   * turn until the server is invalidated; never cleared by a transport reset. */
  catalog?: ServerToolCatalog;
  /** Identity frozen into descriptors. Unlike `generation` it survives
   * transport resets, so a frozen tool may run over a reconnected client for
   * the same configuration; invalidation replaces the whole state. */
  catalogGeneration: number;
  catalogRestore?: Promise<void>;
  client?: McpRuntimeClient;
  /** The pooled client has listed tools since it connected. Composite plugin
   * clients route calls through that listing, so a fresh client lists first. */
  clientListed: boolean;
  connectionConfig: McpRuntimeConnectionConfig;
  connectionKey?: Promise<string>;
  connectionPromise?: Promise<McpRuntimeClient>;
  discoveryFailure?: { attempts: number; nextAttemptAt: number };
  generation: number;
  refresh?: Promise<void>;
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
  client: McpRuntimeClient,
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
function createMcpClient(
  config: McpRuntimeConnectionConfig,
  signal: AbortSignal,
  pluginAuthorizations: PluginAuthorizationManager,
): Promise<McpRuntimeClient> {
  if (config.origin === 'builtin') {
    return createBuiltInMcpClient(
      config.builtinId,
      config.authorizationId,
      signal,
      pluginAuthorizations,
    );
  }
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

function isRunnableMcpServer(server: McpServer): boolean {
  return server.origin === 'builtin' || /^https?:\/\//i.test(server.endpointUrl ?? '');
}

function isMcpToolCallingClient(client: McpRuntimeClient): client is McpToolCallingClient {
  return typeof (client as { callTool?: unknown }).callTool === 'function';
}

/**
 * Runtime MCP client manager for custom servers and official cloud plugins.
 *
 * Settings reads fetch `tools/list` live, bounded by `TOOLS_FETCH_TIMEOUT_MS`;
 * a fast transport failure reconnects once, a timeout never does. Tool calls
 * are never replayed.
 *
 * ## Catalog reuse on the send path
 *
 * A send must not wait on the network for a server it has already listed. The
 * turn catalog therefore comes, in order, from the in-memory catalog of the
 * current connection configuration, from the per-server file the last complete
 * discovery wrote to the app cache directory, and only then from a live
 * discovery. A catalog is reused until the server is invalidated (endpoint,
 * header, or grant change, disable, delete, plugin connect or disconnect);
 * there is no timed refresh. The catalog is reconciled where the network is
 * already being used: a fresh connection lists tools before its first call, and
 * the settings screens always read live. A catalog with partial-discovery
 * warnings is still served immediately but refreshed in the background, and it
 * is never written to disk. A server whose discovery failed is not probed again
 * on the send path until its backoff expires.
 *
 * Connection reuse (`runtimeStates`) keeps one authenticated client per server
 * for the lifetime of the process.
 */
@Injectable('McpRuntimeService')
@ServicePhase(Phase.PostReady)
@DependsOn(['TraceStorageService'])
export class McpRuntimeService extends BaseService implements McpModule {
  readonly pluginAuthorizations = new PluginAuthorizationManager();
  private nextGeneration = 0;
  private readonly catalogPreparations = new Map<string, Promise<void>>();
  private readonly runtimeStates = new Map<string, ServerRuntimeState>();
  private readonly runtimeSnapshots = new Map<string, McpServerRuntimeSnapshot>();

  constructor(private readonly traces?: TraceRecorder) {
    super();
  }

  /** Runtime metadata for the settings list, initializing any runnable server not yet observed. */
  async getRuntimeSummaries(
    servers: readonly McpServer[],
  ): Promise<Record<string, McpServerRuntimeSummary>> {
    await Promise.allSettled(
      servers.flatMap((server) => {
        if (!server.isEnabled || !isRunnableMcpServer(server)) {
          return [];
        }
        const state = this.getRuntimeState(server);
        return state.client ? [] : [this.fetchTools(server, state)];
      }),
    );

    return Object.fromEntries(servers.map((server) => [server.id, this.getRuntimeSummary(server)]));
  }

  /** Tool list for the server edit screen. */
  async listTools(serverId: string): Promise<McpToolSummary[]> {
    const server = await mcpServerService.getById(serverId);
    if (!isRunnableMcpServer(server)) {
      throw new Error(`MCP server ${server.name} has no valid HTTP URL`);
    }

    const rawTools = await this.fetchTools(server, this.getRuntimeState(server));
    return rawTools.map((tool) => ({
      description: tool.description,
      name: tool.name,
    }));
  }

  /**
   * Raw, JSON-safe definitions used by the Host-facing Runtime projection.
   * Served from the reusable catalog when one exists; `signal` cancels a live
   * discovery together with the turn that requested it.
   */
  async listExecutableToolDescriptors(
    serverId: string,
    onUnavailable?: (warning: string) => void,
    signal?: AbortSignal,
  ): Promise<McpExecutableToolDescriptor[]> {
    const server = await mcpServerService.getById(serverId);
    const sourceName =
      server.origin === 'builtin' ? `${server.name} (${server.builtinId})` : server.name;
    if (!server.isEnabled || !isRunnableMcpServer(server)) {
      throw new McpRuntimeToolError(
        'mcp_tool_unavailable',
        'The MCP server is not executable.',
        false,
      );
    }

    const state = this.getRuntimeState(server);
    let catalog: ServerToolCatalog;
    try {
      catalog = await this.getTurnCatalog(server, state, signal);
    } catch (error) {
      const reason = error instanceof PluginError ? error.reason : 'unavailable';
      onUnavailable?.(
        `${sourceName}: tool discovery failed (${reason}). Check authorization and the service connection.`,
      );
      if (error instanceof McpRuntimeToolError) {
        throw error;
      }
      throw new McpRuntimeToolError(
        'mcp_tool_unavailable',
        'The MCP tool catalog is unavailable.',
        true,
      );
    }
    if (!this.isCurrentState(state)) {
      throw unavailableToolError();
    }
    const definitions = catalog.tools;
    const disabledTools = new Set(server.disabledTools);
    for (const warning of catalog.discoveryWarnings) onUnavailable?.(warning);
    if (definitions.length === 0)
      onUnavailable?.(`${sourceName}: the service returned no available tools.`);
    return definitions
      .filter((tool) => !disabledTools.has(tool.name))
      .flatMap((tool) => {
        let inputSchema: RuntimeJsonValue;
        try {
          inputSchema = prepareMcpInputSchema(tool.inputSchema);
        } catch {
          onUnavailable?.(
            `${sourceName}: tool ${tool.name} has an unsupported parameter schema and was not loaded.`,
          );
          return [];
        }
        return [
          {
            description: tool.description ? `${sourceName}: ${tool.description}` : sourceName,
            displayName: tool.title ?? tool.annotations?.title ?? tool.name,
            // Pin the catalog to its endpoint and catalog generation; edits and
            // invalidation cannot retarget a frozen tool, while a transport
            // reconnect for the same configuration keeps it callable.
            endpointUrl: server.endpointUrl,
            ...(server.origin === 'builtin'
              ? {
                  pluginId: server.builtinId,
                  effect: getBuiltInMcpToolEffect(server.builtinId, tool.name),
                }
              : {}),
            generation: state.catalogGeneration,
            inputSchema,
            rawToolName: tool.name,
            serverId: server.id,
          },
        ];
      });
  }

  /** Adapt an already selected catalog without reading Agent bindings or injecting the Host. */
  createRuntimeTools(selections: readonly McpRuntimeToolSelection[]): RuntimeTool[] {
    return createMcpRuntimeTools(selections, {
      traces: this.traces,
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
  protected async onStop(): Promise<void> {
    this.catalogPreparations.clear();
    for (const state of [...this.runtimeStates.values()]) {
      this.retireState(state);
    }

    this.runtimeSnapshots.clear();
    await this.pluginAuthorizations.stop();
  }

  /**
   * Drop one server's runtime after transport change, disable, or delete. A
   * preserved snapshot keeps the settings metadata and the stored catalog for
   * a disabled server, whose configuration is unchanged; anything else also
   * forgets the catalog so the next turn discovers live.
   */
  invalidateServer(serverId: string, options: { preserveSnapshot?: boolean } = {}): void {
    this.catalogPreparations.delete(serverId);
    const state = this.runtimeStates.get(serverId);
    if (state) {
      this.retireState(state);
    }
    if (!options.preserveSnapshot) {
      this.runtimeSnapshots.delete(serverId);
      deleteMcpToolCatalog(serverId);
    }
  }

  /**
   * Keep the directory already discovered during plugin validation. The saved
   * grant owns its cache key; the temporary validation client is never reused.
   */
  cachePluginToolCatalog(serverId: string, catalog: PluginToolCatalog): Promise<void> {
    const preparation = mcpServerService
      .getById(serverId)
      .then(async (server) => {
        if (
          this.catalogPreparations.get(serverId) !== preparation ||
          server.origin !== 'builtin' ||
          !server.isEnabled
        )
          return;
        const state = this.getRuntimeState(server);
        await this.recordCatalog(server, state, catalog);
      })
      .catch((error: unknown) => {
        // A cache failure must not turn a committed connection into an auth failure.
        logger.warn('Could not cache the validated plugin tools', error as Error, { serverId });
      })
      .finally(() => {
        if (this.catalogPreparations.get(serverId) === preparation) {
          this.catalogPreparations.delete(serverId);
        }
      });
    this.catalogPreparations.set(serverId, preparation);
    return preparation;
  }

  /**
   * The turn catalog: the current connection's catalog, else the stored file,
   * else one live discovery. A catalog carrying partial-discovery warnings is
   * served as is and refreshed in the background after its backoff expires.
   */
  private async getTurnCatalog(
    server: McpServer,
    state: ServerRuntimeState,
    signal?: AbortSignal,
  ): Promise<ServerToolCatalog> {
    signal?.throwIfAborted();
    if (!state.catalog) {
      // A send racing the local cache handoff waits here; it starts no second
      // discovery and cancellation does not discard the prepared directory.
      await this.catalogPreparations.get(server.id);
      signal?.throwIfAborted();
      await this.restoreCatalog(server, state);
      signal?.throwIfAborted();
    }
    if (state.catalog) {
      if (state.catalog.discoveryWarnings.length > 0) this.refreshInBackground(server, state);
      return state.catalog;
    }
    const failure = state.discoveryFailure;
    if (failure && Date.now() < failure.nextAttemptAt) {
      throw new McpRuntimeToolError(
        'mcp_tool_unavailable',
        'The MCP tool catalog is unavailable.',
        true,
      );
    }
    const tools = await this.fetchTools(server, state, signal);
    return state.catalog ?? { discoveryWarnings: [], source: 'live', tools };
  }

  /** Single-flight restore of the stored catalog for this connection configuration. */
  private restoreCatalog(server: McpServer, state: ServerRuntimeState): Promise<void> {
    state.catalogRestore ??= (async () => {
      const [stored, key] = await Promise.all([
        readMcpToolCatalog(server.id),
        this.getConnectionKey(state),
      ]);
      if (!stored || stored.connectionKey !== key) return;
      if (!this.isCurrentState(state) || state.catalog) return;
      state.catalog = { discoveryWarnings: [], source: 'stored', tools: stored.tools };
      this.runtimeSnapshots.set(server.id, {
        ...this.runtimeSnapshots.get(server.id),
        connectionConfig: state.connectionConfig,
        lastConnectedAt: stored.discoveredAt,
        toolCount: stored.tools.length,
      });
    })().catch((error: unknown) => {
      logger.warn('Could not restore the MCP tool catalog', error as Error, {
        serverId: server.id,
      });
    });
    return state.catalogRestore;
  }

  private refreshInBackground(server: McpServer, state: ServerRuntimeState): void {
    const failure = state.discoveryFailure;
    if (state.refresh || (failure && Date.now() < failure.nextAttemptAt)) return;
    state.refresh = this.fetchTools(server, state)
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        state.refresh = undefined;
      });
  }

  private getConnectionKey(state: ServerRuntimeState): Promise<string> {
    state.connectionKey ??= createMcpConnectionKey(state.connectionConfig);
    return state.connectionKey;
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
      catalogGeneration: this.allocateGeneration(),
      clientListed: false,
      connectionConfig,
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
    if (!isRunnableMcpServer(server)) {
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
    didTimeout?: () => boolean,
  ): Promise<McpRuntimeClient> {
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
    const trace = this.traces?.startTrace('mcp.connect', undefined, {
      'mcp.server.id': state.serverId,
      'mcp.connection.generation': generation,
    });
    const initPromise: Promise<McpRuntimeClient> = createMcpClient(
      state.connectionConfig,
      signal,
      this.pluginAuthorizations,
    )
      .then((client) => {
        if (state.connectionPromise !== initPromise || !this.isCurrentState(state, generation)) {
          this.closeQuietly(client);
          throw new McpEvictedError(`MCP server ${server.name} was reconfigured while connecting`);
        }
        state.client = client;
        trace?.end('ok');
        return client;
      })
      .catch((error: unknown) => {
        endMcpTrace(trace, error, signal, didTimeout?.());
        throw error;
      })
      .finally(() => {
        if (state.connectionPromise === initPromise) {
          state.connectionPromise = undefined;
        }
      });

    state.connectionPromise = initPromise;
    return initPromise;
  }

  private closeQuietly(client: McpRuntimeClient): void {
    client.close().catch(() => undefined);
  }

  private async withTemporaryClient<TValue>(
    config: McpConnectionConfig,
    label: string,
    operation: (client: McpRuntimeClient) => Promise<TValue> | TValue,
  ): Promise<TValue> {
    const bound = createBoundedSignal(TOOLS_FETCH_TIMEOUT_MS);
    const trace = this.traces?.startTrace('mcp.connect', undefined, {
      'mcp.connection.temporary': true,
    });
    let client: McpRuntimeClient | undefined;
    try {
      client = await createMcpClient(config, bound.signal, this.pluginAuthorizations);
      trace?.end('ok');
      return await operation(client);
    } catch (error) {
      endMcpTrace(trace, error, bound.signal, bound.didTimeout());
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
    state.clientListed = false;
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
    discoveredEndpointUrl: string | null,
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
      !isRunnableMcpServer(server) ||
      (server.origin === 'builtin' &&
        !isBuiltInMcpToolAllowed(server.builtinId, ref.rawToolName)) ||
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
      state.catalogGeneration !== discoveredGeneration ||
      !state.catalog?.tools.some((tool) => tool.name === ref.rawToolName)
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
      if (!state.clientListed) {
        // A fresh connection lists before its first call: composite plugin
        // clients route on that listing, and it confirms a catalog restored
        // from disk still names this tool.
        const tools = await this.listAndRecord(server, state, client, invocationSignal);
        if (!this.isCurrentState(state, generation)) {
          throw unavailableToolError();
        }
        if (!tools.some((tool) => tool.name === ref.rawToolName)) {
          throw unavailableToolError();
        }
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
      if (error instanceof PluginError) {
        throw new McpRuntimeToolError(
          error.reason === 'unknown-write'
            ? 'mcp_tool_write_outcome_unknown'
            : 'mcp_tool_call_failed',
          error.message,
          error.reason === 'network' || error.reason === 'quota',
        );
      }
      throw error;
    }
  }

  /**
   * Live discovery. A fast transport failure reconnects once, since the pooled
   * client may be stale (backgrounded socket, expired session); a timeout or a
   * cancelled caller never does.
   */
  private async fetchTools(
    server: McpServer,
    state: ServerRuntimeState,
    signal?: AbortSignal,
  ): Promise<ListToolsResult['tools']> {
    try {
      return await this.fetchRawTools(server, state, signal);
    } catch (error) {
      if (
        error instanceof McpEvictedError ||
        error instanceof McpRuntimeToolError ||
        error instanceof McpTimeoutError ||
        signal?.aborted
      ) {
        throw error;
      }
      logger.warn('MCP tools() failed, reconnecting once', { serverId: server.id });
      this.resetConnection(state);
      try {
        return await this.fetchRawTools(server, state, signal);
      } catch (retryError) {
        if (!(retryError instanceof McpEvictedError) && !signal?.aborted) {
          this.resetConnection(state);
          this.recordDiscoveryFailure(state, retryError);
        }
        throw retryError;
      }
    }
  }

  private async fetchRawTools(
    server: McpServer,
    state: ServerRuntimeState,
    signal?: AbortSignal,
  ): Promise<ListToolsResult['tools']> {
    const generation = state.generation;
    // One bound covers connect + full pagination, matching the old wall-clock
    // ceiling. Eviction and the caller's cancellation ride the same signal.
    const bound = createBoundedSignal(
      TOOLS_FETCH_TIMEOUT_MS,
      state.abort.signal,
      ...(signal ? [signal] : []),
    );
    try {
      const client = await this.getClient(server, state, bound.signal, bound.didTimeout);
      return await this.listAndRecord(server, state, client, bound.signal, bound.didTimeout);
    } catch (error) {
      if (error instanceof McpEvictedError) {
        throw error;
      }
      if (!this.isCurrentState(state, generation)) {
        throw new McpEvictedError(`MCP server ${server.name} was invalidated while listing tools`);
      }
      if (signal?.aborted) {
        throw new McpRuntimeToolError(
          'mcp_tool_cancelled',
          'MCP tool discovery was cancelled.',
          false,
        );
      }
      if (bound.didTimeout()) {
        this.resetConnection(state);
        const timeout = new McpTimeoutError(
          `MCP server ${server.name} timed out after ${TOOLS_FETCH_TIMEOUT_MS}ms`,
        );
        this.recordDiscoveryFailure(state, timeout);
        throw timeout;
      }
      throw error;
    } finally {
      bound.done();
    }
  }

  /**
   * List the connected client's tools and make that listing the server's
   * catalog: in memory for later turns, on disk when it is complete.
   */
  private async listAndRecord(
    server: McpServer,
    state: ServerRuntimeState,
    client: McpRuntimeClient,
    signal: AbortSignal,
    didTimeout?: () => boolean,
  ): Promise<ListToolsResult['tools']> {
    const generation = state.generation;
    const trace = this.traces?.startTrace('mcp.list_tools', undefined, {
      'mcp.server.id': server.id,
      'mcp.connection.generation': generation,
    });
    let rawTools: ListToolsResult['tools'];
    try {
      rawTools = await listAllTools(client, signal);
    } catch (error) {
      endMcpTrace(trace, error, signal, didTimeout?.());
      throw error;
    }
    if (!this.isCurrentState(state, generation)) {
      trace?.end('cancelled', { 'error.category': 'cancelled' });
      throw new McpEvictedError(`MCP server ${server.name} was invalidated while listing tools`);
    }
    state.clientListed = true;
    const tools = await this.recordCatalog(server, state, {
      tools: rawTools,
      discoveryWarnings: client.discoveryWarnings ?? [],
      serverInfo: client.serverInfo,
    });
    trace?.end('ok', { 'mcp.tools_count': tools.length });
    return tools;
  }

  private async recordCatalog(
    server: McpServer,
    state: ServerRuntimeState,
    catalog: PluginToolCatalog,
  ): Promise<ListToolsResult['tools']> {
    const rawTools =
      server.origin === 'builtin'
        ? catalog.tools.filter((tool) => isBuiltInMcpToolAllowed(server.builtinId, tool.name))
        : catalog.tools;
    const discoveryWarnings = [...catalog.discoveryWarnings];
    state.runtimeError = discoveryWarnings.join(' ') || undefined;
    if (discoveryWarnings.length > 0) this.recordDiscoveryFailure(state);
    else state.discoveryFailure = undefined;
    state.catalog = { discoveryWarnings, source: 'live', tools: rawTools };
    const discoveredAt = Date.now();
    this.runtimeSnapshots.set(server.id, {
      connectionConfig: state.connectionConfig,
      lastConnectedAt: discoveredAt,
      serverName: catalog.serverInfo.name,
      serverTitle: catalog.serverInfo.title,
      serverVersion: catalog.serverInfo.version,
      toolCount: rawTools.length,
    });
    if (discoveryWarnings.length === 0) {
      const connectionKey = await this.getConnectionKey(state);
      if (!this.isCurrentState(state)) return rawTools;
      await writeMcpToolCatalog({
        connectionKey,
        discoveredAt,
        serverId: server.id,
        tools: rawTools,
        version: 1,
      });
    }
    return rawTools;
  }

  private recordDiscoveryFailure(state: ServerRuntimeState, error?: unknown): void {
    if (error !== undefined) this.recordRuntimeError(state, error);
    const attempts = (state.discoveryFailure?.attempts ?? 0) + 1;
    const delay = Math.min(DISCOVERY_BACKOFF_MS * 2 ** (attempts - 1), DISCOVERY_BACKOFF_MAX_MS);
    state.discoveryFailure = { attempts, nextAttemptAt: Date.now() + delay };
  }
}

function toMcpConnectionConfig(server: McpServer): McpRuntimeConnectionConfig {
  if (server.origin === 'builtin')
    return {
      origin: 'builtin',
      endpointUrl: null,
      builtinId: server.builtinId,
      authorizationId: server.authorizationId,
    };
  return {
    endpointUrl: server.endpointUrl,
    ...(server.headers && { headers: { ...server.headers } }),
  };
}
