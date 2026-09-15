import type { ListToolsResult } from '@ai-sdk/mcp';

import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClient, PluginClientContext } from '../../pluginDefinition';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import {
  readWecomCredential,
  type WecomCredential,
  type WecomMcpConnection,
} from './wecomCredentials';
import { getWecomToolEffect } from './wecomTools';

type Source = {
  category: string;
  tools: Record<string, 'read' | 'write'>;
  key?: string;
  client?: PluginClient;
  connecting?: Promise<PluginClient>;
};
type Route = { source: Source; name: string; effect: 'read' | 'write' };

/** Owns official MCP sessions. Tool schemas, descriptions, arguments and results remain upstream-owned. */
export async function createWecomClient(context: PluginClientContext): Promise<PluginClient> {
  context.signal.throwIfAborted();
  const initial = readWecomCredential(await context.getCredential(context.signal));
  context.signal.throwIfAborted();
  const lifetime = new AbortController();
  const sources = new Map<string, Source>();
  let routes = new Map<string, Route>();
  let warnings: string[] = [];
  let discovering: Promise<ListToolsResult> | undefined;
  let closing: Promise<void> | undefined;
  const operationSignal = (caller?: AbortSignal) =>
    AbortSignal.any([lifetime.signal, ...(caller ? [caller] : [])]);

  async function readCredential(signal?: AbortSignal) {
    signal?.throwIfAborted();
    const credential = readWecomCredential(await context.getCredential(signal));
    if (
      credential.kind !== initial.kind ||
      (credential.kind === 'bot' && initial.kind === 'bot' && credential.botId !== initial.botId)
    )
      throw new PluginError('authorization', 'The Wecom authorization changed.');
    await context.assertAuthorized();
    signal?.throwIfAborted();
    return credential;
  }

  function connectionKey(credential: WecomCredential, connection: WecomMcpConnection) {
    return `${credential.kind === 'bot' ? credential.configId : ''}\0${connection.url}`;
  }

  async function getClient(source: Source, signal: AbortSignal): Promise<PluginClient> {
    // Serialize session replacement as well as initialization after configuration renewal.
    source.connecting ??= (async () => {
      const credential = await readCredential(signal);
      const connection = credential.connections.find(
        ({ category }) => category === source.category,
      );
      if (!connection)
        throw new PluginError('access', 'This Wecom capability is no longer authorized.');
      const key = connectionKey(credential, connection);
      if (source.client && source.key === key) return source.client;
      await source.client?.close().catch(() => undefined);
      source.client = undefined;
      const endpoint = new URL(connection.url);
      endpoint.search = '';
      const client = await createOfficialMcpClient(
        {
          ...context,
          signal,
          tools: source.tools,
          getCredential: readCredential,
          authorization: {
            async apply(value, request) {
              const current = readWecomCredential(value);
              const target = current.connections.find(
                ({ category }) => category === source.category,
              );
              if (!target || connectionKey(current, target) !== key)
                throw new PluginError(
                  'access',
                  'Wecom configuration changed. Refresh the tool list.',
                );
              // Different categories may share a path with distinct private query parameters.
              await context.authorization.apply({ ...current, connections: [target] }, request);
            },
          },
        },
        {
          // Credentials are applied per request and stay out of the SDK's endpoint metadata.
          url: endpoint.href,
          async inspectResponse(response) {
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
              return;
            const body: unknown = await response
              .clone()
              .json()
              .catch(() => undefined);
            if (body && typeof body === 'object' && 'error' in body) {
              const error = body.error;
              if (
                error &&
                typeof error === 'object' &&
                'code' in error &&
                typeof error.code === 'number' &&
                [-32001, -32002, -32003].includes(error.code)
              ) {
                await context.rejectCredential?.(credential).catch(() => undefined);
                // The official transport invalidates these configurations. Never replay a write.
                throw new PluginError(
                  'authorization',
                  'Wecom MCP authorization needs to be refreshed. Retry explicitly after reconnecting.',
                );
              }
            }
          },
        },
      );
      if (signal.aborted || lifetime.signal.aborted) {
        await client.close().catch(() => undefined);
        throw new PluginError('cancelled', 'Wecom connection cancelled.');
      }
      source.key = key;
      source.client = client;
      return client;
    })().finally(() => {
      source.connecting = undefined;
    });
    return source.connecting;
  }

  async function discover(signal: AbortSignal): Promise<ListToolsResult> {
    const credential = await readCredential(signal);
    const active = credential.connections.map(({ category }) => {
      let source = sources.get(category);
      if (!source) {
        source = { category, tools: Object.create(null) };
        sources.set(category, source);
      }
      return source;
    });
    const next = new Map<string, Route>();
    const tools: ListToolsResult['tools'] = [];
    const failures: string[] = [];
    const discoverSource = async (source: Source) => {
      const serviceSignal = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
      const client = await getClient(source, serviceSignal);
      const found: ListToolsResult['tools'] = [];
      const names = new Set<string>();
      const cursors = new Set<string>();
      let cursor: string | undefined;
      for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
        const page = await client.listTools({
          options: { signal: serviceSignal },
          ...(cursor ? { params: { cursor } } : {}),
        });
        serviceSignal.throwIfAborted();
        for (const tool of page.tools) {
          const name = `wecom_${source.category}__${tool.name}`;
          if (!getWecomToolEffect(name)) continue;
          if (names.has(tool.name))
            throw new PluginError('request', 'Wecom returned a duplicate tool.');
          names.add(tool.name);
          found.push(tool);
        }
        if (!page.nextCursor) return { source, tools: found };
        if (cursors.has(page.nextCursor))
          throw new PluginError('request', 'Wecom repeated a tool page.');
        cursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      throw new PluginError('request', 'Wecom returned too many tool pages.');
    };
    for (let index = 0; index < active.length; index += 4) {
      const batch = active.slice(index, index + 4);
      // Keep successful services when the overall discovery budget expires.
      const results = await Promise.allSettled(
        batch.map(async (source) => {
          signal.throwIfAborted();
          return discoverSource(source);
        }),
      );
      lifetime.signal.throwIfAborted();
      for (const [offset, result] of results.entries()) {
        if (result.status === 'rejected') {
          if (result.reason instanceof PluginError && result.reason.reason === 'authorization')
            throw result.reason;
          failures.push(
            `Wecom ${batch[offset].category} tools are unavailable. Check the connection and Wecom permissions, then refresh tools.`,
          );
          continue;
        }
        const { source } = result.value;
        for (const name of Object.keys(source.tools)) delete source.tools[name];
        for (const tool of result.value.tools) {
          const name = `wecom_${source.category}__${tool.name}`;
          const effect = getWecomToolEffect(name)!;
          source.tools[tool.name] = effect;
          next.set(name, { source, name: tool.name, effect });
          tools.push({
            ...tool,
            name,
            annotations: { ...tool.annotations, readOnlyHint: effect === 'read' },
          });
        }
      }
    }
    if (!tools.length)
      throw new PluginError('access', 'No authorized Wecom MCP tools are available.');
    routes = next;
    warnings = failures;
    return { tools };
  }

  return {
    serverInfo: { name: 'WeCom MCP', version: '3' },
    get discoveryWarnings() {
      return warnings;
    },
    async listTools(input) {
      const signal = operationSignal(input?.options?.signal);
      signal.throwIfAborted();
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
        throw new PluginError('request', 'Could not load official Wecom MCP tools.');
      }
    },
    async callTool(input) {
      const signal = operationSignal(input.options?.abortSignal);
      const route = routes.get(input.name);
      if (!route) throw new PluginError('access', 'Refresh Wecom tools before calling this tool.');
      let submitted = false;
      try {
        const client = await getClient(route.source, signal);
        signal.throwIfAborted();
        submitted = true;
        return await client.callTool({
          name: route.name,
          args: input.args,
          options: { abortSignal: signal },
        });
      } catch (error) {
        if (
          submitted &&
          route.effect === 'write' &&
          (!(error instanceof PluginError) || error.reason === 'cancelled')
        )
          throw new PluginError(
            'unknown-write',
            'The Wecom write outcome is unknown. Check Wecom before retrying.',
          );
        if (error instanceof PluginError) throw error;
        if (signal.aborted) throw new PluginError('cancelled', 'Wecom request cancelled.');
        throw new PluginError('request', 'The official Wecom MCP request failed.');
      }
    },
    close() {
      closing ??= (async () => {
        lifetime.abort();
        routes.clear();
        await discovering?.catch(() => undefined);
        await Promise.allSettled(
          [...sources.values()].map(async (source) => {
            await source.connecting?.catch(() => undefined);
            await source.client?.close();
          }),
        );
        sources.clear();
      })();
      return closing;
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
