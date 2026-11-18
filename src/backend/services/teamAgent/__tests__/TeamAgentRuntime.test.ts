import {
  TeamAgentError,
  teamDraftKey,
  type TeamChatView,
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
    async (_target: TeamSessionRef, _submission: TeamSubmission): Promise<TeamSubmitResult> =>
      'accepted',
  );
  const connection = {
    context: { bindingId: 'enterprise', key: 'a' },
    listAgents: async () => [{ id: 'agent', name: 'Agent', canCreateSession: true }],
    listSessions: async () => [{ ...target, canDelete: true }],
    createSession: async () => ({ ...target, canDelete: true }),
    deleteSession: jest.fn(async () => {}),
    readDetail: async () => ({ skills: [], mcp: [] }),
    readPortrait: async () => undefined,
    readView: jest.fn(async () => view),
    watch: jest.fn(async () => {}),
    submit,
    stop: jest.fn(async () => {}),
    respond: jest.fn(async () => {}),
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
  conversation.dispose();
  finish('accepted');
  await expect(pending).resolves.toBe('accepted');
  expect(runtime.readDraft(draftKey)).toBe('');
  runtime.dispose();
});

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

it('clears a visible transcript when directory refresh withdraws its Agent', async () => {
  const { runtime, connection } = fixture();
  await runtime.refresh();
  const conversation = runtime.observe(target);
  await conversation.refresh();
  connection.listAgents = async () => [];
  await runtime.refresh();
  expect(conversation.getState()).toMatchObject({
    phase: 'error',
    failure: 'not-visible',
    view: null,
  });
  await expect(conversation.send('late input')).rejects.toBeDefined();
  expect(connection.submit).not.toHaveBeenCalled();
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
