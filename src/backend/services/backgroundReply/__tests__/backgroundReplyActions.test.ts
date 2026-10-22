import type { BackgroundActivitySessionInput } from '@/backend/services/backgroundActivity/BackgroundActivityManager';
import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivity/chatReply';

import { BackgroundReplyRuntime } from '../BackgroundReplyRuntime';
import type { BackgroundReplyInteraction } from '../backgroundReplyTypes';

jest.mock('expo-constants', () => ({
  ...jest.requireActual('expo-constants'),
  __esModule: true,
  default: { executionEnvironment: 'bare', expoConfig: { scheme: 'cherrystudio' } },
}));

async function fixture() {
  let props!: BackgroundReplyActivityProps;
  const runtime = new BackgroundReplyRuntime(
    {
      dismissTask() {},
      startSession(input: BackgroundActivitySessionInput<BackgroundReplyActivityProps>) {
        props = input.props;
        return {
          update(next: BackgroundReplyActivityProps) {
            props = next;
          },
          cancel() {},
          finish: async () => {},
          dismiss: async () => {},
        };
      },
    },
    { assistantPresenter: undefined as never, translate: (key) => key },
    { acquire: () => ({ release() {} }) },
  );
  await runtime._doInit();
  const start = () =>
    runtime.startTurn({ agentId: 'a', agentName: 'Agent', sessionId: 's', sessionTitle: 'Test' });
  return { runtime, start, props: () => props };
}

test.each(['approve', 'deny'] as const)(
  'one pending approval accepts %s once without opening a screen',
  async (decision) => {
    const test = await fixture();
    const turn = test.start();
    const respond = jest.fn(async () => {});
    turn.setInteraction({ kind: 'approval', id: 'a1', title: 'Create Agent', respond });
    turn.awaitApproval(undefined, undefined, 'a1');
    const token = test.props().actions!.token;
    expect(await test.runtime.respondToAction({ token, actionId: decision })).toBe(true);
    expect(await test.runtime.respondToAction({ token, actionId: decision })).toBe(false);
    expect(respond.mock.calls).toEqual([[decision]]);
    expect(test.props().actions).toBeUndefined();
    await test.runtime._doStop();
  },
);

test('a repeated tap while responding cannot start a second decision', async () => {
  const test = await fixture();
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const respond = jest.fn(() => wait);
  const turn = test.start();
  turn.setInteraction({ kind: 'approval', id: 'a1', title: 'Create', respond });
  turn.awaitApproval(undefined, undefined, 'a1');
  const action = { token: test.props().actions!.token, actionId: 'approve' };
  const first = test.runtime.respondToAction(action);
  expect(await test.runtime.respondToAction(action)).toBe(false);
  release();
  expect(await first).toBe(true);
  expect(respond).toHaveBeenCalledTimes(1);
  await test.runtime._doStop();
});

test('a failed decision stays available and resolving one request preserves its successor', async () => {
  const test = await fixture();
  const turn = test.start();
  const nextRespond = jest.fn(async () => {});
  const respond = jest.fn(async () => {
    turn.setInteraction({ kind: 'approval', id: 'a2', title: 'Second', respond: nextRespond });
    turn.awaitApproval(undefined, undefined, 'a2');
  });
  respond.mockRejectedValueOnce(new Error('Disconnected'));
  turn.setInteraction({ kind: 'approval', id: 'a1', title: 'First', respond });
  turn.awaitApproval(undefined, undefined, 'a1');
  const first = { token: test.props().actions!.token, actionId: 'approve' };
  await expect(test.runtime.respondToAction(first)).rejects.toThrow('Disconnected');
  expect(test.props().actions!.token).toBe(first.token);
  expect(await test.runtime.respondToAction(first)).toBe(true);
  const successor = { token: test.props().actions!.token, actionId: 'deny' };
  expect(successor.token).not.toBe(first.token);
  expect(await test.runtime.respondToAction(first)).toBe(false);
  expect(await test.runtime.respondToAction(successor)).toBe(true);
  expect(nextRespond.mock.calls).toEqual([['deny']]);
  await test.runtime._doStop();
});

test('old cards cannot resolve a replacement request, an in-app resolved request, or a new round', async () => {
  const test = await fixture();
  const respond = jest.fn(async () => {});
  const turn = test.start();
  turn.setInteraction({ kind: 'approval', id: 'a1', title: 'First', respond });
  turn.awaitApproval(undefined, undefined, 'a1');
  const old = { token: test.props().actions!.token, actionId: 'approve' };
  turn.setInteraction({ kind: 'approval', id: 'a2', title: 'Second', respond });
  turn.awaitApproval(undefined, undefined, 'a2');
  expect(await test.runtime.respondToAction(old)).toBe(false);
  const current = { token: test.props().actions!.token, actionId: 'approve' };
  turn.setInteraction(undefined);
  expect(await test.runtime.respondToAction(current)).toBe(false);
  turn.setInteraction({ kind: 'approval', id: 'a3', title: 'Third', respond });
  turn.awaitApproval(undefined, undefined, 'a3');
  const previousRound = { token: test.props().actions!.token, actionId: 'approve' };
  test.start();
  expect(await test.runtime.respondToAction(previousRound)).toBe(false);
  expect(respond).not.toHaveBeenCalled();
  await test.runtime._doStop();
});

test.each([
  [{ actionId: 'option:snow' }, ['snow'], ''],
  [{ actionId: 'reply', text: ' Snow ' }, ['snow'], ''],
  [{ actionId: 'reply', text: ' Wind instead ' }, [], 'Wind instead'],
] as const)(
  'single question routes a button or typed answer by exact question and option identity',
  async (response, selectedOptionIds, text) => {
    const test = await fixture();
    const respond = jest.fn(async () => {});
    const interaction: BackgroundReplyInteraction = {
      kind: 'question',
      id: 'q1',
      question: {
        questions: [
          {
            id: 'topic',
            question: 'Which topic?',
            selection: 'single',
            options: [
              { id: 'rain', label: 'Rain' },
              { id: 'snow', label: 'Snow' },
            ],
          },
        ],
      },
      respond,
    };
    const turn = test.start();
    turn.setInteraction(interaction);
    turn.awaitApproval(undefined, 'question', 'q1');
    const token = test.props().actions!.token;
    expect(await test.runtime.respondToAction({ token, ...response })).toBe(true);
    expect(respond.mock.calls).toEqual([
      [
        {
          answers: [
            {
              questionId: 'topic',
              selectedOptionIds: [...selectedOptionIds],
              text,
              skipped: false,
            },
          ],
        },
      ],
    ]);
    await test.runtime._doStop();
  },
);

test('empty and unknown answers do not resolve; complex forms expose no shortcut', async () => {
  const test = await fixture();
  const respond = jest.fn(async () => {});
  const question = { id: 'topic', question: 'Which?', selection: 'single' as const, options: [] };
  const turn = test.start();
  turn.setInteraction({ kind: 'question', id: 'q1', question: { questions: [question] }, respond });
  turn.awaitApproval(undefined, 'question', 'q1');
  const token = test.props().actions!.token;
  expect(await test.runtime.respondToAction({ token, actionId: 'reply', text: '  ' })).toBe(false);
  expect(await test.runtime.respondToAction({ token, actionId: 'option:missing' })).toBe(false);
  expect(respond).not.toHaveBeenCalled();
  turn.setInteraction({
    kind: 'question',
    id: 'q2',
    question: { questions: [question, { ...question, id: 'second' }] },
    respond,
  });
  turn.awaitApproval(undefined, 'question', 'q2');
  expect(test.props().actions).toBeUndefined();
  await test.runtime._doStop();
});
