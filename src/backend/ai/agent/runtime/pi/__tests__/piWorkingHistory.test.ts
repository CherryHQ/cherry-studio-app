import type { Api, AssistantMessage, Message, Model } from '@earendil-works/pi-ai';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
import { CompactionEntry, ResetEntry, UserEntry } from '@earendil-works/pi-durable';

import { installLogWriter, type LogRecord } from '@/shared/core/logger/LoggerService';

import { formatMessageQuote } from '../../../host/turnRuntimeInput';
import type { RuntimeExecutionRequest } from '../../types';
import { PI_CONTEXT_CHECKPOINT_KIND } from '../piLegacyCheckpoint';
import type { PiStreamFn } from '../piModelTypes';
import { emptyAssistantMessage } from '../piStreamEvents';
import { applyPiWebReplay, projectPiWebReplayForImport, readPiWebResult } from '../PiWebResponse';
import { createPiContextCheckpoint, createWorkingPiEntries } from '../piWorkingHistory';

const model: Model<Api> = {
  id: 'model',
  provider: 'provider',
  api: 'openai-responses',
  name: 'Model',
  baseUrl: '',
  contextWindow: 32768,
  maxTokens: 4096,
  input: ['text'],
  reasoning: false,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

function request(): RuntimeExecutionRequest {
  return {
    sessionId: 'session',
    turnId: 'new-turn',
    model: { providerId: 'provider', modelId: 'model' },
    instructions: 'Help the user.',
    input: [{ type: 'text', text: 'New input, not imported.' }],
    history: [
      {
        turnId: 'recent',
        messages: [
          { role: 'user', parts: [{ type: 'text', text: 'Keep the blue theme.' }] },
          { role: 'assistant', parts: [{ type: 'text', text: 'Agreed.' }] },
        ],
      },
    ],
    contextCheckpoint: {
      version: 1,
      anchorTurnId: 'summarized',
      payload: {
        kind: PI_CONTEXT_CHECKPOINT_KIND,
        summary: 'Earlier preferences.',
        tokensBefore: 8000,
      },
    },
    options: {},
    tools: [],
  };
}

describe('Cherry history working-copy import', () => {
  test('round-trips signed active context and imports only the following Cherry tail', () => {
    const signed: AssistantMessage = {
      ...emptyAssistantMessage(model),
      content: [{ type: 'thinking', thinking: 'Retained thought', thinkingSignature: 'signature' }],
    };
    const input = request();
    input.contextCheckpoint = createPiContextCheckpoint('summarized', [signed]);
    const entries = createWorkingPiEntries(input, model);
    expect(entries[0]).toEqual({ kind: ResetEntry.kind, head: 'self' });
    expect(entries[1]?.model).toEqual([signed]);
    expect(entries[2]?.model?.[0]).toMatchObject({ content: 'Keep the blue theme.' });
    expect(entries).toHaveLength(4);
    signed.content.length = 0;
    expect(entries[1]?.model?.[0]).toMatchObject({
      content: [{ thinkingSignature: 'signature' }],
    });
  });

  test('persists an empty reset context and rejects oversized checkpoints without trimming history', () => {
    const input = request();
    input.contextCheckpoint = createPiContextCheckpoint('summarized', []);
    expect(createWorkingPiEntries(input, model)[0]).toEqual({
      kind: ResetEntry.kind,
      head: 'self',
    });
    expect(
      createPiContextCheckpoint('summarized', [
        { role: 'user', content: 'x'.repeat(256 * 1024), timestamp: 0 },
      ]),
    ).toBeNull();
    input.contextCheckpoint = null;
    input.history[0].messages[0].parts = [{ type: 'text', text: 'x'.repeat(300_000) }];
    expect(createWorkingPiEntries(input, model)[0]?.model?.[0]).toMatchObject({
      content: 'x'.repeat(300_000),
    });
  });

  test('rejects malformed new context payloads instead of importing a truncated transcript', () => {
    const input = request();
    input.contextCheckpoint!.payload = { kind: 'pi-durable-context-v1', messages: [null] };
    expect(() => createWorkingPiEntries(input, model)).toThrow('invalid message');
  });
  test('reuses a saved summary and preserves the original recent tail without admitting new input', () => {
    const entries = createWorkingPiEntries(request(), model);
    expect(entries[0]).toMatchObject({ kind: CompactionEntry.kind, head: 'self' });
    expect(entries[0]?.model?.[0]).toMatchObject({
      content: expect.stringContaining('Earlier preferences.'),
    });
    expect(entries[1]).toMatchObject({
      kind: UserEntry.kind,
      model: [{ content: 'Keep the blue theme.' }],
    });
    expect(entries).toHaveLength(3);
    expect(JSON.stringify(entries)).not.toContain('New input, not imported.');
  });

  test('retains a whole reconstructed turn when a split offset addressed the unavailable native replay', () => {
    const input = request();
    input.contextCheckpoint!.payload = {
      kind: PI_CONTEXT_CHECKPOINT_KIND,
      summary: 'Earlier preferences.',
      tokensBefore: 8000,
      resume: { turnId: 'recent', messageOffset: 1, replayKind: 'pi-turn-replay-v1' },
    };
    const entries = createWorkingPiEntries(input, model);
    expect(entries[1]?.model?.[0]).toMatchObject({ content: 'Keep the blue theme.' });
    expect(entries).toHaveLength(3);
  });

  test('refuses a corrupt summary or a missing split point instead of losing a trimmed prefix', () => {
    const input = request();
    input.contextCheckpoint!.payload = { kind: PI_CONTEXT_CHECKPOINT_KIND, summary: '' };
    expect(() => createWorkingPiEntries(input, model)).toThrow('valid saved context checkpoint');
    input.contextCheckpoint!.payload = {
      kind: PI_CONTEXT_CHECKPOINT_KIND,
      summary: 'Earlier preferences.',
      tokensBefore: 8000,
      resume: { turnId: 'missing-turn', messageOffset: 1 },
    };
    expect(() => createWorkingPiEntries(input, model)).toThrow('split point is missing');
  });
});

test('checkpoint reconstruction leaves already-materialized quote envelopes byte-identical', () => {
  const text = formatMessageQuote('Request', [
    { id: 'q', sourceMessageId: '00000000-0000-7000-8000-000000000001', text: 'Snapshot' },
  ]);
  const input = request();
  input.contextCheckpoint = createPiContextCheckpoint('summarized', [
    { role: 'user', content: text, timestamp: 0 },
  ]);
  const entries = createWorkingPiEntries(input, model);
  expect(entries[1]?.model?.[0]).toMatchObject({ content: text });
  expect(JSON.stringify(entries).match(/> Snapshot/g)).toHaveLength(1);
});

const anthropic = {
  ...model,
  api: 'anthropic-messages' as const,
  provider: 'custom',
  id: 'opus-5.5',
  baseUrl: 'https://provider.test',
};
const call = {
  type: 'toolCall' as const,
  id: 'call-1',
  name: 'lookup',
  arguments: { query: 'deploy' },
  thoughtSignature: 'keep-tool-signature',
};
const thinking: AssistantMessage['content'] = [
  { type: 'thinking', thinking: 'private-signed', thinkingSignature: 'secret-signature' },
  { type: 'thinking', thinking: 'private-unsigned' },
  { type: 'thinking', thinking: 'private-empty', thinkingSignature: '' },
  { type: 'thinking', thinking: '', redacted: true, thinkingSignature: 'secret-ciphertext' },
];
function anthropicMessage(content: AssistantMessage['content']): AssistantMessage {
  return { ...emptyAssistantMessage(anthropic), content, stopReason: 'toolUse' };
}
function importMessages(messages: Message[], direct = false) {
  const input = request();
  input.history = [];
  input.contextCheckpoint = direct
    ? {
        version: 1,
        anchorTurnId: 'old',
        payload: JSON.parse(JSON.stringify({ kind: 'pi-durable-context-v1', messages })),
      }
    : createPiContextCheckpoint('old', messages);
  return { input, entries: createWorkingPiEntries(input, model) };
}

describe('Anthropic checkpoint projection', () => {
  test('imports persisted Anthropic history in order without thinking or checkpoint mutation', () => {
    const user: Message = { role: 'user', content: 'Find deploy', timestamp: 0 };
    const text = { type: 'text' as const, text: 'Looking up.' };
    const mixed = anthropicMessage([...thinking, text, call]);
    const result: Message = {
      role: 'toolResult',
      toolCallId: call.id,
      toolName: call.name,
      content: [{ type: 'text', text: 'Found' }],
      isError: false,
      timestamp: 0,
    };
    const final = {
      ...anthropicMessage([{ type: 'text', text: 'Done' }]),
      stopReason: 'stop' as const,
    };
    const snapshot = JSON.parse(
      JSON.stringify({ kind: 'pi-durable-context-v1', messages: [user, mixed, result, final] }),
    );
    const { input, entries } = importMessages([user, mixed, result, final], true);
    const payload = input.contextCheckpoint!.payload;
    const again = createWorkingPiEntries(input, { ...model, api: 'cherry' });
    expect(entries).toEqual(again);
    expect(entries[0]).toEqual({ kind: ResetEntry.kind, head: 'self' });
    expect(entries.slice(1).map((entry) => entry.model)).toEqual([
      [user],
      [{ ...mixed, content: [text, call] }],
      [result],
      [final],
    ]);
    const saved = (payload as unknown as { messages: Message[] }).messages;
    expect(entries[2]!.model![0]).not.toBe(saved[1]);
    expect(entries[2]!.model![0]!.content).not.toBe(saved[1]!.content);
    expect(payload).toEqual(snapshot);
  });

  test('omits thinking-only assistants but keeps reset and call-only continuations', () => {
    const only = importMessages([anthropicMessage(thinking)]);
    expect(only.entries).toEqual([{ kind: ResetEntry.kind, head: 'self' }]);
    const mixed = anthropicMessage([...thinking, call]);
    expect(importMessages([mixed]).entries[1]!.model).toEqual([{ ...mixed, content: [call] }]);
  });

  test('preserves clean, non-Anthropic and string content and web helper identity', () => {
    const clean = anthropicMessage([{ type: 'text', text: 'Clean' }]);
    expect(projectPiWebReplayForImport(clean)).toBe(clean);
    const foreign = { ...anthropicMessage(thinking), api: 'google-generative-ai' as const };
    const string = { ...clean, content: 'legacy string' } as unknown as AssistantMessage;
    expect(
      importMessages([clean, foreign, string])
        .entries.slice(1)
        .map((entry) => entry.model),
    ).toEqual([[clean], [foreign], [string]]);
  });

  function webMessage() {
    return {
      ...anthropicMessage([
        thinking[0]!,
        { type: 'text', text: 'Answer' },
        thinking[3]!,
        { type: 'text', text: '(lookup web-id; sources)' },
        call,
      ]),
      diagnostics: [
        { type: 'other', timestamp: 1, details: { extra: 'keep' } },
        {
          type: 'cherry.web',
          timestamp: 2,
          details: {
            version: 1,
            id: 'web-id',
            sources: [{ sourceId: 's1', url: 'https://example.com', title: 'Source' }],
            failed: false,
            unknown: { keep: true },
            texts: [
              { contentIndex: 0, text: 'private-display' },
              { contentIndex: 1, text: 'Cited answer', extra: 'keep-text-metadata' },
            ],
            replayIndex: 3,
            anthropicContent: [
              { type: 'thinking', thinking: 'private-raw', signature: 'secret-raw-signature' },
              {
                type: 'server_tool_use',
                id: 'server1',
                name: 'web_search',
                input: { query: 'deploy' },
              },
              { type: 'redacted_thinking', data: 'secret-raw-ciphertext' },
              { type: 'web_search_tool_result', tool_use_id: 'server1', content: [] },
              {
                type: 'web_fetch_tool_result',
                tool_use_id: 'server2',
                content: { document: 'keep' },
              },
              {
                type: 'text',
                text: 'Answer',
                citations: [{ type: 'web_search_result_location', url: 'https://example.com' }],
              },
              { type: 'document', source: { type: 'text', data: 'Document' } },
              { type: 'tool_use', id: 'call-1', name: 'lookup', input: { query: 'deploy' } },
            ],
          },
        },
      ],
    } as AssistantMessage;
  }

  test('projects Pi indices without introducing absent raw web content', () => {
    const original: AssistantMessage = {
      ...anthropicMessage([
        thinking[0]!,
        { type: 'text', text: 'Answer' },
        { type: 'text', text: '(lookup web-id; sources)' },
      ]),
      diagnostics: [
        {
          type: 'cherry.web',
          timestamp: 2,
          details: {
            version: 1,
            id: 'web-id',
            sources: [{ sourceId: 's1', url: 'https://example.com' }],
            failed: false,
            texts: [
              { contentIndex: 0, text: 'private-display' },
              { contentIndex: 1, text: 'Cited answer' },
              { contentIndex: 2, text: 'Source facts' },
            ],
            replayIndex: 2,
          },
        },
      ],
    };
    const { input, entries } = importMessages([original], true);
    const message = entries[1]!.model![0] as AssistantMessage;
    expect(message.content).toEqual(original.content.slice(1));
    expect(message.diagnostics![0]!.details).toEqual({
      ...original.diagnostics![0]!.details,
      texts: [
        { contentIndex: 0, text: 'Cited answer' },
        { contentIndex: 1, text: 'Source facts' },
      ],
      replayIndex: 1,
    });
    expect(message.diagnostics![0]!.details).not.toHaveProperty('anthropicContent');
    expect(input.contextCheckpoint!.payload).toEqual({
      kind: 'pi-durable-context-v1',
      messages: [original],
    });
  });

  test('projects raw web replay and Pi indices without losing protocol or metadata, through real serialization', async () => {
    const original = webMessage();
    const input = request();
    input.history = [];
    input.contextCheckpoint = createPiContextCheckpoint('old', [original]);
    const snapshot = JSON.parse(JSON.stringify(input.contextCheckpoint!.payload));
    const entries = createWorkingPiEntries(input, model);
    const message = entries[1]!.model![0] as AssistantMessage;
    const expectedRaw = readPiWebResult(original)!.anthropicContent!.filter(
      (block) => block.type !== 'thinking' && block.type !== 'redacted_thinking',
    );
    expect(readPiWebResult(message)).toEqual({
      ...readPiWebResult(original),
      anthropicContent: expectedRaw,
      texts: [{ contentIndex: 0, text: 'Cited answer' }],
      replayIndex: 1,
    });
    expect(message.diagnostics![0]).toEqual(original.diagnostics![0]);
    expect(message.diagnostics![1]).toEqual({
      ...original.diagnostics![1],
      details: {
        ...original.diagnostics![1]!.details,
        anthropicContent: expectedRaw,
        texts: [{ contentIndex: 0, text: 'Cited answer', extra: 'keep-text-metadata' }],
        replayIndex: 1,
      },
    });
    expect(input.contextCheckpoint!.payload).toEqual(snapshot);
    expect(createWorkingPiEntries(input, model)).toEqual(entries);
    expect(projectPiWebReplayForImport(message)).toBe(message);
    const { streamSimple } = jest.requireActual<{ streamSimple: PiStreamFn }>(
      '@earendil-works/pi-ai/api/anthropic-messages',
    );
    let captured: { messages: { content: unknown[] }[] } | undefined;
    const stream = streamSimple(
      anthropic,
      normalizeContext({
        messages: [{ role: 'system', content: 'new prefix', timestamp: 0 }, message],
      }),
      {
        apiKey: 'test',
        maxRetries: 0,
        onPayload: (payload) => applyPiWebReplay(payload, anthropic, [message]),
        fetch: async (_url, init) => {
          captured = JSON.parse(String(init?.body));
          return new Response(JSON.stringify({ error: { message: 'captured' } }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      },
    );
    await (await stream).result();
    expect(captured!.messages[0]!.content).toEqual(expectedRaw);
  });

  test('logs one count-only record per nonzero projection and stays silent for clean or other APIs', () => {
    const records: LogRecord[] = [];
    const restore = installLogWriter((record) => records.push(record));
    try {
      const { input } = importMessages([anthropicMessage(thinking), webMessage()]);
      createWorkingPiEntries(input, model);
      importMessages([anthropicMessage([{ type: 'text', text: 'clean' }])]);
      importMessages([{ ...webMessage(), api: 'openai-responses' }]);
      expect(records).toHaveLength(2);
      for (const record of records) {
        expect(record).toEqual({
          timestamp: expect.any(String),
          level: 'info',
          module: 'piWorkingHistory',
          process: 'main',
          message: 'Sanitized checkpoint projection',
          droppedThinkingBlocks: 6,
          droppedRawThinkingBlocks: 2,
          droppedAssistantMessages: 1,
        });
        expect(JSON.stringify(record)).not.toMatch(
          /private|secret|deploy|lookup|ciphertext|signature/i,
        );
      }
    } finally {
      restore();
    }
  });
});
