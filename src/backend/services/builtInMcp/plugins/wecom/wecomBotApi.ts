import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

import {
  WecomBotSchema,
  WecomBotCredentialSchema,
  type WecomBot,
  type WecomBotCredential,
} from './wecomCredentials';

// Official MCP bootstrap: WecomTeam/wecom-cli at 9eb7898b959861af879495e211e37431fa908f19,
// src/auth/qrcode.rs, src/mcp/config.rs and src/constants.rs. Business calls use MCP directly.
const authorization = createHttpClient({
  baseUrl: 'https://work.weixin.qq.com',
  timeoutMs: 15_000,
});
const api = createHttpClient({ baseUrl: 'https://qyapi.weixin.qq.com', timeoutMs: 15_000 });
const secret = z
  .string()
  .min(1)
  .max(16_384)
  .regex(/^[^\r\n\0]+$/);

function parseResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PluginError('request', 'Invalid Wecom authorization response.');
  return parsed.data;
}

async function request(
  client: typeof api,
  path: string,
  signal: AbortSignal,
  options: { body?: Record<string, unknown>; query?: Record<string, string> },
) {
  try {
    signal.throwIfAborted();
    const response = await client.request<unknown>({
      path,
      signal,
      redirect: 'error',
      maxResponseBytes: 262_144,
      headers: { 'Content-Type': 'application/json' },
      ...(options.body
        ? { method: 'POST', body: options.body }
        : { method: 'GET', query: options.query }),
    });
    signal.throwIfAborted();
    const data = parseResponse(z.looseObject({ errcode: z.number().optional() }), response.data);
    if (data.errcode)
      throw new PluginError('authorization', 'Wecom rejected the authorization request.');
    return data;
  } catch (error) {
    if (signal.aborted) throw new PluginError('cancelled', 'Wecom authorization cancelled.');
    if (error instanceof PluginError) throw error;
    if (isHttpError(error)) {
      if (error.status === 429) throw new PluginError('quota', 'Wecom request rate limited.');
      if (error.status === 401)
        throw new PluginError('authorization', 'Wecom authorization rejected.');
      if (error.status === 403) throw new PluginError('access', 'Wecom access denied.');
      if (error.status && error.status < 500)
        throw new PluginError('request', 'Wecom request rejected.');
    }
    // Never forward upstream bodies, URLs, credentials or messages to diagnostics.
    throw new PluginError('network', 'Could not reach Wecom.');
  }
}

export const wecomBotApi = {
  async begin(signal: AbortSignal) {
    const startedAt = Date.now();
    const response = await request(authorization, '/ai/qc/generate', signal, {
      query: { source: 'wecom_cli_external', plat: '0' },
    });
    const data = parseResponse(
      z.object({ scode: secret, auth_url: z.string().url().max(8192) }),
      response.data,
    );
    const url = new URL(data.auth_url);
    if (
      url.origin !== 'https://work.weixin.qq.com' ||
      url.pathname !== '/ai/qc/c' ||
      !url.searchParams.get('s') ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new PluginError('request', 'Untrusted Wecom confirmation URL.');
    return {
      sessionCode: data.scode,
      verificationUrl: url.href,
      expiresAt: startedAt + 300_000,
      nextPollAt: Date.now() + 3000,
    };
  },

  async poll(sessionCode: string, signal: AbortSignal): Promise<WecomBot | undefined> {
    const response = await request(authorization, '/ai/qc/query_result', signal, {
      query: { scode: sessionCode },
    });
    const data = parseResponse(
      z.looseObject({ status: z.string().optional() }),
      response.data ?? {},
    );
    if (data.status !== 'success') return undefined;
    const bot = parseResponse(z.object({ botid: secret, secret }), data.bot_info);
    return parseResponse(WecomBotSchema, { botId: bot.botid, secret: bot.secret });
  },

  async exchange(
    bot: WecomBot,
    bindSource: 1 | 2,
    signal: AbortSignal,
  ): Promise<WecomBotCredential> {
    const time = Math.floor(Date.now() / 1000);
    const nonce = `mcp_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const signature = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      `${bot.secret}${bot.botId}${time}${nonce}`,
    );
    const response = await request(api, '/cgi-bin/aibot/cli/get_mcp_config', signal, {
      body: {
        bot_id: bot.botId,
        time,
        nonce,
        signature,
        bind_source: bindSource,
        cli_version: 'CherryStudio/WeComMcp',
      },
    });
    const { list } = parseResponse(
      z.object({
        list: z
          .array(
            z.object({
              biz_type: z.string().nullish(),
              url: z.string().nullish(),
              type: z.string().nullish(),
              is_authed: z.boolean().nullish(),
            }),
          )
          .max(32),
      }),
      response,
    );
    const connections = list
      .filter(
        (item) =>
          item.url &&
          item.is_authed !== false &&
          (!item.type || item.type === 'streamable-http' || item.type === 'http'),
      )
      .map((item) => ({ category: item.biz_type, url: item.url }));
    if (!connections.length)
      throw new PluginError('access', 'Authorize at least one Wecom capability before connecting.');
    return parseResponse(WecomBotCredentialSchema, {
      version: 3,
      kind: 'bot',
      ...bot,
      configId: randomUUID(),
      connections,
    });
  },
};
