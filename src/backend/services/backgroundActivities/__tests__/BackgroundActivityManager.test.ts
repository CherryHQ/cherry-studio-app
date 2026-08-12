import { AppState, type AppStateStatus, Platform } from 'react-native';

import type { BackgroundActivityBaseProps } from '@/shared/backgroundActivities/types';

import { BackgroundActivityManager } from '../BackgroundActivityManager';
import type { BackgroundActivityPresenter } from '../presenter';

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    exists = true;
    uri = 'file:///widgets/cherry-studio-logo.png';
    copy = jest.fn(async () => {});
  },
}));
jest.mock('expo-widgets', () => ({ widgetsDirectory: 'file:///widgets' }));

type TestProps = BackgroundActivityBaseProps & { detail: string };

function createMockPresenter() {
  const handles: { end: jest.Mock; update: jest.Mock }[] = [];
  const presenter = {
    clearOrphans: jest.fn(async () => 0),
    start: jest.fn((_props: TestProps, _deepLinkUrl?: string) => {
      const handle = { end: jest.fn(async () => {}), update: jest.fn(async () => {}) };
      handles.push(handle);
      return handle;
    }),
  } satisfies BackgroundActivityPresenter<TestProps> & {
    clearOrphans: jest.Mock;
    start: jest.Mock;
  };
  return { handles, presenter };
}

describe('BackgroundActivityManager', () => {
  let appStateListener: ((state: AppStateStatus) => void) | undefined;
  const mockLeases: { release: jest.Mock }[] = [];
  const mockAcquire = jest.fn((_tag: string) => {
    const lease = { release: jest.fn() };
    mockLeases.push(lease);
    return lease;
  });

  beforeEach(() => {
    appStateListener = undefined;
    mockLeases.length = 0;
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
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
    jest.restoreAllMocks();
  });

  test('sweeps orphaned surfaces from every presenter at construction', async () => {
    const first = createMockPresenter();
    const second = createMockPresenter();
    first.presenter.clearOrphans.mockResolvedValueOnce(2);
    const manager = await createManager([first.presenter, second.presenter]);
    await flushOperations();

    expect(first.presenter.clearOrphans).toHaveBeenCalledTimes(1);
    expect(second.presenter.clearOrphans).toHaveBeenCalledTimes(1);
    await manager._doStop();
  });

  test('starts the surface only in the background and injects the staged logo', async () => {
    const { handles, presenter } = createMockPresenter();
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      deepLinkUrl: 'cherrystudio://topics?topicId=t-1',
      presenter,
      props: makeProps('preparing'),
      tag: 'chat.topic-1',
    });
    await session.ready;
    expect(presenter.start).not.toHaveBeenCalled();

    appStateListener?.('background');
    await flushOperations();
    expect(presenter.start).toHaveBeenCalledTimes(1);
    expect(presenter.start).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'preparing',
        logoUri: 'file:///widgets/cherry-studio-logo.png',
      }),
      'cherrystudio://topics?topicId=t-1',
    );

    appStateListener?.('active');
    await flushOperations();
    expect(handles[0]?.end).toHaveBeenCalledWith('immediate', expect.any(Object));

    appStateListener?.('background');
    await flushOperations();
    expect(presenter.start).toHaveBeenCalledTimes(2);

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
    await session.ready;
    expect(mockAcquire).toHaveBeenCalledTimes(1);
    expect(mockAcquire).toHaveBeenCalledWith('chat.topic-1');

    session.update(makeProps('awaiting-approval'), { keepAlive: false });
    expect(mockLeases[0]?.release).toHaveBeenCalledTimes(1);

    session.update(makeProps('generating-again'), { keepAlive: true });
    expect(mockAcquire).toHaveBeenCalledTimes(2);

    session.cancel();
    expect(mockLeases[1]?.release).toHaveBeenCalledTimes(1);
    await manager._doStop();
  });

  test('applies urgent updates immediately and throttles the rest', async () => {
    const { handles, presenter } = createMockPresenter();
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      presenter,
      props: makeProps('one'),
      tag: 'chat.topic-1',
    });
    await session.ready;
    appStateListener?.('background');
    await flushOperations();
    expect(presenter.start).toHaveBeenCalledTimes(1);

    session.update(makeProps('two'));
    await flushOperations();
    expect(handles[0]?.update).not.toHaveBeenCalled();

    session.update(makeProps('three'), { urgent: true });
    await flushOperations();
    expect(handles[0]?.update).toHaveBeenCalledTimes(1);

    session.update(makeProps('four'));
    await flushOperations();
    expect(handles[0]?.update).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 1050));
    await flushOperations();
    expect(handles[0]?.update).toHaveBeenCalledTimes(2);

    session.cancel();
    await manager._doStop();
  });

  test('skips native work when nothing visible changed', async () => {
    const { handles, presenter } = createMockPresenter();
    const manager = await createManager([presenter]);
    const props = makeProps('same');
    const session = manager.startSession({ presenter, props, tag: 'chat.topic-1' });
    await session.ready;
    appStateListener?.('background');
    await flushOperations();

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
    await session.ready;
    appStateListener?.('background');
    await flushOperations();

    session.finish(makeProps('done'));
    await flushOperations();
    expect(handles[0]?.end).toHaveBeenCalledWith(
      'default',
      expect.objectContaining({ detail: 'done', finishedAtEpochMs: expect.any(Number) }),
    );

    session.update(makeProps('after-finish'), { urgent: true });
    await flushOperations();
    expect(handles[0]?.update).not.toHaveBeenCalled();
    await manager._doStop();
  });

  test('isolates presenter failures from the session lifecycle', async () => {
    const { presenter } = createMockPresenter();
    presenter.start.mockImplementationOnce(() => {
      throw new Error('activities unavailable');
    });
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      presenter,
      props: makeProps('start'),
      tag: 'chat.topic-1',
    });

    await expect(session.ready).resolves.toBeUndefined();
    appStateListener?.('background');
    await flushOperations();
    expect(presenter.start).toHaveBeenCalledTimes(1);

    session.cancel();
    await manager._doStop();
  });

  test('stop ends every session, releases leases, and no-ops later sessions', async () => {
    const { handles, presenter } = createMockPresenter();
    const manager = await createManager([presenter]);
    const session = manager.startSession({
      keepAlive: true,
      presenter,
      props: makeProps('running'),
      tag: 'chat.topic-1',
    });
    await session.ready;
    appStateListener?.('background');
    await flushOperations();

    await manager._doStop();
    expect(handles[0]?.end).toHaveBeenCalledWith('immediate', expect.any(Object));
    expect(mockLeases[0]?.release).toHaveBeenCalledTimes(1);

    const late = manager.startSession({
      keepAlive: true,
      presenter,
      props: makeProps('late'),
      tag: 'chat.topic-2',
    });
    await late.ready;
    expect(mockAcquire).toHaveBeenCalledTimes(1);
  });

  async function createManager(presenters: readonly { clearOrphans(): Promise<number> }[]) {
    const manager = new BackgroundActivityManager({ acquire: mockAcquire }, { presenters });
    await manager._doInit();
    return manager;
  }
});

function makeProps(detail: string): TestProps {
  return { detail, startedAtEpochMs: 1_000 };
}

async function flushOperations() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
