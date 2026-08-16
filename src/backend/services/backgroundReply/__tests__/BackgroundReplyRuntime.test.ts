import { Platform } from 'react-native';

import type { BackgroundActivitySessionInput } from '@/backend/services/backgroundActivity/BackgroundActivityManager';
import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivity/chatReply';

import { BackgroundReplyRuntime } from '../BackgroundReplyRuntime';

type SessionInput = BackgroundActivitySessionInput<BackgroundReplyActivityProps>;

type MockSession = {
  cancel: jest.Mock;
  finish: jest.Mock;
  input: SessionInput;
  ready: Promise<void>;
  update: jest.Mock;
};

describe('BackgroundReplyRuntime', () => {
  let preferenceListener: (() => void) | undefined;
  let enabled: boolean;
  const mockSessions: MockSession[] = [];
  const createMockSession = (input: SessionInput): MockSession => {
    const session: MockSession = {
      cancel: jest.fn(),
      finish: jest.fn(),
      input,
      ready: Promise.resolve(),
      update: jest.fn(),
    };
    mockSessions.push(session);
    return session;
  };
  const mockStartSession = jest.fn(createMockSession);

  beforeEach(() => {
    enabled = true;
    preferenceListener = undefined;
    mockSessions.length = 0;
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('opens one keep-alive session per topic with derived initial content', async () => {
    const runtime = await createRuntime();
    expect(runtime.isActivated).toBe(true);
    const first = runtime.startTurn({
      assistantName: 'Alpha',
      topicId: 'topic-1',
      topicTitle: 'First topic',
    });
    const second = runtime.startTurn({
      assistantName: 'Beta',
      topicId: 'topic-2',
      topicTitle: 'Second topic',
    });
    expect(first).not.toBe(second);
    await Promise.all([first.ready, second.ready]);

    expect(mockStartSession).toHaveBeenCalledTimes(2);
    expect(mockSessions[0]?.input).toMatchObject({
      deepLinkUrl: 'cherrystudio://topics?topicId=topic-1',
      keepAlive: true,
      props: expect.objectContaining({
        attribution: 'Alpha',
        compactIcon: 'bubble-ellipsis',
        detail: 'chat.backgroundReply.preparing',
        icon: 'hourglass',
        phase: 'preparing',
        title: 'First topic',
      }),
      tag: 'chat.backgroundReply',
    });
    expect(mockSessions[1]?.input).toMatchObject({
      deepLinkUrl: 'cherrystudio://topics?topicId=topic-2',
      props: expect.objectContaining({
        attribution: 'Beta',
        detail: 'chat.backgroundReply.preparing',
        title: 'Second topic',
      }),
    });

    await runtime._doStop();
  });

  test('uses the localized assistant fallback when no assistant or model name is available', async () => {
    const runtime = await createRuntime();
    const turn = runtime.startTurn({ assistantName: ' ', topicId: 'topic-1', topicTitle: ' ' });
    await turn.ready;

    expect(mockSessions[0]?.input.props).toMatchObject({ title: 'Localized assistant' });

    await runtime._doStop();
  });

  test('marks phase changes urgent and drops keep-alive while approval is pending', async () => {
    const runtime = await createRuntime();
    const turn = runtime.startTurn({
      assistantName: 'Alpha',
      topicId: 'topic-1',
      topicTitle: 'First topic',
    });
    await turn.ready;
    const session = mockSessions[0];

    turn.update({ id: 'assistant-1', parts: [{ type: 'text', text: 'hello' }], role: 'assistant' });
    expect(session?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        icon: 'bubble-ellipsis',
        phase: 'responding',
        preview: 'hello',
      }),
      { keepAlive: true, urgent: true },
    );
    expect(session?.update.mock.calls.at(-1)?.[0]).not.toHaveProperty('compactLabel');

    turn.update({
      id: 'assistant-1',
      parts: [{ type: 'text', text: 'hello more' }],
      role: 'assistant',
    });
    expect(session?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'responding' }),
      { keepAlive: true, urgent: false },
    );

    turn.awaitApproval({ id: 'assistant-1', parts: [], role: 'assistant' });
    expect(session?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        compactLabel: '等待审批',
        icon: 'bubble-exclamation',
        phase: 'awaiting-approval',
      }),
      { keepAlive: false, urgent: true },
    );

    turn.update({
      id: 'assistant-1',
      parts: [{ type: 'text', text: 'approved and continuing' }],
      role: 'assistant',
    });
    expect(session?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'responding' }),
      { keepAlive: true, urgent: true },
    );
    expect(session?.update.mock.calls.at(-1)?.[0]).not.toHaveProperty('compactLabel');

    turn.finish('completed');
    await flushOperations();
    expect(session?.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        compactIcon: 'bubble-ellipsis',
        compactLabel: '已完成',
        icon: 'check-circle',
        phase: 'completed',
      }),
    );
    await runtime._doStop();
  });

  test.each([
    ['cancelled', '已取消'],
    ['failed', '回复失败'],
  ] as const)(
    'uses the expected compact label when a turn finishes as %s',
    async (outcome, label) => {
      const runtime = await createRuntime();
      const turn = runtime.startTurn({
        assistantName: 'Alpha',
        topicId: 'topic-1',
        topicTitle: 'First topic',
      });
      await turn.ready;

      turn.finish(outcome);
      await flushOperations();

      expect(mockSessions[0]?.finish).toHaveBeenCalledWith(
        expect.objectContaining({ compactLabel: label, phase: outcome }),
      );
      await runtime._doStop();
    },
  );

  test('does not let an older finish end the session inherited by a newer turn', async () => {
    const runtime = await createRuntime();
    const first = runtime.startTurn({
      assistantName: 'Alpha',
      topicId: 'topic-1',
      topicTitle: 'First topic',
    });
    await first.ready;
    const session = mockSessions[0];

    first.finish('completed');
    const second = runtime.startTurn({
      assistantName: 'Alpha',
      topicId: 'topic-1',
      topicTitle: 'First topic',
    });
    await second.ready;
    await flushOperations();

    expect(mockStartSession).toHaveBeenCalledTimes(1);
    expect(session?.finish).not.toHaveBeenCalled();
    expect(session?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'preparing' }),
      { keepAlive: true, urgent: true },
    );

    second.finish('completed');
    await flushOperations();
    expect(session?.finish).toHaveBeenCalledTimes(1);
    await runtime._doStop();
  });

  test('clearTopic cancels the session so approval records cannot recreate it later', async () => {
    const runtime = await createRuntime();
    const turn = runtime.startTurn({
      assistantName: 'Alpha',
      topicId: 'topic-1',
      topicTitle: 'First topic',
    });
    await turn.ready;

    turn.awaitApproval();
    runtime.clearTopic('topic-1');
    expect(mockSessions[0]?.cancel).toHaveBeenCalledTimes(1);

    turn.update({ id: 'assistant-1', parts: [{ type: 'text', text: 'late' }], role: 'assistant' });
    expect(mockStartSession).toHaveBeenCalledTimes(1);
    await runtime._doStop();
  });

  test('cancels sessions when the preference turns off and restores them on re-enable', async () => {
    const runtime = await createRuntime();
    const turn = runtime.startTurn({
      assistantName: 'Alpha',
      topicId: 'topic-1',
      topicTitle: 'First topic',
    });
    await turn.ready;

    enabled = false;
    preferenceListener?.();
    await flushOperations();
    expect(runtime.isActivated).toBe(false);
    expect(mockSessions[0]?.cancel).toHaveBeenCalledTimes(1);

    turn.update({ id: 'assistant-1', parts: [{ type: 'text', text: 'hi' }], role: 'assistant' });
    expect(mockStartSession).toHaveBeenCalledTimes(1);

    enabled = true;
    preferenceListener?.();
    await flushOperations();
    expect(runtime.isActivated).toBe(true);
    expect(mockStartSession).toHaveBeenCalledTimes(2);
    expect(mockSessions[1]?.input.props).toMatchObject({ phase: 'responding' });

    await runtime._doStop();
  });

  test('rolls back partially restored sessions when activation fails', async () => {
    const runtime = await createRuntime();
    runtime.startTurn({ assistantName: 'Alpha', topicId: 'topic-1', topicTitle: 'First topic' });
    runtime.startTurn({ assistantName: 'Beta', topicId: 'topic-2', topicTitle: 'Second topic' });

    enabled = false;
    preferenceListener?.();
    await flushOperations();
    mockStartSession.mockImplementationOnce(createMockSession).mockImplementationOnce(() => {
      throw new Error('presenter unavailable');
    });

    enabled = true;
    preferenceListener?.();
    await flushOperations();

    expect(runtime.isActivated).toBe(false);
    expect(mockSessions[2]?.cancel).toHaveBeenCalledTimes(1);
    await runtime._doStop();
  });

  test('ends sessions when stopped during an active turn and stops idempotently', async () => {
    const runtime = await createRuntime();
    const turn = runtime.startTurn({
      assistantName: 'Alpha',
      topicId: 'topic-1',
      topicTitle: 'First topic',
    });
    await turn.ready;

    await expect(runtime._doStop()).resolves.toBeUndefined();
    await expect(runtime._doStop()).resolves.toBeUndefined();
    expect(mockSessions[0]?.cancel).toHaveBeenCalledTimes(1);
  });

  test('uses no-op turns on Android and when the preference is disabled at startup', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const androidRuntime = await createRuntime();
    const androidTurn = androidRuntime.startTurn({
      assistantName: 'Alpha',
      topicId: 'topic-1',
      topicTitle: 'First topic',
    });
    await androidTurn.ready;
    expect(mockStartSession).not.toHaveBeenCalled();
    await androidRuntime._doStop();

    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    enabled = false;
    const disabledRuntime = await createRuntime();
    expect(disabledRuntime.isActivated).toBe(false);
    const disabledTurn = disabledRuntime.startTurn({
      assistantName: 'Alpha',
      topicId: 'topic-2',
      topicTitle: 'Second topic',
    });
    await disabledTurn.ready;
    expect(mockStartSession).not.toHaveBeenCalled();
    await disabledRuntime._doStop();
  });

  test('keeps turn callbacks non-throwing when content derivation fails', async () => {
    const runtime = await createRuntime((key) => {
      if (
        key === 'chat.backgroundReply.awaitingApproval' ||
        key === 'chat.backgroundReply.completed' ||
        key === 'chat.backgroundReply.responding'
      ) {
        throw new Error('translation failed');
      }
      return key;
    });
    const turn = runtime.startTurn({
      assistantName: 'Alpha',
      topicId: 'topic-1',
      topicTitle: 'First topic',
    });
    await turn.ready;

    expect(() =>
      turn.update({
        id: 'assistant-1',
        parts: [{ type: 'text', text: 'hello' }],
        role: 'assistant',
      }),
    ).not.toThrow();
    expect(() => turn.awaitApproval()).not.toThrow();
    expect(() => turn.finish('completed')).not.toThrow();

    await runtime._doStop();
  });

  async function createRuntime(
    translate: (key: string) => string = (key) =>
      key === 'chat.backgroundReply.assistant'
        ? 'Localized assistant'
        : key === 'backgroundActivity.awaitingApproval'
          ? '等待审批'
          : key === 'backgroundActivity.cancelled'
            ? '已取消'
            : key === 'backgroundActivity.completed'
              ? '已完成'
              : key === 'chat.backgroundReply.failed'
                ? '回复失败'
                : key,
  ) {
    const runtime = new BackgroundReplyRuntime(
      { startSession: mockStartSession },
      {
        readCached: jest.fn(() => enabled),
        subscribeChange: jest.fn(() => (listener: () => void) => {
          preferenceListener = listener;
          return jest.fn();
        }),
      },
      {
        assistantPresenter: undefined as never,
        translate,
      },
    );
    await runtime._doInit();
    return runtime;
  }
});

async function flushOperations() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
