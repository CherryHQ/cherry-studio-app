import { zstdDecompressSync } from 'node:zlib';

import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { Api, AssistantMessage, Model } from '@earendil-works/pi-ai';
import { streamSimple as streamSimpleCodex } from '@earendil-works/pi-ai/api/openai-codex-responses';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import { installLogWriter, type LogRecord } from '@/shared/core/logger/LoggerService';

import { generatePiText } from '../generatePiText';
import { bindPiStream, resolvePiApiAdapter } from '../piApiAdapters';
import type { PiRuntimeDependencies, PiStreamFn } from '../piModelTypes';
import { emptyAssistantMessage } from '../piStreamEvents';

function setup() {
  const model: Model<Api> = {
    api: 'openai-codex-responses',
    provider: 'openai-codex',
    id: 'translator',
    name: 'Translator',
    baseUrl: 'https://chatgpt.com/backend-api',
    input: ['text'],
    reasoning: true,
    contextWindow: 8192,
    maxTokens: 4096,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  const source = new AssistantMessageEventStream();
  const streamFn = jest.fn<ReturnType<PiStreamFn>, Parameters<PiStreamFn>>(() => source);
  const resolution = {
    model,
    streamFn,
    defaultThinkingLevel: 'medium',
    redactionValues: ['oauth-access'],
    supportsTools: true,
    usageContext: {
      providerId: 'configured-provider',
      modelId: 'translator',
      credentialReceipt: { attribution: 'unknown' },
    },
  };
  const resolveModel = jest.fn().mockResolvedValue(resolution);
  const dependencies: PiRuntimeDependencies = {
    preflightModel: jest.fn(),
    resolveModel,
  };
  const request = {
    model: { providerId: 'configured-provider', modelId: 'translator' },
    instructions: 'Translate into Chinese.',
    text: 'Hello',
    options: { reasoningEffort: 'none' as const },
  };
  const message = (text: string): AssistantMessage => ({
    ...emptyAssistantMessage(model),
    content: [{ type: 'text', text }],
    usage: { ...emptyAssistantMessage(model).usage, input: 10, output: 2, totalTokens: 12 },
  });
  return { dependencies, request, source, streamFn, resolveModel, resolution, message };
}

test('sends a text-only translation through the installed Codex adapter with OAuth headers', async () => {
  const { dependencies, request, resolveModel, resolution } = setup();
  const token = `header.${Buffer.from(
    JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'test-account' } }),
  ).toString('base64')}.signature`;
  const item = {
    type: 'message',
    id: 'answer',
    role: 'assistant',
    content: [{ type: 'output_text', text: '你好', annotations: [] }],
  };
  const body = [
    { type: 'response.output_item.added', output_index: 0, item },
    { type: 'response.output_item.done', output_index: 0, item },
    {
      type: 'response.completed',
      response: {
        id: 'response',
        status: 'completed',
        usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 },
      },
    },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('');
  const fetch = jest.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
  );
  const adapter = resolvePiApiAdapter(ENDPOINT_TYPE.OPENAI_RESPONSES, 'openai-codex');
  const loadStream = jest
    .spyOn(adapter, 'loadStreamSimple')
    .mockResolvedValue(streamSimpleCodex as unknown as PiStreamFn);
  try {
    const streamFn = await bindPiStream(adapter, {
      apiKey: token,
      fetch,
      headers: {},
      maxRetries: 0,
      maxTokens: 4096,
    });
    resolveModel.mockResolvedValue({ ...resolution, streamFn, redactionValues: [token] });
    await expect(generatePiText(dependencies, request)).resolves.toEqual({
      text: '你好',
      finishReason: 'stop',
    });
  } finally {
    loadStream.mockRestore();
  }
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(String(url)).toBe('https://chatgpt.com/backend-api/codex/responses');
  const headers = new Headers(init?.headers);
  expect(headers.get('authorization')).toBe(`Bearer ${token}`);
  expect(headers.get('chatgpt-account-id')).toBe('test-account');
  const sentBody = new Response(init?.body);
  const sent = JSON.parse(
    headers.get('content-encoding') === 'zstd'
      ? zstdDecompressSync(new Uint8Array(await sentBody.arrayBuffer())).toString()
      : await sentBody.text(),
  );
  expect(sent).toMatchObject({
    instructions: request.instructions,
    stream: true,
    store: false,
    reasoning: { effort: 'none' },
    input: [
      expect.objectContaining({
        role: 'user',
        content: [{ type: 'input_text', text: request.text }],
      }),
    ],
  });
  expect(sent.temperature).toBeUndefined();
  expect(sent.tools).toBeUndefined();
});

test('publishes cumulative text without reasoning and captures the terminal usage', async () => {
  const { dependencies, request, source, message } = setup();
  const onText = jest.fn();
  const onUsage = jest.fn().mockResolvedValue(undefined);
  let now = Date.now();
  const clock = jest.spyOn(Date, 'now').mockImplementation(() => (now += 5));
  const reasoning: AssistantMessage = {
    ...message(''),
    content: [{ type: 'thinking', thinking: 'private reasoning' }],
  };
  source.push({ type: 'thinking_start', contentIndex: 0, partial: reasoning });
  source.push({
    type: 'thinking_delta',
    contentIndex: 0,
    delta: 'private reasoning',
    partial: reasoning,
  });
  source.push({
    type: 'thinking_end',
    contentIndex: 0,
    content: 'private reasoning',
    partial: reasoning,
  });
  source.push({ type: 'text_delta', contentIndex: 0, delta: '你', partial: message('你') });
  source.push({ type: 'text_delta', contentIndex: 0, delta: '好', partial: message('你好') });
  source.push({ type: 'done', reason: 'stop', message: message('你好') });

  try {
    await expect(generatePiText(dependencies, request, { onText, onUsage })).resolves.toEqual({
      text: '你好',
      finishReason: 'stop',
    });
  } finally {
    clock.mockRestore();
  }
  expect(onText.mock.calls).toEqual([['你'], ['你好']]);
  expect(onUsage).toHaveBeenCalledWith(
    expect.objectContaining({
      usage: expect.objectContaining({ inputTokens: 10, outputTokens: 2, totalTokens: 12 }),
      context: expect.objectContaining({ providerId: 'configured-provider' }),
      metrics: expect.objectContaining({
        timeFirstTokenMs: expect.any(Number),
        timeThinkingMs: expect.any(Number),
        timeCompletionMs: expect.any(Number),
      }),
    }),
  );
});

test('preserves structured provider failures while logging only diagnostic metadata', async () => {
  const { dependencies, request, source, message } = setup();
  const records: LogRecord[] = [];
  const stopLogging = installLogWriter((record) => records.push(record));
  source.push({
    type: 'error',
    reason: 'error',
    error: {
      ...message(''),
      stopReason: 'error',
      errorMessage: 'Rejected oauth-access',
      diagnostics: [
        {
          type: 'provider_response_failure',
          timestamp: 1,
          error: { name: 'ProviderError', message: 'Rejected oauth-access', code: 'quota' },
          details: { statusCode: 429, body: 'private response body' },
        },
      ],
    },
  });
  try {
    await expect(generatePiText(dependencies, request)).rejects.toMatchObject({
      message: 'Rejected [REDACTED]',
      cause: {
        code: 'quota',
        context: expect.objectContaining({ statusCode: 429, finishReason: 'error' }),
      },
    });
  } finally {
    stopLogging();
  }
  expect(records).toContainEqual(
    expect.objectContaining({ 'error.code': 'quota', 'http.status_code': 429 }),
  );
  expect(JSON.stringify(records)).not.toContain('oauth-access');
  expect(JSON.stringify(records)).not.toContain('private response body');
  expect(JSON.stringify(records)).not.toContain(request.text);
});

test('preserves length termination so translation cannot save a partial result', async () => {
  const { dependencies, request, source, message } = setup();
  source.push({
    type: 'done',
    reason: 'length',
    message: { ...message('部分'), stopReason: 'length' },
  });
  await expect(generatePiText(dependencies, request)).resolves.toEqual({
    text: '部分',
    finishReason: 'length',
  });
});

test('rejects missing terminal events and redacts OAuth credentials from provider failures', async () => {
  const missing = setup();
  missing.source.end();
  await expect(generatePiText(missing.dependencies, missing.request)).rejects.toThrow(
    'without a completion event',
  );
  const failed = setup();
  failed.source.push({
    type: 'error',
    reason: 'error',
    error: { ...failed.message(''), stopReason: 'error', errorMessage: 'Rejected oauth-access' },
  });
  await expect(generatePiText(failed.dependencies, failed.request)).rejects.toThrow(
    'Rejected [REDACTED]',
  );
});

test('stops the transport and ignores queued chunks after the caller cancels', async () => {
  const { dependencies, request, source, streamFn, message } = setup();
  const controller = new AbortController();
  const cancelled = new Error('Cancelled translation');
  const onText = jest.fn(() => controller.abort(cancelled));
  source.push({ type: 'text_delta', contentIndex: 0, delta: '你', partial: message('你') });
  source.push({ type: 'done', reason: 'stop', message: message('你好') });
  await expect(
    generatePiText(dependencies, request, { signal: controller.signal, onText }),
  ).rejects.toBe(cancelled);
  expect(onText.mock.calls).toEqual([['你']]);
  expect(streamFn.mock.calls[0][2]?.signal?.aborted).toBe(true);
});

test('does not resolve credentials for a pre-aborted request', async () => {
  const { dependencies, request, resolveModel } = setup();
  const controller = new AbortController();
  controller.abort(new Error('Already cancelled'));
  await expect(generatePiText(dependencies, request, { signal: controller.signal })).rejects.toBe(
    controller.signal.reason,
  );
  expect(resolveModel).not.toHaveBeenCalled();
});

test.each([
  [1_048_576, undefined, 65_536],
  [1_048_576, 512, 512],
  [1_048_576, 65_536, 65_536],
  [1_048_576, 131_072, 131_072],
  [1_048_576, 2_000_000, 1_048_576],
  [64_000, undefined, 64_000],
])('reserves text output for ceiling %i and explicit %s', async (ceiling, explicit, expected) => {
  const { dependencies, request, resolution, streamFn, source, message } = setup();
  resolution.model.maxTokens = ceiling;
  resolution.model.contextWindow = 1_048_576;
  source.push({ type: 'done', reason: 'stop', message: message('OK') });
  await generatePiText(dependencies, {
    ...request,
    options: { ...request.options, maxOutputTokens: explicit },
  });
  expect(streamFn).toHaveBeenCalledWith(
    resolution.model,
    expect.anything(),
    expect.objectContaining({ maxTokens: expected }),
  );
});
