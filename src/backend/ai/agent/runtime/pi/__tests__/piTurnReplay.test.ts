import type { AssistantMessage, Message, Model, ToolResultMessage } from '@earendil-works/pi-ai';
import { stream } from '@earendil-works/pi-ai/api/anthropic-messages';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import { parseRuntimeTurnReplay } from '../../runtimeTurnReplay';
import type { RuntimeExecutionRequest } from '../../types';
import { toPiConversation } from '../modelMessages';
import { createPiTurnReplay, readPiTurnReplay } from '../piTurnReplay';

const model: Model<'anthropic-messages'> = {
  api: 'anthropic-messages',
  provider: 'anthropic',
  id: 'claude-sonnet-4-6',
  name: 'Claude',
  baseUrl: 'https://api.anthropic.com',
  reasoning: true,
  input: ['text'],
  contextWindow: 200_000,
  maxTokens: 4096,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const assistant: AssistantMessage = {
  role: 'assistant',
  api: model.api,
  provider: model.provider,
  model: model.id,
  content: [
    { type: 'thinking', thinking: 'Look up both tools.', thinkingSignature: 'signed-thought' },
    { type: 'thinking', thinking: '', redacted: true, thinkingSignature: 'encrypted-thought' },
    { type: 'toolCall', id: 'call-a', name: 'tool_search', arguments: { query: 'files' } },
    { type: 'toolCall', id: 'call-b', name: 'tool_describe', arguments: { name: 'read_file' } },
  ],
  stopReason: 'toolUse',
  timestamp: 1,
  usage: {
    input: 6000,
    output: 100,
    cacheRead: 5000,
    cacheWrite: 0,
    totalTokens: 11_100,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  },
};
const results: ToolResultMessage[] = [
  {
    role: 'toolResult',
    toolCallId: 'call-b',
    toolName: 'tool_describe',
    content: [
      { type: 'text', text: '{"name":"read_file","parameters":{"path":{"type":"string"}}}' },
    ],
    isError: false,
    timestamp: 2,
  },
  {
    role: 'toolResult',
    toolCallId: 'call-a',
    toolName: 'tool_search',
    content: [
      {
        type: 'text',
        text: '{"tools":[{"name":"read_file","description":"Read a managed file"}]}',
      },
    ],
    isError: false,
    timestamp: 3,
  },
];
const answer: AssistantMessage = {
  ...assistant,
  content: [{ type: 'text', text: 'Found both tools.' }],
  stopReason: 'stop',
  timestamp: 4,
};
const nativeMessages = [assistant, ...results, answer];

function request(replay: unknown): RuntimeExecutionRequest {
  return {
    turnId: 'next-turn',
    sessionId: 'session',
    instructions: 'Be helpful.',
    model: { providerId: model.provider, modelId: model.id },
    options: {},
    tools: [],
    contextCheckpoint: null,
    input: [{ type: 'text', text: 'Continue.' }],
    history: [
      {
        turnId: 'previous-turn',
        replay: parseRuntimeTurnReplay(replay),
        messages: [
          { role: 'user', parts: [{ type: 'text', text: 'Find tools.' }] },
          {
            role: 'assistant',
            parts: [{ type: 'text', text: 'Display summary only.' }],
            contextTokens: 1234,
          },
        ],
      },
    ],
  };
}

/** Exercise the real SDK serializer; stop in onPayload before any HTTP request. */
async function payload(messages: Message[]) {
  let captured: unknown;
  const fetch = jest.fn(() => {
    throw new Error('Unexpected HTTP request');
  });
  await stream(model, normalizeContext({ systemPrompt: 'Be helpful.', messages }), {
    apiKey: 'test-only-key',
    cacheRetention: 'short',
    fetch,
    onPayload(value) {
      captured = value;
      throw new Error('Captured before transport');
    },
  }).result();
  expect(fetch).not.toHaveBeenCalled();
  expect(captured).toBeDefined();
  return JSON.parse(
    JSON.stringify(captured, (key, value) => (key === 'cache_control' ? undefined : value)),
  ) as {
    messages: unknown[];
    system: unknown;
  };
}

test('preserves the already-sent Anthropic prefix after JSON persistence and a fresh turn', async () => {
  const artifact = createPiTurnReplay(nativeMessages);
  expect(artifact).toBeDefined();
  const conversation = toPiConversation(request(JSON.parse(JSON.stringify(artifact))), model);
  const before = await payload([
    { role: 'user', content: 'Find tools.', timestamp: 0 },
    assistant,
    ...results,
  ]);
  const after = await payload([...conversation.history, conversation.prompt]);
  expect(after.system).toEqual(before.system);
  expect(after.messages.slice(0, before.messages.length)).toEqual(before.messages);
  expect(JSON.stringify(after)).toContain('signed-thought');
  expect(JSON.stringify(after)).toContain('encrypted-thought');
  expect(JSON.stringify(after)).not.toContain('Display summary only.');
  expect(conversation.history.map((message) => message.role)).toEqual([
    'user',
    'assistant',
    'toolResult',
    'toolResult',
    'assistant',
  ]);
  expect(conversation.history.at(-1)).toMatchObject({ usage: { totalTokens: 1234 } });
  expect(conversation.history[1]).toMatchObject({ usage: { totalTokens: 0 } });
});

test('preserves original model provenance so the SDK can handle a model switch', () => {
  const conversation = toPiConversation(request(createPiTurnReplay(nativeMessages)), {
    ...model,
    id: 'different-model',
    provider: 'different-provider',
  });
  expect(conversation.history[1]).toMatchObject({
    model: model.id,
    provider: model.provider,
    api: model.api,
  });
});

test.each([undefined, { version: 2, payload: {} }, { version: 1, payload: { kind: 'future' } }])(
  'uses display history for absent or unsupported artifacts: %p',
  (replay) => {
    const conversation = toPiConversation(request(replay), model);
    expect(conversation.historyTurns[0].replayKind).toBeUndefined();
    expect(conversation.history[1]).toMatchObject({
      content: [{ type: 'text', text: 'Display summary only.' }],
    });
  },
);

test('rejects incomplete, orphaned, duplicate and unsupported message batches as a whole', () => {
  expect(createPiTurnReplay([assistant, results[0], answer])).toBeUndefined();
  expect(createPiTurnReplay([results[0], answer])).toBeUndefined();
  expect(
    createPiTurnReplay([assistant, ...results, assistant, ...results, answer]),
  ).toBeUndefined();
  expect(createPiTurnReplay([{ ...assistant, stopReason: 'error' }])).toBeUndefined();
  expect(
    createPiTurnReplay([
      { role: 'user', content: 'Do not persist user attachments', timestamp: 0 },
    ]),
  ).toBeUndefined();
});

test('keeps durable replay beyond the former cache budget and omits provider diagnostics', () => {
  expect(
    createPiTurnReplay([
      { ...answer, content: [{ type: 'text', text: 'x'.repeat(4 * 1024 * 1024) }] },
    ]),
  ).toBeDefined();
  const replay = createPiTurnReplay([
    { ...answer, errorMessage: 'connection-secret', responseId: 'response-id' },
  ]);
  expect(JSON.stringify(replay)).not.toContain('connection-secret');
  expect(readPiTurnReplay(replay)?.[0]).toMatchObject({ responseId: 'response-id' });
  const cyclic: AssistantMessage = { ...answer, content: [] };
  cyclic.content.push({ type: 'toolCall', id: 'cyclic', name: 'tool', arguments: cyclic as never });
  expect(createPiTurnReplay([cyclic])).toBeUndefined();
});
