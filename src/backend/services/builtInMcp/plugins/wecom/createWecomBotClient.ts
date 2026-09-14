import type { ListToolsResult } from '@ai-sdk/mcp';
import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClient, PluginClientContext } from '../../pluginDefinition';
import {
  parseWecomResponse,
  wecomBotApi,
  WecomBotApiError,
  WecomBotCredentialSchema,
} from './wecomBotApi';
import { getWecomBotTools, type WecomBotTool } from './wecomBotTools';

/** Adapts the official CLI HTTP protocol to Cherry's tool boundary without running a CLI. */
export async function createWecomBotClient(
  context: PluginClientContext,
  botId: string,
): Promise<PluginClient> {
  const lifetime = new AbortController();
  let routes = new Map<string, WecomBotTool>();
  const operationSignal = (caller?: AbortSignal) =>
    AbortSignal.any([lifetime.signal, ...(caller ? [caller] : []), AbortSignal.timeout(30_000)]);

  async function request(
    path: string,
    payload: Record<string, unknown>,
    signal: AbortSignal,
    effect: 'read' | 'write',
  ) {
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted();
      const credential = parseWecomResponse(
        WecomBotCredentialSchema,
        await context.getCredential(signal),
      );
      if (credential.botId !== botId)
        throw new PluginError('authorization', 'The Wecom bot changed.');
      await context.assertAuthorized();
      signal.throwIfAborted();
      try {
        return await wecomBotApi.invoke(path, payload, credential.token, signal);
      } catch (error) {
        // Replay only an explicit token rejection, never a timeout or uncertain write.
        if (
          error instanceof WecomBotApiError &&
          error.code === 853004 &&
          attempt === 0 &&
          context.rejectCredential
        ) {
          await context.rejectCredential(credential);
          continue;
        }
        if (
          effect === 'write' &&
          !(error instanceof WecomBotApiError) &&
          !(
            error instanceof PluginError &&
            ['authorization', 'access', 'quota'].includes(error.reason)
          )
        )
          throw new PluginError(
            'unknown-write',
            'The Wecom write outcome is unknown. Check Wecom before retrying.',
          );
        throw error;
      }
    }
    throw new PluginError('authorization', 'Reconnect Wecom to renew authorization.');
  }

  return {
    serverInfo: { name: 'Cherry Studio Wecom Bot', version: '1' },
    async listTools(input): Promise<ListToolsResult> {
      const signal = operationSignal(input?.options?.signal);
      const catalog = parseWecomResponse(
        z.object({
          items: z.array(z.object({ name: z.string(), hidden: z.boolean().optional() })),
        }),
        await request('/cli/service/discovery', {}, signal, 'read'),
      );
      const services = new Set(
        catalog.items.filter((service) => !service.hidden).map((service) => service.name),
      );
      const results = await Promise.allSettled(
        ['doc', 'todo', 'calendar']
          .filter((name) => services.has(name))
          .map(async (name) =>
            getWecomBotTools(
              name,
              await request('/cli/service/discovery', { service: name }, signal, 'read'),
            ),
          ),
      );
      signal.throwIfAborted();
      const next = new Map<string, WecomBotTool>();
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
        for (const tool of result.value) {
          if (context.tools[tool.definition.name] === tool.effect)
            next.set(tool.definition.name, tool);
        }
      }
      if (!next.size)
        throw new PluginError('access', 'The Wecom bot has no supported authorized tools.');
      routes = next;
      return { tools: [...next.values()].map((tool) => tool.definition) };
    },
    async callTool(input) {
      const signal = operationSignal(input.options?.abortSignal);
      const route = routes.get(input.name);
      if (!route || context.tools[input.name] !== route.effect)
        throw new PluginError('access', 'Refresh the Wecom tool list before using this tool.');
      const result = await request(route.path, input.args, signal, route.effect);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
    async close() {
      lifetime.abort();
      routes.clear();
    },
  };
}
