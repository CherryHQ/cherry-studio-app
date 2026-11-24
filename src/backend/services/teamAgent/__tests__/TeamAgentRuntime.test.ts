import {
  TeamAgentError,
  teamAgentDraftKey,
  teamDraftKey,
  type TeamAgent,
  type TeamChatView,
  type TeamReply,
  type TeamSession,
  type TeamSessionRef,
  type TeamSubmission,
  type TeamSubmitResult,
} from '@/shared/contracts/teamAgent';

import type { TeamAgentConnection } from '../teamAgentAdapter';
import { TeamAgentRuntime } from '../TeamAgentRuntime';

const target = { agentId: 'agent', sessionId: 'session' };
const idle: TeamChatView = {
  messages: [],
  pending: [],
  run: null,
  canSend: true,
  canStop: false,
  canRespond: false,
};
function fixture(view = idle) {
  const submit = jest.fn(
    async (
      _target: TeamSessionRef,
      _submission: TeamSubmission,
      _signal: AbortSignal,
    ): Promise<TeamSubmitResult> => 'accepted',
  );
  const connection = {
    context: { bindingId: 'enterprise', key: 'a' },
    listAgents: async (): Promise<readonly TeamAgent[]> => [
      { id: 'agent', name: 'Agent', canCreateSession: true },
    ],
    listSessions: async () => [{ ...target, canDelete: true }],
    createSession: jest.fn(
      async (_id: string, _signal: AbortSignal): Promise<TeamSession> => ({
        ...target,
        canDelete: true,
      }),
    ),
    deleteSession: jest.fn(async (_target: TeamSessionRef, _signal: AbortSignal) => {}),
    readDetail: async () => ({ skills: [], mcp: [] }),
    readPortrait: async () => undefined,
    readView: jest.fn(async () => view),
    watch: jest.fn(
      async (
        _target: TeamSessionRef,
        _signal: AbortSignal,
        _snapshot: (view: TeamChatView) => void,
      ) => {},
    ),
    submit,
    stop: jest.fn(async (_target: TeamSessionRef, _runId: string, _signal: AbortSignal) => {}),
    respond: jest.fn(
      async (
        _target: TeamSessionRef,
        _pendingId: string,
        _requestId: string,
        _reply: TeamReply,
        _signal: AbortSignal,
      ) => {},
    ),
  } satisfies TeamAgentConnection;
  let current: TeamAgentConnection | null = connection;
  let changed = () => {};
  const runtime = new TeamAgentRuntime([
    {
      current: () => current,
      subscribe: (listener) => {
        changed = listener;
        return () => {};
      },
    },
  ]);
  return {
    runtime,
    connection,
    submit,
    replace(next: TeamAgentConnection | null) {
      current = next;
      changed();
    },
  };
}

it('retires old content and discards a late snapshot on account replacement', async () => {
  const { runtime, connection, replace } = fixture();
  let finish!: (view: TeamChatView) => void;
  connection.readView.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const conversation = runtime.observe(target);
  const pending = conversation.refresh();
  replace(null);
  finish(idle);
  await expect(pending).rejects.toBeDefined();
  expect(conversation.getState()).toMatchObject({ phase: 'retired', view: null });
  expect(runtime.getState()).toMatchObject({ context: null, agents: [] });
  runtime.dispose();
});

it('settles admitted submission after the page releases observation', async () => {
  const { runtime, submit } = fixture();
  const draftKey = teamDraftKey('a', target);
  runtime.writeDraft(draftKey, 'hello');
  let finish!: (result: TeamSubmitResult) => void;
  submit.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const conversation = runtime.observe(target);
  await conversation.refresh();
  const pending = conversation.send('hello');
  expect(conversation.getState()).toMatchObject({ submitting: true });
  expect(conversation.getState().unknown).toBeUndefined();
  conversation.dispose();
  expect(submit.mock.calls[0][2].aborted).toBe(false);
  finish('accepted');
  await expect(pending).resolves.toBe('accepted');
  expect(runtime.readDraft(draftKey)).toBe('');
  runtime.dispose();
});

it('leaves the draft retryable when submission preflight throws', async () => {
  const { runtime, submit } = fixture();
  const draftKey = teamDraftKey('a', target);
  runtime.writeDraft(draftKey, 'hello');
  submit.mockRejectedValueOnce(new TeamAgentError('offline'));
  const conversation = runtime.observe(target);
  await conversation.refresh();

  await expect(conversation.send('hello')).rejects.toMatchObject({ code: 'offline' });
  expect(conversation.getState().unknown).toBeUndefined();
  expect(conversation.getState().submitting).toBe(false);
  expect(runtime.readDraft(draftKey)).toBe('hello');
  runtime.dispose();
});

it('keeps the original unknown submission if a confirmed retry is rejected or throws', async () => {
  const { runtime, submit } = fixture();
  submit.mockResolvedValueOnce('unknown').mockResolvedValueOnce('rejected');
  const conversation = runtime.observe(target);
  await conversation.refresh();
  await expect(conversation.send('hello')).resolves.toBe('unknown');
  const original = submit.mock.calls[0][1];
  await expect(conversation.send('retry', true)).resolves.toBe('rejected');
  expect(conversation.getState().unknown).toEqual(original);

  submit.mockRejectedValueOnce(new TeamAgentError('offline'));
  await expect(conversation.send('retry', true)).rejects.toMatchObject({ code: 'offline' });
  expect(conversation.getState().unknown).toEqual(original);
  runtime.dispose();
});

it.each(['offline', 'not-visible'] as const)(
  'handles a late %s read failure after a stream snapshot',
  async (code) => {
    const { runtime, connection } = fixture({ ...idle, run: { id: 'run', state: 'running' } });
    const stream = Promise.withResolvers<void>();
    connection.watch.mockReturnValueOnce(stream.promise);
    const conversation = runtime.observe(target);
    conversation.setActive(true);
    await conversation.refresh();
    const read = Promise.withResolvers<TeamChatView>();
    connection.readView.mockReturnValueOnce(read.promise);
    const pending = conversation.refresh();
    const latest: TeamChatView = { ...idle, run: { id: 'run', state: 'done' } };
    connection.watch.mock.calls[0][2](latest);
    read.reject(new TeamAgentError(code));
    await expect(pending).rejects.toMatchObject({ code });
    expect(conversation.getState()).toMatchObject(
      code === 'not-visible'
        ? { phase: 'error', failure: 'not-visible', view: null }
        : { phase: 'current', view: latest },
    );
    runtime.dispose();
    stream.resolve();
  },
);

it('keeps uncertain text and requires an explicit duplicate decision before another submit', async () => {
  const { runtime, submit } = fixture();
  submit.mockResolvedValue('unknown');
  const conversation = runtime.observe(target);
  await conversation.refresh();
  await expect(conversation.send('hello')).resolves.toBe('unknown');
  await conversation.refresh();
  await expect(conversation.send('hello')).resolves.toBe('unknown');
  expect(submit).toHaveBeenCalledTimes(1);
  await expect(conversation.send('hello', true)).resolves.toBe('unknown');
  expect(submit).toHaveBeenCalledTimes(2);
  expect(submit.mock.calls[0][1].requestId).not.toBe(submit.mock.calls[1][1].requestId);
  runtime.dispose();
});

it('does not restore an old account draft from a departing page cleanup', () => {
  const { runtime, replace } = fixture();
  const key = JSON.stringify(['a', 'draft']);
  runtime.writeDraft(key, 'private text');
  expect(runtime.readDraft(key)).toBe('private text');
  replace(null);
  runtime.writeDraft(key, 'late cleanup');
  expect(runtime.readDraft(key)).toBe('');
  runtime.dispose();
});

it('clears a withdrawn Agent transcript and its drafts, including unobserved sessions', async () => {
  const { runtime, connection } = fixture();
  const other = { id: 'other', name: 'Other', canCreateSession: true };
  const listAgents = connection.listAgents;
  connection.listAgents = async () => [...(await listAgents()), other];
  await runtime.refresh();
  const conversation = runtime.observe(target);
  await conversation.refresh();
  const withdrawn = [
    teamAgentDraftKey('a', target.agentId),
    teamDraftKey('a', target),
    teamDraftKey('a', { ...target, sessionId: 'unobserved' }),
  ];
  const retained = [
    teamAgentDraftKey('a', other.id),
    teamDraftKey('a', { ...target, agentId: other.id }),
  ];
  for (const key of [...withdrawn, ...retained]) runtime.writeDraft(key, 'draft');
  connection.listAgents = async () => [other];
  await runtime.refresh();
  expect(conversation.getState()).toMatchObject({
    phase: 'error',
    failure: 'not-visible',
    view: null,
  });
  await expect(conversation.send('late input')).rejects.toBeDefined();
  expect(connection.submit).not.toHaveBeenCalled();
  for (const key of withdrawn) expect(runtime.readDraft(key)).toBe('');
  for (const key of retained) expect(runtime.readDraft(key)).toBe('draft');
  runtime.dispose();
});

it('clears only the deleted session draft', async () => {
  const { runtime } = fixture();
  const deleted = teamDraftKey('a', target);
  const retained = teamDraftKey('a', { ...target, sessionId: 'other' });
  runtime.writeDraft(deleted, 'delete');
  runtime.writeDraft(retained, 'keep');
  await runtime.deleteSession(target);
  expect(runtime.readDraft(deleted)).toBe('');
  expect(runtime.readDraft(retained)).toBe('keep');
  runtime.dispose();
});

it('notifies session subscribers only for create, delete and accepted or unknown submits', async () => {
  const { runtime, submit } = fixture();
  const directoryChanged = jest.fn();
  const sessionsChanged = jest.fn();
  runtime.subscribe(directoryChanged);
  runtime.subscribeSessions(sessionsChanged);
  await runtime.refresh();
  expect(directoryChanged).toHaveBeenCalledTimes(1);
  expect(sessionsChanged).not.toHaveBeenCalled();

  await runtime.createSession(target.agentId);
  expect(sessionsChanged).toHaveBeenCalledTimes(1);
  await runtime.deleteSession(target);
  expect(sessionsChanged).toHaveBeenCalledTimes(2);
  const conversation = runtime.observe(target);
  await conversation.refresh();
  await conversation.send('accepted');
  expect(sessionsChanged).toHaveBeenCalledTimes(3);
  submit.mockResolvedValueOnce('unknown');
  await conversation.send('unknown');
  expect(sessionsChanged).toHaveBeenCalledTimes(4);
  submit.mockResolvedValueOnce('rejected');
  await conversation.send('rejected', true);
  submit.mockRejectedValueOnce(new TeamAgentError('offline'));
  await expect(conversation.send('offline', true)).rejects.toMatchObject({ code: 'offline' });
  expect(sessionsChanged).toHaveBeenCalledTimes(4);
  expect(directoryChanged).toHaveBeenCalledTimes(1);
  runtime.dispose();
});

it.each(['replace', 'dispose'] as const)('aborts all in-flight commands on %s', async (mode) => {
  const { runtime, connection, replace, submit } = fixture({
    ...idle,
    run: { id: 'run', state: 'running' },
    pending: [{ id: 'pending', requestId: 'run', kind: 'approval', text: 'Allow?' }],
    canStop: true,
    canRespond: true,
  });
  const signals: AbortSignal[] = [];
  const waitForAbort = <T>(signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<T>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  };
  const deleting = Promise.withResolvers<void>();
  connection.createSession.mockImplementation((_id, signal) => waitForAbort(signal));
  connection.deleteSession.mockImplementation((_target, signal) => {
    deleting.resolve();
    return waitForAbort(signal);
  });
  submit.mockImplementation((_target, _submission, signal) => waitForAbort(signal));
  connection.stop.mockImplementation((_target, _run, signal) => waitForAbort(signal));
  connection.respond.mockImplementation((_target, _id, _run, _reply, signal) =>
    waitForAbort(signal),
  );
  await runtime.refresh();
  const conversation = runtime.observe(target);
  await conversation.refresh();
  const settled = Promise.allSettled([
    runtime.createSession(target.agentId),
    runtime.deleteSession(target),
    conversation.send('hello'),
    conversation.stop(),
    conversation.respond('pending', 'run', { decision: 'allow' }),
  ]);
  await deleting.promise;
  expect(signals).toHaveLength(5);
  expect(signals.every((signal) => !signal.aborted)).toBe(true);
  if (mode === 'replace') replace({ ...connection, context: { ...connection.context, key: 'b' } });
  else runtime.dispose();
  expect(signals.every((signal) => signal.aborted)).toBe(true);
  expect((await settled).map(({ status }) => status)).toEqual(Array(5).fill('rejected'));
  runtime.dispose();
});

it('releases observation without sending remote cancellation', async () => {
  const { runtime, connection } = fixture({
    ...idle,
    run: { id: 'server-run', state: 'running' },
    canSend: false,
    canStop: true,
  });
  const conversation = runtime.observe(target);
  conversation.setActive(true);
  await conversation.refresh();
  conversation.setActive(false);
  conversation.dispose();
  expect(connection.stop).not.toHaveBeenCalled();
  runtime.dispose();
});

it('withdraws cached content and drafts when the directory explicitly denies access', async () => {
  const { runtime, connection } = fixture();
  await runtime.refresh();
  const conversation = runtime.observe(target);
  await conversation.refresh();
  const key = teamDraftKey('a', target);
  runtime.writeDraft(key, 'private draft');
  connection.listAgents = async () => {
    throw new TeamAgentError('not-visible', 403);
  };
  await expect(runtime.refresh()).rejects.toMatchObject({ code: 'not-visible' });
  expect(runtime.getState().agents).toEqual([]);
  expect(conversation.getState()).toMatchObject({ phase: 'error', view: null });
  expect(runtime.readDraft(key)).toBe('');
  runtime.dispose();
});

it('rejects an expired pending request before calling the service', async () => {
  const { runtime, connection } = fixture({ ...idle, canRespond: true });
  const conversation = runtime.observe(target);
  await conversation.refresh();
  await expect(
    conversation.respond('expired', 'old-run', { decision: 'allow' }),
  ).rejects.toMatchObject({ code: 'not-visible' });
  expect(connection.respond).not.toHaveBeenCalled();
  runtime.dispose();
});
