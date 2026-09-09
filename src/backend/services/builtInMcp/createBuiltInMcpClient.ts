import type { MCPClient } from '@ai-sdk/mcp';
import * as z from 'zod';

import { pluginAuthorizationService } from '@/backend/data/services/PluginAuthorizationService';
import { PluginError } from '@/shared/contracts/plugins';
import type { PluginId } from '@/shared/data/types/plugin';

import { getPluginDefinition, requirePluginDefinition } from './pluginRegistry';

const CONNECTION_TIMEOUT_MS = 15_000;

export function isBuiltInMcpToolAllowed(pluginId: PluginId, name: string): boolean {
  const plugin = getPluginDefinition(pluginId);
  return plugin !== undefined && Object.hasOwn(plugin.tools, name);
}

/** Bind a client to a registered plugin and one durable grant, checked before every request. */
export async function createBuiltInMcpClient(
  pluginId: PluginId,
  authorizationId: string,
  signal: AbortSignal,
): Promise<MCPClient> {
  const plugin = requirePluginDefinition(pluginId);
  return plugin.createClient({
    pluginId,
    tools: plugin.tools,
    signal,
    async getCredential() {
      const grant = await pluginAuthorizationService.getCredentialGrant(pluginId, authorizationId);
      if (grant.authMethod !== plugin.authMethod) {
        throw new PluginError(
          'authorization',
          'The plugin authorization method is unavailable. Reconnect the plugin.',
        );
      }
      return grant.credential;
    },
  });
}

/** Verify new credentials through read-only connection checks before committing them. */
export async function validatePluginCredential(
  pluginId: PluginId,
  credential: string,
  signal?: AbortSignal,
): Promise<string> {
  const plugin = requirePluginDefinition(pluginId);
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), CONNECTION_TIMEOUT_MS);
  const operationSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  let client: MCPClient | undefined;
  try {
    operationSignal.throwIfAborted();
    client = await plugin.createClient({
      pluginId,
      tools: plugin.tools,
      getCredential: async () => credential,
      signal: operationSignal,
    });
    const name = plugin.validation.tool;
    const cursors = new Set<string>();
    let cursor: string | undefined;
    while (true) {
      const page = await client.listTools({
        options: { signal: operationSignal },
        ...(cursor ? { params: { cursor } } : {}),
      });
      const definition = page.tools.find((tool) => tool.name === name);
      if (definition) {
        if (!plugin.validation.args) {
          operationSignal.throwIfAborted();
          return plugin.validation.accountLabel(undefined, credential);
        }
        const tool = client.toolsFromDefinitions({ tools: [definition] })[name];
        const output = await tool!.execute(plugin.validation.args, {
          abortSignal: operationSignal,
          messages: [],
          toolCallId: 'plugin-authorization',
        });
        const result = z
          .object({
            isError: z.boolean().optional(),
            structuredContent: z.unknown().optional(),
            content: z
              .array(z.object({ type: z.string(), text: z.string().optional() }))
              .optional(),
          })
          .parse(output);
        if (result.isError) {
          throw new PluginError(
            'request',
            'Credential validation failed. Check service access and quota.',
          );
        }
        const text = result.content?.find((item) => item.type === 'text')?.text;
        const value = result.structuredContent ?? (text ? JSON.parse(text) : undefined);
        operationSignal.throwIfAborted();
        return plugin.validation.accountLabel(value, credential);
      }
      if (!page.nextCursor || cursors.has(page.nextCursor)) {
        throw new PluginError('request', 'The official MCP validation tool is unavailable.');
      }
      cursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
  } catch (error) {
    if (signal?.aborted) throw new PluginError('cancelled', 'Plugin connection cancelled.');
    if (deadline.signal.aborted) throw new PluginError('network', 'Plugin connection timed out.');
    if (error instanceof PluginError) throw error;
    throw new PluginError('request', 'Could not validate the official MCP connection.');
  } finally {
    clearTimeout(timer);
    await client?.close().catch(() => undefined);
  }
}
