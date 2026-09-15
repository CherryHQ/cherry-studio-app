import type { ListToolsResult } from '@ai-sdk/mcp';

import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClient, PluginClientContext } from '../../pluginDefinition';
import { createWecomApi, readWecomResult, unknownWecomWrite } from './wecomApi';
import { readWecomCredential } from './wecomCredentials';
import { prepareWecomFiles, saveWecomFile, saveWecomResult } from './wecomFiles';
import { readWecomService, WecomCatalogSchema, type WecomTool } from './wecomSchema';

/** One authorized CLI gateway client; business definitions are discovered from the official service. */
export async function createWecomClient(context: PluginClientContext): Promise<PluginClient> {
  context.signal.throwIfAborted();
  const initial = readWecomCredential(await context.getCredential(context.signal));
  await context.assertAuthorized();
  context.signal.throwIfAborted();
  const lifetime = new AbortController();
  const api = createWecomApi(context, initial.botId);
  let routes = new Map<string, WecomTool>();
  let warnings: string[] = [];
  let expiresAt = 0;
  let discovering: Promise<ListToolsResult> | undefined;
  const operationSignal = (signal?: AbortSignal) =>
    AbortSignal.any([lifetime.signal, ...(signal ? [signal] : [])]);

  async function discover(signal: AbortSignal): Promise<ListToolsResult> {
    const catalog = WecomCatalogSchema.parse(
      readWecomResult(
        await api.call({
          endpoint: { path: '/cli/service/discovery' },
          payload: {},
          effect: 'read',
          signal,
          maxResponseBytes: 256 * 1024,
        }),
      ),
    );
    const services = catalog.items.filter(({ hidden }) => !hidden);
    if (new Set(services.map(({ name }) => name)).size !== services.length)
      throw new PluginError('request', 'Wecom returned duplicate services.');
    const next = new Map<string, WecomTool>();
    const failures: string[] = [];
    for (let offset = 0; offset < services.length; offset += 6) {
      if (signal.aborted) {
        failures.push('Wecom discovery timed out. Refresh tools to load remaining services.');
        break;
      }
      const batch = services.slice(offset, offset + 6);
      const results = await Promise.allSettled(
        batch.map(async ({ name }) => {
          const value = readWecomResult(
            await api.call({
              endpoint: { path: '/cli/service/discovery' },
              payload: { service: name },
              effect: 'read',
              signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
              maxResponseBytes: 4 * 1024 * 1024,
            }),
          );
          return readWecomService(name, value);
        }),
      );
      lifetime.signal.throwIfAborted();
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') {
          if (result.reason instanceof PluginError && result.reason.reason === 'authorization')
            throw result.reason;
          failures.push(
            `Wecom ${batch[index].name} tools could not be loaded. Check authorization and refresh tools.`,
          );
          continue;
        }
        for (const tool of result.value.tools) {
          if (next.has(tool.definition.name))
            throw new PluginError('request', 'Wecom returned duplicate tools.');
          next.set(tool.definition.name, tool);
          if (next.size > 1024) throw new PluginError('request', 'Wecom returned too many tools.');
        }
        failures.push(...result.value.warnings);
      }
    }
    if (!next.size)
      throw new PluginError(
        'access',
        'No authorized Wecom tools are available. Check permissions and reconnect.',
      );
    routes = next;
    warnings = failures;
    // Follow the official 60-second schema cache; retry partial discoveries on the next refresh.
    expiresAt = failures.length ? 0 : Date.now() + 60_000;
    return { tools: [...routes.values()].map(({ definition }) => definition) };
  }

  return {
    serverInfo: { name: 'WeCom', version: '1' },
    get discoveryWarnings() {
      return warnings;
    },
    async listTools(input) {
      const signal = operationSignal(input?.options?.signal);
      signal.throwIfAborted();
      await context.assertAuthorized();
      if (Date.now() < expiresAt)
        return { tools: [...routes.values()].map(({ definition }) => definition) };
      discovering ??= discover(operationSignal(AbortSignal.timeout(14_000))).finally(() => {
        discovering = undefined;
      });
      try {
        const result = await waitForCaller(discovering, signal);
        signal.throwIfAborted();
        return result;
      } catch (error) {
        if (signal.aborted) throw new PluginError('cancelled', 'Wecom discovery cancelled.');
        if (error instanceof PluginError) throw error;
        throw new PluginError('request', 'Could not load official Wecom tools.');
      }
    },
    async callTool(input) {
      const signal = operationSignal(input.options?.abortSignal);
      if (signal.aborted) throw new PluginError('cancelled', 'Wecom request cancelled.');
      const tool = routes.get(input.name);
      if (!tool)
        throw new PluginError('access', 'Refresh Wecom tools before calling this operation.');
      const credential = readWecomCredential(await context.getCredential(signal));
      if (credential.botId !== initial.botId)
        throw new PluginError('authorization', 'Wecom identity changed.');
      await context.assertAuthorized();
      signal.throwIfAborted();
      const prepared = await prepareWecomFiles(api, tool.request, input.args, signal);
      const response = await api.call({
        ...prepared,
        endpoint: tool.endpoint,
        effect: tool.effect,
        signal,
      });
      try {
        signal.throwIfAborted();
        const result =
          response.kind === 'file'
            ? {
                ...saveWecomFile(response.bytes, response.filename),
                content_type: response.contentType,
              }
            : saveWecomResult(tool.response, readWecomResult(response), signal);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        if (tool.effect === 'write') throw unknownWecomWrite();
        throw error;
      }
    },
    async close() {
      lifetime.abort();
      expiresAt = 0;
      routes.clear();
      await discovering?.catch(() => undefined);
    },
  };
}

function waitForCaller<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new PluginError('cancelled', 'Wecom discovery cancelled.'));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    void operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
