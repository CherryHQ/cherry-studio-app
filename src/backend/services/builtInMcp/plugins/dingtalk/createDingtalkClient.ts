import type { ListToolsResult } from '@ai-sdk/mcp';

import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClient, PluginClientContext, PluginToolPolicy } from '../../pluginDefinition';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import { DingtalkCredentialSchema, type DingtalkConnection } from './dingtalkCredentials';
import { DINGTALK_TOOL_POLICY, DINGTALK_SERVICES } from './dingtalkTools';

type Source = {
  connection: DingtalkConnection;
  client?: PluginClient;
  connecting?: Promise<PluginClient>;
};

/** Owns the imported official sessions and one atomic, reviewed tool-routing snapshot. */
export async function createDingtalkClient(context: PluginClientContext): Promise<PluginClient> {
  context.signal.throwIfAborted();
  const initial = DingtalkCredentialSchema.safeParse(await context.getCredential(context.signal));
  if (!initial.success)
    throw new PluginError(
      'authorization',
      'Reconnect Dingtalk with an official MCP configuration.',
    );
  context.signal.throwIfAborted();
  const lifetime = new AbortController();
  const sources: Source[] = initial.data.connections.map((connection) => ({ connection }));
  let routes = new Map<string, Source>();
  let discovering: Promise<ListToolsResult> | undefined;
  let closing: Promise<void> | undefined;
  const operationSignal = (caller?: AbortSignal) =>
    caller ? AbortSignal.any([caller, lifetime.signal]) : lifetime.signal;
  function policy(connection: DingtalkConnection): PluginToolPolicy {
    const reviewed: PluginToolPolicy = Object.values(DINGTALK_SERVICES).find(
      (service) => service.path === new URL(connection.url).pathname,
    )!.tools;
    return Object.fromEntries(
      Object.entries(reviewed).filter(([name, effect]) => context.tools[name] === effect),
    );
  }
  async function authorize(source: Source, signal: AbortSignal) {
    signal.throwIfAborted();
    const current = DingtalkCredentialSchema.safeParse(await context.getCredential(signal));
    const same =
      current.success &&
      current.data.connections.some(
        (connection) =>
          connection.url === source.connection.url &&
          JSON.stringify(connection.headers ?? {}) ===
            JSON.stringify(source.connection.headers ?? {}),
      );
    if (!same)
      throw new PluginError(
        'authorization',
        'The Dingtalk connection changed. Reconnect before using it.',
      );
    await context.assertAuthorized();
    signal.throwIfAborted();
  }
  async function getClient(source: Source, signal: AbortSignal): Promise<PluginClient> {
    await authorize(source, signal);
    if (source.client) return source.client;
    source.connecting ??= createOfficialMcpClient(
      {
        ...context,
        signal,
        tools: policy(source.connection),
        authorization: {
          async apply(credential, { url, headers, signal: requestSignal }) {
            const parsed = DingtalkCredentialSchema.safeParse(credential);
            const connection =
              parsed.success &&
              parsed.data.connections.find((item) => item.url === source.connection.url);
            if (
              !connection ||
              url.href !== connection.url ||
              JSON.stringify(connection.headers ?? {}) !==
                JSON.stringify(source.connection.headers ?? {})
            )
              throw new PluginError('authorization', 'The Dingtalk connection changed.');
            requestSignal?.throwIfAborted();
            for (const [name, value] of Object.entries(connection.headers ?? {}))
              headers.set(name, value);
          },
        },
      },
      { url: source.connection.url },
    )
      .then(async (client) => {
        if (signal.aborted || lifetime.signal.aborted) {
          await client.close().catch(() => undefined);
          throw new PluginError('cancelled', 'Dingtalk connection cancelled.');
        }
        source.client = client;
        return client;
      })
      .finally(() => {
        source.connecting = undefined;
      });
    return source.connecting;
  }
  async function discover(signal: AbortSignal): Promise<ListToolsResult> {
    const results = await Promise.allSettled(
      sources.map(async (source) => {
        const client = await getClient(source, signal);
        const allowed = policy(source.connection);
        const tools: ListToolsResult['tools'] = [];
        const cursors = new Set<string>();
        const names = new Set<string>();
        let cursor: string | undefined;
        for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
          const page = await client.listTools({
            options: { signal },
            ...(cursor ? { params: { cursor } } : {}),
          });
          signal.throwIfAborted();
          for (const tool of page.tools) {
            if (!Object.hasOwn(allowed, tool.name)) continue;
            if (names.has(tool.name))
              throw new PluginError('request', 'Dingtalk returned a duplicate tool.');
            names.add(tool.name);
            // Read/write effects come from bundled policy, not a server hint.
            tools.push({
              ...tool,
              annotations: { ...tool.annotations, readOnlyHint: allowed[tool.name] === 'read' },
            });
          }
          if (!page.nextCursor) {
            if (!tools.length)
              throw new PluginError(
                'access',
                'An imported Dingtalk service has no supported authorized tools.',
              );
            return { source, tools };
          }
          if (cursors.has(page.nextCursor))
            throw new PluginError('request', 'Dingtalk repeated a tool page.');
          cursors.add(page.nextCursor);
          cursor = page.nextCursor;
        }
        throw new PluginError('request', 'Dingtalk returned too many tool pages.');
      }),
    );
    signal.throwIfAborted();
    const next = new Map<string, Source>();
    const tools: ListToolsResult['tools'] = [];
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      for (const tool of result.value.tools) {
        if (next.has(tool.name))
          throw new PluginError('request', 'Import each Dingtalk service only once.');
        next.set(tool.name, result.value.source);
        tools.push(tool);
      }
    }
    routes = next;
    return { tools };
  }
  return {
    serverInfo: { name: 'Cherry Studio Dingtalk', version: '1' },
    async listTools(input) {
      const signal = operationSignal(input?.options?.signal);
      signal.throwIfAborted();
      // Shared discovery owns its deadline; cancellation of one observer cannot cancel another.
      discovering ??= discover(operationSignal(AbortSignal.timeout(12_000))).finally(() => {
        discovering = undefined;
      });
      try {
        const result = await waitForCaller(discovering, signal);
        signal.throwIfAborted();
        return result;
      } catch (error) {
        if (signal.aborted) throw new PluginError('cancelled', 'Dingtalk discovery cancelled.');
        if (error instanceof PluginError) throw error;
        throw new PluginError(
          'request',
          'Could not load Dingtalk tools. Check the imported configuration and permissions.',
        );
      }
    },
    async callTool(input) {
      const signal = operationSignal(input.options?.abortSignal);
      const effect = Object.hasOwn(DINGTALK_TOOL_POLICY, input.name)
        ? (DINGTALK_TOOL_POLICY as PluginToolPolicy)[input.name]
        : undefined;
      if (!effect || context.tools[input.name] !== effect)
        throw new PluginError('access', 'The Dingtalk tool is not admitted.');
      const source = routes.get(input.name);
      if (!source)
        throw new PluginError('access', 'Refresh the Dingtalk tool list before using this tool.');
      let submitted = false;
      try {
        const client = await getClient(source, signal);
        signal.throwIfAborted();
        submitted = true;
        return await client.callTool({ ...input, options: { abortSignal: signal } });
      } catch (error) {
        if (error instanceof PluginError) throw error;
        if (effect === 'write' && submitted)
          throw new PluginError(
            'unknown-write',
            'The Dingtalk write outcome is unknown. Check the service before retrying.',
          );
        if (signal.aborted) throw new PluginError('cancelled', 'Dingtalk request cancelled.');
        throw new PluginError('request', 'Dingtalk could not complete the request.');
      }
    },
    close() {
      if (!closing) {
        lifetime.abort();
        routes.clear();
        closing = (async () => {
          await discovering?.catch(() => undefined);
          await Promise.allSettled(
            sources.map(async (source) => {
              await source.connecting?.catch(() => undefined);
              await source.client?.close();
              source.client = undefined;
            }),
          );
        })();
      }
      return closing;
    },
  };
}

function waitForCaller<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new PluginError('cancelled', 'Dingtalk discovery cancelled.'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
