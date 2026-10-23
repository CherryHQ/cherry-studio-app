import type { ListToolsResult } from '@modelcontextprotocol/client';
import { ProtocolError } from '@modelcontextprotocol/client';
import { AppState } from 'react-native';
import * as z from 'zod';

import type { RuntimeJsonValue, RuntimeTool, RuntimeToolRef } from '@/backend/ai/agent';
import { raceAbort } from '@/backend/ai/agent/runtime/raceAbort';
import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { agentToolBindingService } from '@/backend/data/services/AgentToolBindingService';
import { assertUserOwned } from '@/backend/data/services/managedResources';
import { mcpServerService } from '@/backend/data/services/McpServerService';
import {
  createBuiltInMcpClient,
  getBuiltInMcpToolEffect,
  PluginAuthorizationManager,
  isBuiltInMcpToolAllowed,
  type PluginToolCatalog,
} from '@/backend/services/builtInMcp';
import { McpOAuthRuntime } from '@/backend/services/mcp';
import type {
  McpConnectionConfig,
  McpModule,
  McpServerInfo,
  McpServerRuntimeSummary,
  McpToolSummary,
} from '@/shared/contracts';
import {
  McpAuthorizationError,
  type McpOAuthStartInput,
  type McpContentPreview,
  type McpPromptEntry,
} from '@/shared/contracts/mcp';
import type {
  McpAppLaunch,
  McpAppChannel,
  McpAppView,
  McpAppHostContext,
} from '@/shared/contracts/mcpApp';
import { McpResultSourceSchema, type McpResourceReference } from '@/shared/contracts/mcpContent';
import type { McpElicitationResponse } from '@/shared/contracts/mcpInteraction';
import { PluginError } from '@/shared/contracts/plugins';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { McpServer } from '@/shared/data/types/mcpServer';
import type { PluginId } from '@/shared/data/types/plugin';
import { enablesMcpServer } from '@/shared/utils/agentMcpBinding';
import { isSameMcpConnectionConfig } from '@/shared/utils/mcpConnectionConfig';

import type { TraceRecorder } from '../observability';
import { endMcpTrace } from './endMcpTrace';
import { McpAppAccess, type McpAppConnection } from './McpAppAccess';
import { mcpToolAppUri, mcpToolVisible } from './mcpAppMetadata';
import { McpAppRuntime } from './McpAppRuntime';
import { listMcpPrompts, readMcpContent } from './mcpContent';
import { McpElicitationBroker } from './mcpElicitation';
import {
  classifyMcpCallRejection,
  createRemoteMcpClient,
  type McpRuntimeClient,
} from './mcpProtocolClient';
import { storeMcpResultFiles } from './mcpResultFiles';
import {
  createBoundedSignal,
  createMcpRuntimeTools,
  type McpExecutableToolDescriptor,
  type McpRuntimeToolSelection,
  McpRuntimeToolError,
  prepareMcpInputSchema,
  type McpInvocationProgress,
} from './mcpRuntimeAdapter';
import {
  createMcpConnectionKey,
  deleteMcpToolCatalog,
  readMcpToolCatalog,
  writeMcpToolCatalog,
} from './mcpToolCatalogStore';

const logger = loggerService.withContext('McpRuntimeService');

/** Ceiling for connect + tools/list, enforced through the abort signal the
 * official MCP SDK forwards to its transport for remote servers and built-in
 * plugins alike. Without it a server that accepts the socket then stalls would
 * pin a client slot indefinitely. */
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

type McpToolCallingClient = McpRuntimeClient & {
  callTool(input: {
    args: Record<string, unknown>;
    name: string;
    options: { abortSignal: AbortSignal };
  }): Promise<unknown>;
};

type ServerToolCatalog = {
  expiresAt: number;
  /** Partial-discovery warnings that describe this catalog; empty when complete. */
  discoveryWarnings: readonly string[];
  /** A live catalog was discovered in this process, including plugin setup. */
  source: 'live' | 'stored';
  tools: ListToolsResult['tools'];
};

type ServerRuntimeState = {
  /** Tool calls in flight on the pooled client; a server question pauses all of them. */
  calls: Set<McpInvocationProgress>;
  /** Server questions awaiting the user, withdrawn once no call remains to receive the answer. */
  questions: Set<AbortController>;
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
  /** Setup shared by every caller; cancelled only once no caller still waits for it. */
  connection?: { client: Promise<McpRuntimeClient>; cancel: AbortController; waiters: number };
  discoveryFailure?: { attempts: number; nextAttemptAt: number };
  prompts?: McpPromptEntry[];
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
  foreground: boolean,
  authorization: McpOAuthRuntime,
  pooled?: Pick<Parameters<typeof createRemoteMcpClient>[0], 'elicit' | 'onCatalogChanged'>,
): Promise<McpRuntimeClient> {
  if (config.origin === 'builtin') {
    return createBuiltInMcpClient(
      config.builtinId,
      config.authorizationId,
      signal,
      pluginAuthorizations,
    );
  }
  return createRemoteMcpClient({ config, signal, foreground, authorization, ...pooled });
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
 * header, or grant change, disable, delete, plugin connect or disconnect).
 * There is no timed refresh. A remote catalog past its freshness window is
 * still served to the turn that asks for it, which also starts a background
 * refresh for the next one; a tools-changed notification or a call the server
 * rejects does the same. A fresh connection lists tools before its first call,
 * and the settings screens always read live. A catalog with partial-discovery
 * warnings is still served immediately but refreshed in the background, and it
 * is never written to disk. A server whose discovery failed is not probed again
 * on the send path until its backoff expires.
 *
 * Connection reuse (`runtimeStates`) keeps one authenticated client per server
 * for the lifetime of the process. Tool calls share it. A question the server
 * asks mid-call belongs to that server rather than to one call: every call in
 * flight pauses its network budget until the user answers.
 */
@Injectable('McpRuntimeService')
@ServicePhase(Phase.PostReady)
@AppStatePolicy('foreground-refresh')
@DependsOn(['TraceStorageService'])
export class McpRuntimeService extends BaseService implements McpModule {
  readonly pluginAuthorizations: PluginAuthorizationManager;
  private readonly oauth = new McpOAuthRuntime();
  private readonly oauthCompletions = new Map<string, Promise<McpServer>>();
  private readonly lifetime = new AbortController();
  private readonly temporaryOperations = new Set<Promise<unknown>>();
  private foreground = AppState.currentState === 'active';
  private nextGeneration = 0;
  private readonly catalogPreparations = new Map<string, Promise<void>>();
  private readonly runtimeStates = new Map<string, ServerRuntimeState>();
  private readonly runtimeSnapshots = new Map<string, McpServerRuntimeSnapshot>();
  private readonly promptCatalogListeners = new Set<() => void>();

  constructor(private readonly traces?: TraceRecorder) {
    super();
    this.pluginAuthorizations = new PluginAuthorizationManager(undefined, undefined, traces);
  }

  async beginOAuth(input: McpOAuthStartInput) {
    this.lifetime.signal.throwIfAborted();
    const previous = input.serverId ? await mcpServerService.getById(input.serverId) : undefined;
    this.lifetime.signal.throwIfAborted();
    if (previous?.origin === 'builtin') throw new McpAuthorizationError('configuration');
    assertUserOwned(previous?.isManaged, 'mcp.beginOAuth');
    return this.oauth.begin(input, previous);
  }

  completeOAuth(attemptId: string, callbackUrl: string): Promise<McpServer> {
    this.lifetime.signal.throwIfAborted();
    const current = this.oauthCompletions.get(attemptId);
    if (current) return current;
    storageMutationGate.assertWritable();
    const completion = this.saveOAuthConnection(attemptId, callbackUrl).finally(() => {
      this.oauthCompletions.delete(attemptId);
    });
    this.oauthCompletions.set(attemptId, completion);
    return completion;
  }

  hasPendingStorageWork(): boolean {
    return this.oauthCompletions.size > 0;
  }

  async receiveOAuthCallback(callbackUrl: string): Promise<McpServer | undefined> {
    const attemptId = this.oauth.findAttempt(callbackUrl);
    return attemptId ? this.completeOAuth(attemptId, callbackUrl) : undefined;
  }

  private async saveOAuthConnection(attemptId: string, callbackUrl: string): Promise<McpServer> {
    const completed = await this.oauth.complete(attemptId, callbackUrl);
    try {
      this.lifetime.signal.throwIfAborted();
      await this.getServerInfo({
        endpointUrl: completed.input.endpointUrl,
        headers: completed.input.headers,
        oauth: { authorizationId: completed.authorizationId, clientId: completed.clientId },
      });
      this.lifetime.signal.throwIfAborted();
      storageMutationGate.assertWritable();
      const server = await mcpServerService.saveOAuthConnection(
        {
          name: completed.input.name,
          endpointUrl: completed.input.endpointUrl,
          headers: completed.input.headers,
        },
        { authorizationId: completed.authorizationId, clientId: completed.clientId },
        completed.previous,
        this.lifetime.signal,
      );
      this.invalidateServer(server.id);
      if (completed.previous?.origin !== 'builtin' && completed.previous?.oauth) {
        await this.forgetOAuthAuthorization(completed.previous.oauth.authorizationId);
      }
      return server;
    } catch (error) {
      await this.forgetOAuthAuthorization(completed.authorizationId);
      throw error;
    }
  }

  cancelOAuth(attemptId: string): void {
    if (!this.oauthCompletions.has(attemptId)) this.oauth.cancel(attemptId);
  }

  async disconnectOAuth(serverId: string): Promise<McpServer> {
    const previous = await mcpServerService.getById(serverId);
    const server = await mcpServerService.disconnectOAuth(serverId);
    this.invalidateServer(serverId);
    if (previous.origin !== 'builtin' && previous.oauth)
      await this.forgetOAuthAuthorization(previous.oauth.authorizationId);
    return server;
  }

  async forgetOAuthAuthorization(authorizationId: string): Promise<void> {
    // A native cleanup failure cannot undo the committed database revocation.
    await this.oauth.remove(authorizationId).catch(() => undefined);
  }

  private readonly elicitations = new McpElicitationBroker();
  private readonly appAccess = new McpAppAccess({
    isForeground: () => this.foreground,
    assertBinding: async (reference, name) => {
      if (!reference.agentId) throw unavailableToolError();
      const binding = await agentToolBindingService.resolveMcpTool(reference.agentId, {
        serverId: reference.serverId,
        rawToolName: name,
        isToolAvailable: true,
      });
      if (!binding.enabled || binding.approval === 'deny') throw unavailableToolError();
    },
    withConnection: (serverId, signal, operation) =>
      this.withContentClient(serverId, signal, operation),
    requestConsent: (server, name, args, signal) =>
      this.elicitations.request(
        { serverId: server.id, serverName: server.name, endpointUrl: server.endpointUrl },
        { mode: 'form', message: name, requestedSchema: { type: 'object', properties: {} } },
        signal,
        { name, arguments: args },
      ),
  });
  private readonly apps = new McpAppRuntime(this.appAccess);
  openApp(input: McpAppLaunch, channel: McpAppChannel, signal: AbortSignal): Promise<McpAppView> {
    return this.apps.open(input, channel, signal);
  }
  receiveAppMessage(id: string, message: string): void {
    this.apps.receive(id, message);
  }
  updateAppContext(id: string, context: McpAppHostContext): void {
    this.apps.updateContext(id, context);
  }
  closeApp(id: string): Promise<void> {
    return this.apps.close(id);
  }

  readonly getElicitations = this.elicitations.getSnapshot;
  readonly subscribeElicitations = this.elicitations.subscribe;
  respondElicitation(id: string, response: McpElicitationResponse): void {
    this.elicitations.respond(id, response);
  }

  protected onInit(): void {
    this.registerAppStateListener((status) => {
      this.foreground = status === 'active';
      if (!this.foreground) void this.apps.stop();
      for (const state of this.runtimeStates.values()) {
        state.client?.setForeground?.(this.foreground);
      }
    });
  }

  /** The server signalled that its catalog changed; replace it without waiting for a turn. */
  private refreshChangedCatalog(state: ServerRuntimeState): void {
    if (state.catalog) state.catalog.expiresAt = 0;
    if (!this.foreground || !this.isCurrentState(state)) return;
    void mcpServerService
      .getById(state.serverId)
      .then((server) => {
        if (
          server.isEnabled &&
          this.isCurrentState(state) &&
          isSameMcpConnectionConfig(state.connectionConfig, toMcpConnectionConfig(server))
        )
          this.refreshInBackground(server, state);
      })
      .catch(() => undefined);
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

  readonly subscribePromptCatalogs = (listener: () => void): (() => void) => {
    this.promptCatalogListeners.add(listener);
    return () => this.promptCatalogListeners.delete(listener);
  };

  /** Read only the current connections' memory/disk catalogs, without opening a client. */
  async getCachedPrompts(): Promise<Readonly<Record<string, readonly McpPromptEntry[]>>> {
    const { items: servers } = await mcpServerService.list({ isEnabled: true });
    const catalogs = await Promise.all(
      servers
        .filter((server) => server.isEnabled && server.origin !== 'builtin')
        .map(async (server) => {
          const state = this.getRuntimeState(server);
          await this.restoreCatalog(server, state);
          return [server.id, this.isCurrentState(state) ? (state.prompts ?? []) : []] as const;
        }),
    );
    return Object.fromEntries(catalogs);
  }

  /** Resolves a cached prompt on the server's shared connection, like a tool call. */
  async readPrompt(
    agentId: string,
    serverId: string,
    name: string,
    args: Record<string, string>,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<McpContentPreview> {
    const { items: bindings } = await agentToolBindingService.list(agentId);
    if (!bindings.some((binding) => binding.serverId === serverId && enablesMcpServer(binding)))
      throw unavailableToolError();
    const server = await mcpServerService.getById(serverId);
    if (!server.isEnabled || server.origin === 'builtin' || !isRunnableMcpServer(server))
      throw unavailableToolError();
    const state = this.getRuntimeState(server);
    await this.restoreCatalog(server, state);
    const entry = state.prompts?.find((item) => item.key === name);
    if (!entry) throw unavailableToolError();
    const generation = state.generation;
    const requestSignal = AbortSignal.any([signal, state.abort.signal]);
    try {
      const client = await this.getClient(server, state, requestSignal);
      const preview = await readMcpContent(client, server.name, entry, args, requestSignal);
      if (!this.isCurrentState(state, generation)) throw unavailableToolError();
      return preview;
    } catch (error) {
      if (error instanceof McpRuntimeToolError || !this.isCurrentState(state, generation)) {
        throw error instanceof McpRuntimeToolError ? error : unavailableToolError();
      }
      const rejection = classifyMcpCallRejection(error);
      if (rejection?.staleCatalog) {
        this.refreshChangedCatalog(state);
        throw rejection.failure;
      }
      if (!signal.aborted) this.resetConnection(state);
      throw rejection?.failure ?? error;
    }
  }

  async readResultResource(
    reference: McpResourceReference,
    signal?: AbortSignal,
  ): Promise<McpContentPreview> {
    const source = McpResultSourceSchema.parse(reference.source);
    const uri = z.string().min(1).max(8192).parse(reference.uri);
    return this.withContentClient(
      source.serverId,
      signal,
      async ({ client, server, signal: requestSignal }) => {
        if ((await createMcpConnectionKey(server)) !== source.connectionKey)
          throw unavailableToolError();
        // A returned resource need not appear in resources/list. Its URI is interpreted only by this server.
        return readMcpContent(
          client,
          server.name,
          { kind: 'resource', key: uri, title: uri, arguments: [] },
          {},
          requestSignal,
        );
      },
    );
  }

  private async withContentClient<T>(
    serverId: string,
    signal: AbortSignal | undefined,
    operation: (connection: McpAppConnection) => Promise<T>,
  ): Promise<T> {
    const server = await mcpServerService.getById(serverId);
    if (!server.isEnabled || server.origin === 'builtin' || !isRunnableMcpServer(server))
      throw unavailableToolError();
    const state = this.getRuntimeState(server);
    const generation = state.generation;
    const bound = createBoundedSignal(60_000, state.abort.signal, ...(signal ? [signal] : []));
    const progress: McpInvocationProgress = { sent() {}, waiting: bound.setPaused };
    state.calls.add(progress);
    try {
      const client = await this.getClient(server, state, bound.signal);
      let catalog: Promise<ListToolsResult['tools']> | undefined;
      const result = await operation({
        client,
        server,
        signal: bound.signal,
        tools: () => (catalog ??= this.listAndRecord(server, state, client, bound.signal)),
        invoke: (name, args, invocationProgress) =>
          this.invokeTool(
            { source: 'mcp', serverId, rawToolName: name },
            args as RuntimeJsonValue,
            bound.signal,
            server.endpointUrl,
            state.catalogGeneration,
            invocationProgress,
          ),
      });
      bound.signal.throwIfAborted();
      if (!this.isCurrentState(state, generation)) throw unavailableToolError();
      return result;
    } catch (error) {
      if (error instanceof McpRuntimeToolError || !this.isCurrentState(state, generation))
        throw error;
      const rejection = classifyMcpCallRejection(error);
      if (rejection?.staleCatalog) this.refreshChangedCatalog(state);
      // A JSON-RPC error answer proves the shared connection; resetting it would abort Agent calls.
      else if (!signal?.aborted && !ProtocolError.isInstance(error)) this.resetConnection(state);
      throw rejection?.failure ?? error;
    } finally {
      bound.done();
      state.calls.delete(progress);
      if (state.calls.size === 0) for (const question of state.questions) question.abort();
    }
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
    const connectionKey =
      server.origin === 'builtin' ? undefined : await this.getConnectionKey(state);
    const disabledTools = new Set(server.disabledTools);
    for (const warning of catalog.discoveryWarnings) onUnavailable?.(warning);
    if (definitions.length === 0)
      onUnavailable?.(`${sourceName}: the service returned no available tools.`);
    return definitions
      .filter((tool) => !disabledTools.has(tool.name) && mcpToolVisible(tool, 'model'))
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
        const resourceUri = connectionKey ? mcpToolAppUri(tool) : undefined;
        return [
          {
            ...(connectionKey ? { connectionKey } : {}),
            ...(resourceUri && connectionKey
              ? { app: { serverId: server.id, toolName: tool.name, resourceUri, connectionKey } }
              : {}),
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
              : // A wrong hint costs one repeated call on a server the user chose to connect;
                // approval still gates every call, so this never widens what a tool may do.
                tool.annotations?.readOnlyHint === true || tool.annotations?.idempotentHint === true
                ? { effect: 'read' as const }
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
      storeResult: storeMcpResultFiles,
      traces: this.traces,
      invoke: (ref, input, signal, discoveredEndpointUrl, discoveredGeneration, progress) =>
        this.invokeTool(ref, input, signal, discoveredEndpointUrl, discoveredGeneration, progress),
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
    this.lifetime.abort();
    this.promptCatalogListeners.clear();
    await this.apps.stop();
    this.elicitations.stop();
    this.catalogPreparations.clear();
    for (const state of [...this.runtimeStates.values()]) {
      this.retireState(state);
    }

    this.runtimeSnapshots.clear();
    // Abort token exchanges first. Then join outer completion/inspection work while persistence
    // dependencies remain alive; failed completions can still remove their newly created grant.
    await this.oauth.stop();
    await Promise.allSettled([...this.oauthCompletions.values(), ...this.temporaryOperations]);
    await this.pluginAuthorizations.stop();
  }

  /**
   * Drop one server's runtime after transport change, disable, or delete. A
   * preserved snapshot keeps the settings metadata and the stored catalog for
   * a disabled server, whose configuration is unchanged; anything else also
   * forgets the catalog so the next turn discovers live.
   */
  invalidateServer(serverId: string, options: { preserveSnapshot?: boolean } = {}): void {
    void this.apps.closeServer(serverId);
    this.catalogPreparations.delete(serverId);
    const state = this.runtimeStates.get(serverId);
    if (state) {
      this.retireState(state);
    }
    if (!options.preserveSnapshot) {
      this.runtimeSnapshots.delete(serverId);
      deleteMcpToolCatalog(serverId);
    }
    this.notifyPromptCatalogs();
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
      if (state.catalog.discoveryWarnings.length > 0 || state.catalog.expiresAt <= Date.now()) {
        this.refreshInBackground(server, state);
      }
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
    return state.catalog ?? { discoveryWarnings: [], expiresAt: 0, source: 'live', tools };
  }

  /** Single-flight restore of the stored catalog for this connection configuration. */
  private restoreCatalog(server: McpServer, state: ServerRuntimeState): Promise<void> {
    state.catalogRestore ??= (async () => {
      const [stored, key] = await Promise.all([
        readMcpToolCatalog(server.id),
        this.getConnectionKey(state),
      ]);
      if (!stored || stored.connectionKey !== key || !this.isCurrentState(state)) return;
      state.prompts ??= stored.prompts;
      if (state.catalog) return;
      state.catalog = {
        discoveryWarnings: [],
        // A remote file written before prompt discovery refreshes on the next turn.
        expiresAt: server.origin !== 'builtin' && !stored.prompts ? 0 : stored.expiresAt,
        source: 'stored',
        tools: stored.tools,
      };
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
    if (!this.foreground) return;
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
    this.lifetime.signal.throwIfAborted();
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
      calls: new Set(),
      questions: new Set(),
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
            protocol: storedSnapshot.protocol,
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
  ): Promise<McpRuntimeClient> {
    if (!this.isCurrentState(state)) {
      throw new McpEvictedError(`MCP server ${server.name} was invalidated`);
    }

    if (state.client) {
      return state.client;
    }

    let connection = state.connection;
    if (!connection) {
      const generation = state.generation;
      const cancel = new AbortController();
      const setupSignal = AbortSignal.any([state.abort.signal, cancel.signal]);
      const trace = this.traces?.startTrace('mcp.connect', undefined, {
        'mcp.server.id': state.serverId,
        'plugin.id': server.origin === 'builtin' ? server.builtinId : undefined,
        'mcp.connection.generation': generation,
      });
      const pending: Promise<McpRuntimeClient> = createMcpClient(
        state.connectionConfig,
        setupSignal,
        this.pluginAuthorizations,
        this.foreground,
        this.oauth,
        {
          elicit: (params, requestSignal) =>
            this.askForServer(server, state, params, requestSignal),
          onCatalogChanged: () => {
            if (this.isCurrentState(state, generation)) this.refreshChangedCatalog(state);
          },
        },
      )
        .then((client) => {
          if (state.connection?.client !== pending || !this.isCurrentState(state, generation)) {
            this.closeQuietly(client);
            throw new McpEvictedError(
              `MCP server ${server.name} was reconfigured while connecting`,
            );
          }
          state.client = client;
          client.setForeground?.(this.foreground);
          trace?.end('ok');
          return client;
        })
        .catch((error: unknown) => {
          endMcpTrace(trace, error, setupSignal);
          throw error;
        })
        .finally(() => {
          if (state.connection?.client === pending) {
            state.connection = undefined;
          }
        });
      connection = { client: pending, cancel, waiters: 0 };
      state.connection = connection;
    }

    connection.waiters += 1;
    try {
      return await raceAbort(connection.client, signal);
    } finally {
      connection.waiters -= 1;
      if (connection.waiters === 0 && state.connection === connection) {
        state.connection = undefined;
        connection.cancel.abort();
      }
    }
  }

  private closeQuietly(client: McpRuntimeClient): void {
    client.close().catch(() => undefined);
  }

  private async withTemporaryClient<TValue>(
    config: McpConnectionConfig,
    label: string,
    operation: (client: McpRuntimeClient) => Promise<TValue> | TValue,
  ): Promise<TValue> {
    this.lifetime.signal.throwIfAborted();
    const pending = this.runTemporaryClient(config, label, operation);
    this.temporaryOperations.add(pending);
    try {
      return await pending;
    } finally {
      this.temporaryOperations.delete(pending);
    }
  }

  private async runTemporaryClient<TValue>(
    config: McpConnectionConfig,
    label: string,
    operation: (client: McpRuntimeClient) => Promise<TValue> | TValue,
  ): Promise<TValue> {
    const bound = createBoundedSignal(TOOLS_FETCH_TIMEOUT_MS, this.lifetime.signal);
    const trace = this.traces?.startTrace('mcp.connect', undefined, {
      'mcp.connection.temporary': true,
    });
    let client: McpRuntimeClient | undefined;
    try {
      client = await createMcpClient(
        config,
        bound.signal,
        this.pluginAuthorizations,
        this.foreground,
        this.oauth,
      );
      bound.signal.throwIfAborted();
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
        await client.close().catch(() => undefined);
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
    state.connection = undefined;
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
    state.connection = undefined;
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
    progress: McpInvocationProgress,
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
    let sent = false;
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

      let result: unknown;
      state.calls.add(progress);
      try {
        invocationSignal.throwIfAborted();
        progress.sent();
        sent = true;
        result = await client.callTool({
          args: input,
          name: ref.rawToolName,
          options: { abortSignal: invocationSignal },
        });
      } finally {
        state.calls.delete(progress);
        if (state.calls.size === 0) for (const question of state.questions) question.abort();
      }
      if (!this.isCurrentState(state, generation)) {
        throw new McpEvictedError('MCP connection changed after transmission');
      }
      signal.throwIfAborted();
      return result;
    } catch (error) {
      if (error instanceof McpRuntimeToolError) throw error;
      if (!this.isCurrentState(state, generation)) throw sent ? error : unavailableToolError();
      const rejection = classifyMcpCallRejection(error);
      if (rejection?.staleCatalog) {
        // The server answered, so the connection is sound; its catalog is what went stale.
        this.refreshChangedCatalog(state);
        throw rejection.failure;
      }
      if (!signal.aborted) {
        this.resetConnection(state);
      }
      if (rejection) throw rejection.failure;
      if (error instanceof PluginError) {
        throw new McpRuntimeToolError(
          error.reason === 'unknown-write'
            ? 'mcp_tool_write_outcome_unknown'
            : 'mcp_tool_call_failed',
          error.message,
          error.reason === 'network' || error.reason === 'quota',
          { pluginReason: error.reason, statusCode: error.statusCode, providerCode: error.code },
        );
      }
      throw error;
    }
  }

  /**
   * A question the server asks mid-call. It is attributed to the server, the scope the user
   * sees and answers for, so calls share one connection instead of each opening its own.
   */
  private async askForServer(
    server: McpServer,
    state: ServerRuntimeState,
    params: unknown,
    requestSignal: AbortSignal,
  ): Promise<McpElicitationResponse> {
    const waiting = [...state.calls];
    const question = new AbortController();
    state.questions.add(question);
    for (const call of waiting) call.waiting(true);
    try {
      return await this.elicitations.request(
        { serverId: server.id, serverName: server.name, endpointUrl: server.endpointUrl ?? '' },
        params,
        AbortSignal.any([requestSignal, question.signal, state.abort.signal]),
      );
    } finally {
      state.questions.delete(question);
      for (const call of waiting) call.waiting(false);
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
        error instanceof McpAuthorizationError ||
        error instanceof McpTimeoutError ||
        signal?.aborted
      ) {
        if (error instanceof McpAuthorizationError) this.recordDiscoveryFailure(state, error);
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
      const client = await this.getClient(server, state, bound.signal);
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
      'plugin.id': server.origin === 'builtin' ? server.builtinId : undefined,
      'mcp.connection.generation': generation,
    });
    let rawTools: ListToolsResult['tools'];
    let prompts: McpPromptEntry[] | undefined;
    try {
      [rawTools, prompts] = await Promise.all([
        listAllTools(client, signal),
        server.origin === 'builtin'
          ? undefined
          : listMcpPrompts(client, signal).catch((error: unknown) => {
              // Prompts are optional: a failure keeps the last known menu and never blocks tools.
              logger.warn('Could not list MCP prompts', error as Error, { serverId: server.id });
              return undefined;
            }),
      ]);
    } catch (error) {
      endMcpTrace(trace, error, signal, didTimeout?.());
      throw error;
    }
    if (!this.isCurrentState(state, generation)) {
      trace?.end('cancelled', { 'error.category': 'cancelled' });
      throw new McpEvictedError(`MCP server ${server.name} was invalidated while listing tools`);
    }
    state.clientListed = true;
    if (prompts) {
      const changed = JSON.stringify(prompts) !== JSON.stringify(state.prompts);
      state.prompts = prompts;
      if (changed) this.notifyPromptCatalogs();
    } else {
      // Keep the stored menu when a live discovery ran before the file was restored.
      await this.restoreCatalog(server, state);
    }
    const tools = await this.recordCatalog(
      server,
      state,
      {
        tools: rawTools,
        discoveryWarnings: client.discoveryWarnings ?? [],
        serverInfo: client.serverInfo,
      },
      client.catalogExpiresAt,
      client.protocolInfo,
    );
    trace?.end('ok', { 'mcp.tools_count': tools.length });
    return tools;
  }

  private async recordCatalog(
    server: McpServer,
    state: ServerRuntimeState,
    catalog: PluginToolCatalog,
    // Bundled plugin catalogs change only with their grant, which invalidates the server.
    expiresAt = Number.MAX_SAFE_INTEGER,
    protocol?: McpServerRuntimeSummary['protocol'],
  ): Promise<ListToolsResult['tools']> {
    const rawTools =
      server.origin === 'builtin'
        ? catalog.tools.filter((tool) => isBuiltInMcpToolAllowed(server.builtinId, tool.name))
        : catalog.tools;
    const discoveryWarnings = [...catalog.discoveryWarnings];
    state.runtimeError = discoveryWarnings.join(' ') || undefined;
    if (discoveryWarnings.length > 0) this.recordDiscoveryFailure(state);
    else state.discoveryFailure = undefined;
    state.catalog = { discoveryWarnings, expiresAt, source: 'live', tools: rawTools };
    const discoveredAt = Date.now();
    this.runtimeSnapshots.set(server.id, {
      connectionConfig: state.connectionConfig,
      lastConnectedAt: discoveredAt,
      serverName: catalog.serverInfo.name,
      serverTitle: catalog.serverInfo.title,
      serverVersion: catalog.serverInfo.version,
      protocol,
      toolCount: rawTools.length,
    });
    if (discoveryWarnings.length === 0) {
      const connectionKey = await this.getConnectionKey(state);
      if (!this.isCurrentState(state)) return rawTools;
      await writeMcpToolCatalog({
        connectionKey,
        discoveredAt,
        expiresAt,
        serverId: server.id,
        tools: rawTools,
        prompts: state.prompts,
        version: 2,
      });
    }
    return rawTools;
  }

  private notifyPromptCatalogs(): void {
    for (const listener of this.promptCatalogListeners) listener();
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
    ...(server.oauth && { oauth: server.oauth }),
    ...(server.headers && { headers: { ...server.headers } }),
  };
}
