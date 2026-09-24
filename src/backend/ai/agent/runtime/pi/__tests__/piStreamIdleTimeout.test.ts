import type { StreamFn } from '@earendil-works/pi-agent-core';
import type { AssistantMessage, AssistantMessageEvent, Model } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';

import { withPiApiKeyFallback } from '../piApiKeyFallback';
import { withPiStreamIdleTimeout } from '../piStreamIdleTimeout';

const IDLE_MS = 120_000;

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

function message(text = '', stopReason: AssistantMessage['stopReason'] = 'stop'): AssistantMessage {
  return {
    role: 'assistant',
    api: MODEL.api,
    provider: MODEL.provider,
    model: MODEL.id,
    timestamp: 1,
    content: text ? [{ type: 'text', text }] : [],
    stopReason,
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

/** A provider stream driven by the test, which reports cancellation like pi-ai does. */
function controlledSource() {
  const stream = new AssistantMessageEventStream();
  let signal: AbortSignal | undefined;
  const streamFn: StreamFn = (_model, _context, options) => {
    signal = options?.signal;
    signal?.addEventListener('abort', () => {
      stream.push({ type: 'error', reason: 'aborted', error: message('', 'aborted') });
      stream.end();
    });
    return stream;
  };
  return {
    stream,
    streamFn,
    get signal() {
      return signal;
    },
    text(text: string) {
      stream.push({
        type: 'text_delta',
        contentIndex: 0,
        delta: text,
        partial: message(text),
      });
    },
    done(text: string) {
      stream.push({ type: 'done', reason: 'stop', message: message(text) });
      stream.end();
    },
    fail(status: number) {
      const error = message('', 'error');
      error.diagnostics = [
        { type: 'provider_response_failure', timestamp: 1, details: { status } },
      ];
      stream.push({ type: 'error', reason: 'error', error });
      stream.end();
    },
  };
}

async function collect(stream: AssistantMessageEventStream) {
  const events: AssistantMessageEvent[] = [];
  for await (const event of stream) events.push(event);
  return { events, result: await stream.result() };
}

describe('Pi stream idle timeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('fails a request that produces no data and aborts the provider request', async () => {
    const source = controlledSource();
    const stream = await withPiStreamIdleTimeout(source.streamFn, IDLE_MS)(MODEL, {
      messages: [],
    });

    await jest.advanceTimersByTimeAsync(IDLE_MS);
    const { result } = await collect(stream);
    expect(result).toMatchObject({
      stopReason: 'error',
      errorMessage: 'The model response timed out after 120 seconds without data.',
    });
    expect(result.diagnostics?.at(-1)).toMatchObject({
      type: 'provider_response_failure',
      error: { name: 'TimeoutError', code: 'stream_idle_timeout' },
      details: { retryable: true },
    });
    expect(source.signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('times out even while creation of the source stream is pending', async () => {
    let resolveSource!: (stream: AssistantMessageEventStream) => void;
    const pendingSource = new Promise<AssistantMessageEventStream>((resolve) => {
      resolveSource = resolve;
    });
    let signal: AbortSignal | undefined;
    const stream = await withPiStreamIdleTimeout((_model, _context, options) => {
      signal = options?.signal;
      return pendingSource;
    })(MODEL, { messages: [] });

    await jest.advanceTimersByTimeAsync(IDLE_MS);
    const result = await stream.result();
    expect(result.stopReason).toBe('error');
    expect(result.diagnostics?.at(-1)?.error?.code).toBe('stream_idle_timeout');
    expect(signal?.aborted).toBe(true);

    const lateSource = controlledSource();
    lateSource.done('too late');
    resolveSource(lateSource.stream);
    expect((await collect(stream)).events.map((event) => event.type)).toEqual(['error']);
    expect(await stream.result()).toBe(result);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('does not restart the first-response timer for a start event', async () => {
    const source = controlledSource();
    const stream = await withPiStreamIdleTimeout(source.streamFn)(MODEL, { messages: [] });

    await jest.advanceTimersByTimeAsync(IDLE_MS - 1);
    source.stream.push({ type: 'start', partial: message() });
    await jest.advanceTimersByTimeAsync(1);

    expect((await stream.result()).diagnostics?.at(-1)?.error?.code).toBe('stream_idle_timeout');
  });

  test.each(['text', 'thinking'] as const)(
    'does not restart the timer for an empty %s block, with or without failover',
    async (kind) => {
      const empty = message();
      empty.content =
        kind === 'text' ? [{ type: 'text', text: '' }] : [{ type: 'thinking', thinking: '' }];
      const event: AssistantMessageEvent = {
        type: `${kind}_start`,
        contentIndex: 0,
        partial: empty,
      };
      const single = controlledSource();
      const ringSource = controlledSource();
      const streams = [
        await withPiStreamIdleTimeout(single.streamFn)(MODEL, { messages: [] }),
        await withPiStreamIdleTimeout(
          withPiApiKeyFallback([
            async () => ringSource.streamFn,
            async () => controlledSource().streamFn,
          ]),
        )(MODEL, { messages: [] }),
      ];

      await jest.advanceTimersByTimeAsync(IDLE_MS - 1);
      single.stream.push(event);
      ringSource.stream.push(event);
      await jest.advanceTimersByTimeAsync(1);

      for (const stream of streams) {
        expect((await stream.result()).diagnostics?.at(-1)?.error?.code).toBe(
          'stream_idle_timeout',
        );
      }
      expect(jest.getTimerCount()).toBe(0);
    },
  );

  test('keeps a long response alive while data keeps arriving', async () => {
    const source = controlledSource();
    const stream = await withPiStreamIdleTimeout(source.streamFn, IDLE_MS)(MODEL, {
      messages: [],
    });

    for (const chunk of ['a', 'ab', 'abc']) {
      await jest.advanceTimersByTimeAsync(IDLE_MS - 1);
      source.text(chunk);
    }
    await jest.advanceTimersByTimeAsync(IDLE_MS - 1);
    source.done('abcd');

    expect((await collect(stream)).result).toMatchObject({ stopReason: 'stop' });
    expect(source.signal?.aborted).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('keeps generated content when the stream stalls midway', async () => {
    const source = controlledSource();
    const stream = await withPiStreamIdleTimeout(source.streamFn, IDLE_MS)(MODEL, {
      messages: [],
    });

    source.text('partial answer');
    await jest.advanceTimersByTimeAsync(IDLE_MS);
    const { events, result } = await collect(stream);
    expect(events.map((event) => event.type)).toEqual(['text_delta', 'error']);
    expect(result).toMatchObject({
      stopReason: 'error',
      content: [{ type: 'text', text: 'partial answer' }],
    });
  });

  test('passes cancellation through and stops timing', async () => {
    const source = controlledSource();
    const controller = new AbortController();
    const stream = await withPiStreamIdleTimeout(source.streamFn, IDLE_MS)(
      MODEL,
      { messages: [] },
      { signal: controller.signal },
    );

    controller.abort();
    const { result } = await collect(stream);
    await jest.advanceTimersByTimeAsync(IDLE_MS);
    expect(result.stopReason).toBe('aborted');
    expect(jest.getTimerCount()).toBe(0);
  });

  test('finishes cancellation when the source ignores abort and preserves partial content', async () => {
    const source = new AssistantMessageEventStream();
    const controller = new AbortController();
    let signal: AbortSignal | undefined;
    const stream = await withPiStreamIdleTimeout((_model, _context, options) => {
      signal = options?.signal;
      return source;
    })(MODEL, { messages: [] }, { signal: controller.signal });
    source.push({
      type: 'text_delta',
      contentIndex: 0,
      delta: 'partial',
      partial: message('partial'),
    });
    await jest.advanceTimersByTimeAsync(0);

    controller.abort(new Error('Cancelled'));
    const { events, result } = await collect(stream);
    expect(events.map((event) => event.type)).toEqual(['text_delta', 'error']);
    expect(result).toMatchObject({
      stopReason: 'aborted',
      content: [{ type: 'text', text: 'partial' }],
    });
    expect(signal?.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);

    source.push({ type: 'done', reason: 'stop', message: message('late result') });
    expect(await stream.result()).toBe(result);
  });

  test('does not start the source if the caller has already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const source = jest.fn(() => new AssistantMessageEventStream());
    const stream = await withPiStreamIdleTimeout(source)(
      MODEL,
      { messages: [] },
      { signal: controller.signal },
    );

    expect((await stream.result()).stopReason).toBe('aborted');
    expect(source).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test.each(['throw', 'reject'] as const)('terminalizes a source creation %s', async (mode) => {
    const error = Object.assign(new Error('Bad request'), { status: 400, code: 'bad_request' });
    const stream = await withPiStreamIdleTimeout(() => {
      if (mode === 'reject') return Promise.reject(error);
      throw error;
    })(MODEL, { messages: [] });

    const { events, result } = await collect(stream);
    expect(events.map((event) => event.type)).toEqual(['error']);
    expect(result).toMatchObject({ stopReason: 'error', errorMessage: 'Bad request' });
    expect(result.diagnostics?.at(-1)).toMatchObject({
      error: { code: 'bad_request' },
      details: { status: 400 },
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  test('terminalizes a stream that closes without a terminal event', async () => {
    const source = controlledSource();
    const stream = await withPiStreamIdleTimeout(source.streamFn)(MODEL, { messages: [] });
    source.text('partial');
    source.stream.end();

    const { events, result } = await collect(stream);
    expect(events.map((event) => event.type)).toEqual(['text_delta', 'error']);
    expect(result).toMatchObject({
      stopReason: 'error',
      errorMessage: 'The model response ended without a terminal event.',
      content: [{ type: 'text', text: 'partial' }],
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  test('terminalizes an iterator failure instead of leaving an unhandled rejection', async () => {
    const source = new AssistantMessageEventStream();
    jest.spyOn(source, Symbol.asyncIterator).mockImplementation(async function* () {
      yield { type: 'text_delta', contentIndex: 0, delta: 'partial', partial: message('partial') };
      throw new Error('Read failed');
    });
    const stream = await withPiStreamIdleTimeout(() => source)(MODEL, { messages: [] });

    expect((await collect(stream)).result).toMatchObject({
      stopReason: 'error',
      errorMessage: 'Read failed',
      content: [{ type: 'text', text: 'partial' }],
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  test('shares two minutes across key failures without restarting the budget', async () => {
    const first = controlledSource();
    const second = controlledSource();
    const unused = jest.fn(async () => controlledSource().streamFn);
    const stream = await withPiStreamIdleTimeout(
      withPiApiKeyFallback([async () => first.streamFn, async () => second.streamFn, unused]),
    )(MODEL, { messages: [] });

    await jest.advanceTimersByTimeAsync(60_000);
    first.fail(503);
    await jest.advanceTimersByTimeAsync(59_999);
    expect(second.signal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    expect((await collect(stream)).result.diagnostics?.at(-1)?.error?.code).toBe(
      'stream_idle_timeout',
    );
    expect(second.signal?.aborted).toBe(true);
    expect(unused).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('lets a replacement key stream beyond two minutes after it begins producing content', async () => {
    const first = controlledSource();
    const second = controlledSource();
    const stream = await withPiStreamIdleTimeout(
      withPiApiKeyFallback([async () => first.streamFn, async () => second.streamFn]),
    )(MODEL, { messages: [] });

    await jest.advanceTimersByTimeAsync(60_000);
    first.fail(401);
    await jest.advanceTimersByTimeAsync(59_999);
    second.text('Recovered');
    await jest.advanceTimersByTimeAsync(IDLE_MS - 1);
    second.done('Recovered');

    expect((await collect(stream)).result.content).toEqual([{ type: 'text', text: 'Recovered' }]);
    expect(second.signal?.aborted).toBe(false);
  });
});
