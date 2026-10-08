import { AppState, type AppStateStatus } from 'react-native';

import { IosBackgroundExecutionSource } from '../IosBackgroundExecutionSource';

const mockBegin = jest.fn<Promise<boolean>, [string]>();
const mockEnd = jest.fn<Promise<void>, [string]>();
const mockRemove = jest.fn();
let mockExpire: (event: { id: string }) => void;

jest.mock('../../../../../modules/system-integration', () => ({
  getSystemIntegration: () => ({
    beginBackgroundExecution: mockBegin,
    endBackgroundExecution: mockEnd,
    addListener: (_event: string, listener: typeof mockExpire) => {
      mockExpire = listener;
      return { remove: mockRemove };
    },
  }),
}));

describe('IosBackgroundExecutionSource', () => {
  let appStateListener: (state: AppStateStatus) => void;
  const changeState = (state: AppStateStatus) => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: state });
    appStateListener(state);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockBegin.mockResolvedValue(true);
    mockEnd.mockResolvedValue(undefined);
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => jest.restoreAllMocks());

  test('shares a finite window and ends it only after the last idempotent release', async () => {
    const source = new IosBackgroundExecutionSource();
    await source._doInit();
    const first = source.acquire('chat');
    const second = source.acquire('painting');
    await flushOperations();
    expect(source.getStatus()).toBe('limited');
    expect(mockBegin).toHaveBeenCalledTimes(1);
    const id = mockBegin.mock.calls[0][0];
    first.release();
    first.release();
    await flushOperations();
    expect(mockEnd).not.toHaveBeenCalled();
    second.release();
    await flushOperations();
    expect(mockEnd).toHaveBeenCalledWith(id);
    expect(source.getStatus()).toBe('idle');
    await source._doStop();
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  test('expiration interrupts each held consumer once and cannot renew while backgrounded', async () => {
    const source = new IosBackgroundExecutionSource();
    await source._doInit();
    const interrupted = jest.fn();
    const released = jest.fn();
    const first = source.acquire('chat', interrupted);
    source.acquire('painting', interrupted);
    source.acquire('finished', released).release();
    await flushOperations();
    changeState('background');
    const id = mockBegin.mock.calls[0][0];
    mockExpire({ id });
    mockExpire({ id });
    await flushOperations();
    expect(interrupted).toHaveBeenCalledTimes(2);
    expect(released).not.toHaveBeenCalled();
    expect(source.getStatus()).toBe('interrupted');
    const late = jest.fn();
    source.acquire('late', late);
    await flushOperations();
    expect(late).toHaveBeenCalledTimes(1);
    expect(mockBegin).toHaveBeenCalledTimes(1);
    first.release();
    changeState('active');
    await flushOperations();
    expect(mockBegin).toHaveBeenCalledTimes(2);
    mockExpire({ id });
    expect(source.getStatus()).toBe('limited');
    expect(interrupted).toHaveBeenCalledTimes(2);
    await source._doStop();
  });

  test('denied foreground admission leaves foreground work usable but interrupts on background entry', async () => {
    mockBegin.mockResolvedValue(false);
    const source = new IosBackgroundExecutionSource();
    await source._doInit();
    const interrupted = jest.fn();
    source.acquire('chat', interrupted);
    await flushOperations();
    expect(interrupted).not.toHaveBeenCalled();
    expect(source.getStatus()).toBe('limited');
    changeState('background');
    await flushOperations();
    expect(interrupted).toHaveBeenCalledTimes(1);
    expect(mockBegin).toHaveBeenCalledTimes(1);
    await source._doStop();
  });

  test('disposal waits for pending admission then ends its assertion', async () => {
    let admit!: (value: boolean) => void;
    mockBegin.mockImplementation(
      () =>
        new Promise((resolve) => {
          admit = resolve;
        }),
    );
    const source = new IosBackgroundExecutionSource();
    await source._doInit();
    const interrupted = jest.fn();
    source.acquire('chat', interrupted);
    await flushOperations();
    const stopped = source._doStop();
    admit(true);
    await stopped;
    expect(mockEnd).toHaveBeenCalledWith(mockBegin.mock.calls[0][0]);
    mockExpire({ id: mockBegin.mock.calls[0][0] });
    source.acquire('late', interrupted).release();
    await flushOperations();
    expect(interrupted).not.toHaveBeenCalled();
    expect(mockBegin).toHaveBeenCalledTimes(1);
  });
});

async function flushOperations(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}
