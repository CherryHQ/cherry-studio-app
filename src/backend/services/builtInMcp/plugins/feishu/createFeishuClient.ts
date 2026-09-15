import type { ListToolsResult } from '@ai-sdk/mcp';

import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClient, PluginClientContext } from '../../pluginDefinition';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import { FeishuUserCredentialSchema } from './feishuCredentials';
import { callFeishuOpenApi } from './feishuOpenApi';
import { FEISHU_API_TOOLS, FEISHU_REMOTE_TOOL_POLICY, getFeishuToolPolicy } from './feishuTools';

// Leave room in the shared discovery deadline for credential resolution and local tools.
const REMOTE_DISCOVERY_TIMEOUT_MS = 5_000;

/** One grant-aware catalog; hosted document discovery cannot remove local business tools. */
export async function createFeishuClient(context: PluginClientContext): Promise<PluginClient> {
  context.signal.throwIfAborted();
  const lifetime = new AbortController();
  let remote: PluginClient | undefined;
  let connecting: Promise<PluginClient> | undefined;
  let closing: Promise<void> | undefined;
  let discoveryWarnings: string[] = [];

  function operationSignal(caller?: AbortSignal) {
    if (lifetime.signal.aborted) throw new PluginError('cancelled', 'Feishu client closed.');
    // The initialization deadline is not the lifetime of later calls.
    return caller ? AbortSignal.any([caller, lifetime.signal]) : lifetime.signal;
  }

  async function grantedTools(signal: AbortSignal) {
    const value = await context.getCredential(signal).catch((error: unknown) => {
      if (error instanceof PluginError) throw error;
      throw new PluginError('authorization', 'Feishu authorization is no longer available.');
    });
    const credential = FeishuUserCredentialSchema.safeParse(value);
    if (!credential.success)
      throw new PluginError('authorization', 'Reconnect Feishu to authorize its tools.');
    await context.assertAuthorized().catch(() => {
      throw new PluginError('authorization', 'Feishu authorization is no longer available.');
    });
    signal.throwIfAborted();
    return Object.fromEntries(
      Object.entries(getFeishuToolPolicy(credential.data.tokens.scope)).filter(([name]) =>
        Object.hasOwn(context.tools, name),
      ),
    );
  }

  function getRemote(signal: AbortSignal): Promise<PluginClient> {
    if (remote) return Promise.resolve(remote);
    connecting ??= createOfficialMcpClient(
      { ...context, tools: FEISHU_REMOTE_TOOL_POLICY, signal },
      { url: 'https://mcp.feishu.cn/mcp' },
    )
      .then(async (client) => {
        if (signal.aborted || lifetime.signal.aborted) {
          await client.close();
          throw new PluginError('cancelled', 'Feishu document connection cancelled.');
        }
        remote = client;
        return client;
      })
      .finally(() => {
        connecting = undefined;
      });
    return connecting;
  }

  return {
    get serverInfo() {
      return remote?.serverInfo ?? { name: 'Cherry Studio Feishu', version: '1' };
    },
    get discoveryWarnings() {
      return discoveryWarnings;
    },
    async listTools(input) {
      const signal = operationSignal(input?.options?.signal);
      signal.throwIfAborted();
      discoveryWarnings = [];
      const allowed = await grantedTools(signal);
      if (Object.keys(allowed).length === 0)
        throw new PluginError('access', 'Feishu has no permitted tools. Update its authorization.');
      const localTools = [...FEISHU_API_TOOLS.values()]
        .filter((tool) => Object.hasOwn(allowed, tool.definition.name))
        .map((tool) => tool.definition);
      if (!Object.keys(allowed).some((name) => Object.hasOwn(FEISHU_REMOTE_TOOL_POLICY, name)))
        return { tools: localTools };

      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(), REMOTE_DISCOVERY_TIMEOUT_MS);
      const remoteSignal = AbortSignal.any([signal, deadline.signal]);
      try {
        const client = await getRemote(remoteSignal);
        const tools: ListToolsResult['tools'] = [];
        const names = new Set<string>();
        const cursors = new Set<string>();
        let cursor: string | undefined;
        // Collect hosted pages within their own deadline, then publish one complete local page.
        while (true) {
          const page = await client.listTools({
            options: { signal: remoteSignal },
            ...(cursor ? { params: { cursor } } : {}),
          });
          remoteSignal.throwIfAborted();
          for (const tool of page.tools) {
            if (
              !Object.hasOwn(allowed, tool.name) ||
              !Object.hasOwn(FEISHU_REMOTE_TOOL_POLICY, tool.name)
            )
              continue;
            if (names.has(tool.name))
              throw new PluginError('request', 'Feishu returned duplicate document tools.');
            names.add(tool.name);
            tools.push(tool);
          }
          if (!page.nextCursor) break;
          if (cursors.has(page.nextCursor))
            throw new PluginError('request', 'Feishu repeated a document tool page.');
          cursors.add(page.nextCursor);
          cursor = page.nextCursor;
        }
        if (tools.length === 0)
          throw new PluginError('unavailable', 'Feishu returned no authorized document tools.');
        return { tools: [...tools, ...localTools] };
      } catch (error) {
        signal.throwIfAborted();
        const failed = remote;
        remote = undefined;
        // Closing a failed hosted transport must not hold up the independent local catalog.
        void failed?.close().catch(() => undefined);
        if (localTools.length === 0) throw error;
        const reason = deadline.signal.aborted
          ? 'timeout'
          : error instanceof PluginError
            ? error.reason
            : 'unavailable';
        discoveryWarnings = [
          `Feishu document tools and people lookup could not be loaded (${reason}).`,
        ];
        return { tools: localTools };
      } finally {
        clearTimeout(timer);
      }
    },
    async callTool(input) {
      const signal = operationSignal(input.options?.abortSignal);
      signal.throwIfAborted();
      if (!Object.hasOwn(context.tools, input.name))
        throw new PluginError('access', 'The Feishu tool is not admitted.');
      const local = FEISHU_API_TOOLS.get(input.name);
      if (local) return callFeishuOpenApi(context, local, input.args, signal);
      if (Object.hasOwn(FEISHU_REMOTE_TOOL_POLICY, input.name)) {
        const allowed = await grantedTools(signal);
        if (!Object.hasOwn(allowed, input.name))
          throw new PluginError('access', 'Update Feishu authorization to use this tool.');
        const client = await getRemote(signal);
        return client.callTool({ ...input, options: { abortSignal: signal } });
      }
      throw new PluginError('access', 'The Feishu tool is not admitted.');
    },
    close() {
      if (!closing) {
        lifetime.abort();
        closing = (async () => {
          await connecting?.catch(() => undefined);
          await remote?.close();
          remote = undefined;
        })();
      }
      return closing;
    },
  };
}
