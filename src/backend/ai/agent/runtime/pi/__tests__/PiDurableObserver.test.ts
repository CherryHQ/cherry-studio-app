import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import type {
  CompactionResult,
  ConversationId,
  ConversationView,
  EntryId,
  EntryRecord,
  LiveState,
  SubmissionId,
  SubmissionRecord,
  TaskId,
  WatchHandle,
} from '@earendil-works/pi-durable';

import { installLogWriter, type LogRecord } from '@/shared/core/logger/LoggerService';

import type { RuntimeConversationEvent, RuntimeDurableTurn } from '../../durableTypes';
import { PiDurableObserver } from '../PiDurableObserver';
import { detachedJson, piSubmissionMetadata } from '../piDurableProjection';
import type { PiDurableRuntime } from '../PiDurableRuntime';

const inputId = 1 as SubmissionId;
const taskId = 42 as TaskId;
const conversationId = 1 as ConversationId;
const run = { inputs: [inputId], taskId, turns: 0 };

function response(text: string) {
  return {
    role: 'assistant',
    api: 'openai-completions',
    provider: 'provider',
    model: 'model',
    content: [{ type: 'text', text }],
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
  } satisfies AssistantMessage;
}

function entry(id: number, text: string): EntryRecord {
  return { id: id as EntryId, conversationId, kind: 'pi.assistant', model: [response(text)] };
}

function input(id = 1): Extract<SubmissionRecord, { type: 'input'; status: 'placed' }> {
  return {
    id: id as SubmissionId,
    conversationId,
    requestId: `request-${id}`,
    type: 'input',
    status: 'placed',
    entry: id as EntryId,
  };
}

function view(
  live: LiveState = {},
  entries: readonly EntryRecord[] = [],
  before?: number,
): ConversationView {
  return {
    conversation: { id: conversationId },
    entries,
    ...(before === undefined ? {} : { before: before as EntryId }),
    docs: { 'pi.live': detachedJson(live), 'pi.inbox': { items: [] } },
  };
}

function attach(initial = view(), records: SubmissionRecord[] = []) {
  const stored = new Map(records.map((record) => [record.id, record]));
  const history = new Map<SubmissionId, EntryRecord[]>();
  const metadata = (record: SubmissionRecord) =>
    piSubmissionMetadata(
      {
        requestId: record.requestId!,
        turnId: `turn-${record.id}`,
        userMessageId: `user-${record.id}`,
        assistantMessageId: `assistant-${record.id}`,
        createdAt: 1,
        input: [{ type: 'text', text: 'Question' }],
        metadata: {},
      },
      [],
    );
  let advance!: Parameters<WatchHandle<ConversationView>['start']>[0];
  let commit!: (records: readonly SubmissionRecord[]) => void;
  const detach = jest.fn();
  const turnEntries = jest.fn(
    async (_session: string, record: SubmissionRecord) => history.get(record.id) ?? [],
  );
  const runtime = {
    observeSubmissions: async (_session: string, listener: typeof commit) => {
      commit = listener;
      return detach;
    },
    watch: async () => ({
      value: initial,
      start: (listener: typeof advance) => {
        advance = listener;
      },
      stop: async () => {},
    }),
    submissions: async (ids: readonly SubmissionId[]) =>
      ids.map((id) => ({ record: stored.get(id)!, metadata: metadata(stored.get(id)!) })),
    submissionMetadata: async (record: SubmissionRecord) => metadata(record),
    turnEntries,
  } as unknown as PiDurableRuntime;
  const events: RuntimeConversationEvent[] = [];
  const waiters: ((turn: RuntimeDurableTurn) => void)[] = [];
  const observer = new PiDurableObserver(runtime, { sessionId: 'session', slot: 0 }, (event) => {
    events.push(event);
    if (event.type === 'turn.updated') waiters.forEach((listener) => listener(event.turn));
  });
  return {
    observer,
    events,
    history,
    turnEntries,
    detach,
    latest: () => events.findLast((event) => event.type === 'turn.updated')!.turn,
    advance: (value: ConversationView) =>
      advance({ kind: 'value', value, ops: [], retired: false }, BACKGROUND_CONTEXT),
    notify: (...changes: SubmissionRecord[]) => {
      changes.forEach((record) => stored.set(record.id, record));
      commit(changes);
    },
    terminal: (id = 1) =>
      new Promise<RuntimeDurableTurn>((resolve) => {
        waiters.push((turn) => {
          if (
            turn.identity.requestId === `request-${id}` &&
            turn.status !== 'running' &&
            turn.status !== 'queued'
          )
            resolve(turn);
        });
      }),
  };
}

test('projects immutable streamed values without changing earlier snapshots', async () => {
  const original = response('Answer');
  const fixture = attach(view({ run, generation: { attempt: 0, message: original } }), [input()]);
  try {
    const initial = (await fixture.observer.start()).activeTurn!;
    const next = {
      ...original,
      content: [
        { type: 'text', text: 'Answer one' },
        { type: 'thinking', thinking: 'Reason' },
        { type: 'toolCall', id: 'call', name: 'custom_tool', arguments: { rows: [{ text: 'A' }] } },
      ],
    } satisfies AssistantMessage;
    await fixture.advance(view({ run, generation: { attempt: 0, message: next } }));
    const first = fixture.latest();
    await fixture.advance(
      view({ run, generation: { attempt: 0, message: response('Answer two') } }),
    );
    expect(fixture.latest().parts[0]).toMatchObject({ text: 'Answer two' });
    expect(first.parts).toMatchObject([
      { type: 'text', text: 'Answer one' },
      { type: 'reasoning', text: 'Reason' },
      { type: 'tool', input: { rows: [{ text: 'A' }] } },
    ]);
    expect(initial.parts[0]).toMatchObject({ text: 'Answer' });
    expect(original.content).toEqual([{ type: 'text', text: 'Answer' }]);
    expect(next.content[2]).toMatchObject({ arguments: { rows: [{ text: 'A' }] } });
  } finally {
    await fixture.observer.stop();
  }
});

test('retains retry feedback until response content arrives or a tool round commits', async () => {
  const fixture = attach(view({ run }), [input()]);
  try {
    expect((await fixture.observer.start()).activeTurn?.isRetrying).toBeUndefined();
    await fixture.advance(
      view({ run, generation: { attempt: 1, retry: { at: 3, error: 'private timeout' } } }),
    );
    expect(fixture.latest().isRetrying).toBe(true);
    await fixture.advance(
      view({
        run,
        generation: {
          attempt: 1,
          message: { ...response('Interrupted response'), stopReason: 'error' },
        },
      }),
    );
    expect(fixture.latest().isRetrying).toBe(true);
    await fixture.advance(view({ run, generation: { attempt: 1, message: response('') } }));
    expect(fixture.latest().isRetrying).toBe(true);
    await fixture.advance(view({ run, generation: { attempt: 1, message: response('Resumed') } }));
    expect(fixture.latest().isRetrying).toBeUndefined();
    await fixture.advance(
      view({ run, generation: { attempt: 2, retry: { at: 4, error: 'private timeout' } } }),
    );
    const tool: EntryRecord = {
      ...entry(2, ''),
      model: [
        {
          ...response(''),
          stopReason: 'toolUse',
          content: [{ type: 'toolCall', id: 'call', name: 'custom_tool', arguments: {} }],
        },
      ],
    };
    await fixture.advance(
      view({ run, tools: [{ callId: 'call', name: 'custom_tool', status: 'pending' }] }, [tool]),
    );
    expect(fixture.latest()).toMatchObject({
      status: 'running',
      parts: [{ type: 'tool', state: 'input-available' }],
    });
    expect(fixture.latest().isRetrying).toBeUndefined();
  } finally {
    await fixture.observer.stop();
  }
});

test('projects nested tool progress and drops it when the parent result commits', async () => {
  const call: EntryRecord = {
    ...entry(2, ''),
    model: [
      {
        ...response(''),
        stopReason: 'toolUse',
        content: [
          { type: 'toolCall', id: 'call', name: 'codemode', arguments: { code: 'return 1' } },
        ],
      },
    ],
  };
  const tool = { callId: 'call', name: 'codemode', taskId, status: 'running' as const };
  const child = {
    callId: 'call/child',
    name: 'lookup',
    parentCallId: 'call',
    parentTaskId: taskId,
    taskId: 43 as TaskId,
    status: 'running' as const,
    arguments: { query: 'calendar', code: 'hidden'.repeat(20_000) },
  };
  const fixture = attach(view({ run, tools: [tool], nestedTools: [child] }, [call]), [input()]);
  try {
    const initial = (await fixture.observer.start()).activeTurn!;
    expect(initial.parts[0]).toMatchObject({
      state: 'running',
      progress: { calls: [{ id: 'call/child', status: 'running' }] },
    });
    expect(initial.parts[0]).not.toHaveProperty('progress.calls.0.args');
    await fixture.advance(
      view(
        {
          run,
          tools: [tool],
          nestedTools: [{ ...child, status: 'done', summary: { isError: true } }],
        },
        [call],
      ),
    );
    expect(fixture.latest().parts[0]).toMatchObject({ progress: { calls: [{ status: 'error' }] } });
    const result: EntryRecord = {
      id: 3 as EntryId,
      conversationId,
      kind: 'pi.tool-result',
      data: { diagnostics: [] },
      model: [
        {
          role: 'toolResult',
          toolCallId: 'call',
          toolName: 'codemode',
          content: [{ type: 'text', text: 'finished' }],
          isError: false,
          timestamp: 2,
        },
      ],
    };
    await fixture.advance(
      view({ run, tools: [{ ...tool, status: 'done', entry: result.id }] }, [call, result]),
    );
    expect(fixture.latest().parts[0]).toMatchObject({ state: 'output-available' });
    expect(fixture.latest().parts[0]).not.toHaveProperty('progress');
    expect(initial.parts[0]).toMatchObject({ progress: { calls: [{ status: 'running' }] } });
  } finally {
    await fixture.observer.stop();
  }
});

test('restores compaction failure and separates background work, blocking work, and committed summaries', async () => {
  const compactionId = 5 as TaskId<CompactionResult>;
  const failure: LiveState = {
    compactionFailure: {
      taskId: compactionId,
      trigger: 'threshold',
      error: 'private provider response',
    },
  };
  const fixture = attach(view(failure));
  const records: LogRecord[] = [];
  const dispose = installLogWriter((record) => records.push(record));
  try {
    expect((await fixture.observer.start()).contextStatus).toBe('compaction-failed');
    await fixture.advance(
      view({
        ...failure,
        compactions: [{ taskId: compactionId, trigger: 'threshold', blocking: false, attempt: 1 }],
      }),
    );
    expect(fixture.events.at(-1)).toEqual({ type: 'context.updated', status: null });
    await fixture.advance(
      view({
        ...failure,
        compactions: [{ taskId: compactionId, trigger: 'threshold', blocking: true, attempt: 1 }],
      }),
    );
    expect(fixture.events.at(-1)).toEqual({ type: 'context.updated', status: 'compacting' });
    await fixture.advance(view(failure));
    expect(fixture.events.at(-1)).toEqual({ type: 'context.updated', status: 'compaction-failed' });
    await fixture.advance(
      view({
        compactions: [{ taskId: compactionId, trigger: 'threshold', blocking: false, attempt: 2 }],
      }),
    );
    await fixture.advance(view());
    await fixture.advance(
      view({}, [
        { id: 10 as EntryId, conversationId, kind: 'pi.compaction', data: { reason: 'threshold' } },
      ]),
    );
    const compactions = records.filter((record) => record.operation === 'pi.compaction');
    expect(compactions.map((record) => record.outcome)).toEqual([
      'started',
      'failed',
      'started',
      'ended',
      'committed',
    ]);
    expect(compactions.at(-1)).toMatchObject({ entryId: 10, reasonCode: 'threshold' });
    expect(compactions.every((record) => record.turnId === undefined)).toBe(true);
    expect(JSON.stringify(records)).not.toContain('private');
  } finally {
    dispose();
    await fixture.observer.stop();
  }
});

test.each(['interrupted', 'restart_limit'])(
  'settles %s as a terminal turn instead of parking it',
  async (reason) => {
    const fixture = attach(view({ run }), [input()]);
    const records: LogRecord[] = [];
    const dispose = installLogWriter((record) => records.push(record));
    try {
      expect((await fixture.observer.start()).activeTurn).toMatchObject({
        status: 'running',
        isPaused: false,
      });
      fixture.notify({ ...input(), status: 'unanswered', reason, detail: 'private failure' });
      await fixture.advance(
        view({
          runFailure: {
            taskId,
            inputs: [inputId],
            reason: reason as 'interrupted' | 'restart_limit',
            detail: 'private failure',
          },
        }),
      );
      expect(fixture.latest()).toMatchObject({
        status: reason === 'interrupted' ? 'interrupted' : 'failed',
        error: { code: reason },
      });
      expect(fixture.latest().isPaused).not.toBe(true);
      expect(records.find((record) => record.operation === 'pi.run')).toMatchObject({
        taskId: 42,
        reasonCode: reason,
        requestId: 'request-1',
        turnId: 'turn-1',
      });
      expect(JSON.stringify(records)).not.toContain('private');
    } finally {
      dispose();
      await fixture.observer.stop();
    }
  },
);

test('waits for the run frame when a placed input still appears in the old inbox', async () => {
  const queued: SubmissionRecord = {
    id: inputId,
    conversationId,
    requestId: 'request-1',
    type: 'input',
    status: 'queued',
  };
  const oldInbox: ConversationView = {
    ...view(),
    docs: { 'pi.inbox': { items: [{ id: inputId, mode: 'followUp', content: 'Question' }] } },
  };
  const fixture = attach(oldInbox, [queued]);
  try {
    expect((await fixture.observer.start()).queue).toHaveLength(1);
    fixture.notify(input());
    await fixture.advance(oldInbox);
    expect(fixture.events.filter((event) => event.type === 'turn.updated')).toEqual([]);
    await fixture.advance(view({ run }));
    expect(fixture.latest().status).toBe('running');
    const terminal = fixture.terminal();
    fixture.history.set(inputId, [entry(2, 'Complete answer')]);
    fixture.notify({ ...input(), status: 'done', answer: 2 as EntryId });
    expect((await terminal).status).toBe('completed');
  } finally {
    await fixture.observer.stop();
  }
});

test('settles a whole short run from persisted submissions without a view update', async () => {
  const fixture = attach();
  try {
    await fixture.observer.start();
    fixture.history.set(inputId, [entry(2, 'Complete answer')]);
    const terminal = fixture.terminal();
    fixture.notify({ ...input(), status: 'done', answer: 2 as EntryId });
    expect(await terminal).toMatchObject({
      status: 'completed',
      parts: [{ text: 'Complete answer' }],
    });
    await fixture.advance(view({ run }));
    await fixture.advance(view());
    fixture.notify({ ...input(), status: 'done', answer: 2 as EntryId });
    await fixture.advance(view());
    expect(fixture.events.filter((event) => event.type === 'turn.updated')).toHaveLength(1);
  } finally {
    await fixture.observer.stop();
  }
});

test.each(['aborted', 'withdrawn', 'stale'])(
  'settles a queued %s input with no run or transcript entry',
  async (reason) => {
    const queued: SubmissionRecord = {
      id: inputId,
      conversationId,
      requestId: 'request-1',
      type: 'input',
      status: 'queued',
    };
    const initial: ConversationView = {
      ...view(),
      docs: { 'pi.inbox': { items: [{ id: inputId, mode: 'followUp', content: 'Question' }] } },
    };
    const fixture = attach(initial, [queued]);
    try {
      expect((await fixture.observer.start()).queue).toHaveLength(1);
      const terminal = fixture.terminal();
      fixture.notify({ ...queued, status: 'unanswered', reason });
      expect(await terminal).toMatchObject({
        status: reason === 'aborted' ? 'cancelled' : 'failed',
        parts: [],
      });
      await fixture.advance(view());
      expect(fixture.events).toContainEqual({ type: 'queue.updated', queue: [] });
      expect(fixture.turnEntries).not.toHaveBeenCalled();
    } finally {
      await fixture.observer.stop();
    }
  },
);

test('fills a skipped window and retains the complete turn when more than 100 entries arrive', async () => {
  const entries = Array.from({ length: 130 }, (_, index) => entry(index + 1, `part-${index + 1}`));
  const fixture = attach(view({ run }, entries.slice(0, 1)), [input()]);
  fixture.history.set(inputId, entries);
  try {
    await fixture.observer.start();
    await fixture.advance(view({ run }, entries.slice(80), 80));
    expect(fixture.latest().parts).toHaveLength(130);
    const terminal = fixture.terminal();
    fixture.notify({ ...input(), status: 'done', answer: 130 as EntryId });
    expect((await terminal).parts).toHaveLength(130);
    expect(fixture.turnEntries).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'done' }),
      BACKGROUND_CONTEXT,
      undefined,
    );
  } finally {
    await fixture.observer.stop();
  }
});

test('reattaches inside a truncated window and isolates a terminal turn from the next answer', async () => {
  const fixture = attach(view({ run }, [entry(101, 'last part')], 100), [input()]);
  fixture.history.set(inputId, [entry(2, 'first part'), entry(101, 'last part')]);
  try {
    expect((await fixture.observer.start()).activeTurn?.parts).toHaveLength(2);
    await fixture.advance(view({}, [entry(102, 'another turn')], 101));
    // The run disappearing alone must not settle a still-placed input.
    expect(
      fixture.events.filter(
        (event) => event.type === 'turn.updated' && event.turn.status !== 'running',
      ),
    ).toHaveLength(0);
    const terminal = fixture.terminal();
    fixture.notify({ ...input(), status: 'done', answer: 101 as EntryId });
    expect((await terminal).parts).toMatchObject([{ text: 'first part' }, { text: 'last part' }]);
  } finally {
    await fixture.observer.stop();
  }
});

test('settles several coalesced inputs independently and ignores continue submissions', async () => {
  const fixture = attach();
  fixture.history.set(inputId, [entry(2, 'one')]);
  fixture.history.set(3 as SubmissionId, [entry(4, 'two')]);
  try {
    await fixture.observer.start();
    const first = fixture.terminal(1);
    const second = fixture.terminal(3);
    fixture.notify(
      { ...input(), status: 'done', answer: 2 as EntryId },
      { ...input(3), status: 'done', answer: 4 as EntryId },
      {
        id: 5 as SubmissionId,
        conversationId,
        type: 'continue',
        status: 'unanswered',
        reason: 'nothing_to_answer',
      },
    );
    expect((await first).parts).toMatchObject([{ text: 'one' }]);
    expect((await second).parts).toMatchObject([{ text: 'two' }]);
    expect(fixture.events.filter((event) => event.type === 'turn.updated')).toHaveLength(2);
  } finally {
    await fixture.observer.stop();
  }
});

test('detaches before draining reads and emits no settlement after stop', async () => {
  const fixture = attach();
  let release!: (entries: EntryRecord[]) => void;
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  fixture.turnEntries.mockImplementation(async () => {
    entered();
    return new Promise<EntryRecord[]>((resolve) => {
      release = resolve;
    });
  });
  await fixture.observer.start();
  fixture.notify({ ...input(), status: 'done', answer: 2 as EntryId });
  await started;
  const stopping = fixture.observer.stop();
  expect(fixture.detach).toHaveBeenCalledTimes(1);
  release([entry(2, 'finished after stop')]);
  await stopping;
  expect(fixture.events).toEqual([]);
});
