import { AppState, type AppStateStatus, Platform } from 'react-native';

import {
  BACKGROUND_ACTIVITY_LINGER_MS,
  type BackgroundActivityBaseProps,
} from '@/shared/backgroundActivity/types';

import { BackgroundActivityManager } from '../BackgroundActivityManager';
import type { BackgroundActivityPresenter } from '../presenter';

type TestProps = BackgroundActivityBaseProps & { detail: string };

function createMockPresenter(
  capabilities: Partial<
    Pick<BackgroundActivityPresenter<TestProps>, 'presentWhile' | 'shouldHoldLeaseUntilDelivery'>
  > = {},
) {
  const handles: { dismiss: jest.Mock; end: jest.Mock; isActive: jest.Mock; update: jest.Mock }[] =
    [];
  const presenter = {
    presentWhile: 'always',
    shouldHoldLeaseUntilDelivery: false,
    ...capabilities,
    clearOrphans: jest.fn(async () => 0),
    start: jest.fn((_props: TestProps, _deepLinkUrl?: string) => {
      const handle = {
        dismiss: jest.fn(async () => {}),
        end: jest.fn(async () => {}),
        isActive: jest.fn(() => true),
        update: jest.fn(async () => {}),
      };
      handles.push(handle);
      return handle;
    }),
  } satisfies BackgroundActivityPresenter<TestProps> & {
    clearOrphans: jest.Mock;
    start: jest.Mock;
  };
  return { handles, presenter };
}

describe.each(['ios', 'android'])('BackgroundActivityManager on %s', (platform) => {
  let appStateListener: ((state: AppStateStatus) => void) | undefined;
  let visibleTaskListener: ((deepLinkUrl: string | undefined) => void) | undefined;
  let presentationEnabledListener: (() => void) | undefined;
  let isPresentationEnabled: boolean;
  const mockLeases: { release: jest.Mock }[] = [];
  const mockPrepareLogo = jest.fn(async () => 'file:///widgets/cherry-studio-logo.png');
  const mockAcquire = jest.fn((_tag: string) => {
    const lease = { release: jest.fn() };
    mockLeases.push(lease);
    return lease;
  });

  beforeEach(() => {
    appStateListener = undefined;
    visibleTaskListener = undefined;
    presentationEnabledListener = undefined;
    isPresentationEnabled = true;
    mockLeases.length = 0;
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: platform });
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('sweeps orphaned surfaces and prepares the environment logo at initialization', async () => {
    const first = createMockPresenter();
    const second = createMockPresenter();
    first.presenter.clearOrphans.mockResolvedValueOnce(2);
    const manager = await createManager([first.presenter, second.presenter]);
    await flushOperations();

    expect(first.presenter.clearOrphans).toHaveBeenCalledTimes(1);
    expect(second.presenter.clearOrphans).toHaveBeenCalledTimes(1);
    expect(mockPrepareLogo).toHaveBeenCalledTimes(1);
    await manager._doStop();
  });

  test('starts the surface synchronously in the foreground and keeps it across AppState changes', async () => {
    const { handles, presenter } = createMockPresenter();
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      deepLinkUrl: 'cherrystudio:///?agentId=agent-1&sessionId=session-1',
      presenter,
      props: makeProps('preparing'),
      tag: 'chat.topic-1',
    });
    expect(presenter.start).toHaveBeenCalledTimes(1);
    expect(presenter.start).toHaveBeenCalledWith(
      expect.objectContaining({
        colorScheme: 'dark',
        detail: 'preparing',
        logoUri: 'file:///widgets/cherry-studio-logo.png',
      }),
      'cherrystudio:///?agentId=agent-1&sessionId=session-1',
    );
    appStateListener?.('inactive');
    appStateListener?.('background');
    appStateListener?.('active');
    await flushOperations();
    expect(presenter.start).toHaveBeenCalledTimes(1);
    expect(handles[0]?.end).not.toHaveBeenCalled();

    session.cancel();
    await flushOperations();
    expect(handles[0]?.end).toHaveBeenCalledWith(
      'immediate',
      expect.objectContaining({ finishedAtEpochMs: expect.any(Number) }),
      expect.objectContaining({ phaseStartedInBackground: expect.any(Boolean) }),
    );
    await manager._doStop();
  });

  test('keeps an app-hidden surface out of the foreground and recreates it with the latest props', async () => {
    const { handles, presenter } = createMockPresenter({ presentWhile: 'app-hidden' });
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      keepAlive: true,
      presenter,
      props: makeProps('one'),
      tag: 'chat.topic-1',
    });
    session.update(makeProps('two'), { urgent: true });
    expect(presenter.start).not.toHaveBeenCalled();

    appStateListener?.('inactive');
    expect(presenter.start).toHaveBeenCalledTimes(1);
    expect(presenter.start).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'two' }),
      undefined,
    );
    appStateListener?.('background');
    expect(presenter.start).toHaveBeenCalledTimes(1);

    // Returning retires the surface without ending the session or its lease.
    appStateListener?.('active');
    await flushOperations();
    expect(handles[0]!.end).toHaveBeenCalledWith(
      'immediate',
      expect.objectContaining({ detail: 'two' }),
      expect.objectContaining({ phaseStartedInBackground: expect.any(Boolean) }),
    );
    expect(mockLeases[0]!.release).not.toHaveBeenCalled();

    session.update(makeProps('three'), { urgent: true });
    await flushOperations();
    expect(handles[0]!.update).not.toHaveBeenCalled();

    appStateListener?.('inactive');
    expect(presenter.start).toHaveBeenCalledTimes(2);
    expect(presenter.start).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: 'three' }),
      undefined,
    );

    session.cancel();
    await flushOperations();
    expect(mockLeases[0]!.release).toHaveBeenCalledTimes(1);
    await manager._doStop();
  });

  test('never creates an app-hidden surface while the session runs in the foreground', async () => {
    const { presenter } = createMockPresenter({ presentWhile: 'app-hidden' });
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      deepLinkUrl: 'cherrystudio:///?sessionId=session-1',
      presenter,
      props: makeProps('running'),
      tag: 'chat.topic-1',
    });
    await session.finish(makeProps('completed'));
    await flushOperations();
    expect(presenter.start).not.toHaveBeenCalled();
    await manager._doStop();
  });

  test.each(['return', 'update', 'finish'] as const)(
    'respects native dismissal detected on %s without interrupting the task',
    async (detection) => {
      const { handles, presenter } = createMockPresenter({ presentWhile: 'app-hidden' });
      const manager = await createManager([presenter]);
      const input = {
        deepLinkUrl: 'cherrystudio:///?sessionId=session-1',
        keepAlive: true,
        presenter,
        props: makeProps('running'),
        tag: 'chat.topic-1',
      };
      const session = manager.startSession(input);
      appStateListener?.('inactive');
      appStateListener?.('background');
      handles[0]!.isActive.mockReturnValue(false);

      if (detection === 'update') {
        session.update(makeProps('more text'), { urgent: true });
        await flushOperations();
      } else if (detection === 'finish') {
        await session.finish(makeProps('completed'));
      }
      appStateListener?.('active');
      appStateListener?.('inactive');
      appStateListener?.('active');
      appStateListener?.('inactive');
      await flushOperations();

      expect(presenter.start).toHaveBeenCalledTimes(1);
      expect(handles[0]!.update).not.toHaveBeenCalled();
      expect(handles[0]!.end).not.toHaveBeenCalled();
      if (detection !== 'finish') expect(mockLeases[0]!.release).not.toHaveBeenCalled();
      await session.finish(makeProps('completed'));
      expect(mockLeases[0]!.release).toHaveBeenCalledTimes(1);
      visibleTaskListener?.(input.deepLinkUrl);
      await flushOperations();
      expect(handles[0]!.dismiss).not.toHaveBeenCalled();

      // A new task at the same destination gets a new presentation opportunity.
      appStateListener?.('active');
      manager.startSession(input);
      appStateListener?.('inactive');
      expect(presenter.start).toHaveBeenCalledTimes(2);
      await manager._doStop();
    },
  );

  test('gates both chat and painting surfaces without taking away their execution leases', async () => {
    isPresentationEnabled = false;
    const chat = createMockPresenter({ presentWhile: 'app-hidden' });
    const painting = createMockPresenter({ presentWhile: 'app-hidden' });
    const manager = await createManager([chat.presenter, painting.presenter]);
    const sessions = [chat, painting].map(({ presenter }) =>
      manager.startSession({ keepAlive: true, presenter, props: makeProps('one'), tag: 'task' }),
    );
    appStateListener?.('inactive');
    expect(chat.presenter.start).not.toHaveBeenCalled();
    expect(painting.presenter.start).not.toHaveBeenCalled();
    expect(mockLeases).toHaveLength(2);
    for (const lease of mockLeases) expect(lease.release).not.toHaveBeenCalled();
    for (const session of sessions) session.update(makeProps('two'));

    appStateListener?.('active');
    isPresentationEnabled = true;
    presentationEnabledListener?.();
    expect(chat.presenter.start).not.toHaveBeenCalled();
    expect(painting.presenter.start).not.toHaveBeenCalled();
    appStateListener?.('inactive');
    for (const { presenter } of [chat, painting]) {
      expect(presenter.start).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'two' }),
        undefined,
      );
    }
    await manager._doStop();
  });

  test('turning presentation off removes running and settled cards across presenters', async () => {
    const chat = createMockPresenter({ presentWhile: 'app-hidden' });
    const painting = createMockPresenter({ presentWhile: 'app-hidden' });
    const manager = await createManager([chat.presenter, painting.presenter]);
    const chatSession = manager.startSession({
      deepLinkUrl: 'cherrystudio:///?sessionId=session-1',
      presenter: chat.presenter,
      props: makeProps('chat'),
      tag: 'chat',
    });
    const paintingSession = manager.startSession({
      keepAlive: true,
      presenter: painting.presenter,
      props: makeProps('painting'),
      tag: 'painting',
    });
    appStateListener?.('inactive');
    await chatSession.finish(makeProps('completed'));

    isPresentationEnabled = false;
    presentationEnabledListener?.();
    await flushOperations();
    expect(chat.handles[0]!.dismiss).toHaveBeenCalledTimes(1);
    expect(painting.handles[0]!.end).toHaveBeenCalledWith(
      'immediate',
      expect.any(Object),
      expect.any(Object),
    );
    expect(mockLeases[0]!.release).not.toHaveBeenCalled();
    appStateListener?.('active');
    appStateListener?.('inactive');
    await paintingSession.finish(makeProps('completed'));
    expect(painting.presenter.start).toHaveBeenCalledTimes(1);
    expect(mockLeases[0]!.release).toHaveBeenCalledTimes(1);
    await manager._doStop();
    expect(presentationEnabledListener).toBeUndefined();
  });

  test('dismisses a settled surface when the user opens its destination', async () => {
    const { handles, presenter } = createMockPresenter({ presentWhile: 'app-hidden' });
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      deepLinkUrl: 'cherrystudio:///?sessionId=session-1',
      presenter,
      props: makeProps('running'),
      tag: 'chat.topic-1',
    });
    appStateListener?.('inactive');
    await session.finish(makeProps('completed'));
    await flushOperations();
    expect(handles[0]!.end).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ detail: 'completed' }),
      expect.objectContaining({ phaseStartedInBackground: expect.any(Boolean) }),
    );

    // Another conversation's surface stays untouched.
    visibleTaskListener?.('cherrystudio:///?sessionId=session-2');
    visibleTaskListener?.(undefined);
    await flushOperations();
    expect(handles[0]!.dismiss).not.toHaveBeenCalled();

    visibleTaskListener?.('cherrystudio:///?sessionId=session-1');
    await flushOperations();
    expect(handles[0]!.dismiss).toHaveBeenCalledTimes(1);

    visibleTaskListener?.('cherrystudio:///?sessionId=session-1');
    await flushOperations();
    expect(handles[0]!.dismiss).toHaveBeenCalledTimes(1);
    await manager._doStop();
  });

  test('dismisses a settled surface when a new session takes over its destination', async () => {
    jest.useFakeTimers();
    const { handles, presenter } = createMockPresenter({ presentWhile: 'app-hidden' });
    const manager = await createManager([presenter]);
    const deepLinkUrl = 'cherrystudio:///?sessionId=session-1';
    const first = manager.startSession({
      deepLinkUrl,
      presenter,
      props: makeProps('running'),
      tag: 'chat.topic-1',
    });
    appStateListener?.('inactive');
    await first.finish(makeProps('completed'));
    await flushMicrotasks();

    manager.startSession({ deepLinkUrl, presenter, props: makeProps('next'), tag: 'chat.topic-1' });
    await flushMicrotasks();
    expect(handles[0]!.dismiss).toHaveBeenCalledTimes(1);

    // The retained reference is released once the platform retires the surface.
    await jest.advanceTimersByTimeAsync(BACKGROUND_ACTIVITY_LINGER_MS);
    visibleTaskListener?.(deepLinkUrl);
    await flushMicrotasks();
    expect(handles[1]?.dismiss).not.toHaveBeenCalled();
    await manager._doStop();
  });

  test('dismisses a settled surface seen while its final delivery is in flight', async () => {
    const { handles, presenter } = createMockPresenter({ presentWhile: 'app-hidden' });
    const manager = await createManager([presenter]);
    const deepLinkUrl = 'cherrystudio:///?sessionId=session-1';
    const session = manager.startSession({
      deepLinkUrl,
      presenter,
      props: makeProps('running'),
      tag: 'chat.topic-1',
    });
    appStateListener?.('inactive');

    let deliverEnd: (() => void) | undefined;
    handles[0]!.end.mockImplementationOnce(
      () => new Promise<void>((resolve) => (deliverEnd = resolve)),
    );
    const finished = session.finish(makeProps('completed'));
    await flushMicrotasks();

    // The user reaches the conversation before the platform confirms the end.
    visibleTaskListener?.(deepLinkUrl);
    deliverEnd?.();
    await finished;
    await flushOperations();
    expect(handles[0]!.dismiss).toHaveBeenCalledTimes(1);
    await manager._doStop();
  });

  test('forgets settled surfaces that outlive the linger window', async () => {
    jest.useFakeTimers();
    const { handles, presenter } = createMockPresenter({ presentWhile: 'app-hidden' });
    const manager = await createManager([presenter]);
    const deepLinkUrl = 'cherrystudio:///?sessionId=session-1';
    const session = manager.startSession({
      deepLinkUrl,
      presenter,
      props: makeProps('running'),
      tag: 'chat.topic-1',
    });
    appStateListener?.('inactive');
    await session.finish(makeProps('completed'));
    await flushMicrotasks();

    await jest.advanceTimersByTimeAsync(BACKGROUND_ACTIVITY_LINGER_MS);
    visibleTaskListener?.(deepLinkUrl);
    await flushMicrotasks();
    expect(handles[0]!.dismiss).not.toHaveBeenCalled();
    await manager._doStop();
  });

  test('keeps a cancelled surface out of the settled set', async () => {
    const { handles, presenter } = createMockPresenter({ presentWhile: 'app-hidden' });
    const manager = await createManager([presenter]);
    const deepLinkUrl = 'cherrystudio:///?sessionId=session-1';
    const session = manager.startSession({
      deepLinkUrl,
      presenter,
      props: makeProps('running'),
      tag: 'chat.topic-1',
    });
    appStateListener?.('inactive');
    session.cancel();
    await flushOperations();

    visibleTaskListener?.(deepLinkUrl);
    await flushOperations();
    expect(handles[0]!.dismiss).not.toHaveBeenCalled();
    await manager._doStop();
  });

  test('refreshes AppState during initialization instead of using the constructor snapshot', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
    const { presenter } = createMockPresenter({ presentWhile: 'app-hidden' });
    const manager = new BackgroundActivityManager(
      { acquire: mockAcquire },
      {
        getColorScheme: () => 'dark',
        isPresentationEnabled: () => isPresentationEnabled,
        subscribePresentationEnabled,
        prepareLogo: mockPrepareLogo,
        presenters: [presenter],
        subscribeVisibleTask,
      },
    );
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    await manager._doInit();

    const session = manager.startSession({
      presenter,
      props: makeProps('foreground'),
      tag: 'chat.topic-1',
    });
    expect(presenter.start).not.toHaveBeenCalled();
    appStateListener?.('inactive');
    expect(presenter.start).toHaveBeenCalledTimes(1);

    session.cancel();
    await manager._doStop();
  });

  test('mirrors the keepAlive bit into coordinator leases', async () => {
    const { presenter } = createMockPresenter();
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      keepAlive: true,
      presenter,
      props: makeProps('generating'),
      tag: 'chat.topic-1',
    });
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    expect(mockAcquire).toHaveBeenCalledWith('chat.topic-1', undefined);

    session.update(makeProps('awaiting-approval'), { keepAlive: false });
    expect(mockLeases[0]?.release).toHaveBeenCalledTimes(1);

    session.update(makeProps('generating-again'), { keepAlive: true });
    expect(mockAcquire).toHaveBeenCalledTimes(2);

    session.cancel();
    expect(mockLeases[1]?.release).toHaveBeenCalledTimes(1);
    await manager._doStop();
  });

  test('protects approval delivery when the presenter requires an execution lease', async () => {
    const { presenter, handles } = createMockPresenter({ shouldHoldLeaseUntilDelivery: true });
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      keepAlive: true,
      presenter,
      props: makeProps('generating'),
      tag: 'chat',
    });
    let finishUpdate!: () => void;
    handles[0]!.update.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishUpdate = resolve;
        }),
    );
    session.update(makeProps('awaiting-approval'), { keepAlive: false, urgent: true });
    await flushOperations();
    expect(mockLeases[0]!.release).not.toHaveBeenCalled();
    finishUpdate();
    await flushOperations();
    expect(mockLeases[0]!.release).toHaveBeenCalledTimes(1);
    session.cancel();
    await manager._doStop();
  });

  test.each(['update', 'finish', 'cancel'] as const)(
    'protects %s delivery when an older progress update is pending',
    async (terminalAction) => {
      const { presenter, handles } = createMockPresenter({ shouldHoldLeaseUntilDelivery: true });
      const manager = await createManager([presenter]);
      const session = manager.startSession({
        keepAlive: true,
        presenter,
        props: makeProps('starting'),
        tag: 'chat',
      });
      let releaseProgress!: () => void;
      handles[0]!.update.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseProgress = resolve;
          }),
      );
      session.update(makeProps('responding'), { urgent: true });
      await flushOperations();

      let releaseTerminal!: () => void;
      const pendingTerminal = () =>
        new Promise<void>((resolve) => {
          releaseTerminal = resolve;
        });
      if (terminalAction === 'update') {
        handles[0]!.update.mockImplementationOnce(pendingTerminal);
        session.update(makeProps('awaiting-approval'), { keepAlive: false, urgent: true });
        // A repeated projection with identical content must also await delivery.
        session.update(makeProps('awaiting-approval'), { keepAlive: false });
      } else {
        handles[0]!.end.mockImplementationOnce(pendingTerminal);
        if (terminalAction === 'finish') void session.finish(makeProps('completed'));
        else session.cancel();
      }
      expect(mockLeases[0]!.release).not.toHaveBeenCalled();
      releaseProgress();
      await flushOperations();
      expect(mockLeases[0]!.release).not.toHaveBeenCalled();
      releaseTerminal();
      await flushOperations();
      expect(mockLeases[0]!.release).toHaveBeenCalledTimes(1);
      session.cancel();
      await manager._doStop();
    },
  );

  test('starts a surface that represents work regardless of what the user sees', async () => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
    const { presenter, handles } = createMockPresenter({ presentWhile: 'always' });
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      presenter,
      props: makeProps('generating'),
      tag: 'painting',
    });
    expect(presenter.start).toHaveBeenCalledTimes(1);
    session.finish(makeProps('completed'));
    await flushOperations();
    expect(handles[0]!.end).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ detail: 'completed' }),
      expect.objectContaining({ phaseStartedInBackground: expect.any(Boolean) }),
    );
    await manager._doStop();
  });

  test('applies urgent updates immediately and throttles updates across AppState changes', async () => {
    jest.useFakeTimers();
    const { handles, presenter } = createMockPresenter();
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      presenter,
      props: makeProps('one'),
      tag: 'chat.topic-1',
    });
    expect(presenter.start).toHaveBeenCalledTimes(1);

    session.update(makeProps('two'));
    await flushMicrotasks();
    expect(handles[0]?.update).not.toHaveBeenCalled();

    session.update(makeProps('three'), { urgent: true });
    await flushMicrotasks();
    expect(handles[0]?.update).toHaveBeenCalledTimes(1);

    appStateListener?.('background');
    session.update(makeProps('four'));
    await flushMicrotasks();
    expect(handles[0]?.update).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_000);
    await flushMicrotasks();
    expect(handles[0]?.update).toHaveBeenCalledTimes(2);

    session.cancel();
    await manager._doStop();
  });

  test('skips native work when nothing visible changed', async () => {
    const { handles, presenter } = createMockPresenter();
    const manager = await createManager([presenter]);
    const props = makeProps('same');
    const session = manager.startSession({ presenter, props, tag: 'chat.topic-1' });
    session.update({ ...props }, { urgent: true });
    await flushOperations();
    expect(handles[0]?.update).not.toHaveBeenCalled();

    session.cancel();
    await manager._doStop();
  });

  test('finish stamps finishedAtEpochMs and ends under the default policy', async () => {
    const { handles, presenter } = createMockPresenter();
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      presenter,
      props: makeProps('running'),
      tag: 'chat.topic-1',
    });
    session.finish(makeProps('done'));
    session.finish(makeProps('late-finish'));
    await flushOperations();
    expect(handles[0]?.end).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ detail: 'done', finishedAtEpochMs: expect.any(Number) }),
      expect.objectContaining({ phaseStartedInBackground: expect.any(Boolean) }),
    );
    expect(handles[0]?.end).not.toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ detail: 'late-finish' }),
      expect.objectContaining({ phaseStartedInBackground: expect.any(Boolean) }),
    );

    session.update(makeProps('after-finish'), { urgent: true });
    await flushOperations();
    expect(handles[0]?.update).not.toHaveBeenCalled();
    await manager._doStop();
  });

  test('isolates presenter failures and retries them only in the next presentation window', async () => {
    const { presenter } = createMockPresenter({ presentWhile: 'app-hidden' });
    presenter.start.mockImplementationOnce(() => {
      throw new Error('activities unavailable');
    });
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      presenter,
      props: makeProps('start'),
      tag: 'chat.topic-1',
    });

    appStateListener?.('inactive');
    expect(presenter.start).toHaveBeenCalledTimes(1);
    // The same window never retries a refused surface.
    appStateListener?.('background');
    session.update(makeProps('update'), { urgent: true });
    await flushOperations();
    expect(presenter.start).toHaveBeenCalledTimes(1);

    appStateListener?.('active');
    appStateListener?.('inactive');
    expect(presenter.start).toHaveBeenCalledTimes(2);

    session.cancel();
    await manager._doStop();
  });

  test('finish waits for queued platform delivery even when the caller owns the execution lease', async () => {
    const { handles, presenter } = createMockPresenter();
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      keepAlive: false,
      presenter,
      props: makeProps('preparing'),
      tag: 'painting',
    });
    let releaseUpdate!: () => void;
    handles[0]!.update.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseUpdate = resolve;
        }),
    );
    session.update(makeProps('responding'), { urgent: true });
    await flushOperations();
    let releaseEnd!: () => void;
    handles[0]!.end.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseEnd = resolve;
        }),
    );
    let finished = false;
    const finish = session.finish(makeProps('completed')).then(() => {
      finished = true;
    });
    await flushOperations();
    expect(finished).toBe(false);
    expect(handles[0]!.end).not.toHaveBeenCalled();
    releaseUpdate();
    await flushOperations();
    expect(handles[0]!.end).toHaveBeenCalled();
    expect(finished).toBe(false);
    releaseEnd();
    await finish;
    expect(finished).toBe(true);
    await manager._doStop();
  });

  test('stop ends every session, releases leases, and no-ops later sessions', async () => {
    const { handles, presenter } = createMockPresenter();
    const manager = await createManager([presenter]);
    manager.startSession({
      keepAlive: true,
      presenter,
      props: makeProps('running'),
      tag: 'chat.topic-1',
    });
    await manager._doStop();
    expect(handles[0]?.end).toHaveBeenCalledWith(
      'immediate',
      expect.objectContaining({ finishedAtEpochMs: expect.any(Number) }),
      expect.objectContaining({ phaseStartedInBackground: expect.any(Boolean) }),
    );
    expect(mockLeases[0]?.release).toHaveBeenCalledTimes(1);

    manager.startSession({
      keepAlive: true,
      presenter,
      props: makeProps('late'),
      tag: 'chat.topic-2',
    });
    expect(mockAcquire).toHaveBeenCalledTimes(1);
  });

  test('preserves phase-entry visibility through the delivery queue and late title projection', async () => {
    const { presenter, handles } = createMockPresenter();
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      presenter,
      props: { ...makeProps('running'), phase: 'responding' },
      tag: 'chat',
    });
    let releaseUpdate!: () => void;
    handles[0]!.update.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseUpdate = resolve;
        }),
    );
    session.update({ ...makeProps('streaming'), phase: 'responding' }, { urgent: true });
    await flushMicrotasks();
    session.update({ ...makeProps('done'), phase: 'completed' }, { urgent: true });
    appStateListener?.('background');
    session.update({ ...makeProps('final title'), phase: 'completed' }, { urgent: true });
    const finished = session.finish({ ...makeProps('final title'), phase: 'completed' });
    releaseUpdate();
    await finished;
    expect(handles[0]!.end).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ phase: 'completed' }),
      { phaseStartedInBackground: false },
    );
    await manager._doStop();
  });

  async function createManager(presenters: readonly { clearOrphans(): Promise<number> }[]) {
    const manager = new BackgroundActivityManager(
      { acquire: mockAcquire },
      {
        getColorScheme: () => 'dark',
        isPresentationEnabled: () => isPresentationEnabled,
        subscribePresentationEnabled,
        prepareLogo: mockPrepareLogo,
        presenters,
        subscribeVisibleTask,
      },
    );
    await manager._doInit();
    return manager;
  }

  function subscribeVisibleTask(listener: (deepLinkUrl: string | undefined) => void) {
    visibleTaskListener = listener;
    return () => {
      visibleTaskListener = undefined;
    };
  }

  function subscribePresentationEnabled(listener: () => void) {
    presentationEnabledListener = listener;
    return () => {
      presentationEnabledListener = undefined;
    };
  }
});

function makeProps(detail: string): TestProps {
  return { detail, startedAtEpochMs: 1_000 };
}

async function flushOperations() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

async function flushMicrotasks() {
  for (let index = 0; index < 4; index += 1) await Promise.resolve();
}
