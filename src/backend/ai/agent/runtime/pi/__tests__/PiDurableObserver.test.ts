import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
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

import type { RuntimeConversationEvent } from '../../durableTypes';
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

test('restores background compaction and reports blocking progress only while a reply waits', async () => {
  const backgroundId = 5 as TaskId<CompactionResult>;
  const blockingId = 6 as TaskId<CompactionResult>;
  const snapshot: SnapshotEvent = {
    type: 'snapshot',
    entries: [],
    tools: [],
    nestedTools: [],
    compactions: [{ taskId: backgroundId, reason: 'threshold', blocking: false, attempt: 1 }],
    inbox: [],
    agent: {},
    usage: { models: {}, tools: {} },
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
  try {
    expect((await observer.start()).contextStatus).toBe('compacting-background');
    await advance([
      { type: 'compaction_start', taskId: blockingId, reason: 'threshold', blocking: true },
    ]);
    expect(events.at(-1)).toEqual({ type: 'context.updated', status: 'compacting' });
    await advance([{ type: 'compaction_end', taskId: blockingId, reason: 'threshold' }]);
    expect(events.at(-1)).toEqual({ type: 'context.updated', status: 'compacting-background' });
    await advance([{ type: 'compaction_end', taskId: backgroundId, reason: 'threshold' }]);
    expect(events.at(-1)).toEqual({ type: 'context.updated', status: null });
  } finally {
    await observer.stop();
  }
});
