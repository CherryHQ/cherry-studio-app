import type { ListToolsResult } from '@ai-sdk/mcp';

import { PluginError } from '@/shared/contracts/plugins';

import type { PluginCredential } from '../../authorization/pluginCredential';
import type { PluginClient, PluginClientContext, PluginToolPolicy } from '../../pluginDefinition';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import { DingtalkUserCredentialSchema } from './dingtalkCredentials';
import {
  readDingtalkPermission,
  readDingtalkResponsePermission,
  type DingtalkPermission,
} from './dingtalkPermission';
import { DINGTALK_TOOL_POLICY, DINGTALK_SERVICES } from './dingtalkTools';

type Source = {
  id: string;
  url: string;
  tools: PluginToolPolicy;
  client?: PluginClient;
  connecting?: Promise<PluginClient>;
};

/** Owns official cloud sessions and one atomic, reviewed tool-routing snapshot. */
export async function createDingtalkClient(context: PluginClientContext): Promise<PluginClient> {
  context.signal.throwIfAborted();
  const credential = await context.getCredential(context.signal);
  const initial = DingtalkUserCredentialSchema.safeParse(credential);
  if (!initial.success)
    throw new PluginError('authorization', 'Connect with your Dingtalk account first.');
  const user = initial.data;
  context.signal.throwIfAborted();
  const lifetime = new AbortController();
  const sources: Source[] = Object.entries(DINGTALK_SERVICES).map(([id, service]) => ({
    id,
    url: `https://mcp-gw.dingtalk.com${service.path}`,
    tools: Object.fromEntries(
      Object.entries(service.tools).filter(([name, effect]) => context.tools[name] === effect),
    ),
  }));
  let warnings: string[] = [];
  let routes = new Map<string, Source>();
  let discovering: Promise<ListToolsResult> | undefined;
  let closing: Promise<void> | undefined;
  const operationSignal = (caller?: AbortSignal) =>
    caller ? AbortSignal.any([caller, lifetime.signal]) : lifetime.signal;
  async function requirePermission(permission: DingtalkPermission) {
    await context.requestAuthorization?.(JSON.parse(JSON.stringify(permission)));
    throw new PluginError(
      permission.code.startsWith('DWS_') ? 'authorization' : 'access',
      permission.code === 'PAT_ORG_POLICY_DENIED'
        ? 'Dingtalk organization policy denies this action. Contact your administrator.'
        : 'Dingtalk requires additional authorization. Open the plugin connection to continue, then explicitly retry the operation.',
    );
  }
  function assertAccount(value: PluginCredential) {
    const current = DingtalkUserCredentialSchema.safeParse(value);
    if (
      !current.success ||
      current.data.rejected ||
      current.data.clientId !== user.clientId ||
      current.data.account.corpId !== user.account.corpId ||
      current.data.account.userId !== user.account.userId
    )
      throw new PluginError('authorization', 'The Dingtalk account changed.');
  }
  async function getClient(source: Source, signal: AbortSignal): Promise<PluginClient> {
    signal.throwIfAborted();
    assertAccount(await context.getCredential(signal));
    await context.assertAuthorized();
    signal.throwIfAborted();
    if (source.client) return source.client;
    source.connecting ??= createOfficialMcpClient(
      {
        ...context,
        signal,
        tools: source.tools,
        authorization: {
          async apply(credential, { url, headers, signal: requestSignal }) {
            if (url.href !== source.url)
              throw new PluginError('request', 'The Dingtalk request target changed.');
            assertAccount(credential);
            requestSignal?.throwIfAborted();
            await context.authorization.apply(credential, { url, headers, signal: requestSignal });
          },
        },
      },
      {
        url: source.url,
        async inspectResponse(response, signal) {
          const permission = await readDingtalkResponsePermission(response, signal);
          if (permission) await requirePermission(permission);
        },
      },
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
    const discoverSource = async (source: Source) => {
      // Bound each service independently so an unavailable service cannot discard useful tools.
      const serviceSignal = AbortSignal.any([signal, AbortSignal.timeout(3000)]);
      const client = await getClient(source, serviceSignal);
      const allowed = source.tools;
      const tools: ListToolsResult['tools'] = [];
      const cursors = new Set<string>();
      const names = new Set<string>();
      let cursor: string | undefined;
      for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
        const page = await client.listTools({
          options: { signal: serviceSignal },
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
              'This Dingtalk service has no supported authorized tools.',
            );
          return { source, tools };
        }
        if (cursors.has(page.nextCursor))
          throw new PluginError('request', 'Dingtalk repeated a tool page.');
        cursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      throw new PluginError('request', 'Dingtalk returned too many tool pages.');
    };
    const results: PromiseSettledResult<Awaited<ReturnType<typeof discoverSource>>>[] = [];
    // Four sessions at a time avoids opening the whole service catalog at once on mobile.
    for (let index = 0; index < sources.length; index += 4) {
      results.push(
        ...(await Promise.allSettled(sources.slice(index, index + 4).map(discoverSource))),
      );
      signal.throwIfAborted();
    }
    signal.throwIfAborted();
    const next = new Map<string, Source>();
    const tools: ListToolsResult['tools'] = [];
    const failures: string[] = [];
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        if (result.reason instanceof PluginError && result.reason.reason === 'authorization')
          throw result.reason;
        const service = sources[index]!.id;
        failures.push(
          `Dingtalk ${service} tools are currently unavailable. Check organization access and reconnect to discover them again.`,
        );
        continue;
      }
      for (const tool of result.value.tools) {
        if (next.has(tool.name))
          throw new PluginError('request', 'Dingtalk returned a conflicting tool name.');
        next.set(tool.name, result.value.source);
        tools.push(tool);
      }
    }
    if (!tools.length)
      throw new PluginError('access', 'No supported Dingtalk services are authorized.');
    routes = next;
    warnings = failures;
    return { tools };
  }
  return {
    serverInfo: { name: 'Cherry Studio Dingtalk', version: '1' },
    get discoveryWarnings() {
      return warnings;
    },
    async listTools(input) {
      const signal = operationSignal(input?.options?.signal);
      signal.throwIfAborted();
      // Shared discovery owns its deadline; cancellation of one observer cannot cancel another.
      discovering ??= discover(operationSignal(AbortSignal.timeout(14_000))).finally(() => {
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
          'Could not load Dingtalk tools. Check your connection and organization permissions.',
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
        const result = await client.callTool({ ...input, options: { abortSignal: signal } });
        const permission = readDingtalkPermission(result);
        if (permission) await requirePermission(permission);
        return result;
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
