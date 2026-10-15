import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import type {
  AgentEvent,
  AgentEventStream,
  CompactionResult,
  EntryRecord,
  SnapshotEvent,
  SubmissionId,
  SubmissionRecord,
  TaskId,
} from '@earendil-works/pi-durable';

import { installLogWriter, type LogRecord } from '@/shared/core/logger/LoggerService';

import type { RuntimeConversationEvent, RuntimeDurableTurn } from '../../durableTypes';
import { PiDurableObserver } from '../PiDurableObserver';
import { piSubmissionMetadata } from '../piDurableProjection';
import type { PiDurableRuntime } from '../PiDurableRuntime';

test.each([
  ['pi.compaction', false],
  ['extension.background', false],
  ['pi.generation', true],
  ['pi.tool', true],
] as const)(
  'attributes %s failures to their owned scope while a turn is running',
  async (kind, ownsTurn) => {
    const inputId = 1 as SubmissionId;
    const taskId = 42 as TaskId<CompactionResult>;
    const snapshot: SnapshotEvent = {
      type: 'snapshot',
      run: { inputs: [inputId] },
      entries: [],
      tools: [],
      nestedTools: [],
      compactions: [{ taskId, reason: 'threshold', blocking: false, attempt: 1 }],
      inbox: [],
      agent: {},
      usage: { models: {}, tools: {} },
    };
    const metadata = piSubmissionMetadata(
      {
        requestId: 'request-current',
        turnId: 'turn-current',
        userMessageId: 'user-current',
        assistantMessageId: 'assistant-current',
        createdAt: 1,
        input: [{ type: 'text', text: 'private question' }],
        metadata: {},
      },
      [],
    );
    let advance!: Parameters<AgentEventStream['start']>[0];
    const runtime = {
      watch: async () => ({
        snapshot,
        start: (listener: typeof advance) => {
          advance = listener;
        },
        stop: async () => {},
      }),
      submissions: async () => [
        {
          record: {
            id: inputId,
            conversationId: 1,
            requestId: 'request-current',
            type: 'input',
            status: 'placed',
            entry: 1,
          } as SubmissionRecord,
          metadata,
        },
      ],
      turnEntries: async () => [],
    } as unknown as PiDurableRuntime;
    const records: LogRecord[] = [];
    const dispose = installLogWriter((record) => {
      records.push(record);
    });
    const observer = new PiDurableObserver(runtime, 'session', () => {});
    try {
      const observed = await observer.start();
      expect(observed.activeTurn?.identity.requestId).toBe('request-current');
      await advance(
        [{ type: 'task_failed', taskId, kind, message: 'private internal failure' }],
        BACKGROUND_CONTEXT,
      );
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        level: 'error',
        message: 'Pi durable task failed',
        operation: 'pi.task',
        sessionId: 'session',
        taskId: 42,
        taskKind: kind,
      });
      if (ownsTurn) {
        expect(records[0]).toMatchObject({
          requestId: 'request-current',
          turnId: 'turn-current',
          assistantMessageId: 'assistant-current',
        });
      } else {
        expect(records[0]).not.toHaveProperty('requestId');
        expect(records[0]).not.toHaveProperty('turnId');
        expect(records[0]).not.toHaveProperty('assistantMessageId');
      }
      expect(JSON.stringify(records)).not.toContain('private');
    } finally {
      dispose();
      await observer.stop();
    }
  },
);

test('restores compaction failure, shows progress, and clears failure only after a summary commits', async () => {
  const taskId = 5 as TaskId<CompactionResult>;
  const snapshot: SnapshotEvent = {
    type: 'snapshot',
    entries: [],
    tools: [],
    nestedTools: [],
    compactions: [],
    inbox: [],
    agent: {},
    usage: { models: {}, tools: {} },
    compactionFailure: { taskId, reason: 'threshold', error: 'Provider failed' },
  };
  let advance!: (events: readonly AgentEvent[]) => Promise<void>;
  const runtime = {
    watch: async () => ({
      snapshot,
      start: (listener: typeof advance) => {
        advance = listener;
      },
      stop: async () => {},
    }),
    submissions: async () => [],
  } as unknown as PiDurableRuntime;
  const events: RuntimeConversationEvent[] = [];
  const observer = new PiDurableObserver(runtime, 'session', (event) => events.push(event));
  expect((await observer.start()).contextStatus).toBe('compaction-failed');
  await advance([{ type: 'compaction_start', taskId, reason: 'threshold', blocking: true }]);
  expect(events.at(-1)).toEqual({ type: 'context.updated', status: 'compacting' });
  await advance([{ type: 'compaction_end', taskId, reason: 'threshold' }]);
  expect(events.at(-1)).toEqual({ type: 'context.updated', status: 'compaction-failed' });
  await advance([
    { type: 'entry_appended', entry: { id: 10, kind: 'pi.compaction' } as EntryRecord },
  ]);
  expect(events.at(-1)).toEqual({ type: 'context.updated', status: null });
  await observer.stop();
});

function attach(snapshot: Omit<SnapshotEvent, 'type' | 'agent' | 'usage'>, running = false) {
  const inputId = 1 as SubmissionId;
  const metadata = piSubmissionMetadata(
    {
      requestId: 'request',
      turnId: 'turn',
      userMessageId: 'user',
      assistantMessageId: 'assistant',
      createdAt: 1,
      input: [{ type: 'text', text: 'Question' }],
      metadata: {},
    },
    [],
  );
  let advance!: (events: readonly AgentEvent[]) => Promise<void>;
  const runtime = {
    watch: async () => ({
      snapshot: {
        type: 'snapshot',
        agent: {},
        usage: { models: {}, tools: {} },
        ...snapshot,
        ...(running ? { run: { inputs: [inputId] } } : {}),
      },
      start: (listener: typeof advance) => {
        advance = listener;
      },
      stop: async () => {},
    }),
    submissions: async () =>
      running
        ? [
            {
              record: {
                id: inputId,
                conversationId: 1,
                requestId: 'request',
                type: 'input',
                status: 'placed',
                entry: 1,
              } as SubmissionRecord,
              metadata,
            },
          ]
        : [],
    turnEntries: async () => [],
  } as unknown as PiDurableRuntime;
  const events: RuntimeConversationEvent[] = [];
  const observer = new PiDurableObserver(runtime, 'session', (event) => events.push(event));
  return { observer, events, advance: (batch: readonly AgentEvent[]) => advance(batch) };
}

test('reports blocking compaction only; background compaction never delays the reply', async () => {
  const backgroundId = 5 as TaskId<CompactionResult>;
  const blockingId = 6 as TaskId<CompactionResult>;
  const { observer, events, advance } = attach({
    entries: [],
    tools: [],
    nestedTools: [],
    compactions: [{ taskId: backgroundId, reason: 'threshold', blocking: false, attempt: 1 }],
    inbox: [],
  });
  try {
    expect((await observer.start()).contextStatus).toBeNull();
    await advance([
      { type: 'compaction_start', taskId: blockingId, reason: 'threshold', blocking: true },
    ]);
    expect(events.at(-1)).toEqual({ type: 'context.updated', status: 'compacting' });
    await advance([{ type: 'compaction_end', taskId: blockingId, reason: 'threshold' }]);
    expect(events.at(-1)).toEqual({ type: 'context.updated', status: null });
    const reported = events.length;
    await advance([{ type: 'compaction_end', taskId: backgroundId, reason: 'threshold' }]);
    expect(events).toHaveLength(reported);
  } finally {
    await observer.stop();
  }
});

test('marks a running turn as retrying until the next provider attempt produces output', async () => {
  const response = (stopReason: 'error' | 'stop', timestamp: number) =>
    ({
      role: 'assistant',
      content: [],
      api: 'openai-completions',
      provider: 'provider',
      model: 'model',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
      stopReason,
      ...(stopReason === 'error' ? { errorMessage: 'Request timed out' } : {}),
      timestamp,
    }) as unknown as AssistantMessage;
  const { observer, events, advance } = attach(
    { entries: [], tools: [], nestedTools: [], compactions: [], inbox: [] },
    true,
  );
  const latestTurn = () =>
    events.findLast((event) => event.type === 'turn.updated')?.turn as RuntimeDurableTurn;
  try {
    expect((await observer.start()).activeTurn?.isRetrying).toBeUndefined();
    // Pi reports the retry before the failed attempt's own message in the same batch.
    const failed = response('error', 2);
    await advance([
      { type: 'auto_retry_start', attempt: 1, at: 3, errorMessage: 'Request timed out' },
      { type: 'message_start', message: failed },
      { type: 'message_end', entry: { id: 2, model: [failed] } as unknown as EntryRecord },
    ]);
    expect(latestTurn()).toMatchObject({ status: 'running', isRetrying: true });
    await advance([{ type: 'auto_retry_end', attempt: 1 }]);
    expect(latestTurn().isRetrying).toBe(true);
    await advance([{ type: 'message_start', message: response('stop', 4) }]);
    expect(latestTurn().isRetrying).toBeUndefined();
  } finally {
    await observer.stop();
  }
});
