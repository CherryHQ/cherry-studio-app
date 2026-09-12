import { PluginError } from '@/shared/contracts/plugins';

import type { PluginCredential } from '../../authorization/pluginCredential';
import type { PluginClient, PluginClientContext } from '../../pluginDefinition';
import { slackRequest } from './slackApi';
import { SlackUserCredentialSchema } from './slackCredentials';
import { SLACK_TOOLS } from './slackTools';

export async function createSlackClient(context: PluginClientContext): Promise<PluginClient> {
  context.signal.throwIfAborted();
  const lifetime = new AbortController();
  const operationSignal = (caller?: AbortSignal) =>
    caller ? AbortSignal.any([caller, lifetime.signal]) : lifetime.signal;
  async function credential(signal: AbortSignal) {
    signal.throwIfAborted();
    const saved = await context.getCredential(signal);
    const parsed = SlackUserCredentialSchema.safeParse(saved);
    if (!parsed.success || parsed.data.rejected)
      throw new PluginError('authorization', 'Reconnect Slack with read-only user permissions.');
    await context.assertAuthorized();
    signal.throwIfAborted();
    return { saved, value: parsed.data };
  }
  return {
    serverInfo: { name: 'Cherry Studio Slack', version: '1' },
    async listTools(input) {
      await credential(operationSignal(input?.options?.signal));
      return {
        tools: [...SLACK_TOOLS.values()]
          .filter((tool) => context.tools[tool.definition.name] === 'read')
          .map((tool) => tool.definition),
      };
    },
    async callTool(input) {
      const signal = operationSignal(input.options?.abortSignal);
      let sent: PluginCredential | undefined;
      try {
        const tool = SLACK_TOOLS.get(input.name);
        if (
          !tool ||
          !Object.hasOwn(context.tools, input.name) ||
          context.tools[input.name] !== 'read'
        )
          throw new PluginError('access', 'The Slack tool is not admitted.');
        const request = tool.request(input.args);
        const authorized = await credential(signal);
        sent = authorized.saved;
        const result = await slackRequest(
          request.method,
          request.fields,
          signal,
          authorized.value.tokens.accessToken,
        );
        signal.throwIfAborted();
        const text = JSON.stringify(result);
        if (new TextEncoder().encode(text).byteLength > 100 * 1024)
          throw new PluginError(
            'request',
            'Slack result is too large. Narrow the query or reduce the page size.',
          );
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        if (signal.aborted) throw new PluginError('cancelled', 'Slack request cancelled.');
        if (error instanceof PluginError) {
          if (error.reason === 'authorization' && sent)
            await context.rejectCredential?.(sent).catch(() => undefined);
          throw error;
        }
        throw new PluginError('request', 'Could not process the Slack result.');
      }
    },
    async close() {
      lifetime.abort();
    },
  };
}
