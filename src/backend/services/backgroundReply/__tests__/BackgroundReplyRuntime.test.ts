import Constants from 'expo-constants';
import { AppState } from 'react-native';

import type { BackgroundActivitySessionInput } from '@/backend/services/backgroundActivity/BackgroundActivityManager';
import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivity/chatReply';
import type { AgentMessagePart } from '@/shared/contracts/agent';

import { BackgroundReplyRuntime } from '../BackgroundReplyRuntime';
import type {
  ReplyCompletionNotifier,
  ReplyCompletionNotificationEvent,
} from '../replyCompletionNotifications';

jest.mock('expo-constants', () => ({
  ...jest.requireActual('expo-constants'),
  __esModule: true,
  default: { executionEnvironment: 'bare', expoConfig: { scheme: 'cherrystudio' } },
}));

afterEach(() => {
  Constants.expoConfig!.scheme = 'cherrystudio';
});

type SessionInput = BackgroundActivitySessionInput<BackgroundReplyActivityProps>;

type MockSession = {
  cancel: jest.Mock;
  finish: jest.Mock;
  input: SessionInput;
  update: jest.Mock;
};

describe('BackgroundReplyRuntime', () => {
  const mockSessions: MockSession[] = [];
  const createMockSession = (input: SessionInput): MockSession => {
    const session: MockSession = {
      cancel: jest.fn(),
      finish: jest.fn(),
      input,
      update: jest.fn(),
    };
    mockSessions.push(session);
    return session;
  };
  const mockStartSession = jest.fn(createMockSession);
  const mockDismissTask = jest.fn();
  const preparationRelease = jest.fn();
  const acquire = jest.fn(() => ({ release: preparationRelease }));

  beforeEach(() => {
    mockSessions.length = 0;
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('preparation acquires protection before turn admission', async () => {
    const runtime = await createRuntime();
    const interrupt = jest.fn();
    const lease = runtime.acquirePreparation('session-1', interrupt);
    expect(acquire).toHaveBeenCalledWith('chat.preparation', interrupt);
    expect(mockStartSession).toHaveBeenCalledTimes(1);
    lease.release();
    expect(preparationRelease).toHaveBeenCalledTimes(1);
    await runtime._doStop();
  });

  test('preparation opens the surface the turn then inherits', async () => {
    const runtime = await createRuntime();
    const lease = runtime.acquirePreparation('session-1', jest.fn());

    // The window to create a surface can close before the turn exists.
    expect(mockStartSession).toHaveBeenCalledTimes(1);
    const [session] = mockSessions;
    expect(session!.input.deepLinkUrl).toBe('cherrystudio:///?sessionId=session-1');
    expect(session!.input.props).toMatchObject({ phase: 'preparing' });

    const turn = runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });
    lease.release();

    expect(mockStartSession).toHaveBeenCalledTimes(1);
    expect(session!.cancel).not.toHaveBeenCalled();
    expect(session!.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ attribution: 'Alpha', title: 'First session' }),
      expect.objectContaining({ keepAlive: true }),
    );

    turn.finish('completed');
    await flushOperations();
    expect(session!.finish).toHaveBeenCalledTimes(1);
    await runtime._doStop();
  });

  test('a preparation that never reaches a turn leaves no surface behind', async () => {
    const runtime = await createRuntime();
    const lease = runtime.acquirePreparation('session-1', jest.fn());
    expect(mockStartSession).toHaveBeenCalledTimes(1);

    lease.release();
    expect(mockSessions[0]!.cancel).toHaveBeenCalledTimes(1);
    expect(mockDismissTask).toHaveBeenCalledWith('cherrystudio:///?sessionId=session-1');

    // The next submission starts from scratch rather than inheriting it.
    runtime.acquirePreparation('session-1', jest.fn());
    expect(mockStartSession).toHaveBeenCalledTimes(2);
    await runtime._doStop();
  });

  test('preparation never displaces a live turn on the same Session', async () => {
    const runtime = await createRuntime();
    runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });
    expect(mockStartSession).toHaveBeenCalledTimes(1);

    const lease = runtime.acquirePreparation('session-1', jest.fn());
    lease.release();

    expect(mockStartSession).toHaveBeenCalledTimes(1);
    expect(mockSessions[0]!.cancel).not.toHaveBeenCalled();
    await runtime._doStop();
  });

  test('releases pending preparation leases once when stopped', async () => {
    const runtime = await createRuntime();
    const interrupt = jest.fn();
    const completed = runtime.acquirePreparation('session-1', interrupt);
    const pending = [
      runtime.acquirePreparation('session-2', interrupt),
      runtime.acquirePreparation('session-3', interrupt),
    ];
    completed.release();
    completed.release();
    expect(preparationRelease).toHaveBeenCalledTimes(1);

    await runtime._doStop();
    expect(preparationRelease).toHaveBeenCalledTimes(3);
    expect(interrupt).not.toHaveBeenCalled();

    for (const lease of pending) lease.release();
    completed.release();
    await runtime._doStop();
    expect(preparationRelease).toHaveBeenCalledTimes(3);
  });

  test.each(['cherrystudio', 'cherrystudio-dev', 'cherrystudio-preview'])(
    'opens chat activities with the current app scheme %s',
    async (scheme) => {
      Constants.expoConfig!.scheme = scheme;
      const runtime = await createRuntime();
      expect(runtime.isReady).toBe(true);
      const first = runtime.startTurn({
        agentId: 'agent-1',
        agentName: 'Alpha',
        sessionId: 'session-1',
        sessionTitle: 'First session',
      });
      const second = runtime.startTurn({
        agentId: 'agent-2',
        agentName: 'Beta',
        sessionId: 'session-2',
        sessionTitle: 'Second session',
      });
      expect(first).not.toBe(second);
      expect(mockStartSession).toHaveBeenCalledTimes(2);
      expect(mockSessions[0]?.input).toMatchObject({
        deepLinkUrl: `${scheme}:///?sessionId=session-1`,
        keepAlive: true,
        props: expect.objectContaining({
          attribution: 'Alpha',
          compactIcon: 'bubble-ellipsis',
          detail: 'chat.backgroundReply.preparing',
          icon: 'hourglass',
          phase: 'preparing',
          title: 'First session',
        }),
        tag: 'chat.backgroundReply',
      });
      expect(mockSessions[1]?.input).toMatchObject({
        deepLinkUrl: `${scheme}:///?sessionId=session-2`,
        props: expect.objectContaining({
          attribution: 'Beta',
          detail: 'chat.backgroundReply.preparing',
          title: 'Second session',
        }),
      });

      await runtime._doStop();
    },
  );

  test('uses the localized assistant fallback when no assistant or model name is available', async () => {
    const runtime = await createRuntime();
    runtime.startTurn({
      agentId: 'agent-1',
      agentName: ' ',
      sessionId: 'session-1',
      sessionTitle: ' ',
    });
    expect(mockSessions[0]?.input.props).toMatchObject({ title: 'Localized assistant' });

    await runtime._doStop();
  });

  test('updates the visible title while an Agent Session turn is active', async () => {
    const runtime = await createRuntime();
    runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: '',
    });

    runtime.updateSessionTitle('session-1', '  Renamed session  ');

    expect(mockSessions[0]?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ attribution: 'Alpha', title: 'Renamed session' }),
      { keepAlive: true, urgent: true },
    );
    await runtime._doStop();
  });

  test('delivers an iOS completion notice from a background terminal event and retires the Live Activity', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
    const notifyTurnFinished = jest.fn(async (event: ReplyCompletionNotificationEvent) => {
      await event.beforeDelivery?.();
      return true;
    });
    const dismissDestination = jest.fn();
    const runtime = await createRuntime(undefined, {
      dismissDestination,
      notifyTurnFinished,
      requestPermissionOnce: jest.fn(),
    });
    const turn = runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });

    // A new reply on a destination retires the previous completion notice.
    expect(dismissDestination).toHaveBeenCalledWith('cherrystudio:///?sessionId=session-1');

    turn.finish('completed');
    await flushOperations();

    expect(notifyTurnFinished).toHaveBeenCalledTimes(1);
    expect(notifyTurnFinished).toHaveBeenCalledWith(
      expect.objectContaining({
        deepLinkUrl: 'cherrystudio:///?sessionId=session-1',
        occurredInBackground: true,
        outcome: 'completed',
        title: 'First session',
      }),
    );
    // The delivered notice replaces the Live Activity card: the settled
    // surface for that destination retires through the manager's dismissal.
    expect(mockDismissTask).toHaveBeenCalledWith('cherrystudio:///?sessionId=session-1');
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    await runtime._doStop();
  });

  test('a foreground terminal event notifies with occurredInBackground false and never retires the surface', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    const notifyTurnFinished = jest.fn(async () => false);
    const runtime = await createRuntime(undefined, {
      dismissDestination: jest.fn(),
      notifyTurnFinished,
      requestPermissionOnce: jest.fn(),
    });
    const turn = runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: '',
    });
    turn.finish('failed');
    await flushOperations();

    expect(notifyTurnFinished).toHaveBeenCalledWith(
      expect.objectContaining({ occurredInBackground: false, outcome: 'failed' }),
    );
    expect(mockDismissTask).not.toHaveBeenCalled();
    await runtime._doStop();
  });

  test('a notification delivery failure never breaks the turn settlement', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
    const notifyTurnFinished = jest.fn(async () => {
      throw new Error('notification channel unavailable');
    });
    const runtime = await createRuntime(undefined, {
      dismissDestination: jest.fn(),
      notifyTurnFinished,
      requestPermissionOnce: jest.fn(),
    });
    const turn = runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: '',
    });
    const session = mockSessions[0];
    turn.finish('completed');
    await flushOperations();

    expect(session?.finish).toHaveBeenCalledWith(expect.objectContaining({ phase: 'completed' }));
    expect(mockDismissTask).not.toHaveBeenCalled();
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    await runtime._doStop();
  });

  test('keeps execution independent of completion-notification delivery', async () => {
    const notifyTurnFinished = jest.fn(async (event: ReplyCompletionNotificationEvent) => {
      await event.beforeDelivery?.();
      return true;
    });
    const dismissDestination = jest.fn();
    const runtime = await createRuntime(undefined, {
      dismissDestination,
      notifyTurnFinished,
      requestPermissionOnce: jest.fn(),
    });
    // The full notify-only lifecycle: preparation opens the logical turn, the
    // turn starts, and the preparation lease is released right after — the
    // generation interval must keep its own execution lease to ever reach the
    // terminal event that schedules the notice.
    const lease = runtime.acquirePreparation('session-1', jest.fn());
    const turn = runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });
    lease.release();

    // Live Activities are off, so no surface presents, but the session exists
    // and its generating keep-alive bit survives the preparation release. The
    // destination's notice channel is engaged for the new reply.
    expect(runtime.isReady).toBe(true);
    expect(mockStartSession).toHaveBeenCalledTimes(1);
    expect(mockSessions[0]?.input).toMatchObject({
      deepLinkUrl: 'cherrystudio:///?sessionId=session-1',
      keepAlive: true,
      props: expect.objectContaining({ phase: 'preparing' }),
    });
    expect(mockSessions[0]?.cancel).not.toHaveBeenCalled();
    expect(dismissDestination).toHaveBeenCalledWith('cherrystudio:///?sessionId=session-1');

    turn.finish('completed');
    await flushOperations();

    // The terminal event drains the session's own lease and delivers the
    // notice the whole run was kept alive for.
    expect(mockSessions[0]?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'completed' }),
      { keepAlive: true, urgent: true },
    );
    expect(notifyTurnFinished).toHaveBeenCalledTimes(1);
    expect(notifyTurnFinished).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'completed', occurredInBackground: false }),
    );
    await runtime._doStop();
  });

  test('holds a delivery lease across the finish window', async () => {
    const release = jest.fn();
    const runtime = await createRuntime(undefined, {
      dismissDestination: jest.fn(),
      requestPermissionOnce: jest.fn(),
      notifyTurnFinished: jest.fn(async () => false),
    });
    acquire.mockImplementationOnce(() => ({ release }));
    const turn = runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });

    turn.finish('completed');
    await flushOperations();

    expect(acquire).toHaveBeenCalledWith('chat.replyNotice');
    expect(release).toHaveBeenCalledTimes(1);
    await runtime._doStop();
  });

  test('keeps terminal content updateable until a finish dependency settles', async () => {
    const runtime = await createRuntime();
    const finishDependency = createDeferred();
    const turn = runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: '',
    });
    const session = mockSessions[0];

    turn.finish('completed', { waitFor: finishDependency.promise });

    expect(session?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'completed' }),
      { keepAlive: true, urgent: true },
    );
    await flushOperations();
    expect(session?.finish).not.toHaveBeenCalled();

    runtime.updateSessionTitle('session-1', 'Summary title');
    finishDependency.resolve();
    await flushOperations();
    expect(session?.finish).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'completed', title: 'Summary title' }),
    );
    await runtime._doStop();
  });

  test('bounds the final-title grace period when its dependency does not settle', async () => {
    const runtime = await createRuntime();
    jest.useFakeTimers();
    try {
      const turn = runtime.startTurn({
        agentId: 'agent-1',
        agentName: 'Alpha',
        sessionId: 'session-1',
        sessionTitle: '',
      });
      const session = mockSessions[0];

      turn.finish('completed', { waitFor: new Promise(() => {}) });
      await jest.advanceTimersByTimeAsync(4_999);
      expect(session?.finish).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      expect(session?.finish).toHaveBeenCalledWith(expect.objectContaining({ phase: 'completed' }));
    } finally {
      jest.useRealTimers();
      await runtime._doStop();
    }
  });

  test('marks phase changes urgent and keeps protection while approval is pending', async () => {
    const runtime = await createRuntime();
    const turn = runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });
    const session = mockSessions[0];

    turn.update({ parts: [textPart('hello')] });
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
      parts: [textPart('hello more')],
    });
    expect(session?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'responding' }),
      { keepAlive: true, urgent: false },
    );

    turn.awaitApproval({ parts: [] });
    expect(session?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        compactLabel: '等待审批',
        icon: 'bubble-exclamation',
        phase: 'awaiting-approval',
      }),
      { keepAlive: true, urgent: true },
    );

    turn.update({
      parts: [textPart('approved and continuing')],
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

  test('coalesces high-frequency reply preview updates and publishes the latest text', async () => {
    const runtime = await createRuntime();
    const turn = runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });
    const session = mockSessions[0];
    turn.update({ parts: [textPart('hello')] });
    session?.update.mockClear();

    jest.useFakeTimers();
    try {
      turn.update({ parts: [textPart('hello more')] }, { deferPreview: true });
      turn.update({ parts: [textPart('hello latest')] }, { deferPreview: true });

      expect(session?.update).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(999);
      expect(session?.update).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1);
      expect(session?.update).toHaveBeenCalledTimes(1);
      expect(session?.update).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'responding', preview: 'hello latest' }),
        { keepAlive: true, urgent: false },
      );
    } finally {
      jest.useRealTimers();
      await runtime._doStop();
    }
  });

  test('uses the latest deferred preview when the turn finishes before its timer fires', async () => {
    const runtime = await createRuntime();
    const turn = runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });
    const session = mockSessions[0];
    turn.update({ parts: [textPart('hello')] });
    turn.update({ parts: [textPart('latest complete reply')] }, { deferPreview: true });

    turn.finish('completed');
    await flushOperations();

    expect(session?.finish).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'completed', preview: 'latest complete reply' }),
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
        agentId: 'agent-1',
        agentName: 'Alpha',
        sessionId: 'session-1',
        sessionTitle: 'First session',
      });
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
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });
    const session = mockSessions[0];

    first.finish('completed');
    const second = runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });
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

  test('clearSession cancels the activity so approval records cannot recreate it later', async () => {
    const runtime = await createRuntime();
    const turn = runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });
    turn.awaitApproval();
    runtime.clearSession('session-1');
    expect(mockSessions[0]?.cancel).toHaveBeenCalledTimes(1);
    // A settled surface from an earlier turn outlives its session record.
    expect(mockDismissTask).toHaveBeenCalledWith(
      `${Constants.expoConfig!.scheme as string}:///?sessionId=session-1`,
    );

    turn.update({ parts: [textPart('late')] });
    expect(mockStartSession).toHaveBeenCalledTimes(1);
    await runtime._doStop();
  });

  test('ends sessions when stopped during an active turn and stops idempotently', async () => {
    const runtime = await createRuntime();
    runtime.startTurn({
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });
    await expect(runtime._doStop()).resolves.toBeUndefined();
    await expect(runtime._doStop()).resolves.toBeUndefined();
    expect(mockSessions[0]?.cancel).toHaveBeenCalledTimes(1);
  });

  test('isolates local and desktop conversations that share a session id', async () => {
    const runtime = await createRuntime();
    const input = {
      agentId: 'agent',
      agentName: 'Assistant',
      sessionId: 'same',
      sessionTitle: 'Original',
    };
    runtime.startTurn(input);
    runtime.startTurn({ ...input, connectionId: 'pc-one' });
    runtime.startTurn({ ...input, connectionId: 'pc-two' });
    expect(mockSessions).toHaveLength(3);
    expect(new Set(mockSessions.map((session) => session.input.deepLinkUrl)).size).toBe(3);
    runtime.updateSessionTitle('same', 'Renamed remote', 'pc-one');
    expect(mockSessions[1]!.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Renamed remote' }),
      expect.any(Object),
    );
    expect(mockSessions[0]!.update).not.toHaveBeenCalled();
    expect(mockSessions[2]!.update).not.toHaveBeenCalled();
    runtime.clearSession('same');
    expect(mockSessions[0]!.cancel).toHaveBeenCalledTimes(1);
    expect(mockSessions[1]!.cancel).not.toHaveBeenCalled();
    expect(mockSessions[2]!.cancel).not.toHaveBeenCalled();
    await runtime._doStop();
  });

  test('stopped runtimes cannot admit new turns', async () => {
    const runtime = await createRuntime();
    await runtime._doStop();
    const turn = runtime.startTurn({
      agentId: 'agent',
      agentName: 'Assistant',
      sessionId: 'session',
      sessionTitle: '',
    });
    turn.update({ parts: [textPart('ignored')] });
    turn.finish('completed');
    expect(mockStartSession).not.toHaveBeenCalled();
  });

  test('execution interruption targets the superseding turn of a shared session', async () => {
    const runtime = await createRuntime();
    const firstInterrupted = jest.fn();
    const nextInterrupted = jest.fn();
    const input = {
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'Chat',
    };
    runtime.startTurn({ ...input, onInterrupt: firstInterrupted });
    runtime.startTurn({ ...input, onInterrupt: nextInterrupted });
    expect(mockSessions).toHaveLength(1);
    const reason = new Error('Android foreground service expired');
    mockSessions[0]!.input.onInterrupt?.(reason);
    expect(firstInterrupted).not.toHaveBeenCalled();
    expect(nextInterrupted).toHaveBeenCalledWith(reason);
    expect(mockSessions[0]!.cancel).not.toHaveBeenCalled();
    await runtime._doStop();
    expect(mockSessions[0]!.cancel).toHaveBeenCalledTimes(1);
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
      agentId: 'agent-1',
      agentName: 'Alpha',
      sessionId: 'session-1',
      sessionTitle: 'First session',
    });
    expect(() =>
      turn.update({
        parts: [textPart('hello')],
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
        : key === 'chat.backgroundReply.awaitingApproval'
          ? '等待审批'
          : key === 'backgroundActivity.cancelled'
            ? '已取消'
            : key === 'backgroundActivity.completed'
              ? '已完成'
              : key === 'chat.backgroundReply.failed'
                ? '回复失败'
                : key,
    notifications?: ReplyCompletionNotifier,
  ) {
    const runtime = new BackgroundReplyRuntime(
      { dismissTask: mockDismissTask, startSession: mockStartSession },
      {
        assistantPresenter: undefined as never,
        ...(notifications ? { replyNotifications: notifications } : {}),
        translate,
      },
      { acquire },
    );
    await runtime._doInit();
    return runtime;
  }
});

async function flushOperations() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function textPart(text: string): AgentMessagePart {
  return { id: `text-${text}`, state: 'done', text, type: 'text' };
}
