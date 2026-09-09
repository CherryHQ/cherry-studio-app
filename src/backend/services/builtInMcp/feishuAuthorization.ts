import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';
import type { PluginCredentialField } from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

export const FEISHU_CREDENTIAL_FIELDS = [
  {
    id: 'appId',
    label: {
      default: 'App ID',
      'zh-cn': '应用 ID（App ID）',
    },
    error: {
      default: 'Enter the complete application ID starting with cli_',
      'zh-cn': '请输入以 cli_ 开头的完整应用 ID',
    },
    secret: false,
    maxLength: 128,
    pattern: '^cli_[a-zA-Z0-9]+$',
  },
  {
    id: 'appSecret',
    label: {
      default: 'App Secret',
      'zh-cn': '应用密钥（App Secret）',
    },
    error: {
      default: 'Enter a complete credential without spaces or line breaks',
      'zh-cn': '请输入完整的密钥，不要包含空格或换行',
    },
    secret: true,
    maxLength: 4096,
    pattern: '^\\S+$',
  },
] as const satisfies readonly PluginCredentialField[];

const FeishuAppCredentialsSchema = createPluginCredentialsSchema(FEISHU_CREDENTIAL_FIELDS);

const feishuHttp = createHttpClient({
  baseUrl: 'https://open.feishu.cn',
  timeoutMs: 15_000,
});

const TokenResponseSchema = z.object({
  code: z.literal(0),
  tenant_access_token: z.string().min(1).max(4096),
  expire: z.number().int().positive(),
});

export function parseFeishuAppCredentials(credential: string) {
  try {
    return FeishuAppCredentialsSchema.parse(JSON.parse(credential));
  } catch {
    throw new PluginError('authorization', 'The Feishu application credentials are invalid.');
  }
}

/** One token cache per MCP client/grant. The caller still checks the durable grant per request. */
export function createFeishuTokenProvider() {
  let cached: { credential: string; token: string; expiresAt: number } | undefined;

  return {
    invalidate() {
      cached = undefined;
    },
    async getToken(credential: string, signal?: AbortSignal): Promise<string> {
      signal?.throwIfAborted();
      if (cached?.credential === credential && cached.expiresAt > Date.now()) return cached.token;
      const { appId, appSecret } = parseFeishuAppCredentials(credential);
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
          credential,
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
