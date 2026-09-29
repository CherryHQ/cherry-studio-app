import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { Api, AssistantMessage, AssistantMessageEvent, Model } from '@earendil-works/pi-ai';
import { stream as streamAnthropic } from '@earendil-works/pi-ai/api/anthropic-messages';
import { stream as streamAzure } from '@earendil-works/pi-ai/api/azure-openai-responses';
import { stream as streamCompletions } from '@earendil-works/pi-ai/api/openai-completions';
import { stream as streamResponses } from '@earendil-works/pi-ai/api/openai-responses';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import { withPiApiKeyFallback } from '../piApiKeyFallback';

function sse(event: string | undefined, data: unknown): string {
  return `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`;
}

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
      { messages: [{ role: 'user', content: 'Hello', timestamp: 1 }] },
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
