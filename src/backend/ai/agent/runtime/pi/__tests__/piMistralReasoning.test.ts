import type { AssistantMessage, AssistantMessageEvent, Model } from '@earendil-works/pi-ai';
import { streamSimple } from '@earendil-works/pi-ai/api/openai-completions';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

const model: Model<'openai-completions'> = {
  api: 'openai-completions',
  provider: 'mistral',
  id: 'mistral-large-4',
  name: 'Mistral',
  baseUrl: 'https://provider.test/v1',
  input: ['text'],
  reasoning: true,
  contextWindow: 8192,
  maxTokens: 1024,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const text = (value: unknown) => ({ type: 'text', text: value });
const thinking = (...children: unknown[]) => ({ type: 'thinking', thinking: children });
const think = (value: string) => thinking(text(value));
const frame = (delta: Record<string, unknown>, finishReason: string | null = null) =>
  `data: ${JSON.stringify({ id: 'completion', choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;

function harness(provider = model.provider) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
    },
  });
  const encoder = new TextEncoder();
  const events: AssistantMessageEvent[] = [];
  let observe: ((event: AssistantMessageEvent) => void) | undefined;
  const stream = streamSimple(
    { ...model, provider },
    normalizeContext({
      messages: [{ role: 'user', content: 'Calculate.', timestamp: 0 }],
    }),
    {
      apiKey: 'fake',
      maxRetries: 0,
      fetch: async () => new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }),
    },
  );
  const consumed = (async () => {
    for await (const event of stream) {
      // Each event shares mutable partial output; preserve the state at delivery.
      const snapshot: AssistantMessageEvent = JSON.parse(JSON.stringify(event));
      events.push(snapshot);
      observe?.(snapshot);
    }
  })();
  return {
    events,
    send(delta: Record<string, unknown>) {
      controller.enqueue(encoder.encode(frame(delta)));
    },
    nextThinking() {
      return new Promise<AssistantMessageEvent>((resolve) => {
        observe = (event) => {
          if (event.type === 'thinking_delta') resolve(event);
        };
      });
    },
    async finish(reason = 'stop') {
      controller.enqueue(encoder.encode(frame({}, reason) + 'data: [DONE]\n\n'));
      controller.close();
      await consumed;
      const result = await stream.result();
      expect(result.stopReason).toBe(reason === 'tool_calls' ? 'toolUse' : 'stop');
      for (const event of events) {
        if ('delta' in event) expect(typeof event.delta).toBe('string');
      }
      return result;
    },
  };
}
async function run(deltas: Record<string, unknown>[], provider?: string) {
  const test = harness(provider);
  for (const delta of deltas) test.send(delta);
  return { events: test.events, result: await test.finish() };
}
function totals(result: AssistantMessage) {
  return {
    thinking: result.content
      .filter((block) => block.type === 'thinking')
      .map((block) => block.thinking)
      .join(''),
    text: result.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join(''),
  };
}
function deltas(events: AssistantMessageEvent[]) {
  return events.flatMap((event) =>
    event.type === 'text_delta' || event.type === 'thinking_delta'
      ? [[event.type, event.delta, event.contentIndex]]
      : [],
  );
}
function expectAnswerOnly(
  result: AssistantMessage,
  events: AssistantMessageEvent[],
  answer: string,
) {
  expect(totals(result)).toEqual({ thinking: '', text: answer });
  expect(result.content.map((block) => block.type)).toEqual(['text']);
  expect(events.some((event) => event.type === 'thinking_start')).toBe(false);
}

test('delivers thinking before releasing the mixed transition and string answer', async () => {
  const test = harness();
  const observed = test.nextThinking();
  test.send({ content: [think('First. ')] });
  try {
    const event = await observed;
    expect(event.type).toBe('thinking_delta');
    expect(test.events.map((value) => value.type)).toEqual([
      'start',
      'thinking_start',
      'thinking_delta',
    ]);
    expect('partial' in event && totals(event.partial)).toEqual({ thinking: 'First. ', text: '' });
  } finally {
    test.send({ content: [think('Last. '), text('Answer: ')] });
    test.send({ content: '42.' });
    const result = await test.finish();
    expect(totals(result)).toEqual({ thinking: 'First. Last. ', text: 'Answer: 42.' });
    expect(result.content[0]).toMatchObject({ thinkingSignature: undefined });
    expect(deltas(test.events)).toEqual([
      ['thinking_delta', 'First. ', 0],
      ['thinking_delta', 'Last. ', 0],
      ['text_delta', 'Answer: ', 1],
      ['text_delta', '42.', 1],
    ]);
    expect(test.events.map((value) => value.type)).toEqual([
      'start',
      'thinking_start',
      'thinking_delta',
      'thinking_delta',
      'text_start',
      'text_delta',
      'text_delta',
      'thinking_end',
      'text_end',
      'done',
    ]);
    expect(test.events.find((value) => value.type === 'thinking_delta')).toMatchObject({
      partial: { content: [{ type: 'thinking', thinking: 'First. ' }] },
    });
  }
});

test('concatenates nested text children exactly into one thinking delta', async () => {
  const { result, events } = await run([
    { content: [thinking(text('First.'), text(''), text(' '), text('Last.\n'))] },
  ]);
  expect(totals(result)).toEqual({ thinking: 'First. Last.\n', text: '' });
  expect(deltas(events)).toEqual([['thinking_delta', 'First. Last.\n', 0]]);
});

test('processes several outer chunks in wire order and reuses channel blocks', async () => {
  const { result, events } = await run([
    { content: [text('A'), think('B'), text(' '), think('C'), text('D')] },
  ]);
  expect(totals(result)).toEqual({ thinking: 'BC', text: 'A D' });
  expect(result.content.map((block) => block.type)).toEqual(['text', 'thinking']);
  expect(deltas(events)).toEqual([
    ['text_delta', 'A', 0],
    ['thinking_delta', 'B', 1],
    ['text_delta', ' ', 0],
    ['thinking_delta', 'C', 1],
    ['text_delta', 'D', 0],
  ]);
});

test('ignores malformed outer and nested values while preserving valid siblings', async () => {
  const malformed = [
    null,
    false,
    7,
    'plain',
    [text('nested')],
    {},
    { type: 'other', text: 'unknown' },
    text({}),
    text(9),
    text(null),
  ];
  const { result, events } = await run([
    ...[null, {}, 4, true].map((content) => ({ content })),
    {
      content: [
        ...malformed,
        { type: 'thinking', thinking: 'wrong' },
        { type: 'thinking', thinking: {} },
        thinking(...malformed, text('valid')),
        text('answer'),
      ],
    },
  ]);
  expect(totals(result)).toEqual({ thinking: 'valid', text: 'answer' });
  expect(deltas(events)).toEqual([
    ['thinking_delta', 'valid', 0],
    ['text_delta', 'answer', 1],
  ]);
});

test('empty thinking chunks create no thinking block or start event', async () => {
  const { result, events } = await run([
    { content: [thinking(), think(''), thinking(text(''), null), text('')] },
    { content: 'answer' },
  ]);
  expectAnswerOnly(result, events, 'answer');
});

test('array text alone creates only the answer block', async () => {
  const { result, events } = await run([{ content: [text('Answer: '), text('42.')] }]);
  expectAnswerOnly(result, events, 'Answer: 42.');
});

test('empty array text before a string answer creates no text start or thinking block', async () => {
  const { result, events } = await run([{ content: [text(''), think('')] }, { content: 'answer' }]);
  expectAnswerOnly(result, events, 'answer');
  expect(deltas(events)).toEqual([['text_delta', 'answer', 0]]);
  expect(events.map((event) => event.type)).toEqual([
    'start',
    'text_start',
    'text_delta',
    'text_end',
    'done',
  ]);
  expect(events.find((event) => event.type === 'text_start')).toMatchObject({
    contentIndex: 0,
    partial: { content: [{ type: 'text', text: 'answer' }] },
  });
});

test('whitespace-only array thinking preserves the untrimmed thinking delta', async () => {
  const { result, events } = await run([{ content: [think(' ')] }]);
  expect(totals(result)).toEqual({ thinking: ' ', text: '' });
  expect(result.content.map((block) => block.type)).toEqual(['thinking']);
  expect(deltas(events)).toEqual([['thinking_delta', ' ', 0]]);
});

test('scalar reasoning suppresses same-delta array thinking and retains array text', async () => {
  const { result, events } = await run([
    { reasoning_content: 'scalar', content: [think('duplicate'), text('answer')] },
    { content: [think(' later')] },
  ]);
  expect(totals(result)).toEqual({ thinking: 'scalar later', text: 'answer' });
  expect(result.content[0]).toMatchObject({ thinkingSignature: 'reasoning_content' });
  expect(deltas(events)).toEqual([
    ['thinking_delta', 'scalar', 0],
    ['text_delta', 'answer', 1],
    ['thinking_delta', ' later', 0],
  ]);
});

test.each(['', null, {}, [], 0])(
  'empty/non-string scalar reasoning %p allows array thinking',
  async (value) => {
    const { result } = await run([
      {
        reasoning_content: value,
        reasoning: value,
        reasoning_text: value,
        content: [think('array')],
      },
    ]);
    expect(totals(result)).toEqual({ thinking: 'array', text: '' });
  },
);

test('plain string answer preserves content and event order', async () => {
  const { result, events } = await run([{ content: 'Answer: ' }, { content: '42.' }]);
  expectAnswerOnly(result, events, 'Answer: 42.');
  expect(events.map((event) => event.type)).toEqual([
    'start',
    'text_start',
    'text_delta',
    'text_delta',
    'text_end',
    'done',
  ]);
});

test.each([
  [
    { reasoning_content: 'first', reasoning: 'second', reasoning_text: 'third' },
    'first',
    'reasoning_content',
  ],
  [{ reasoning_content: '', reasoning: 'second', reasoning_text: 'third' }, 'second', 'reasoning'],
  [{ reasoning_content: {}, reasoning: '', reasoning_text: 'third' }, 'third', 'reasoning_text'],
] as const)('selects first nonempty scalar reasoning: %p', async (fields, expected, signature) => {
  const { result, events } = await run([
    { ...fields, content: [think('suppressed'), text('answer')] },
  ]);
  expect(totals(result)).toEqual({ thinking: expected, text: 'answer' });
  expect(result.content[0]).toMatchObject({ thinkingSignature: signature });
  expect(deltas(events)).toEqual([
    ['thinking_delta', expected, 0],
    ['text_delta', 'answer', 1],
  ]);
});

test('keeps the opencode-go reasoning signature exception', async () => {
  const { result } = await run(
    [{ reasoning: 'reason', content: [think('duplicate')] }, { content: [think(' more')] }],
    'opencode-go',
  );
  expect(result.content[0]).toMatchObject({
    thinking: 'reason more',
    thinkingSignature: 'reasoning_content',
  });
});

test('preserves reasoning_details alongside array thinking', async () => {
  const detail = { type: 'reasoning.encrypted', id: 'opaque', data: 'secret' };
  const { result } = await run([
    { reasoning_details: [detail], content: [think('visible'), text('answer')] },
  ]);
  const block = result.content[0];
  expect(block.type).toBe('thinking');
  if (block.type !== 'thinking') throw new Error('Missing thinking block');
  expect(block.thinking).toBe('visible');
  expect(JSON.parse(block.thinkingSignature!)).toEqual([detail]);
});

test('reasoning followed by streamed signed tool arguments keeps tool lifecycle and toolUse finish', async () => {
  const test = harness();
  test.send({ content: [think('lookup')] });
  test.send({
    tool_calls: [
      {
        index: 0,
        id: 'call_lookup',
        type: 'function',
        function: { name: 'lookup', arguments: '{"city":' },
      },
    ],
  });
  test.send({
    tool_calls: [
      {
        index: 0,
        function: { arguments: '"Paris"}' },
        extra_content: { google: { thought_signature: 'signature' } },
      },
    ],
  });
  const result = await test.finish('tool_calls');
  expect(result.content[1]).toMatchObject({
    type: 'toolCall',
    id: 'call_lookup',
    name: 'lookup',
    arguments: { city: 'Paris' },
    thoughtSignature: 'signature',
  });
  expect(test.events.map((event) => event.type)).toEqual([
    'start',
    'thinking_start',
    'thinking_delta',
    'toolcall_start',
    'toolcall_delta',
    'toolcall_delta',
    'thinking_end',
    'toolcall_end',
    'done',
  ]);
  expect(test.events.find((event) => event.type === 'toolcall_end')).toMatchObject({
    toolCall: result.content[1],
    contentIndex: 1,
  });
});

test('array reasoning and text alongside a tool call keep wire order and toolUse finish', async () => {
  const test = harness();
  test.send({
    content: [think('First. '), text('Answer. '), think('Last.')],
    tool_calls: [
      {
        index: 0,
        id: 'call_lookup',
        type: 'function',
        function: { name: 'lookup', arguments: '{"city":"Paris"}' },
      },
    ],
  });
  const result = await test.finish('tool_calls');
  expect(totals(result)).toEqual({ thinking: 'First. Last.', text: 'Answer. ' });
  expect(result.content.map((block) => block.type)).toEqual(['thinking', 'text', 'toolCall']);
  expect(deltas(test.events)).toEqual([
    ['thinking_delta', 'First. ', 0],
    ['text_delta', 'Answer. ', 1],
    ['thinking_delta', 'Last.', 0],
  ]);
  expect(result.content[2]).toMatchObject({
    type: 'toolCall',
    id: 'call_lookup',
    name: 'lookup',
    arguments: { city: 'Paris' },
  });
  expect(test.events.map((event) => event.type)).toEqual([
    'start',
    'thinking_start',
    'thinking_delta',
    'text_start',
    'text_delta',
    'thinking_delta',
    'toolcall_start',
    'toolcall_delta',
    'thinking_end',
    'text_end',
    'toolcall_end',
    'done',
  ]);
  expect(test.events.find((event) => event.type === 'toolcall_end')).toMatchObject({
    contentIndex: 2,
    toolCall: result.content[2],
  });
  expect(result.stopReason).toBe('toolUse');
});

test('preserves literal object-string text arriving on the wire', async () => {
  const { result } = await run([
    { reasoning_content: '[object Object]' },
    { content: '[object Object]' },
    { content: [text('[object Object]')] },
  ]);
  expect(totals(result)).toEqual({
    thinking: '[object Object]',
    text: '[object Object][object Object]',
  });
});
