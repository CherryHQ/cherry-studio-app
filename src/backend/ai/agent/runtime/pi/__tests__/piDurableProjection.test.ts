import type { AssistantMessage } from '@earendil-works/pi-ai';
import type { EntryRecord, SubmissionRecord } from '@earendil-works/pi-durable';

import { projectPiTurn } from '../piDurableProjection';

const writeFile = {
  ref: { source: 'builtin' as const, capabilityId: 'write_file' },
  providerName: 'write_file',
  displayName: 'Write file',
  description: 'Write a file.',
  inputSchema: {},
  inputPreview: { textField: 'content', nameField: 'filename' },
  approval: 'auto' as const,
};
const metadata = {
  kind: 'cherry.input',
  version: 1,
  requestId: 'request',
  turnId: 'turn',
  userMessageId: 'user',
  assistantMessageId: 'assistant',
  createdAt: 1_000,
  metadata: {},
  tools: [writeFile],
};
const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function call(content: string, timestamp: number, durationMs?: number): AssistantMessage {
  return {
    role: 'assistant',
    api: 'cherry',
    provider: 'provider',
    model: 'model',
    content: [
      {
        type: 'toolCall',
        id: 'call',
        name: 'write_file',
        arguments: { filename: 'notes.md', content },
      },
    ],
    stopReason: 'toolUse',
    timestamp,
    ...(durationMs !== undefined ? { durationMs } : {}),
    usage,
  };
}

describe('Pi turn projection', () => {
  test('recovered terminal inputs settle tool calls that have no result entry', () => {
    const turn = projectPiTurn({
      sessionId: 'session',
      metadata,
      record: {
        id: 1,
        type: 'input',
        status: 'unanswered',
        entry: 1,
        reason: 'interrupted',
      } as unknown as SubmissionRecord,
      entries: [
        { id: 2, conversationId: 1, kind: 'pi.assistant', model: [call('body', 2_000)] },
      ] as unknown as EntryRecord[],
    });
    expect(turn.status).toBe('interrupted');
    expect(turn.parts[0]).toMatchObject({
      type: 'tool',
      state: 'interrupted',
      input: { filename: 'notes.md', content: 'body' },
      output: { value: { status: 'interrupted' }, artifacts: [] },
    });
  });

  test('streams a bounded file preview instead of the growing tool input', () => {
    const record = {
      id: 1,
      type: 'input',
      status: 'placed',
      entry: 1,
    } as unknown as SubmissionRecord;
    const turn = projectPiTurn({
      sessionId: 'session',
      record,
      metadata,
      entries: [],
      active: true,
      partial: call('# Notes\nfirst line', 2_000),
    });
    expect(turn.parts).toEqual([
      expect.objectContaining({
        type: 'tool',
        state: 'input-streaming',
        inputPreview: { text: '# Notes\nfirst line', truncated: false, name: 'notes.md' },
      }),
    ]);
    expect(turn.parts[0]).not.toHaveProperty('input');
    expect(turn.timing).toEqual({ startedAt: 2_000, tools: [] });
  });

  test('settled calls keep their input and time each tool from its monotonic duration', () => {
    const record = {
      id: 1,
      type: 'input',
      status: 'done',
      entry: 1,
      answer: 4,
    } as unknown as SubmissionRecord;
    const entries = [
      { id: 2, conversationId: 1, kind: 'pi.assistant', model: [call('body', 2_000, 500)] },
      {
        id: 3,
        conversationId: 1,
        kind: 'pi.tool-result',
        data: { diagnostics: [] },
        model: [
          {
            role: 'toolResult',
            toolCallId: 'call',
            toolName: 'write_file',
            content: [{ type: 'text', text: 'saved' }],
            isError: false,
            timestamp: 4_000,
            durationMs: 300,
          },
        ],
      },
      {
        id: 4,
        conversationId: 1,
        kind: 'pi.assistant',
        model: [
          {
            ...call('unused', 5_000, 1_000),
            content: [{ type: 'text', text: 'Done' }],
            stopReason: 'stop',
          },
        ],
      },
    ] as unknown as EntryRecord[];
    const turn = projectPiTurn({ sessionId: 'session', record, metadata, entries });
    expect(turn.status).toBe('completed');
    expect(turn.parts[0]).toEqual(
      expect.objectContaining({
        type: 'tool',
        input: { filename: 'notes.md', content: 'body' },
      }),
    );
    expect(turn.parts[0]).not.toHaveProperty('inputPreview');
    expect(turn.timing).toEqual({
      startedAt: 2_000,
      completedAt: 6_000,
      tools: [{ toolCallId: 'call', toolName: 'write_file', startedAt: 3_700, completedAt: 4_000 }],
    });
  });
});
