import * as z from 'zod';

import { createHttpClient, isHttpError } from '@/backend/services/http';
import { PluginError } from '@/shared/contracts/plugins';

import type { PluginClientContext } from '../../pluginDefinition';
import { readWecomCredential } from './wecomCredentials';
import { isWecomApiUrl, type WecomEndpoint } from './wecomSchema';

const api = createHttpClient({ baseUrl: 'https://qyapi.weixin.qq.com', timeoutMs: 30_000 });
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const responseSchema = z.object({
  result: z.string().nullish(),
  error: z.object({ code: z.number().int() }).nullish(),
  taskid: z
    .string()
    .min(1)
    .max(4096)
    .regex(/^[^\x00-\x1f\x7f]+$/)
    .nullish(),
  poll_mode: z.union([z.literal(0), z.literal(1)]).nullish(),
  long_task_poll: z
    .object({
      done: z.boolean().optional(),
      task_timeout: z.number().nonnegative().optional(),
      polling_interval_ms: z.number().nonnegative().optional(),
    })
    .nullish(),
});
const envelopeSchema = z.object({
  errcode: z.number().int().optional(),
  results_json: z.string().optional(),
});

type WecomResponse = z.infer<typeof responseSchema>;
type WecomApiResult =
  | { kind: 'json'; value: WecomResponse }
  | {
      kind: 'file';
      bytes: Uint8Array;
      contentType: string;
      filename?: string;
      partial?: boolean;
      rangeStart?: number;
      total?: number;
    };
export type WecomApiRequest = {
  endpoint: WecomEndpoint;
  payload: Record<string, unknown>;
  signal: AbortSignal;
  effect: 'read' | 'write';
  form?: () => FormData;
  headers?: Record<string, string>;
  maxResponseBytes?: number;
};

function invalidResponse(): PluginError {
  return new PluginError('request', 'Wecom returned an invalid response.');
}

export function unknownWecomWrite(): PluginError {
  return new PluginError(
    'unknown-write',
    'The Wecom write outcome is unknown. Check Wecom before retrying.',
  );
}

export function readWecomResult(response: WecomApiResult): unknown {
  if (response.kind !== 'json') throw invalidResponse();
  const text = response.value.result;
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw invalidResponse();
  }
}

/** No secrets in URLs/errors. Only an explicitly rejected read can be replayed after renewal. */
export function createWecomApi(context: PluginClientContext, botId: string) {
  async function request(input: WecomApiRequest): Promise<WecomApiResult> {
    const { signal, endpoint, effect } = input;
    const url = new URL(endpoint.path, 'https://qyapi.weixin.qq.com');
    if (!isWecomApiUrl(url)) throw new PluginError('access', 'Untrusted Wecom service endpoint.');
    const payload = JSON.stringify(input.payload);
    if (new TextEncoder().encode(payload).byteLength > MAX_REQUEST_BYTES)
      throw new PluginError(
        'request',
        'Wecom request is too large. Use smaller values or upload a file.',
      );

    for (let attempt = 0; ; attempt++) {
      let submitted = false;
      let decoded = false;
      try {
        signal.throwIfAborted();
        const credential = readWecomCredential(await context.getCredential(signal));
        if (credential.botId !== botId)
          throw new PluginError('authorization', 'Wecom identity changed.');
        await context.assertAuthorized();
        signal.throwIfAborted();
        const headers = new Headers(input.headers);
        await context.authorization.apply(credential, { url, headers, signal });
        const body = input.form?.() ?? { payload };
        if (!input.form) headers.set('Content-Type', 'application/json');
        signal.throwIfAborted();
        submitted = true;
        const response = await api.request<ArrayBuffer>({
          path: endpoint.path,
          // The CLI gateway always POSTs, including operations described as GET in discovery.
          method: 'POST',
          body,
          headers: Object.fromEntries(headers),
          signal,
          redirect: 'error',
          responseType: 'arraybuffer',
          maxResponseBytes: input.maxResponseBytes ?? MAX_RESPONSE_BYTES,
        });
        signal.throwIfAborted();
        const bytes = new Uint8Array(response.data);
        const contentType =
          response.headers['content-type']?.split(';')[0].trim().toLowerCase() ?? '';
        // A JSON gateway error must never be mistaken for a downloaded file.
        if (contentType && contentType !== 'application/json' && !contentType.endsWith('+json')) {
          const disposition = response.headers['content-disposition'] ?? '';
          const range = response.headers['content-range']?.match(/^bytes (\d+)-(\d+)\/(\d+|\*)$/);
          if (range && Number(range[2]) - Number(range[1]) + 1 !== bytes.byteLength)
            throw invalidResponse();
          decoded = true;
          return {
            kind: 'file',
            bytes,
            contentType,
            filename: disposition.match(/filename="([^"]+)"/i)?.[1],
            partial: response.status === 206 || !!range,
            rangeStart: range ? Number(range[1]) : undefined,
            total: range && range[3] !== '*' ? Number(range[3]) : undefined,
          };
        }
        const envelope = envelopeSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
        if (envelope.errcode) {
          decoded = true;
          if (envelope.errcode === 853004) {
            // Official token rejection is definite. Uncertain network/HTTP writes are never retried.
            await context.rejectCredential?.(credential);
            signal.throwIfAborted();
            if (effect === 'read' && attempt === 0 && context.rejectCredential) continue;
            throw new PluginError(
              'authorization',
              'Wecom authorization refreshed. Retry the operation explicitly.',
            );
          }
          throw new PluginError(
            'request',
            `Wecom rejected the request (code ${envelope.errcode}). Check authorization and arguments.`,
          );
        }
        if (!envelope.results_json) throw invalidResponse();
        const value = responseSchema.parse(JSON.parse(envelope.results_json));
        decoded = true;
        if (value.error?.code)
          throw new PluginError(
            'request',
            `Wecom rejected the operation (code ${value.error.code}). Check authorization and arguments.`,
          );
        return { kind: 'json', value };
      } catch (error) {
        if (signal.aborted)
          throw effect === 'write' && submitted && !decoded
            ? unknownWecomWrite()
            : new PluginError('cancelled', 'Wecom request cancelled.');
        if (isHttpError(error)) {
          if (
            error.status === 416 &&
            input.headers?.Range &&
            !input.headers.Range.startsWith('bytes=0-')
          )
            return {
              kind: 'file',
              bytes: new Uint8Array(),
              contentType: 'application/octet-stream',
            };
          if (error.status === 401)
            throw new PluginError('authorization', 'Reconnect Wecom to renew authorization.');
          if (error.status === 403)
            throw new PluginError('access', 'Wecom denied access to this resource.');
          if (error.status === 429) throw new PluginError('quota', 'Wecom request limit reached.');
          if (error.status && error.status < 500 && error.status !== 408)
            throw new PluginError('request', 'Wecom rejected the request.');
        }
        if (effect === 'write' && submitted && !decoded) throw unknownWecomWrite();
        if (error instanceof PluginError) throw error;
        if (isHttpError(error)) throw new PluginError('network', 'Could not reach Wecom.');
        throw invalidResponse();
      }
    }
  }

  async function call(input: WecomApiRequest): Promise<WecomApiResult> {
    const rangeSize = input.form ? undefined : input.endpoint.rangeSize;
    const chunkSize = Math.min(rangeSize ?? 0, 8 * 1024 * 1024);
    let response = await request(
      chunkSize
        ? { ...input, headers: { ...input.headers, Range: `bytes=0-${chunkSize - 1}` } }
        : input,
    );
    try {
      if (response.kind === 'file' && response.partial) {
        if (!chunkSize) throw invalidResponse();
        const first = response;
        let length = first.bytes.byteLength;
        const chunks = [first.bytes];
        if (first.rangeStart !== undefined && first.rangeStart !== 0) throw invalidResponse();
        if ((first.total ?? 0) > MAX_RESPONSE_BYTES)
          throw new PluginError('request', 'Wecom download exceeds 64 MiB.');
        for (let index = 1; first.total === undefined || length < first.total; index++) {
          if (index >= 4096 || length >= MAX_RESPONSE_BYTES)
            throw new PluginError('request', 'Wecom download exceeds its size limit.');
          const chunk = await request({
            ...input,
            headers: { ...input.headers, Range: `bytes=${length}-${length + chunkSize - 1}` },
          });
          if (chunk.kind !== 'file') throw invalidResponse();
          if (!chunk.bytes.byteLength) {
            if (first.total !== undefined && length < first.total) throw invalidResponse();
            break;
          }
          if (!chunk.partial || (chunk.rangeStart !== undefined && chunk.rangeStart !== length))
            throw invalidResponse();
          length += chunk.bytes.byteLength;
          if (length > MAX_RESPONSE_BYTES || (first.total !== undefined && length > first.total))
            throw invalidResponse();
          chunks.push(chunk.bytes);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return { ...first, bytes, partial: false };
      }
      if (
        response.kind !== 'json' ||
        !response.value.taskid ||
        response.value.long_task_poll?.done === true
      )
        return response;
      const taskid = response.value.taskid;
      const mode = response.value.poll_mode ?? 0;
      const started = Date.now();
      let timeout = Math.min(response.value.long_task_poll?.task_timeout ?? 120, 600) * 1000;
      do {
        const interval = Math.min(
          Math.max(response.value.long_task_poll?.polling_interval_ms ?? 500, 500),
          30_000,
        );
        await waitWecomPoll(interval, input.signal);
        if (Date.now() - started >= timeout)
          throw new PluginError('network', 'Wecom task polling timed out.');
        response = await request({
          endpoint: mode === 1 ? input.endpoint : { path: '/cli/task/query' },
          payload:
            mode === 1 ? {} : { method: 'PollClawLongTask', payload: JSON.stringify({ taskid }) },
          headers: mode === 1 ? { 'X-Long-Poll-TaskId': taskid } : undefined,
          signal: input.signal,
          effect: 'read',
        });
        if (response.kind !== 'json' || !response.value.long_task_poll) throw invalidResponse();
        if (response.value.long_task_poll.task_timeout !== undefined)
          timeout = Math.min(response.value.long_task_poll.task_timeout, 600) * 1000;
      } while (!response.value.long_task_poll.done);
      return response;
    } catch (error) {
      if (input.effect === 'write') throw unknownWecomWrite();
      throw error;
    }
  }
  return { call };
}

function waitWecomPoll(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(new PluginError('cancelled', 'Wecom request cancelled.'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
