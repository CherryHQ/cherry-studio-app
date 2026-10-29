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
  TaskGraph,
  TaskGraphWatch,
  ConversationId,
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
      watchWork: async () => ({ value: { tasks: {} }, start: () => {}, stop: async () => {} }),
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
    const observer = new PiDurableObserver(runtime, { sessionId: 'session', slot: 0 }, () => {});
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
    watchWork: async () => ({ value: { tasks: {} }, start: () => {}, stop: async () => {} }),
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
  const observer = new PiDurableObserver(runtime, { sessionId: 'session', slot: 0 }, (event) =>
    events.push(event),
  );
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

function attach(
  snapshot: Omit<SnapshotEvent, 'type' | 'agent' | 'usage'>,
  running = false,
  tasks: TaskGraph = { tasks: {} },
) {
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
  let advanceWork!: Parameters<TaskGraphWatch['start']>[0];
  const runtime = {
    watchWork: async () => ({
      value: tasks,
      start: (listener: typeof advanceWork) => {
        advanceWork = listener;
      },
      stop: async () => {},
    }),
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
  const observer = new PiDurableObserver(runtime, { sessionId: 'session', slot: 0 }, (event) =>
    events.push(event),
  );
  return {
    observer,
    events,
    advance: (batch: readonly AgentEvent[]) => advance(batch),
    advanceWork: (graph: TaskGraph) => advanceWork(graph, [], BACKGROUND_CONTEXT),
  };
}

test('applies streamed changes without mutating earlier snapshots or newly supplied blocks', async () => {
  const message: AssistantMessage = {
    role: 'assistant',
    api: 'openai-completions',
    provider: 'provider',
    model: 'model',
    content: [
      { type: 'text', text: 'Answer' },
      { type: 'thinking', thinking: 'Reason' },
    ],
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
  const block = {
    type: 'toolCall' as const,
    id: 'call',
    name: 'custom_tool',
    arguments: { rows: [{ text: 'A' }, { text: 'B' }], other: { text: 'Kept' } },
  };
  const { observer, events, advance } = attach(
    {
      entries: [],
      tools: [],
      nestedTools: [],
      compactions: [],
      inbox: [],
      generation: { attempt: 0, message },
    },
    true,
  );
  const latestTurn = () => events.findLast((event) => event.type === 'turn.updated')!.turn;
  try {
    const initial = (await observer.start()).activeTurn!;
    await advance([
      {
        type: 'message_update',
        usage: message.usage,
        changes: [
          { type: 'text_delta', contentIndex: 0, delta: ' one' },
          { type: 'thinking_delta', contentIndex: 1, delta: ' more' },
          { type: 'toolcall_start', contentIndex: 2, block },
          { type: 'toolcall_delta', contentIndex: 2, path: ['rows', 0, 'text'], delta: '1' },
          { type: 'toolcall_delta', contentIndex: 2, path: ['rows', 0, 'text'], delta: '2' },
        ],
      },
    ]);
    const first = latestTurn();
    expect(first.parts).toMatchObject([
      { type: 'text', text: 'Answer one' },
      { type: 'reasoning', text: 'Reason more' },
      { type: 'tool', input: { rows: [{ text: 'A12' }, { text: 'B' }], other: { text: 'Kept' } } },
    ]);
    await advance([
      {
        type: 'message_update',
        usage: message.usage,
        changes: [
          { type: 'text_delta', contentIndex: 0, delta: ' two' },
          { type: 'toolcall_delta', contentIndex: 2, path: ['rows', 1, 'text'], delta: '3' },
        ],
      },
    ]);
    expect(latestTurn().parts).toMatchObject([
      { type: 'text', text: 'Answer one two' },
      { type: 'reasoning', text: 'Reason more' },
      { type: 'tool', input: { rows: [{ text: 'A12' }, { text: 'B3' }] } },
    ]);
    expect(first.parts[0]).toMatchObject({ text: 'Answer one' });
    expect(first.parts[2]).toMatchObject({ input: { rows: [{ text: 'A12' }, { text: 'B' }] } });
    expect(initial.parts).toMatchObject([
      { type: 'text', text: 'Answer' },
      { type: 'reasoning', text: 'Reason' },
    ]);
    expect(message.content).toEqual([
      { type: 'text', text: 'Answer' },
      { type: 'thinking', thinking: 'Reason' },
    ]);
    expect(block.arguments).toEqual({
      rows: [{ text: 'A' }, { text: 'B' }],
      other: { text: 'Kept' },
    });
  } finally {
    await observer.stop();
  }
});

test('records compaction tasks separately from committed summaries and keeps private errors out of logs', async () => {
  const { observer, advance } = attach({
    entries: [],
    tools: [],
    nestedTools: [],
    compactions: [],
    inbox: [],
  });
  const taskId = 42 as TaskId<CompactionResult>;
  const records: LogRecord[] = [];
  const dispose = installLogWriter((record) => records.push(record));
  try {
    await observer.start();
    await advance([{ type: 'compaction_start', taskId, reason: 'overflow', blocking: true }]);
    await advance([
      { type: 'compaction_end', taskId, reason: 'overflow', error: 'private provider response' },
    ]);
    await advance([{ type: 'compaction_start', taskId, reason: 'threshold', blocking: false }]);
    await advance([{ type: 'compaction_end', taskId, reason: 'threshold' }]);
    await advance([
      {
        type: 'entry_appended',
        entry: {
          id: 10,
          kind: 'pi.compaction',
          data: { reason: 'threshold' },
        } as unknown as EntryRecord,
      },
    ]);
    const compactions = records.filter(
      (record) => record.message === 'Pi durable context compaction',
    );
    expect(compactions.map((record) => record.outcome)).toEqual([
      'started',
      'failed',
      'started',
      'ended',
      'committed',
    ]);
    expect(compactions[1]).toMatchObject({ taskId: 42, reasonCode: 'overflow', blocking: true });
    expect(compactions.at(-1)).toMatchObject({
      entryId: 10,
      reasonCode: 'threshold',
      sessionId: 'session',
      slot: 0,
    });
    expect(compactions.every((record) => record.turnId === undefined)).toBe(true);
    expect(JSON.stringify(records)).not.toContain('private');
  } finally {
    dispose();
    await observer.stop();
  }
});

test('restores a parked turn and clears its pause when the task can run again', async () => {
  const tasks: TaskGraph = {
    tasks: {
      '42': {
        id: 42 as TaskId,
        kind: 'pi.generation',
        conversationId: 1 as ConversationId,
        background: false,
        abortRequested: false,
        conversations: [],
        blocked: 'restart_limit',
        state: { status: 'pending', phase: 'generate' },
      },
    },
  };
  const { observer, events, advanceWork } = attach(
    { entries: [], tools: [], nestedTools: [], compactions: [], inbox: [] },
    true,
    tasks,
  );
  try {
    expect((await observer.start()).activeTurn).toMatchObject({
      status: 'running',
      isPaused: true,
    });
    await advanceWork({ tasks: { '42': { ...tasks.tasks['42']!, blocked: undefined } } });
    expect(events.at(-1)).toMatchObject({ type: 'turn.updated', turn: { isPaused: false } });
    await advanceWork({ tasks: { '42': { ...tasks.tasks['42']!, background: true } } });
    expect(events).toHaveLength(1);
    await advanceWork({ tasks: { '42': { ...tasks.tasks['42']!, kind: 'pi.compaction' } } });
    expect(events).toHaveLength(1);
    await advanceWork({
      tasks: {
        '42': { ...tasks.tasks['42']!, blocked: undefined },
        '43': {
          ...tasks.tasks['42']!,
          id: 43 as TaskId,
          kind: 'pi.tool',
          owner: 42 as TaskId,
          conversationId: 2 as ConversationId,
        },
      },
    });
    expect(events.at(-1)).toMatchObject({ type: 'turn.updated', turn: { isPaused: true } });
    await advanceWork(tasks);
    expect(events.at(-1)).toMatchObject({ type: 'turn.updated', turn: { isPaused: true } });
  } finally {
    await observer.stop();
  }
});

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

test.each(['message_start', 'message_update', 'message_end'] as const)(
  'keeps retry feedback until content arrives in %s',
  async (contentEvent) => {
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
      const failed: AssistantMessage = {
        ...response('error', 2),
        content: [{ type: 'text', text: 'Interrupted response' }],
      };
      await advance([
        { type: 'auto_retry_start', attempt: 1, at: 3, errorMessage: 'Request timed out' },
        { type: 'message_start', message: failed },
        { type: 'message_end', entry: { id: 2, model: [failed] } as unknown as EntryRecord },
      ]);
      expect(latestTurn()).toMatchObject({ status: 'running', isRetrying: true });
      await advance([{ type: 'auto_retry_end', attempt: 1 }]);
      expect(latestTurn().isRetrying).toBe(true);
      const next = {
        ...response('stop', 4),
        content: [
          { type: 'text' as const, text: contentEvent === 'message_start' ? 'Resumed' : '' },
        ],
      };
      await advance([{ type: 'message_start', message: next }]);
      if (contentEvent !== 'message_start') {
        expect(latestTurn().isRetrying).toBe(true);
      }
      if (contentEvent === 'message_update') {
        await advance([
          {
            type: 'message_update',
            usage: next.usage,
            changes: [
              {
                type: 'message',
                message: { ...next, content: [{ type: 'text', text: 'Resumed' }] },
              },
            ],
          },
        ]);
      } else if (contentEvent === 'message_end') {
        // The final partial was throttled away, but the committed response starts a tool round.
        const completed: AssistantMessage = {
          ...next,
          stopReason: 'toolUse',
          content: [{ type: 'toolCall', id: 'call', name: 'ask_user_question', arguments: {} }],
        };
        await advance([
          {
            type: 'message_end',
            entry: { id: 3, model: [completed] } as unknown as EntryRecord,
          },
        ]);
        expect(latestTurn()).toMatchObject({
          status: 'running',
          parts: [
            { type: 'text', text: 'Interrupted response' },
            { type: 'tool', toolCallId: 'call', state: 'input-available' },
          ],
        });
      }
      expect(latestTurn().isRetrying).toBeUndefined();
    } finally {
      await observer.stop();
    }
  },
);
