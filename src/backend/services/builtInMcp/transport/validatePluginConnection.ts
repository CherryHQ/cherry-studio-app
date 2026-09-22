import { loggerService } from '@logger';
import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';
import type { PluginId } from '@/shared/data/types/plugin';

import type { PluginCredential } from '../authorization/pluginCredential';
import {
  getPluginToolEffect,
  type PluginClient,
  type PluginToolCatalog,
} from '../pluginDefinition';
import { requirePluginAuthMethod, requirePluginDefinition } from '../pluginRegistry';

const CONNECTION_TIMEOUT_MS = 15_000;
const logger = loggerService.withContext('PluginConnection');

/** Validate credentials and collect the reusable catalog in the same bounded connection. */
export async function validatePluginConnection(
  pluginId: PluginId,
  authMethod: string,
  credential: PluginCredential,
  signal?: AbortSignal,
): Promise<{ accountLabel: string; catalog: PluginToolCatalog }> {
  const plugin = requirePluginDefinition(pluginId);
  const method = requirePluginAuthMethod(plugin, authMethod);
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), CONNECTION_TIMEOUT_MS);
  const operationSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  let client: PluginClient | undefined;
  let phase = 'initialization';
  try {
    operationSignal.throwIfAborted();
    client = await plugin.createClient({
      pluginId,
      tools: plugin.tools,
      getCredential: async () => credential,
      assertAuthorized: async () => {
        operationSignal.throwIfAborted();
      },
      authorization: method.createRequestAuthorization(plugin.tools),
      signal: operationSignal,
    });
    const name = plugin.validation.tool;
    const tools: PluginToolCatalog['tools'] = [];
    const names = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    while (true) {
      phase = 'discovery';
      const page = await client.listTools({
        options: { signal: operationSignal },
        ...(cursor ? { params: { cursor } } : {}),
      });
      operationSignal.throwIfAborted();
      for (const tool of page.tools) {
        if (names.has(tool.name)) {
          throw new PluginError(
            'request',
            'The official MCP tool catalog contains duplicate tools.',
          );
        }
        names.add(tool.name);
        tools.push(tool);
      }
      if (!page.nextCursor) break;
      if (cursors.has(page.nextCursor)) {
        throw new PluginError('request', 'The official MCP tool catalog repeated a page.');
      }
      cursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    const definition = tools.find((tool) =>
      name ? tool.name === name : getPluginToolEffect(plugin, tool.name) !== undefined,
    );
    if (!definition) {
      throw new PluginError('request', 'The official MCP validation tool is unavailable.');
    }
    let value: unknown;
    if (plugin.validation.args) {
      phase = 'validation';
      const output = await client.callTool({
        name: definition.name,
        args: plugin.validation.args,
        options: { abortSignal: operationSignal },
      });
      const result = z
        .object({
          isError: z.boolean().optional(),
          structuredContent: z.unknown().optional(),
          content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
        })
        .parse(output);
      if (result.isError) {
        throw new PluginError(
          'request',
          'Credential validation failed. Check service access and quota.',
        );
      }
      const text = result.content?.find((item) => item.type === 'text')?.text;
      value = result.structuredContent ?? (text ? JSON.parse(text) : undefined);
    }
    operationSignal.throwIfAborted();
    return {
      accountLabel: plugin.validation.accountLabel(value),
      catalog: {
        tools: tools.filter((tool) => getPluginToolEffect(plugin, tool.name) !== undefined),
        discoveryWarnings: [...(client.discoveryWarnings ?? [])],
        serverInfo: client.serverInfo,
      },
    };
  } catch (error) {
    logger.warn('Plugin connection check failed.', {
      pluginId,
      authMethod,
      phase,
      ...(error instanceof PluginError
        ? { reason: error.reason, message: error.message }
        : {
            errorName: error instanceof Error ? error.name : typeof error,
            frames:
              error instanceof Error
                ? error.stack
                    ?.split('\n')
                    .filter((line) => /^\s+at /.test(line))
                    .slice(0, 6)
                : undefined,
          }),
    });
    if (signal?.aborted) throw new PluginError('cancelled', 'Plugin connection cancelled.');
    if (deadline.signal.aborted) throw new PluginError('network', 'Plugin connection timed out.');
    if (error instanceof PluginError) throw error;
    throw new PluginError('request', 'Could not validate the official MCP connection.');
  } finally {
    clearTimeout(timer);
    await client?.close().catch(() => undefined);
  }
}
