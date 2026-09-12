import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

import type { PluginCredential } from '../../authorization/pluginCredential';
import type { PluginClient, PluginClientContext } from '../../pluginDefinition';
import { GmailUserCredentialSchema } from './gmailCredentials';
import { GMAIL_TOOLS } from './gmailTools';

const api = createHttpClient({ baseUrl: 'https://gmail.googleapis.com', timeoutMs: 30_000 });

export async function createGmailClient(context: PluginClientContext): Promise<PluginClient> {
  context.signal.throwIfAborted();
  const lifetime = new AbortController();
  function operationSignal(caller?: AbortSignal) {
    return caller ? AbortSignal.any([lifetime.signal, caller]) : lifetime.signal;
  }
  async function credential(signal: AbortSignal) {
    signal.throwIfAborted();
    const saved = await context.getCredential(signal);
    const parsed = GmailUserCredentialSchema.safeParse(saved);
    if (!parsed.success || parsed.data.rejected)
      throw new PluginError('authorization', 'Reconnect Gmail to authorize read-only access.');
    await context.assertAuthorized();
    signal.throwIfAborted();
    return { saved, value: parsed.data };
  }
  return {
    serverInfo: { name: 'Cherry Studio Gmail', version: '1' },
    async listTools(input) {
      await credential(operationSignal(input?.options?.signal));
      return {
        tools: [...GMAIL_TOOLS.values()]
          .filter((tool) => context.tools[tool.definition.name] === 'read')
          .map((tool) => tool.definition),
      };
    },
    async callTool(input) {
      const signal = operationSignal(input.options?.abortSignal);
      let sent: PluginCredential | undefined;
      try {
        signal.throwIfAborted();
        const tool = GMAIL_TOOLS.get(input.name);
        if (
          !tool ||
          !Object.hasOwn(context.tools, input.name) ||
          context.tools[input.name] !== 'read'
        )
          throw new PluginError('access', 'The Gmail tool is not admitted.');
        const request = tool.request(input.args);
        const authorized = await credential(signal);
        sent = authorized.saved;
        const response = await api.request<unknown>({
          ...request,
          method: 'GET',
          signal,
          redirect: 'error',
          maxResponseBytes: 4_000_000,
          headers: { Authorization: `Bearer ${authorized.value.tokens.accessToken}` },
        });
        signal.throwIfAborted();
        const text = JSON.stringify(tool.project(response.data));
        if (new TextEncoder().encode(text).byteLength > 100 * 1024)
          throw new PluginError(
            'request',
            'Gmail result is too large. Narrow the search or read individual messages.',
          );
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        if (signal.aborted) throw new PluginError('cancelled', 'Gmail request cancelled.');
        if (error instanceof PluginError) throw error;
        if (isHttpError(error)) {
          if (error.status === 401) {
            if (sent) await context.rejectCredential?.(sent).catch(() => undefined);
            throw new PluginError(
              'authorization',
              'Google rejected the Gmail credential. Reconnect your account.',
            );
          }
          if (error.status === 403)
            throw new PluginError(
              'access',
              'Google denied Gmail access. Check API enablement, permissions and organization policy.',
            );
          if (error.status === 429) throw new PluginError('quota', 'Gmail request limit reached.');
          if (error.kind === 'invalid_response' || (error.status && error.status < 500))
            throw new PluginError(
              'request',
              'Gmail rejected the request or returned too much data. Narrow the search.',
            );
        }
        throw new PluginError('network', 'Could not reach Gmail.');
      }
    },
    async close() {
      lifetime.abort();
    },
  };
}
