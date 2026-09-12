import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import type { LanguageModelMiddleware } from 'ai';

import { createDeepseekDsmlParserPlugin } from '../deepseekDsmlParserPlugin';

const OPEN = '<｜｜DSML｜｜tool_calls>';
const CLOSE = '</｜｜DSML｜｜tool_calls>';

function invoke(toolName: string, parameters: string): string {
  return `<｜｜DSML｜｜invoke name="${toolName}">${parameters}</｜｜DSML｜｜invoke>`;
}

function parameter(name: string, value: string, isString = true): string {
  return `<｜｜DSML｜｜parameter name="${name}" string="${isString}">${value}</｜｜DSML｜｜parameter>`;
}

async function getMiddleware(): Promise<LanguageModelMiddleware> {
  const plugin = createDeepseekDsmlParserPlugin();
  const context = { middlewares: [] as LanguageModelMiddleware[] };
  await plugin.configureContext?.(context as never);
  expect(context.middlewares).toHaveLength(1);
  return context.middlewares[0];
}

async function runStream(deltas: string[], type: 'text' | 'reasoning' = 'text') {
  const parts: LanguageModelV3StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { type: `${type}-start`, id: 'text-1' },
    ...deltas.map<LanguageModelV3StreamPart>((delta) => ({
      type: `${type}-delta`,
      id: 'text-1',
      delta,
    })),
    { type: `${type}-end`, id: 'text-1' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: {} as never,
    },
  ];
  return runParts(parts);
}

async function runParts(parts: LanguageModelV3StreamPart[]) {
  const middleware = await getMiddleware();
  const source = new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
  const wrapped = await middleware.wrapStream?.({
    doStream: async () => ({ stream: source, request: { body: {} } }),
    doGenerate: async () => ({}) as never,
    model: {} as never,
    params: {} as never,
  });
  if (!wrapped) throw new Error('Missing DSML stream middleware.');

  const events: LanguageModelV3StreamPart[] = [];
  const reader = wrapped.stream.getReader();
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    events.push(result.value);
  }
  return events;
}

async function runGenerate(text: string, type: 'text' | 'reasoning' = 'text') {
  const middleware = await getMiddleware();
  const result = await middleware.wrapGenerate?.({
    doGenerate: async () =>
      ({
        content: [{ type, text }],
        finishReason: { unified: 'stop', raw: 'stop' },
        request: { body: {} },
        usage: {} as never,
        warnings: [],
      }) as never,
    doStream: async () => ({}) as never,
    model: {} as never,
    params: {} as never,
  });
  if (!result) throw new Error('Missing DSML generate middleware.');
  return result;
}

describe('deepseekDsmlParser', () => {
  test('reassembles chunked tags and emits multiple standard tool calls', async () => {
    const dsml =
      `before ${OPEN}` +
      invoke('web_search', parameter('query', 'current Cherry Studio release')) +
      invoke('web_fetch', parameter('urls', '["https://example.com"]', false)) +
      `${CLOSE} after`;
    const events = await runStream([...dsml]);
    const toolCalls = events.filter(
      (event): event is Extract<LanguageModelV3StreamPart, { type: 'tool-call' }> =>
        event.type === 'tool-call',
    );

    expect(toolCalls).toHaveLength(2);
    expect(toolCalls[0]).toMatchObject({ toolName: 'web_search' });
    expect(JSON.parse(toolCalls[0].input)).toEqual({ query: 'current Cherry Studio release' });
    expect(toolCalls[1]).toMatchObject({ toolName: 'web_fetch' });
    expect(JSON.parse(toolCalls[1].input)).toEqual({ urls: ['https://example.com'] });

    const lifecycle = events.filter((event) =>
      ['tool-input-start', 'tool-input-delta', 'tool-input-end', 'tool-call'].includes(event.type),
    );
    expect(lifecycle.map((event) => event.type)).toEqual([
      'tool-input-start',
      'tool-input-delta',
      'tool-input-end',
      'tool-call',
      'tool-input-start',
      'tool-input-delta',
      'tool-input-end',
      'tool-call',
    ]);
    expect(
      events.find(
        (event): event is Extract<LanguageModelV3StreamPart, { type: 'finish' }> =>
          event.type === 'finish',
      )?.finishReason.unified,
    ).toBe('tool-calls');
    expect(streamText(events)).toBe('before  after');
  });

  test('reports malformed and unclosed DSML instead of leaking it as successful text', async () => {
    const malformed = `before ${OPEN}not an invoke${CLOSE} after`;
    await expect(runStream([malformed])).rejects.toMatchObject({
      code: 'deepseek_dsml_parse_error',
    });

    const unclosed = `${OPEN}${invoke('web_search', parameter('query', 'query'))}`;
    await expect(runStream([unclosed])).rejects.toMatchObject({
      code: 'deepseek_dsml_parse_error',
    });
  });

  test('passes ordinary text through without changing the finish reason', async () => {
    const events = await runStream(['Hello, ', 'world!']);
    expect(streamText(events)).toBe('Hello, world!');
    expect(events.some((event) => event.type === 'tool-call')).toBe(false);
    expect(
      events.find(
        (event): event is Extract<LanguageModelV3StreamPart, { type: 'finish' }> =>
          event.type === 'finish',
      )?.finishReason.unified,
    ).toBe('stop');
  });

  test('extracts multiple non-streaming calls and preserves surrounding text', async () => {
    const result = await runGenerate(
      `lead ${OPEN}${invoke('web_search', parameter('query', 'first query'))}${CLOSE}` +
        ` middle ${OPEN}${invoke('web_fetch', parameter('urls', '["https://a.test"]', false))}${CLOSE} tail`,
    );
    const calls = result.content.filter((part) => part.type === 'tool-call');
    const text = result.content
      .filter(
        (part): part is Extract<(typeof result.content)[number], { type: 'text' }> =>
          part.type === 'text',
      )
      .map((part) => part.text)
      .join('');

    expect(calls.map((part) => part.toolName)).toEqual(['web_search', 'web_fetch']);
    expect(text).toBe('lead  middle  tail');
    expect(result.finishReason.unified).toBe('tool-calls');
  });

  test('reports malformed non-streaming blocks', async () => {
    const text = `before ${OPEN}garbage${CLOSE} after`;
    await expect(runGenerate(text)).rejects.toMatchObject({ code: 'deepseek_dsml_parse_error' });
  });

  test('closes reasoning before emitting recovered calls and keeps both channels free of markup', async () => {
    const source =
      'thinking ' +
      `${OPEN}${invoke('lookup', parameter('query', 'notes'))}${CLOSE}`.replaceAll('｜｜', '｜');
    const events = await runStream([...source], 'reasoning');
    expect(events.findIndex((event) => event.type === 'reasoning-end')).toBeLessThan(
      events.findIndex((event) => event.type === 'tool-input-start'),
    );
    expect(
      events
        .filter((event) => event.type === 'reasoning-delta')
        .map((event) => event.delta)
        .join(''),
    ).toBe('thinking ');
    expect(events.filter((event) => event.type === 'tool-call')).toEqual([
      expect.objectContaining({ toolName: 'lookup', input: '{"query":"notes"}' }),
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'tool-calls' },
    });
  });

  test('also recovers calls in non-streaming reasoning', async () => {
    const result = await runGenerate(
      `think ${OPEN}${invoke('lookup', parameter('query', 'notes'))}${CLOSE}`,
      'reasoning',
    );
    expect(result.content).toEqual([
      { type: 'reasoning', text: 'think ' },
      expect.objectContaining({
        type: 'tool-call',
        toolName: 'lookup',
        input: '{"query":"notes"}',
      }),
    ]);
    expect(result.finishReason.unified).toBe('tool-calls');
  });

  test('isolates interleaved content and flushes recovered calls before a terminal finish', async () => {
    const source = `${OPEN}${invoke('lookup', parameter('query', 'notes'))}${CLOSE}`;
    const events = await runParts([
      { type: 'reasoning-start', id: 'shared-id' },
      { type: 'reasoning-delta', id: 'shared-id', delta: source.slice(0, 10) },
      { type: 'text-start', id: 'shared-id' },
      { type: 'text-delta', id: 'shared-id', delta: 'visible' },
      { type: 'text-end', id: 'shared-id', providerMetadata: { vendor: { tag: 'keep' } } },
      { type: 'reasoning-delta', id: 'shared-id', delta: source.slice(10) },
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage: {} as never },
    ]);
    expect(streamText(events)).toBe('visible');
    expect(events.find((event) => event.type === 'text-end')).toMatchObject({
      providerMetadata: { vendor: { tag: 'keep' } },
    });
    expect(events.filter((event) => event.type === 'tool-call')).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({
      type: 'finish',
      finishReason: { unified: 'tool-calls' },
    });
    expect(events.findIndex((event) => event.type === 'reasoning-end')).toBeLessThan(
      events.findIndex((event) => event.type === 'tool-call'),
    );
  });
});

function streamText(events: LanguageModelV3StreamPart[]): string {
  return events
    .filter(
      (event): event is Extract<LanguageModelV3StreamPart, { type: 'text-delta' }> =>
        event.type === 'text-delta',
    )
    .map((event) => event.delta)
    .join('');
}
