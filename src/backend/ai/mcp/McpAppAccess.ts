import type { ListToolsResult } from '@ai-sdk/mcp';
import type { CallToolResult, Tool } from '@modelcontextprotocol/client';
import { CallToolResultSchema } from '@modelcontextprotocol/core';
import * as z from 'zod';

import { raceAbort } from '@/backend/ai/agent/runtime/raceAbort';
import type { McpAppReference } from '@/shared/contracts/mcpApp';
import type { McpElicitationResponse } from '@/shared/contracts/mcpInteraction';
import type { RemoteMcpServer } from '@/shared/data/types/mcpServer';

import { mcpToolAppUri, mcpToolVisible } from './mcpAppMetadata';
import type { McpRuntimeClient } from './mcpProtocolClient';
import {
  createBoundedSignal,
  incompleteCallError,
  McpRuntimeToolError,
  type McpInvocationProgress,
} from './mcpRuntimeAdapter';
import { createMcpConnectionKey } from './mcpToolCatalogStore';

/** The service owns connections and catalogs; App access owns authorization policy only. */
export type McpAppConnection = {
  client: McpRuntimeClient;
  server: RemoteMcpServer;
  signal: AbortSignal;
  tools(): Promise<ListToolsResult['tools']>;
  invoke(
    name: string,
    args: Record<string, unknown>,
    progress: McpInvocationProgress,
  ): Promise<unknown>;
};

type AppAccessPorts = {
  isForeground(): boolean;
  assertBinding(reference: McpAppReference, name: string): Promise<void>;
  withConnection<T>(
    serverId: string,
    signal: AbortSignal,
    operation: (connection: McpAppConnection) => Promise<T>,
  ): Promise<T>;
  requestConsent(
    server: RemoteMcpServer,
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<McpElicitationResponse>;
};

function unavailable(): McpRuntimeToolError {
  return new McpRuntimeToolError(
    'mcp_tool_unavailable',
    'The MCP tool is no longer available.',
    false,
  );
}

/** Source identity, per-Agent permission and independent App consent. No connection state. */
export class McpAppAccess {
  constructor(private readonly ports: AppAccessPorts) {}

  private async withSource<T>(
    reference: McpAppReference,
    signal: AbortSignal,
    operation: (connection: McpAppConnection, tools: ListToolsResult['tools']) => Promise<T>,
  ): Promise<T> {
    signal.throwIfAborted();
    if (!this.ports.isForeground()) throw unavailable();
    await this.ports.assertBinding(reference, reference.toolName);
    return this.ports.withConnection(reference.serverId, signal, async (connection) => {
      const { server } = connection;
      if ((await createMcpConnectionKey(server)) !== reference.connectionKey) throw unavailable();
      const tools = await connection.tools();
      const source = tools.find((tool) => tool.name === reference.toolName);
      if (
        !source ||
        mcpToolAppUri(source) !== reference.resourceUri ||
        server.disabledTools.includes(source.name)
      )
        throw unavailable();
      const result = await operation(connection, tools);
      await this.ports.assertBinding(reference, reference.toolName);
      if (!this.ports.isForeground()) throw unavailable();
      connection.signal.throwIfAborted();
      return result;
    });
  }

  resources(reference: McpAppReference, signal: AbortSignal) {
    return this.withSource(reference, signal, async ({ client, signal: requestSignal }) => {
      if (!client.listResources) throw unavailable();
      return client.listResources(undefined, { signal: requestSignal, cacheMode: 'refresh' });
    });
  }

  templates(reference: McpAppReference, signal: AbortSignal) {
    return this.withSource(reference, signal, async ({ client, signal: requestSignal }) => {
      if (!client.listResourceTemplates) throw unavailable();
      return client.listResourceTemplates(undefined, {
        signal: requestSignal,
        cacheMode: 'refresh',
      });
    });
  }

  read(reference: McpAppReference, uri: string, signal: AbortSignal) {
    return this.withSource(reference, signal, async ({ client, signal: requestSignal }) => {
      if (!client.readResource) throw unavailable();
      const result = await client.readResource(
        { uri },
        { signal: requestSignal, cacheMode: 'refresh', timeout: 10 * 60 * 1000 },
      );
      if (JSON.stringify(result).length > 4 * 1024 * 1024) throw unavailable();
      return result;
    });
  }

  tools(reference: McpAppReference, signal: AbortSignal) {
    return this.withSource(reference, signal, async ({ server, signal: requestSignal }, tools) => {
      const permitted: Tool[] = [];
      for (const tool of tools) {
        if (!mcpToolVisible(tool, 'app') || server.disabledTools.includes(tool.name)) continue;
        try {
          await this.ports.assertBinding(reference, tool.name);
          permitted.push(tool as Tool);
        } catch {
          requestSignal.throwIfAborted();
        }
      }
      return permitted;
    });
  }

  async call(
    reference: McpAppReference,
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<CallToolResult> {
    if (JSON.stringify(args).length > 64 * 1024) throw unavailable();
    const inspect = async (connection: McpAppConnection, tools: ListToolsResult['tools']) => {
      await this.ports.assertBinding(reference, name);
      const tool = tools.find((item) => item.name === name);
      if (!tool || !mcpToolVisible(tool, 'app') || connection.server.disabledTools.includes(name))
        throw unavailable();
      const validator = z.fromJSONSchema(
        tool.inputSchema as Parameters<typeof z.fromJSONSchema>[0],
      );
      if (!validator.safeParse(args).success) throw unavailable();
      return tool;
    };
    const server = await this.withSource(reference, signal, async (connection, tools) => {
      await inspect(connection, tools);
      return connection.server;
    });
    // Human waiting has no network timer. A fresh round rechecks identity, catalog and grants.
    const response = await this.ports.requestConsent(server, name, args, signal);
    if (response.action !== 'accept') throw unavailable();
    const bound = createBoundedSignal(60_000, signal);
    let sent = false;
    let received = false;
    let effect: 'read' | undefined;
    try {
      return await raceAbort(
        this.withSource(reference, bound.signal, async (connection, tools) => {
          const tool = await inspect(connection, tools);
          if (tool.annotations?.readOnlyHint === true || tool.annotations?.idempotentHint === true)
            effect = 'read';
          connection.signal.throwIfAborted();
          const result = await connection.invoke(name, args, {
            sent: () => {
              sent = true;
            },
            waiting: bound.setPaused,
          });
          received = true;
          if (JSON.stringify(result).length > 4 * 1024 * 1024)
            throw new Error('Result exceeds App delivery limit');
          return CallToolResultSchema.parse(result);
        }),
        bound.signal,
      );
    } catch (error) {
      // Explicit protocol rejections remain exact. A lost result after transmission does not.
      if (
        error instanceof McpRuntimeToolError &&
        (!received || error.code !== 'mcp_tool_unavailable')
      )
        throw error;
      throw incompleteCallError({
        sent,
        effect,
        cancelled: signal.aborted,
        timedOut: bound.didTimeout(),
      });
    } finally {
      bound.done();
    }
  }
}
