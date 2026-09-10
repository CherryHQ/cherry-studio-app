import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClient, PluginClientContext } from '../../pluginDefinition';
import { createOfficialMcpClient } from '../../transport/createOfficialMcpClient';
import { callFeishuOpenApi } from './feishuOpenApi';
import { FEISHU_API_TOOLS, FEISHU_REMOTE_TOOL_POLICY } from './feishuTools';

/** One plugin client combines hosted document tools with the curated in-app business operations. */
export async function createFeishuClient(context: PluginClientContext): Promise<PluginClient> {
  const lifetime = new AbortController();
  const remote = await createOfficialMcpClient(
    {
      ...context,
      tools: FEISHU_REMOTE_TOOL_POLICY,
      signal: AbortSignal.any([context.signal, lifetime.signal]),
    },
    { url: 'https://mcp.feishu.cn/mcp' },
  );
  let closing: Promise<void> | undefined;

  function operationSignal(caller?: AbortSignal) {
    if (lifetime.signal.aborted) throw new PluginError('cancelled', 'Feishu client closed.');
    // The initialization deadline is not the lifetime of later calls.
    return caller ? AbortSignal.any([caller, lifetime.signal]) : lifetime.signal;
  }

  return {
    get serverInfo() {
      return remote.serverInfo;
    },
    async listTools(input) {
      const signal = operationSignal(input?.options?.signal);
      const page = await remote.listTools({ ...input, options: { ...input?.options, signal } });
      signal.throwIfAborted();
      return {
        ...page,
        tools: [
          ...page.tools.filter((tool) => Object.hasOwn(FEISHU_REMOTE_TOOL_POLICY, tool.name)),
          ...(!input?.params?.cursor
            ? [...FEISHU_API_TOOLS.values()].map((tool) => tool.definition)
            : []),
        ],
      };
    },
    async callTool(input) {
      const signal = operationSignal(input.options?.abortSignal);
      signal.throwIfAborted();
      if (!Object.hasOwn(context.tools, input.name))
        throw new PluginError('access', 'The Feishu tool is not admitted.');
      const local = FEISHU_API_TOOLS.get(input.name);
      if (local) return callFeishuOpenApi(context, local, input.args, signal);
      if (Object.hasOwn(FEISHU_REMOTE_TOOL_POLICY, input.name))
        return remote.callTool({ ...input, options: { abortSignal: signal } });
      throw new PluginError('access', 'The Feishu tool is not admitted.');
    },
    close() {
      if (!closing) {
        lifetime.abort();
        closing = remote.close();
      }
      return closing;
    },
  };
}
