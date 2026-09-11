import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';
import type { PluginId } from '@/shared/data/types/plugin';

import type { PluginCredential } from '../authorization/pluginCredential';
import type { PluginClient } from '../pluginDefinition';
import { requirePluginAuthMethod, requirePluginDefinition } from '../pluginRegistry';

const CONNECTION_TIMEOUT_MS = 15_000;

/** Verify new credentials through read-only connection checks before committing them. */
export async function validatePluginConnection(
  pluginId: PluginId,
  authMethod: string,
  credential: PluginCredential,
  signal?: AbortSignal,
): Promise<string> {
  const plugin = requirePluginDefinition(pluginId);
  const method = requirePluginAuthMethod(plugin, authMethod);
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), CONNECTION_TIMEOUT_MS);
  const operationSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  let client: PluginClient | undefined;
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
    const cursors = new Set<string>();
    let cursor: string | undefined;
    while (true) {
      const page = await client.listTools({
        options: { signal: operationSignal },
        ...(cursor ? { params: { cursor } } : {}),
      });
      const definition = page.tools.find((tool) =>
        name ? tool.name === name : Object.hasOwn(plugin.tools, tool.name),
      );
      if (definition) {
        if (!plugin.validation.args) {
          operationSignal.throwIfAborted();
          return plugin.validation.accountLabel(undefined);
        }
        const output = await client.callTool({
          name: definition.name,
          args: plugin.validation.args,
          options: { abortSignal: operationSignal },
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
        return plugin.validation.accountLabel(value);
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
