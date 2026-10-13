import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { Api, AssistantMessage, AssistantMessageEvent, Model } from '@earendil-works/pi-ai';
import {
  stream as streamAnthropic,
  streamSimple as streamSimpleAnthropic,
} from '@earendil-works/pi-ai/api/anthropic-messages';
import { stream as streamAzure } from '@earendil-works/pi-ai/api/azure-openai-responses';
import {
  stream as streamCodex,
  streamSimple as streamSimpleCodex,
} from '@earendil-works/pi-ai/api/openai-codex-responses';
import {
  stream as streamCompletions,
  streamSimple as streamSimpleCompletions,
} from '@earendil-works/pi-ai/api/openai-completions';
import {
  stream as streamResponses,
  streamSimple as streamSimpleResponses,
} from '@earendil-works/pi-ai/api/openai-responses';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { isRetryableAssistantError } from '@earendil-works/pi-ai/utils/retry';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import { bindPiStream, resolvePiApiAdapter } from '../piApiAdapters';
import { withPiApiKeyFallback } from '../piApiKeyFallback';
import { piModelTerminalErrorAttributes } from '../piModelDiagnostics';
import type { PiStreamFn as StreamFn } from '../piModelTypes';
import { emptyAssistantMessage, providerErrorEvent } from '../piStreamEvents';

function sse(event: string | undefined, data: unknown): string {
  return `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`;
}

// Synthetic account claim; the adapter only decodes it for request routing.
const CODEX_API_KEY = `header.${Buffer.from(
  JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'test-account' } }),
).toString('base64')}.signature`;

const CASES: { name: string; api: Api; stream: StreamFn; body: string }[] = [
  {
    name: 'OpenAI-compatible error type with a truncated diagnostic body',
    api: 'openai-completions',
    stream: streamCompletions as StreamFn,
    body: sse(undefined, { error: { type: 'rate_limit_error', message: 'x'.repeat(4_500) } }),
  },
  {
    name: 'OpenAI-compatible error body',
    api: 'openai-completions',
    stream: streamCompletions as StreamFn,
    body: sse(undefined, { error: { code: 429, message: 'Rate limited' } }),
  },
  {
    name: 'Responses error event',
    api: 'openai-responses',
    stream: streamResponses as StreamFn,
    body: sse('error', { type: 'error', code: 'rate_limit_exceeded', message: 'Rate limited' }),
  },
  {
    name: 'Responses failed response after an empty text block',
    api: 'openai-responses',
    stream: streamResponses as StreamFn,
    body:
      sse('response.output_item.added', {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'message', id: 'message', role: 'assistant', content: [] },
      }) +
      sse('response.failed', {
        type: 'response.failed',
        response: { status: 'failed', error: { code: 'rate_limit_exceeded', message: 'Limited' } },
      }),
  },
  {
    name: 'Azure Responses failed response',
    api: 'azure-openai-responses',
    stream: streamAzure as StreamFn,
    body: sse('response.failed', {
      type: 'response.failed',
      response: { status: 'failed', error: { code: 'rate_limit_exceeded', message: 'Limited' } },
    }),
  },
  {
    name: 'Anthropic error after an empty thinking block',
    api: 'anthropic-messages',
    stream: streamAnthropic as StreamFn,
    body:
      sse('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking', thinking: '' },
      }) +
      sse('error', { type: 'error', error: { type: 'rate_limit_error', message: 'Rate limited' } }),
  },
  {
    name: 'Anthropic error type with a truncated diagnostic body',
    api: 'anthropic-messages',
    stream: streamAnthropic as StreamFn,
    body: sse('error', {
      type: 'error',
      error: { type: 'rate_limit_error', message: 'x'.repeat(4_500) },
    }),
  },
];

function model(api: Api): Model<Api> {
  return {
    api,
    provider: 'test',
    id: 'test-model',
    name: 'Test model',
    baseUrl: 'https://provider.example.test/v1',
    reasoning: false,
    input: ['text'],
    contextWindow: 4096,
    maxTokens: 256,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

const success: StreamFn = (model) => {
  const stream = new AssistantMessageEventStream();
  const message: AssistantMessage = {
    role: 'assistant',
    api: model.api,
    provider: model.provider,
    model: model.id,
    content: [{ type: 'text', text: 'Recovered' }],
    stopReason: 'stop',
    timestamp: 1,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
  stream.push({ type: 'done', reason: 'stop', message });
  return stream;
};

describe('Pi provider stream errors', () => {
  test.each([
    { message: '网络连接已中断', retryable: true, expected: true },
    { message: '503 service unavailable', retryable: false, expected: false },
    { message: 'insufficient_quota', retryable: true, expected: false },
  ])('uses structured retryability for $message', ({ message, retryable, expected }) => {
    const event = providerErrorEvent(emptyAssistantMessage(model('openai-completions')), {
      message,
      retryable,
    });
    expect(isRetryableAssistantError(event.error)).toBe(expected);
    expect(isRetryableAssistantError({ ...event.error, stopReason: 'aborted' })).toBe(false);
  });

  test.each([
    { status: 503, expected: true },
    { status: 429, expected: true },
    { status: 401, expected: false },
  ])('uses the provider status when its message is opaque: $status', ({ status, expected }) => {
    const event = providerErrorEvent(emptyAssistantMessage(model('openai-completions')), {
      message: '请求失败',
      status,
    });
    expect(isRetryableAssistantError(event.error)).toBe(expected);
  });

  test.each([
    { code: 'server_error', expected: true },
    { code: 'rate_limit_exceeded', expected: true },
    { code: 'insufficient_quota', expected: false },
  ])('classifies an opaque provider message by its code: $code', ({ code, expected }) => {
    const event = providerErrorEvent(emptyAssistantMessage(model('openai-responses')), {
      message: '请求失败',
      code,
    });
    expect(isRetryableAssistantError(event.error)).toBe(expected);
  });

  test.each([
    {
      endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      adapterFamily: undefined,
      streamSimple: streamSimpleCompletions,
      message: '网络连接已中断。',
    },
    {
      endpointType: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      adapterFamily: undefined,
      streamSimple: streamSimpleAnthropic,
      message: 'Software caused connection abort',
    },
    {
      endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
      adapterFamily: undefined,
      streamSimple: streamSimpleResponses,
      message: 'Software caused connection abort',
    },
    {
      endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
      adapterFamily: 'openai-codex',
      streamSimple: streamSimpleCodex,
      message: '网络连接已中断。',
    },
  ])(
    'retries a $endpointType connection dropped mid-body: $message',
    async ({ endpointType, adapterFamily, streamSimple, message }) => {
      const adapter = resolvePiApiAdapter(endpointType, adapterFamily);
      // Jest loads the same installed adapter through CommonJS; Metro uses its import entry.
      const loadStream = jest
        .spyOn(adapter, 'loadStreamSimple')
        .mockResolvedValue(streamSimple as unknown as StreamFn);
      const stream = await bindPiStream(adapter, {
        apiKey: adapter.api === 'openai-codex-responses' ? CODEX_API_KEY : 'test-key',
        // The native layer reports the drop as an OS-localized message without status or code.
        fetch: async () =>
          new Response(
            new ReadableStream({
              start: (controller) => controller.enqueue(new TextEncoder().encode(': ping\n\n')),
              pull: (controller) => controller.error(new Error(message)),
            }),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
        headers: {},
        maxRetries: 0,
        maxTokens: 256,
      });
      loadStream.mockRestore();
      const source = await stream(
        model(adapter.api),
        normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
        {},
      );
      const result = await source.result();
      expect(result).toMatchObject({ stopReason: 'error', errorMessage: message });
      expect(isRetryableAssistantError(result)).toBe(true);
      expect(result.diagnostics?.at(-1)).toMatchObject({
        type: 'provider_response_failure',
        error: { code: 'stream_disconnected' },
        details: { retryable: true },
      });
    },
  );

  test.each([
    {
      name: 'OpenAI Chat',
      endpointType: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      adapterFamily: undefined,
      streamSimple: streamSimpleCompletions,
    },
    {
      name: 'Anthropic',
      endpointType: ENDPOINT_TYPE.ANTHROPIC_MESSAGES,
      adapterFamily: undefined,
      streamSimple: streamSimpleAnthropic,
    },
    {
      name: 'OpenAI Responses',
      endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
      adapterFamily: undefined,
      streamSimple: streamSimpleResponses,
    },
    {
      name: 'Codex',
      endpointType: ENDPOINT_TYPE.OPENAI_RESPONSES,
      adapterFamily: 'openai-codex',
      streamSimple: streamSimpleCodex,
    },
  ])(
    'classifies a $name request that receives no response as a network failure',
    async ({ endpointType, adapterFamily, streamSimple }) => {
      const adapter = resolvePiApiAdapter(endpointType, adapterFamily);
      const loadStream = jest
        .spyOn(adapter, 'loadStreamSimple')
        .mockResolvedValue(streamSimple as unknown as StreamFn);
      const stream = await bindPiStream(adapter, {
        apiKey: adapter.api === 'openai-codex-responses' ? CODEX_API_KEY : 'test-key',
        // The native layer rejects with an OS-localized message without status or code.
        fetch: async () => {
          throw new Error('fetch failed: 似乎已断开与互联网的连接。');
        },
        headers: {},
        maxRetries: 0,
        maxTokens: 256,
      });
      loadStream.mockRestore();
      const source = await stream(
        model(adapter.api),
        normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
        {},
      );
      const result = await source.result();
      expect(result.stopReason).toBe('error');
      // The code is diagnostic only; the existing retry decision still applies.
      expect(isRetryableAssistantError(result)).toBe(true);
      expect(piModelTerminalErrorAttributes(result)).toMatchObject({
        'error.code': 'no_response',
        'error.stage': 'stream',
        'error.category': 'network',
        'error.retryable': true,
      });
    },
  );

  test('does not classify a cancelled connection attempt as a network failure', async () => {
    // Codex surfaces the fetch rejection itself; the SDK adapters replace it on abort.
    const adapter = resolvePiApiAdapter(ENDPOINT_TYPE.OPENAI_RESPONSES, 'openai-codex');
    const loadStream = jest
      .spyOn(adapter, 'loadStreamSimple')
      .mockResolvedValue(streamSimpleCodex as unknown as StreamFn);
    const controller = new AbortController();
    const stream = await bindPiStream(adapter, {
      apiKey: CODEX_API_KEY,
      fetch: async () => {
        controller.abort();
        throw new Error('fetch failed: The operation was aborted.');
      },
      headers: {},
      maxRetries: 0,
      maxTokens: 256,
    });
    loadStream.mockRestore();
    const result = await (
      await stream(
        model(adapter.api),
        normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
        { signal: controller.signal },
      )
    ).result();
    expect(result.stopReason).toBe('aborted');
    expect(result.diagnostics?.at(-1)?.error?.code).toBeUndefined();
  });

  test.each([
    { status: 503, body: '暂时不可用', retryable: true },
    { status: 429, body: '暂时不可用', retryable: true },
    { status: 401, body: 'service unavailable', retryable: false },
    {
      status: 429,
      body: JSON.stringify({ error: { code: 'usage_limit_reached', message: 'Quota exhausted' } }),
      retryable: false,
    },
  ])('preserves Codex HTTP $status retry classification for $body', async (testCase) => {
    const stream = streamCodex(
      model('openai-codex-responses') as Model<'openai-codex-responses'>,
      normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
      {
        apiKey: CODEX_API_KEY,
        transport: 'sse',
        maxRetries: 0,
        fetch: async () => new Response(testCase.body, { status: testCase.status }),
      },
    );
    const result = await stream.result();
    expect(result.stopReason).toBe('error');
    expect(result.diagnostics?.at(-1)).toMatchObject({
      type: 'provider_response_failure',
      details: { status: testCase.status },
    });
    expect(isRetryableAssistantError(result)).toBe(testCase.retryable);
  });

  test.each([
    { error: { code: 'rate_limit_exceeded', message: 'Retry in one second' }, retryable: true },
    { error: { type: 'rate_limit_exceeded', message: 'Retry in one second' }, retryable: true },
    { error: { message: '请求过于频繁，请稍后重试' }, retryable: true },
    { error: { code: 'usage_limit_reached', message: '请求失败' }, retryable: false },
    { error: { type: 'usage_not_included', message: '请求失败' }, retryable: false },
    {
      error: { code: 'subscription_sharing_usage_limit_exceeded', message: '请求失败' },
      retryable: false,
    },
    { error: { code: 'insufficient_quota', message: '请求失败' }, retryable: false },
    { error: { code: 'billing_not_active', message: '请求失败' }, retryable: false },
  ])('distinguishes Codex JSON throttling from quota exhaustion: $error', async (testCase) => {
    const body = JSON.stringify({ error: testCase.error });
    const stream = streamCodex(
      model('openai-codex-responses') as Model<'openai-codex-responses'>,
      normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
      {
        apiKey: CODEX_API_KEY,
        transport: 'sse',
        maxRetries: 0,
        fetch: async () => new Response(body, { status: 429 }),
      },
    );
    const result = await stream.result();
    expect(result.stopReason).toBe('error');
    expect(result.diagnostics?.at(-1)).toMatchObject({
      type: 'provider_response_failure',
      error: { code: testCase.error.code ?? testCase.error.type ?? '' },
      details: { status: 429 },
    });
    expect(isRetryableAssistantError(result)).toBe(testCase.retryable);
    if (testCase.retryable) expect(result.errorMessage).toBe(testCase.error.message);
  });

  test('retains Codex stream error codes over HTTP 200', async () => {
    const stream = streamCodex(
      model('openai-codex-responses') as Model<'openai-codex-responses'>,
      normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
      {
        apiKey: CODEX_API_KEY,
        transport: 'sse',
        maxRetries: 0,
        fetch: async () =>
          new Response(
            sse('error', { type: 'error', code: 'server_error', message: '暂时不可用' }),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
      },
    );
    const result = await stream.result();
    expect(result.diagnostics?.at(-1)).toMatchObject({
      type: 'provider_response_failure',
      error: { name: 'CodexApiError', code: 'server_error' },
    });
    expect(isRetryableAssistantError(result)).toBe(true);
  });

  test.each(CASES)('switches keys for $name over HTTP 200', async (testCase) => {
    // Exercise the installed SDK/parser and its patch; no live provider requests.
    const fetch = jest.fn(
      async () => new Response(testCase.body, { headers: { 'Content-Type': 'text/event-stream' } }),
    );
    const primary: StreamFn = (model, context, options) =>
      testCase.stream(model, context, { ...options, apiKey: 'failed-key', maxRetries: 0, fetch });
    const fallback = jest.fn(async () => success);
    const stream = await withPiApiKeyFallback([async () => primary, fallback])(
      model(testCase.api),
      normalizeContext({ messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] }),
      {},
    );
    const events: AssistantMessageEvent[] = [];
    for await (const event of stream) events.push(event);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.type)).toEqual(['start', 'done']);
    expect((await stream.result()).content).toEqual([{ type: 'text', text: 'Recovered' }]);
  });
});
