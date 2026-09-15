import { loggerService } from '@logger';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

import {
  WecomBotSchema,
  WecomCredentialSchema,
  type WecomBot,
  type WecomCredential,
} from './wecomCredentials';

// Official CLI 1.2.1 at 1cd90a5337ce11ffbcf14c5ad2e85e6ee97c8b08:
// crates/wecom-cli/src/auth/{qrcode,bootstrap}.rs.
const logger = loggerService.withContext('WecomAuthorization');
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

function parseResponse<T>(schema: z.ZodType<T>, value: unknown, step: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    // Schema locations identify compatibility failures without logging upstream values or secrets.
    logger.warn('Invalid Wecom authorization response.', {
      step,
      issues: parsed.error.issues.map(({ code, path }) => ({ code, path })),
    });
    const locations = parsed.error.issues
      .slice(0, 3)
      .map(({ code, path }) => `${path.join('.') || 'response'} (${code})`)
      .join(', ');
    throw new PluginError(
      'request',
      `Invalid Wecom authorization response: ${step}; ${locations}.`,
    );
  }
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
    const data = parseResponse(
      z.looseObject({ errcode: z.number().optional() }),
      response.data,
      path,
    );
    if (data.errcode) {
      logger.warn('Wecom rejected authorization.', { step: path, errcode: data.errcode });
      throw new PluginError(
        'authorization',
        `Wecom rejected the authorization request (${data.errcode}).`,
      );
    }
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
      'authorization-link',
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
      'authorization-poll',
    );
    if (data.status !== 'success') return undefined;
    const bot = parseResponse(z.object({ botid: secret, secret }), data.bot_info, 'bot-identity');
    return parseResponse(
      WecomBotSchema,
      { botId: bot.botid, secret: bot.secret },
      'bot-credential',
    );
  },

  async exchange(bot: WecomBot, bindSource: 1 | 2, signal: AbortSignal): Promise<WecomCredential> {
    const time = Math.floor(Date.now() / 1000);
    const nonce = `cli_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const signature = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      `${bot.secret}${bot.botId}${time}${nonce}`,
    );
    const response = await request(api, '/cgi-bin/aibot/cli/get_cli_config', signal, {
      body: {
        bot_id: bot.botId,
        time,
        nonce,
        signature,
        bind_source: bindSource,
      },
    });
    return parseResponse(
      WecomCredentialSchema,
      {
        version: 1,
        ...bot,
        token: response.token,
      },
      'cli-credential',
    );
  },
};
