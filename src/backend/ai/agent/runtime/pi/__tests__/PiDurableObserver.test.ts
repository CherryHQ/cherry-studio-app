import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type {
  AgentEventStream,
  SnapshotEvent,
  SubmissionId,
  SubmissionRecord,
  TaskId,
} from '@earendil-works/pi-durable';

import { installLogWriter, type LogRecord } from '@/shared/core/logger/LoggerService';

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
    const taskId = 42 as TaskId;
    const snapshot: SnapshotEvent = {
      type: 'snapshot',
      run: { inputs: [inputId] },
      entries: [],
      tools: [],
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
