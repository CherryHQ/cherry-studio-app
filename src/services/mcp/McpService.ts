import type { MCPClient } from '@ai-sdk/mcp';
import { createMCPClient } from '@ai-sdk/mcp';
import type { Tool, ToolSet } from 'ai';
import { fetch as expoFetch } from 'expo/fetch';

import { isMcpToolDisabledBySource } from '@/ai/tools/mcpSourcePolicy';
import { buildFunctionCallToolName } from '@/ai/tools/mcpToolName';
import { loggerService } from '@/core/logger/LoggerService';
import type { McpServerService } from '@/data/services/McpServerService';
import type { Assistant } from '@/data/types/assistant';
import { DEFAULT_MCP_TIMEOUT_SECONDS, type McpServer } from '@/data/types/mcpServer';

import type { McpCallToolResult } from './mcpResult';
import { mcpResultToTextSummary } from './mcpResult';
import { resolveServersForAssistant } from './resolveAssistantMcpServers';

const logger = loggerService.withContext('McpService');

const TOOLS_CACHE_TTL_MS = 5 * 60 * 1000;

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

/** Race a promise against a timeout without AbortSignal.timeout (Hermes). */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const handle = setTimeout(() => {
      onTimeout();
      reject(new Error(`MCP tool call timed out after ${timeoutMs}ms`));
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
 * Clients are created lazily and reused; there is no ping API, so staleness is
 * handled fail-and-drop: any tools()/call failure closes the client and the
 * next use reconnects. `invalidateServer` must be called after config changes.
 */
export class McpService {
  constructor(private readonly deps: { mcpServer: McpServerService }) {}

  private readonly clients = new Map<string, MCPClient>();
  private readonly pendingClients = new Map<string, Promise<MCPClient>>();
  private readonly toolsCache = new Map<string, ToolsCacheEntry>();

  /**
   * AI SDK ToolSet for one chat request, keyed `mcp__{server}__{tool}`.
   * Unreachable servers are skipped; returns undefined when nothing applies.
   * Never throws.
   */
  async getToolSetForAssistant(assistant: Assistant): Promise<ToolSet | undefined> {
    let servers: McpServer[];
    try {
      const { items } = await this.deps.mcpServer.list({ isActive: true });
      servers = resolveServersForAssistant(assistant, items);
    } catch (error) {
      logger.warn('Failed to resolve MCP servers for assistant', { error });
      return undefined;
    }

    if (servers.length === 0) {
      return undefined;
    }

    const settled = await Promise.allSettled(
      servers.map(async (server) => ({ rawTools: await this.getRawTools(server), server })),
    );

    const result: ToolSet = {};
    for (const outcome of settled) {
      if (outcome.status === 'rejected') {
        logger.warn('Skipping unreachable MCP server', { error: outcome.reason });
        continue;
      }

      const { rawTools, server } = outcome.value;
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

  /** Tool list for the server edit screen (pooled client + cache). */
  async listToolsForServer(server: McpServer): Promise<McpToolSummary[]> {
    const rawTools = await this.getRawTools(server);

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
      // The mcp package's nested provider-utils copy makes tools() nominally
      // incompatible with ai's ToolSet; the runtime schema brand is Symbol.for,
      // so the cast is safe.
      const rawTools = (await client.tools()) as ToolSet;
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
    for (const key of [...this.clients.keys()]) {
      if (key.startsWith(`${serverId}:`)) {
        this.clients
          .get(key)
          ?.close()
          .catch(() => undefined);
        this.clients.delete(key);
      }
    }
    for (const key of [...this.toolsCache.keys()]) {
      if (key.startsWith(`${serverId}:`)) {
        this.toolsCache.delete(key);
      }
    }
  }

  async disposeAll(): Promise<void> {
    const closing = [...this.clients.values()].map((client) =>
      client.close().catch(() => undefined),
    );
    this.clients.clear();
    this.toolsCache.clear();
    await Promise.all(closing);
  }

  private serverKey(server: McpServer): string {
    // Config changes naturally mint a new key; invalidateServer matches on the
    // id prefix so stale-config entries are dropped too.
    return `${server.id}:${JSON.stringify([server.baseUrl, server.headers, server.timeout])}`;
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

    const initPromise = createHttpClient(server)
      .then((client) => {
        this.clients.set(key, client);
        return client;
      })
      .finally(() => {
        this.pendingClients.delete(key);
      });

    this.pendingClients.set(key, initPromise);
    return initPromise;
  }

  private dropClient(server: McpServer): void {
    const key = this.serverKey(server);
    this.clients
      .get(key)
      ?.close()
      .catch(() => undefined);
    this.clients.delete(key);
    this.toolsCache.delete(key);
  }

  private async getRawTools(server: McpServer): Promise<ToolSet> {
    const key = this.serverKey(server);
    const cached = this.toolsCache.get(key);
    if (cached && Date.now() - cached.fetchedAt < TOOLS_CACHE_TTL_MS) {
      return cached.rawTools;
    }

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
    const client = await this.getClient(server);
    const rawTools = (await client.tools()) as ToolSet;
    this.toolsCache.set(key, { fetchedAt: Date.now(), rawTools });
    return rawTools;
  }

  private wrapTool(rawTool: Tool, server: McpServer, rawToolName: string): Tool {
    const timeoutMs = (server.timeout ?? DEFAULT_MCP_TIMEOUT_SECONDS) * 1000;
    const execute = rawTool.execute;
    if (!execute) {
      return rawTool;
    }

    return {
      ...rawTool,
      description: rawTool.description || rawToolName,
      metadata: {
        cherry: {
          tool: { serverId: server.id, serverName: server.name, type: 'mcp' },
        },
      },
      execute: async (args, options) => {
        const result = (await withTimeout(
          Promise.resolve(execute(args, options)),
          timeoutMs,
          // A timed-out connection may be wedged — don't let later calls reuse it.
          () => this.dropClient(server),
        )) as McpCallToolResult;

        if (result?.isError) {
          throw new Error(mcpResultToTextSummary(result) || 'MCP tool call failed');
        }

        return result;
      },
      toModelOutput: ({ output }) => ({
        type: 'text',
        value: mcpResultToTextSummary(output as McpCallToolResult),
      }),
    } as Tool;
  }
}
