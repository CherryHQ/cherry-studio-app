import type {
  AgentEvent,
  CompactionResult,
  EntryRecord,
  SnapshotEvent,
  TaskId,
} from '@earendil-works/pi-durable';

import type { RuntimeConversationEvent } from '../../durableTypes';
import { PiDurableObserver } from '../PiDurableObserver';
import type { PiDurableRuntime } from '../PiDurableRuntime';

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
