import type { ListToolsResult } from '@ai-sdk/mcp';

import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClient, PluginClientContext, PluginToolPolicy } from '../../pluginDefinition';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import { WecomCredentialSchema, type WecomConnection } from './wecomCredentials';
import { WECOM_TOOL_POLICY } from './wecomTools';

type Source = {
  connection: WecomConnection;
  client?: PluginClient;
  connecting?: Promise<PluginClient>;
};

/** Owns the imported official sessions and one atomic, reviewed tool-routing snapshot. */
export async function createWecomClient(context: PluginClientContext): Promise<PluginClient> {
  context.signal.throwIfAborted();
  const initial = WecomCredentialSchema.safeParse(await context.getCredential(context.signal));
  if (!initial.success)
    throw new PluginError('authorization', 'Reconnect Wecom with an official MCP configuration.');
  context.signal.throwIfAborted();
  const lifetime = new AbortController();
  const sources: Source[] = initial.data.connections.map((connection) => ({ connection }));
  let routes = new Map<string, Source>();
  let discovering: Promise<ListToolsResult> | undefined;
  let closing: Promise<void> | undefined;
  const operationSignal = (caller?: AbortSignal) =>
    caller ? AbortSignal.any([caller, lifetime.signal]) : lifetime.signal;
  function policy(_connection: WecomConnection): PluginToolPolicy {
    const reviewed: PluginToolPolicy = WECOM_TOOL_POLICY;
    return Object.fromEntries(
      Object.entries(reviewed).filter(([name, effect]) => context.tools[name] === effect),
    );
  }
  async function authorize(source: Source, signal: AbortSignal) {
    signal.throwIfAborted();
    const current = WecomCredentialSchema.safeParse(await context.getCredential(signal));
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
        'The Wecom connection changed. Reconnect before using it.',
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
            const parsed = WecomCredentialSchema.safeParse(credential);
            const connection =
              parsed.success &&
              parsed.data.connections.find((item) => item.url === source.connection.url);
            if (
              !connection ||
              url.href !== connection.url ||
              JSON.stringify(connection.headers ?? {}) !==
                JSON.stringify(source.connection.headers ?? {})
            )
              throw new PluginError('authorization', 'The Wecom connection changed.');
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
          throw new PluginError('cancelled', 'Wecom connection cancelled.');
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
              throw new PluginError('request', 'Wecom returned a duplicate tool.');
            names.add(tool.name);
            // Read/write effects come from bundled policy, not a server hint.
            tools.push({
              ...tool,
              inputSchema:
                tool.name === 'update_todo'
                  ? {
                      ...tool.inputSchema,
                      properties: {
                        ...tool.inputSchema.properties,
                        todo_status: {
                          type: 'integer',
                          enum: [0, 1],
                          description: '0: completed; 1: in progress. Deletion is not supported.',
                        },
                      },
                    }
                  : tool.inputSchema,
              annotations: { ...tool.annotations, readOnlyHint: allowed[tool.name] === 'read' },
            });
          }
          if (!page.nextCursor) {
            if (!tools.length)
              throw new PluginError(
                'access',
                'An imported Wecom service has no supported authorized tools.',
              );
            return { source, tools };
          }
          if (cursors.has(page.nextCursor))
            throw new PluginError('request', 'Wecom repeated a tool page.');
          cursors.add(page.nextCursor);
          cursor = page.nextCursor;
        }
        throw new PluginError('request', 'Wecom returned too many tool pages.');
      }),
    );
    signal.throwIfAborted();
    const next = new Map<string, Source>();
    const tools: ListToolsResult['tools'] = [];
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      for (const tool of result.value.tools) {
        if (next.has(tool.name))
          throw new PluginError('request', 'Import each Wecom service only once.');
        next.set(tool.name, result.value.source);
        tools.push(tool);
      }
    }
    routes = next;
    return { tools };
  }
  return {
    serverInfo: { name: 'Cherry Studio Wecom', version: '1' },
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
        if (signal.aborted) throw new PluginError('cancelled', 'Wecom discovery cancelled.');
        if (error instanceof PluginError) throw error;
        throw new PluginError(
          'request',
          'Could not load Wecom tools. Check the imported configuration and permissions.',
        );
      }
    },
    async callTool(input) {
      const signal = operationSignal(input.options?.abortSignal);
      const effect = Object.hasOwn(WECOM_TOOL_POLICY, input.name)
        ? (WECOM_TOOL_POLICY as PluginToolPolicy)[input.name]
        : undefined;
      if (!effect || context.tools[input.name] !== effect)
        throw new PluginError('access', 'The Wecom tool is not admitted.');
      // The update endpoint also accepts status 2 (deletion), which this plugin does not expose.
      if (
        input.name === 'update_todo' &&
        Object.hasOwn(input.args, 'todo_status') &&
        input.args.todo_status !== 0 &&
        input.args.todo_status !== 1
      )
        throw new PluginError('request', 'Set todo_status to 0 (completed) or 1 (in progress).');
      const source = routes.get(input.name);
      if (!source)
        throw new PluginError('access', 'Refresh the Wecom tool list before using this tool.');
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
            'The Wecom write outcome is unknown. Check the service before retrying.',
          );
        if (signal.aborted) throw new PluginError('cancelled', 'Wecom request cancelled.');
        throw new PluginError('request', 'Wecom could not complete the request.');
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
    const onAbort = () => reject(new PluginError('cancelled', 'Wecom discovery cancelled.'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}
