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
import { WECOM_SERVICES } from './wecomTools';

/** Adapts the official CLI HTTP protocol to Cherry's tool boundary without running a CLI. */
export async function createWecomClient(context: PluginClientContext): Promise<PluginClient> {
  context.signal.throwIfAborted();
  const initial = WecomBotCredentialSchema.safeParse(await context.getCredential(context.signal));
  if (!initial.success)
    throw new PluginError('authorization', 'Reconnect Wecom to authorize a bot.');
  context.signal.throwIfAborted();
  const botId = initial.data.botId;
  const lifetime = new AbortController();
  let warnings: string[] = [];
  let discovering: Promise<ListToolsResult> | undefined;
  let routes = new Map<string, WecomBotTool>();
  const operationSignal = (caller?: AbortSignal) =>
    AbortSignal.any([lifetime.signal, ...(caller ? [caller] : []), AbortSignal.timeout(135_000)]);

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

  async function discover(signal: AbortSignal): Promise<ListToolsResult> {
    const catalog = parseWecomResponse(
      z.object({ items: z.array(z.object({ name: z.string(), hidden: z.boolean().optional() })) }),
      await request('/cli/service/discovery', {}, signal, 'read'),
    );
    const available = new Set(
      catalog.items
        .filter((item) => !item.hidden || item.name === 'identity')
        .map((item) => item.name),
    );
    const services = Object.keys(WECOM_SERVICES).filter((name) => available.has(name));
    const next = new Map<string, WecomBotTool>();
    const failures: string[] = [];
    // Keep discovery within setup's deadline without opening every service at once on mobile.
    for (let index = 0; index < services.length; index += 4) {
      const batch = services.slice(index, index + 4);
      const results = await Promise.allSettled(
        batch.map(async (name) => {
          const serviceSignal = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
          return getWecomBotTools(
            name,
            await request('/cli/service/discovery', { service: name }, serviceSignal, 'read'),
          );
        }),
      );
      signal.throwIfAborted();
      for (const [offset, result] of results.entries()) {
        if (result.status === 'rejected') {
          if (result.reason instanceof PluginError && result.reason.reason === 'authorization')
            throw result.reason;
          failures.push(
            `Wecom ${batch[offset]} tools are unavailable. Check permissions and refresh the tool list.`,
          );
          continue;
        }
        for (const tool of result.value) {
          if (context.tools[tool.definition.name] === tool.effect)
            next.set(tool.definition.name, tool);
        }
      }
    }
    signal.throwIfAborted();
    if (!next.size) throw new PluginError('access', 'No supported Wecom tools are available.');
    routes = next;
    warnings = failures;
    return { tools: [...next.values()].map((tool) => tool.definition) };
  }

  return {
    serverInfo: { name: 'Cherry Studio Wecom', version: '2' },
    get discoveryWarnings() {
      return warnings;
    },
    async listTools(input): Promise<ListToolsResult> {
      const signal = operationSignal(input?.options?.signal);
      signal.throwIfAborted();
      discovering ??= discover(operationSignal(AbortSignal.timeout(12_000))).finally(() => {
        discovering = undefined;
      });
      return waitForCaller(discovering, signal);
    },
    async callTool(input) {
      const signal = operationSignal(input.options?.abortSignal);
      const route = routes.get(input.name);
      if (!route || context.tools[input.name] !== route.effect)
        throw new PluginError('access', 'Refresh the Wecom tool list before using this tool.');
      const result = route.readResult(
        await request(route.path, route.parseInput(input.args), signal, route.effect),
      );
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    },
    async close() {
      lifetime.abort();
      routes.clear();
      await discovering?.catch(() => undefined);
    },
  };
}

function waitForCaller<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new PluginError('cancelled', 'Wecom discovery cancelled.'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
