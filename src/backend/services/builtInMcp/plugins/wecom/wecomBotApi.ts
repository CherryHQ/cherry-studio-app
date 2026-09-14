import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

// Protocol reference: WecomTeam/wecom-cli at 1cd90a5337ce11ffbcf14c5ad2e85e6ee97c8b08,
// auth/{qrcode,bootstrap}.rs, transport/{backend,envelope}.rs and wecom-transport/http/polling.rs.
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
export const WecomBotSchema = z.object({
  botId: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[^\x00-\x1f\x7f]+$/),
  secret,
});
export const WecomBotCredentialSchema = WecomBotSchema.extend({
  version: z.literal(2),
  token: secret,
});
export type WecomBot = z.infer<typeof WecomBotSchema>;
export type WecomBotCredential = z.infer<typeof WecomBotCredentialSchema>;

const ResponseSchema = z.looseObject({ errcode: z.number().optional() });
const GatewayResponseSchema = z.object({
  result: z.string().nullish(),
  error: z.object({ code: z.number().optional() }).nullish(),
  taskid: secret.nullish(),
  poll_mode: z.union([z.literal(0), z.literal(1)]).nullish(),
  long_task_poll: z
    .object({
      done: z.boolean().optional(),
      polling_interval_ms: z.number().int().nonnegative().optional(),
      task_timeout: z.number().int().nonnegative().optional(),
    })
    .nullish(),
});

export class WecomBotApiError extends PluginError {
  constructor(readonly code: number) {
    super(code === 853004 ? 'authorization' : 'access', 'Wecom rejected the request.');
  }
}

export function parseWecomResponse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new PluginError('request', 'Invalid Wecom response.');
  return parsed.data;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new PluginError('request', 'Invalid Wecom response.');
  }
}

async function request(
  client: typeof api,
  path: string,
  signal: AbortSignal,
  options: {
    body?: Record<string, unknown>;
    query?: Record<string, string>;
    token?: string;
    taskId?: string;
  } = {},
) {
  try {
    signal.throwIfAborted();
    const response = await client.request<unknown>({
      path,
      signal,
      redirect: 'error',
      maxResponseBytes: 2_097_152,
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        ...(options.taskId ? { 'X-Long-Poll-TaskId': options.taskId } : {}),
      },
      ...(options.body
        ? { method: 'POST', body: options.body }
        : { method: 'GET', query: options.query }),
    });
    signal.throwIfAborted();
    const data = parseWecomResponse(ResponseSchema, response.data);
    if (data.errcode) throw new WecomBotApiError(data.errcode);
    return data;
  } catch (error) {
    if (signal.aborted) throw new PluginError('cancelled', 'Wecom request cancelled.');
    if (error instanceof PluginError) throw error;
    if (isHttpError(error)) {
      if (error.status === 429) throw new PluginError('quota', 'Wecom request rate limited.');
      if (error.status === 401)
        throw new PluginError('authorization', 'Wecom authorization rejected.');
      if (error.status === 403) throw new PluginError('access', 'Wecom access denied.');
      if (error.status && error.status < 500)
        throw new PluginError('request', 'Wecom request rejected.');
    }
    // Do not forward upstream messages, URLs, response bodies or credentials to diagnostics.
    throw new PluginError('network', 'Could not reach Wecom.');
  }
}

async function gateway(
  path: string,
  payload: Record<string, unknown>,
  token: string,
  signal: AbortSignal,
  taskId?: string,
) {
  if (!/^\/cli\/[A-Za-z0-9/_-]+$/.test(path))
    throw new PluginError('request', 'Untrusted Wecom API path.');
  const response = await request(api, path, signal, {
    body: { payload: JSON.stringify(payload) },
    token,
    taskId,
  });
  const inner = parseWecomResponse(
    GatewayResponseSchema,
    parseJson(parseWecomResponse(z.string(), response.results_json)),
  );
  if (inner.error?.code) throw new WecomBotApiError(inner.error.code);
  return inner;
}

function waitForPoll(delay: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new PluginError('cancelled', 'Wecom request cancelled.'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, delay);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export const wecomBotApi = {
  async begin(signal: AbortSignal) {
    const startedAt = Date.now();
    const response = await request(authorization, '/ai/qc/generate', signal, {
      // The upstream CLI reserves 1/2/3 for desktop systems and uses 0 for other platforms.
      query: { source: 'wecom_cli_external', plat: '0' },
    });
    const data = parseWecomResponse(
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
    const data = parseWecomResponse(
      z.looseObject({ status: z.string().optional() }),
      response.data ?? {},
    );
    if (data.status !== 'success') return undefined;
    const bot = parseWecomResponse(z.object({ botid: secret, secret }), data.bot_info);
    return parseWecomResponse(WecomBotSchema, { botId: bot.botid, secret: bot.secret });
  },

  async exchange(
    bot: WecomBot,
    bindSource: 1 | 2,
    signal: AbortSignal,
  ): Promise<WecomBotCredential> {
    const time = Math.floor(Date.now() / 1000);
    const nonce = `cli_${Date.now()}_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
    const signature = await digestStringAsync(
      CryptoDigestAlgorithm.SHA256,
      `${bot.secret}${bot.botId}${time}${nonce}`,
    );
    const response = await request(api, '/cgi-bin/aibot/cli/get_cli_config', signal, {
      body: { bot_id: bot.botId, time, nonce, signature, bind_source: bindSource },
    });
    return { version: 2, ...bot, token: parseWecomResponse(secret, response.token) };
  },

  async invoke(path: string, payload: Record<string, unknown>, token: string, signal: AbortSignal) {
    let inner = await gateway(path, payload, token, signal);
    const taskId = inner.taskid;
    if (taskId && inner.long_task_poll?.done !== true) {
      const reuseEndpoint = inner.poll_mode === 1;
      const startedAt = Date.now();
      let expiresAt = startedAt + 120_000;
      try {
        for (let index = 0; ; index++) {
          inner = await gateway(
            reuseEndpoint ? path : '/cli/task/query',
            reuseEndpoint
              ? {}
              : { method: 'PollClawLongTask', payload: JSON.stringify({ taskid: taskId }) },
            token,
            signal,
            reuseEndpoint ? taskId : undefined,
          );
          const info = inner.long_task_poll;
          if (!info) throw new PluginError('request', 'Missing Wecom task status.');
          if (info.done) break;
          if (index === 0) expiresAt = startedAt + Math.min(info.task_timeout ?? 120, 120) * 1000;
          if (Date.now() >= expiresAt || index >= 240)
            throw new PluginError('request', 'Wecom task timed out.');
          await waitForPoll(
            Math.min(Math.max(info.polling_interval_ms ?? 500, 500), expiresAt - Date.now()),
            signal,
          );
        }
      } catch {
        // The original operation was accepted. A poll failure (even 853004) must never
        // reach the caller as an initial token rejection and cause the write to be replayed.
        throw new PluginError(
          'request',
          'Could not confirm the Wecom task result. Check Wecom before retrying.',
        );
      }
    }
    if (inner.result == null) throw new PluginError('request', 'Wecom returned no result.');
    return parseJson(inner.result);
  },
};
