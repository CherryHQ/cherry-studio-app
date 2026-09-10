import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';
import type { PluginCredential, PluginCredentialField } from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

export const FEISHU_CREDENTIAL_FIELDS = [
  { id: 'appId', secret: false, maxLength: 128, pattern: '^cli_[a-zA-Z0-9]+$' },
  { id: 'appSecret', secret: true, maxLength: 4096, pattern: '^\\S+$' },
] as const satisfies readonly PluginCredentialField[];

const FeishuAppCredentialsSchema = createPluginCredentialsSchema(FEISHU_CREDENTIAL_FIELDS).extend({
  version: z.literal(1),
});

const feishuHttp = createHttpClient({
  baseUrl: 'https://open.feishu.cn',
  timeoutMs: 15_000,
});

const TokenResponseSchema = z.object({
  code: z.literal(0),
  tenant_access_token: z.string().min(1).max(4096),
  expire: z.number().int().positive(),
});

export function parseFeishuAppCredentials(credential: PluginCredential) {
  try {
    return FeishuAppCredentialsSchema.parse(credential);
  } catch {
    throw new PluginError('authorization', 'The Feishu application credentials are invalid.');
  }
}

/** One token cache per MCP client/grant. The caller still checks the durable grant per request. */
export function createFeishuTokenProvider() {
  let cached: { appId: string; appSecret: string; token: string; expiresAt: number } | undefined;

  return {
    invalidate() {
      cached = undefined;
    },
    async getToken(credential: PluginCredential, signal?: AbortSignal): Promise<string> {
      signal?.throwIfAborted();
      const { appId, appSecret } = parseFeishuAppCredentials(credential);
      if (
        cached?.appId === appId &&
        cached.appSecret === appSecret &&
        cached.expiresAt > Date.now()
      )
        return cached.token;
      // No refresh-token rotation or automatic replay: exchange again before the cached TAT expires.
      const requestedAt = Date.now();
      try {
        const response = await feishuHttp.request<unknown>({
          method: 'POST',
          path: '/open-apis/auth/v3/tenant_access_token/internal',
          body: { app_id: appId, app_secret: appSecret },
          redirect: 'error',
          maxResponseBytes: 16_384,
          signal,
        });
        signal?.throwIfAborted();
        const parsed = TokenResponseSchema.safeParse(response.data);
        if (!parsed.success) {
          throw new PluginError('authorization', 'Feishu rejected the application credentials.');
        }
        cached = {
          appId,
          appSecret,
          token: parsed.data.tenant_access_token,
          expiresAt: requestedAt + Math.max(0, parsed.data.expire * 1000 - 60_000),
        };
        return cached.token;
      } catch (error) {
        if (signal?.aborted) throw new PluginError('cancelled', 'Feishu authorization cancelled.');
        if (error instanceof PluginError) throw error;
        if (isHttpError(error)) {
          if (error.status === 401)
            throw new PluginError('authorization', 'Feishu rejected the application credentials.');
          if (error.status === 403)
            throw new PluginError('access', 'Feishu denied application access.');
          if (error.status === 429)
            throw new PluginError('quota', 'The Feishu authorization rate limit was reached.');
        }
        throw new PluginError('network', 'Could not obtain Feishu application authorization.');
      }
    },
  };
}
