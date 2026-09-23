import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, AssistantMessageEvent, Model } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import { withPiApiKeyFallback } from '../piApiKeyFallback';

const MODEL: Model<'openai-completions'> = {
  api: 'openai-completions',
  provider: 'test',
  id: 'model',
  name: 'Model',
  baseUrl: 'https://example.test',
  reasoning: false,
  input: ['text'],
  contextWindow: 4096,
  maxTokens: 256,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

function message(status?: number): AssistantMessage {
  return {
    role: 'assistant',
    api: MODEL.api,
    provider: MODEL.provider,
    model: MODEL.id,
    timestamp: 1,
    content: [],
    stopReason: status ? 'error' : 'stop',
    ...(status
      ? {
          errorMessage: `HTTP ${status}`,
          diagnostics: [{ type: 'provider_response_failure', timestamp: 1, details: { status } }],
        }
      : {}),
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

function source(result: AssistantMessage, contentEvents: AssistantMessageEvent[] = []) {
  const stream = new AssistantMessageEventStream();
  stream.push({ type: 'start', partial: result });
  for (const event of contentEvents) stream.push(event);
  if (result.stopReason === 'error' || result.stopReason === 'aborted') {
    stream.push({ type: 'error', reason: result.stopReason, error: result });
  } else {
    stream.push({ type: 'done', reason: 'stop', message: result });
  }
  stream.end();
  return stream;
}

async function collect(streamFn: StreamFn, signal?: AbortSignal) {
  const stream = await streamFn(MODEL, { messages: [] }, { signal });
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  return { events, result: await stream.result() };
}

describe('Pi API key failover', () => {
  test('advances on 401/429, hides failed attempts, and keeps the working key for later tool steps', async () => {
    const calls: string[] = [];
    const attempt =
      (key: string, status?: number): StreamFn =>
      () => {
        calls.push(key);
        return source(message(status));
      };
    const stream = withPiApiKeyFallback(attempt('b', 401), [
      async () => attempt('c', 429),
      async () => attempt('a'),
    ]);

    const first = await collect(stream);
    expect(first.result.stopReason).toBe('stop');
    expect(first.events.map((event) => event.type)).toEqual(['start', 'done']);
    expect((await collect(stream)).result.stopReason).toBe('stop');
    expect(calls).toEqual(['b', 'c', 'a', 'a']);
  });

  test('tries each key once and does not reuse the exhausted pool on another tool step', async () => {
    const calls: string[] = [];
    const attempt =
      (key: string): StreamFn =>
      () => {
        calls.push(key);
        return source(message(401));
      };
    const stream = withPiApiKeyFallback(attempt('a'), [async () => attempt('b')]);

    expect((await collect(stream)).result.errorMessage).toBe('HTTP 401');
    expect((await collect(stream)).result.errorMessage).toBe('HTTP 401');
    expect(calls).toEqual(['a', 'b']);
  });

  test.each([400, 403, 500, 503])('does not change keys for HTTP %s', async (status) => {
    const fallback = jest.fn(async () => () => source(message()));
    const stream = withPiApiKeyFallback(() => source(message(status)), [fallback]);

    expect((await collect(stream)).result.errorMessage).toBe(`HTTP ${status}`);
    expect(fallback).not.toHaveBeenCalled();
  });

  test.each([
    { status: '429' },
    { code: 'rate_limit_exceeded' },
    { body: { code: 429 } },
    { body: { type: 'authentication_error' } },
    { body: { code: 'invalid_api_key' } },
    { body: { code: 'insufficient_quota' } },
    { body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } } },
    { body: JSON.stringify({ error: { type: 'rate_limit_error' } }) },
  ])('recognizes structured credential failures: %p', async ({ status, code, body }) => {
    const failure = message();
    failure.stopReason = 'error';
    failure.diagnostics = [
      {
        type: 'provider_response_failure',
        timestamp: 1,
        error: { message: 'Provider failure', code },
        details: { status, body },
      },
    ];
    const result = await collect(
      withPiApiKeyFallback(() => source(failure), [async () => () => source(message())]),
    );

    expect(result.result.stopReason).toBe('stop');
    expect(result.events.map((event) => event.type)).toEqual(['start', 'done']);
  });

  test.each([
    { body: { message: 'The prompt mentions 429 and rate_limit_error.' } },
    { body: '{invalid JSON: 429}' },
    { body: { type: 'overloaded_error' } },
    { status: 403, body: { code: 'rate_limit_exceeded' } },
  ])('does not infer key failures from unrelated errors: %p', async (details) => {
    const failure = message();
    failure.stopReason = 'error';
    failure.diagnostics = [{ type: 'provider_response_failure', timestamp: 1, details }];
    const fallback = jest.fn(async () => () => source(message()));

    expect((await collect(withPiApiKeyFallback(() => source(failure), [fallback]))).result).toBe(
      failure,
    );
    expect(fallback).not.toHaveBeenCalled();
  });

  test('does not infer HTTP status from an error message', async () => {
    const failure = message();
    failure.stopReason = 'error';
    failure.errorMessage = 'The prompt mentions 401 and 429.';
    const fallback = jest.fn(async () => () => source(message()));

    expect((await collect(withPiApiKeyFallback(() => source(failure), [fallback]))).result).toBe(
      failure,
    );
    expect(fallback).not.toHaveBeenCalled();
  });

  test.each(['text', 'thinking', 'toolcall'] as const)(
    'preserves a partial %s response instead of replaying it with another key',
    async (kind) => {
      const failure = message(429);
      if (kind === 'text') failure.content = [{ type: 'text', text: 'already generated' }];
      if (kind === 'thinking') {
        failure.content = [{ type: 'thinking', thinking: 'already generated' }];
      }
      const event: AssistantMessageEvent = {
        type: `${kind}_start`,
        contentIndex: 0,
        partial: failure,
      };
      const fallback = jest.fn(async () => () => source(message()));
      const stream = withPiApiKeyFallback(() => source(failure, [event]), [fallback]);

      const result = await collect(stream);
      expect(result.events.map((event) => event.type)).toEqual(['start', `${kind}_start`, 'error']);
      expect(result.result).toBe(failure);
      expect(fallback).not.toHaveBeenCalled();
    },
  );

  test.each(['text', 'thinking'] as const)(
    'discards empty %s blocks before switching keys',
    async (kind) => {
      const failure = message(429);
      failure.content =
        kind === 'text' ? [{ type: 'text', text: '' }] : [{ type: 'thinking', thinking: '' }];
      const events: AssistantMessageEvent[] = [
        { type: `${kind}_start`, contentIndex: 0, partial: failure },
        { type: `${kind}_delta`, contentIndex: 0, delta: '', partial: failure },
        { type: `${kind}_end`, contentIndex: 0, content: '', partial: failure },
      ];
      const result = await collect(
        withPiApiKeyFallback(() => source(failure, events), [async () => () => source(message())]),
      );

      expect(result.result.stopReason).toBe('stop');
      expect(result.events.map((event) => event.type)).toEqual(['start', 'done']);
    },
  );

  test('flushes buffered events in order when real content commits the response', async () => {
    const empty = message();
    empty.content = [{ type: 'text', text: '' }];
    const failure = message(429);
    failure.content = [{ type: 'text', text: 'Hello' }];
    const events: AssistantMessageEvent[] = [
      { type: 'text_start', contentIndex: 0, partial: empty },
      { type: 'text_delta', contentIndex: 0, delta: 'Hello', partial: failure },
    ];
    const fallback = jest.fn(async () => () => source(message()));
    const result = await collect(withPiApiKeyFallback(() => source(failure, events), [fallback]));

    expect(result.events.map((event) => event.type)).toEqual([
      'start',
      'text_start',
      'text_delta',
      'error',
    ]);
    expect(result.result.content).toEqual(failure.content);
    expect(fallback).not.toHaveBeenCalled();
  });

  test.each(['stop', 'error', 'aborted'] as const)(
    'flushes buffered empty events on terminal %s when no switch occurs',
    async (stopReason) => {
      const terminal = { ...message(stopReason === 'error' ? 400 : undefined), stopReason };
      terminal.content = [{ type: 'text', text: '' }];
      const fallback = jest.fn(async () => () => source(message()));
      const result = await collect(
        withPiApiKeyFallback(
          () => source(terminal, [{ type: 'text_start', contentIndex: 0, partial: terminal }]),
          [fallback],
        ),
      );

      expect(result.events.map((event) => event.type)).toEqual([
        'start',
        'text_start',
        stopReason === 'stop' ? 'done' : 'error',
      ]);
      expect(result.result).toBe(terminal);
      expect(fallback).not.toHaveBeenCalled();
    },
  );

  test('preserves signed reasoning even when its visible text is empty', async () => {
    const failure = message(429);
    failure.content = [{ type: 'thinking', thinking: '', thinkingSignature: 'signed' }];
    const fallback = jest.fn(async () => () => source(message()));

    expect((await collect(withPiApiKeyFallback(() => source(failure), [fallback]))).result).toBe(
      failure,
    );
    expect(fallback).not.toHaveBeenCalled();
  });

  test('preserves content included only in the terminal error', async () => {
    const failure = message(401);
    failure.content = [{ type: 'text', text: 'already generated' }];
    const fallback = jest.fn(async () => () => source(message()));
    const result = await collect(withPiApiKeyFallback(() => source(failure), [fallback]));

    expect(result.result.content).toEqual(failure.content);
    expect(fallback).not.toHaveBeenCalled();
  });

  test('does not start a replacement request after cancellation during credential resolution', async () => {
    const controller = new AbortController();
    const replacement = jest.fn(() => source(message()));
    const stream = withPiApiKeyFallback(
      () => source(message(401)),
      [
        async () => {
          controller.abort(new Error('Cancelled'));
          return replacement;
        },
      ],
    );

    expect((await collect(stream, controller.signal)).result.stopReason).toBe('aborted');
    expect(replacement).not.toHaveBeenCalled();
  });

  test('does not send a request when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const primary = jest.fn(() => source(message(401)));
    const fallback = jest.fn(async () => () => source(message()));

    const result = await collect(withPiApiKeyFallback(primary, [fallback]), controller.signal);
    expect(result.result.stopReason).toBe('aborted');
    expect(primary).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  test('does not switch keys for an aborted provider response', async () => {
    const failure = { ...message(401), stopReason: 'aborted' as const };
    const fallback = jest.fn(async () => () => source(message()));

    expect(
      (await collect(withPiApiKeyFallback(() => source(failure), [fallback]))).result.stopReason,
    ).toBe('aborted');
    expect(fallback).not.toHaveBeenCalled();
  });

  test('handles a thrown HTTP error before the provider creates its stream', async () => {
    const stream = withPiApiKeyFallback(() => {
      throw Object.assign(new Error('Unauthorized'), { status: 401 });
    }, [async () => () => source(message())]);

    expect((await collect(stream)).result.stopReason).toBe('stop');
  });

  test('retains structured failures thrown before a stream exists', async () => {
    const stream = withPiApiKeyFallback(() => {
      throw Object.assign(new Error('Rate limited'), {
        error: { type: 'rate_limit_error' },
      });
    }, [async () => () => source(message())]);

    expect((await collect(stream)).result.stopReason).toBe('stop');
  });

  test('settles an unexpectedly closed stream as an error', async () => {
    const incomplete = new AssistantMessageEventStream();
    incomplete.end();
    const fallback = jest.fn(async () => () => source(message()));

    const result = await collect(withPiApiKeyFallback(() => incomplete, [fallback]));
    expect(result.result).toMatchObject({
      stopReason: 'error',
      errorMessage: 'The model response ended without a terminal event.',
    });
    expect(fallback).not.toHaveBeenCalled();
  });
});
