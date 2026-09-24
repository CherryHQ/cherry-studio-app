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

function ring(...streams: StreamFn[]): StreamFn {
  return withPiApiKeyFallback(streams.map((stream) => async () => stream));
}

function failure(details: Record<string, unknown>, code?: string | number): AssistantMessage {
  const result = message();
  result.stopReason = 'error';
  result.diagnostics = [
    {
      type: 'provider_response_failure',
      timestamp: 1,
      error: { message: 'Provider failure', code },
      details,
    },
  ];
  return result;
}

async function collect(streamFn: StreamFn, signal?: AbortSignal) {
  const stream = await streamFn(MODEL, { messages: [] }, { signal });
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  return { events, result: await stream.result() };
}

describe('Pi API key failover', () => {
  test('advances past failed keys, hides failed attempts, and keeps the working key for later tool steps', async () => {
    const calls: string[] = [];
    const attempt =
      (key: string, status?: number): StreamFn =>
      () => {
        calls.push(key);
        return source(message(status));
      };
    const stream = ring(attempt('b', 401), attempt('c', 503), attempt('a'));

    const first = await collect(stream);
    expect(first.result.stopReason).toBe('stop');
    expect(first.events.map((event) => event.type)).toEqual(['start', 'done']);
    expect((await collect(stream)).result.stopReason).toBe('stop');
    expect(calls).toEqual(['b', 'c', 'a', 'a']);
  });

  test('walks the whole ring from the serving key on a later failure', async () => {
    const calls: string[] = [];
    const statuses: Record<string, (number | undefined)[]> = {
      a: [429, 200],
      b: [undefined, 503],
      c: [500],
    };
    const attempt =
      (key: string): StreamFn =>
      () => {
        calls.push(key);
        const status = statuses[key].shift();
        return source(message(status === 200 ? undefined : status));
      };
    const stream = ring(attempt('a'), attempt('b'), attempt('c'));

    expect((await collect(stream)).result.stopReason).toBe('stop');
    expect((await collect(stream)).result.stopReason).toBe('stop');
    expect(calls).toEqual(['a', 'b', 'b', 'c', 'a']);
  });

  test('tries each key once per failed request and reports the last failure', async () => {
    const calls: string[] = [];
    const attempt =
      (key: string, status: number): StreamFn =>
      () => {
        calls.push(key);
        return source(message(status));
      };
    const stream = ring(attempt('a', 401), attempt('b', 502), attempt('c', 429));

    expect((await collect(stream)).result.errorMessage).toBe('HTTP 429');
    expect(calls).toEqual(['a', 'b', 'c']);
  });

  test('treats a credential that cannot be resolved as a failed attempt', async () => {
    const calls: string[] = [];
    const stream = withPiApiKeyFallback([
      async () => () => {
        calls.push('a');
        return source(message(429));
      },
      async () => {
        calls.push('b');
        throw new Error('Key was removed');
      },
      async () => () => {
        calls.push('c');
        return source(message());
      },
    ]);

    expect((await collect(stream)).result.stopReason).toBe('stop');
    expect((await collect(stream)).result.stopReason).toBe('stop');
    expect(calls).toEqual(['a', 'b', 'c', 'c']);
  });

  test('reports a credential resolution failure when it is the last attempt', async () => {
    const stream = withPiApiKeyFallback([
      async () => () => source(message(503)),
      async () => {
        throw Object.assign(new Error('Key was removed'), { code: 'key_missing' });
      },
    ]);

    const { events, result } = await collect(stream);
    expect(events.map((event) => event.type)).toEqual(['start', 'error']);
    expect(result).toMatchObject({ stopReason: 'error', errorMessage: 'Key was removed' });
    expect(result.diagnostics?.at(-1)?.error?.code).toBe('key_missing');
  });

  test.each([401, 402, 403, 404, 408, 429, 500, 502, 503, 529])(
    'changes keys for HTTP %s',
    async (status) => {
      const result = await collect(
        ring(
          () => source(message(status)),
          () => source(message()),
        ),
      );

      expect(result.result.stopReason).toBe('stop');
    },
  );

  test.each([
    {},
    { status: '429' },
    { body: { type: 'overloaded_error' } },
    { body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } } },
    { body: '{invalid JSON: 400}' },
    { status: 503, body: { error: { code: 400 } } },
  ])('changes keys for server and in-stream failures: %p', async (details) => {
    const result = await collect(
      ring(
        () => source(failure(details)),
        () => source(message()),
      ),
    );

    expect(result.result.stopReason).toBe('stop');
    expect(result.events.map((event) => event.type)).toEqual(['start', 'done']);
  });

  test.each([
    { details: { status: 400 } },
    { details: { statusCode: '400' } },
    { details: {}, code: 400 },
    { details: { body: { error: { code: 400, status: 'INVALID_ARGUMENT' } } } },
    { details: { body: JSON.stringify({ error: { code: '400' } }) } },
  ])('keeps the key for a rejected request: %p', async ({ details, code }) => {
    const rejected = failure(details, code);
    const fallback = jest.fn(async () => () => source(message()));

    expect(
      (await collect(withPiApiKeyFallback([async () => () => source(rejected), fallback]))).result,
    ).toBe(rejected);
    expect(fallback).not.toHaveBeenCalled();
  });

  test('does not read HTTP 400 from error text', async () => {
    const result = message();
    result.stopReason = 'error';
    result.errorMessage = '400 Bad Request';

    expect(
      (
        await collect(
          ring(
            () => source(result),
            () => source(message()),
          ),
        )
      ).result.stopReason,
    ).toBe('stop');
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
      const stream = withPiApiKeyFallback([async () => () => source(failure, [event]), fallback]);

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
        ring(
          () => source(failure, events),
          () => source(message()),
        ),
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
    const result = await collect(
      withPiApiKeyFallback([async () => () => source(failure, events), fallback]),
    );

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
        withPiApiKeyFallback([
          async () => () =>
            source(terminal, [{ type: 'text_start', contentIndex: 0, partial: terminal }]),
          fallback,
        ]),
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

    expect(
      (await collect(withPiApiKeyFallback([async () => () => source(failure), fallback]))).result,
    ).toBe(failure);
    expect(fallback).not.toHaveBeenCalled();
  });

  test('preserves content included only in the terminal error', async () => {
    const failure = message(401);
    failure.content = [{ type: 'text', text: 'already generated' }];
    const fallback = jest.fn(async () => () => source(message()));
    const result = await collect(
      withPiApiKeyFallback([async () => () => source(failure), fallback]),
    );

    expect(result.result.content).toEqual(failure.content);
    expect(fallback).not.toHaveBeenCalled();
  });

  test('does not start a replacement request after cancellation during credential resolution', async () => {
    const controller = new AbortController();
    const replacement = jest.fn(() => source(message()));
    const stream = withPiApiKeyFallback([
      async () => () => source(message(401)),
      async () => {
        controller.abort(new Error('Cancelled'));
        return replacement;
      },
    ]);

    expect((await collect(stream, controller.signal)).result.stopReason).toBe('aborted');
    expect(replacement).not.toHaveBeenCalled();
  });

  test('does not send a request when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const primary = jest.fn(() => source(message(401)));
    const fallback = jest.fn(async () => () => source(message()));

    const result = await collect(
      withPiApiKeyFallback([async () => primary, fallback]),
      controller.signal,
    );
    expect(result.result.stopReason).toBe('aborted');
    expect(primary).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });

  test('does not switch keys for an aborted provider response', async () => {
    const failure = { ...message(401), stopReason: 'aborted' as const };
    const fallback = jest.fn(async () => () => source(message()));

    expect(
      (await collect(withPiApiKeyFallback([async () => () => source(failure), fallback]))).result
        .stopReason,
    ).toBe('aborted');
    expect(fallback).not.toHaveBeenCalled();
  });

  test.each([
    Object.assign(new Error('Unauthorized'), { status: 401 }),
    new TypeError('Network request failed'),
  ])('changes keys after a failure thrown before the stream exists: %p', async (error) => {
    const stream = ring(
      () => {
        throw error;
      },
      () => source(message()),
    );

    expect((await collect(stream)).result.stopReason).toBe('stop');
  });

  test('keeps the key for an HTTP 400 thrown before the stream exists', async () => {
    const fallback = jest.fn(async () => () => source(message()));
    const stream = withPiApiKeyFallback([
      async () => () => {
        throw Object.assign(new Error('Bad request'), { status: 400 });
      },
      fallback,
    ]);

    expect((await collect(stream)).result.errorMessage).toBe('Bad request');
    expect(fallback).not.toHaveBeenCalled();
  });

  test('treats an unexpectedly closed stream as a failure', async () => {
    const incomplete = () => {
      const stream = new AssistantMessageEventStream();
      stream.end();
      return stream;
    };

    expect((await collect(ring(incomplete, () => source(message())))).result.stopReason).toBe(
      'stop',
    );
    expect((await collect(ring(incomplete))).result).toMatchObject({
      stopReason: 'error',
      errorMessage: 'The model response ended without a terminal event.',
    });
  });
});
