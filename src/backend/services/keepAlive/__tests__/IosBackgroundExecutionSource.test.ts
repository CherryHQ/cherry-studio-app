import { AppState, type AppStateStatus } from 'react-native';

import { IosBackgroundExecutionSource } from '../IosBackgroundExecutionSource';

const mockBegin = jest.fn<Promise<boolean>, [string]>();
const mockEnd = jest.fn<Promise<void>, [string]>();
const mockBeginAudio = jest.fn<Promise<boolean>, [string]>();
const mockEndAudio = jest.fn<Promise<void>, [string]>();
const mockRemove = jest.fn();
let mockExpire: (event: { id: string }) => void;
let mockAudioState: (event: { id: string; active: boolean }) => void;
let consent: boolean | null;
let changeConsent: () => void;
const preference = { readCached: jest.fn(), subscribeChange: jest.fn() };

jest.mock('../../../../../modules/system-integration', () => ({
  getSystemIntegration: () => ({
    beginBackgroundExecution: mockBegin,
    endBackgroundExecution: mockEnd,
    beginBackgroundAudioExecution: mockBeginAudio,
    endBackgroundAudioExecution: mockEndAudio,
    addListener: (event: string, listener: typeof mockExpire | typeof mockAudioState) => {
      if (event === 'onBackgroundExecutionExpired') mockExpire = listener as typeof mockExpire;
      else mockAudioState = listener as typeof mockAudioState;
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
    mockBeginAudio.mockResolvedValue(true);
    mockEndAudio.mockResolvedValue(undefined);
    consent = null;
    preference.readCached.mockImplementation(() => consent);
    preference.subscribeChange.mockImplementation(() => (listener: () => void) => {
      changeConsent = listener;
      return jest.fn();
    });
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
  });

  afterEach(() => jest.restoreAllMocks());

  test('shares a finite window and ends it only after the last idempotent release', async () => {
    const source = new IosBackgroundExecutionSource(preference);
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
    expect(mockRemove).toHaveBeenCalledTimes(2);
  });

  test('expiration interrupts each held consumer once and cannot renew while backgrounded', async () => {
    const source = new IosBackgroundExecutionSource(preference);
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
    const source = new IosBackgroundExecutionSource(preference);
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
    const source = new IosBackgroundExecutionSource(preference);
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

  test.each([null, false])(
    'does not start audio without an explicit true decision (%s)',
    async (decision) => {
      consent = decision;
      const source = new IosBackgroundExecutionSource(preference);
      await source._doInit();
      source.acquire('chat');
      await flushOperations();
      expect(mockBeginAudio).not.toHaveBeenCalled();
      expect(mockBegin).toHaveBeenCalledTimes(1);
      await source._doStop();
    },
  );

  test('consent upgrades unfinished work and audio survives finite expiry until it is interrupted', async () => {
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const interrupt = jest.fn();
    source.acquire('chat', interrupt);
    await flushOperations();
    consent = true;
    changeConsent();
    await flushOperations();
    expect(mockBeginAudio).toHaveBeenCalledTimes(1);
    const audioId = mockBeginAudio.mock.calls[0][0];
    changeState('background');
    mockExpire({ id: mockBegin.mock.calls[0][0] });
    await flushOperations();
    expect(interrupt).not.toHaveBeenCalled();
    expect(source.getStatus()).toBe('limited');
    source.acquire('second', interrupt);
    await flushOperations();
    expect(mockBeginAudio).toHaveBeenCalledTimes(1);
    mockAudioState({ id: audioId, active: false });
    await flushOperations();
    expect(interrupt).toHaveBeenCalledTimes(2);
    expect(source.getStatus()).toBe('interrupted');
    expect(mockEndAudio).toHaveBeenCalledWith(audioId);
    mockAudioState({ id: audioId, active: true });
    expect(source.getStatus()).toBe('interrupted');
    expect(mockBegin).toHaveBeenCalledTimes(1);
    await source._doStop();
  });

  test('the last release stops shared audio and finite protection even when release repeats', async () => {
    consent = true;
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const first = source.acquire('chat');
    const second = source.acquire('painting');
    await flushOperations();
    first.release();
    first.release();
    await flushOperations();
    expect(mockEndAudio).not.toHaveBeenCalled();
    second.release();
    await flushOperations();
    expect(mockEndAudio).toHaveBeenCalledTimes(1);
    expect(mockEnd).toHaveBeenCalledTimes(1);
    expect(source.getStatus()).toBe('idle');
    await source._doStop();
  });

  test('a newer audio-loss event wins over a pending admission response and falls back to UIKit', async () => {
    consent = true;
    mockBeginAudio.mockImplementation(async (id) => {
      mockAudioState({ id, active: false });
      return true;
    });
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const interrupt = jest.fn();
    source.acquire('chat', interrupt);
    await flushOperations();
    changeState('background');
    expect(interrupt).not.toHaveBeenCalled();
    mockExpire({ id: mockBegin.mock.calls[0][0] });
    await flushOperations();
    expect(interrupt).toHaveBeenCalledTimes(1);
    await source._doStop();
  });

  test('revoking consent ends audio while retaining the remaining finite window', async () => {
    consent = true;
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const interrupt = jest.fn();
    source.acquire('chat', interrupt);
    await flushOperations();
    changeState('background');
    consent = false;
    changeConsent();
    await flushOperations();
    expect(mockEndAudio).toHaveBeenCalledTimes(1);
    expect(mockEnd).not.toHaveBeenCalled();
    expect(interrupt).not.toHaveBeenCalled();
    mockExpire({ id: mockBegin.mock.calls[0][0] });
    await flushOperations();
    expect(interrupt).toHaveBeenCalledTimes(1);
    await source._doStop();
  });

  test('background entry retries failed foreground audio admission before the finite window expires', async () => {
    consent = true;
    mockBeginAudio.mockResolvedValueOnce(false);
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const interrupt = jest.fn();
    source.acquire('chat', interrupt);
    await flushOperations();
    expect(mockBeginAudio).toHaveBeenCalledTimes(1);
    changeState('background');
    await flushOperations();
    expect(mockBeginAudio).toHaveBeenCalledTimes(2);
    mockExpire({ id: mockBegin.mock.calls[0][0] });
    await flushOperations();
    expect(interrupt).not.toHaveBeenCalled();
    await source._doStop();
  });
});

async function flushOperations(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}
