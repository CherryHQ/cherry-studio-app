import { randomUUID as mockRandomUUID } from 'node:crypto';

import { AppState, type AppStateStatus } from 'react-native';

import { IosBackgroundExecutionSource } from '../IosBackgroundExecutionSource';
import type { KeepAliveTask } from '../KeepAliveCoordinator';
import { KeepAliveInterruptionError } from '../KeepAliveInterruptionError';

const mockBegin = jest.fn<Promise<boolean>, [string]>();
const mockEnd = jest.fn<Promise<void>, [string]>();
const mockBeginAudio = jest.fn<Promise<boolean>, [string]>();
const mockEndAudio = jest.fn<Promise<void>, [string]>();
const mockBeginContinued = jest.fn<Promise<boolean>, [string, KeepAliveTask]>();
const mockUpdateContinued = jest.fn<Promise<void>, [string, KeepAliveTask]>();
const mockEndContinued = jest.fn<Promise<void>, [string, boolean]>();
const mockRemove = jest.fn();
let mockExpire: (event: { id: string }) => void;
let mockAudioState: (event: { id: string; active: boolean }) => void;
let mockContinuedState: (event: {
  id: string;
  state: 'active' | 'unavailable' | 'expired';
}) => void;
let consent: boolean | null;
let changeConsent: () => void;
const preference = { readCached: jest.fn(), subscribeChange: jest.fn() };

jest.mock('uuid', () => ({ v4: mockRandomUUID, v7: mockRandomUUID }));

jest.mock('../../../../../modules/system-integration', () => ({
  getSystemIntegration: () => ({
    beginBackgroundExecution: mockBegin,
    endBackgroundExecution: mockEnd,
    beginBackgroundAudioExecution: mockBeginAudio,
    endBackgroundAudioExecution: mockEndAudio,
    beginContinuedProcessingTask: mockBeginContinued,
    updateContinuedProcessingTask: mockUpdateContinued,
    endContinuedProcessingTask: mockEndContinued,
    addListener: (
      event: string,
      listener: typeof mockExpire | typeof mockAudioState | typeof mockContinuedState,
    ) => {
      if (event === 'onBackgroundExecutionExpired') mockExpire = listener as typeof mockExpire;
      else if (event === 'onBackgroundAudioStateChanged')
        mockAudioState = listener as typeof mockAudioState;
      else mockContinuedState = listener as typeof mockContinuedState;
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
    jest.useFakeTimers();
    mockBegin.mockResolvedValue(true);
    mockEnd.mockResolvedValue(undefined);
    mockBeginAudio.mockResolvedValue(true);
    mockEndAudio.mockResolvedValue(undefined);
    mockBeginContinued.mockResolvedValue(false);
    mockUpdateContinued.mockResolvedValue(undefined);
    mockEndContinued.mockResolvedValue(undefined);
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

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('shares a finite window and stops after one idle grace following the last release', async () => {
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
    await jest.advanceTimersByTimeAsync(59_999);
    expect(mockEnd).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(mockEnd).toHaveBeenCalledWith(id);
    expect(source.getStatus()).toBe('idle');
    await source._doStop();
    expect(mockRemove).toHaveBeenCalledTimes(3);
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
    source.acquire('new work');
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

  test('the last release stops shared audio and finite protection after the idle grace', async () => {
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
    expect(mockEndAudio).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(60_000);
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

  const task: KeepAliveTask = {
    title: 'Conversation',
    subtitle: 'Preparing',
    completedUnitCount: 0,
    totalUnitCount: 3,
  };

  test('prefers native continued processing and never starts silence while it is pending or active', async () => {
    consent = true;
    mockBeginContinued.mockResolvedValue(true);
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const interrupt = jest.fn();
    const lease = source.acquire('chat', interrupt, task);
    await flushOperations();
    const id = mockBeginContinued.mock.calls[0][0];
    expect(mockBeginAudio).not.toHaveBeenCalled();
    mockContinuedState({ id, state: 'active' });
    changeState('background');
    mockExpire({ id: mockBegin.mock.calls[0][0] });
    await flushOperations();
    expect(interrupt).not.toHaveBeenCalled();
    const progress = { ...task, subtitle: 'Responding', completedUnitCount: 2 };
    lease.update?.(progress);
    await flushOperations();
    expect(mockUpdateContinued).toHaveBeenLastCalledWith(id, progress);
    expect(mockBeginAudio).not.toHaveBeenCalled();
    lease.release('completed');
    await flushOperations();
    expect(mockEndContinued).toHaveBeenCalledWith(id, true);
    mockContinuedState({ id, state: 'expired' });
    expect(interrupt).not.toHaveBeenCalled();
    expect(source.getStatus()).toBe('limited');
    await source._doStop();
  });

  test.each(['denied', 'unavailable'] as const)(
    'uses consented audio only after continued processing is %s, without automatic resubmission',
    async (failure) => {
      consent = true;
      mockBeginContinued.mockResolvedValue(failure !== 'denied');
      const source = new IosBackgroundExecutionSource(preference);
      await source._doInit();
      source.acquire('chat', jest.fn(), task);
      await flushOperations();
      const id = mockBeginContinued.mock.calls[0][0];
      if (failure === 'unavailable') {
        expect(mockBeginAudio).not.toHaveBeenCalled();
        mockContinuedState({ id, state: 'unavailable' });
        await flushOperations();
      }
      expect(mockBeginAudio).toHaveBeenCalledTimes(1);
      mockContinuedState({ id, state: 'active' });
      changeState('background');
      changeState('active');
      await flushOperations();
      expect(mockBeginContinued).toHaveBeenCalledTimes(1);
      await source._doStop();
    },
  );

  test('native revocation interrupts once even in foreground and never falls back for that task', async () => {
    consent = true;
    mockBeginContinued.mockResolvedValue(true);
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const interrupt = jest.fn();
    const lease = source.acquire('chat', interrupt, task);
    await flushOperations();
    const id = mockBeginContinued.mock.calls[0][0];
    mockContinuedState({ id, state: 'active' });
    mockContinuedState({ id, state: 'expired' });
    mockContinuedState({ id, state: 'expired' });
    await flushOperations();
    expect(interrupt).toHaveBeenCalledTimes(1);
    expect(interrupt.mock.calls[0][0]).toBeInstanceOf(KeepAliveInterruptionError);
    mockContinuedState({ id, state: 'active' });
    changeState('background');
    changeState('active');
    lease.update?.({ ...task, completedUnitCount: 1 });
    await flushOperations();
    expect(mockBeginContinued).toHaveBeenCalledTimes(1);
    expect(mockBeginAudio).not.toHaveBeenCalled();
    lease.release();
    await flushOperations();
    expect(mockEndContinued).toHaveBeenCalledWith(id, false);
    await source._doStop();
  });

  test('does not let generic demand start audio before a revoked task finishes cancelling', async () => {
    consent = true;
    mockBeginContinued.mockResolvedValue(true);
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const taskLease = source.acquire('chat', jest.fn(), task);
    source.acquire('other');
    await flushOperations();
    const id = mockBeginContinued.mock.calls[0][0];
    mockContinuedState({ id, state: 'active' });
    mockContinuedState({ id, state: 'expired' });
    await flushOperations();
    expect(mockBeginAudio).not.toHaveBeenCalled();
    taskLease.release();
    await flushOperations();
    expect(mockBeginAudio).toHaveBeenCalledTimes(1);
    await source._doStop();
  });

  test('revocation after finite expiry lets owner cancellation settle before protecting unrelated demand with audio', async () => {
    consent = true;
    mockBeginContinued.mockResolvedValue(true);
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const cancel = jest.fn();
    const other = jest.fn();
    const lease = source.acquire('chat', cancel, task);
    source.acquire('other', other);
    await flushOperations();
    const id = mockBeginContinued.mock.calls[0][0];
    mockContinuedState({ id, state: 'active' });
    changeState('background');
    mockExpire({ id: mockBegin.mock.calls[0][0] });
    mockContinuedState({ id, state: 'expired' });
    await flushOperations();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    expect(mockBeginAudio).not.toHaveBeenCalled();
    lease.release();
    await flushOperations();
    expect(mockBeginAudio).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    await source._doStop();
  });

  test('revoking one task leaves another admitted task protected', async () => {
    consent = true;
    mockBeginContinued.mockResolvedValue(true);
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const first = jest.fn();
    const second = jest.fn();
    source.acquire('first', first, task);
    source.acquire('second', second, task);
    await flushOperations();
    const firstId = mockBeginContinued.mock.calls[0][0];
    const secondId = mockBeginContinued.mock.calls[1][0];
    mockContinuedState({ id: firstId, state: 'active' });
    mockContinuedState({ id: secondId, state: 'active' });
    changeState('background');
    mockExpire({ id: mockBegin.mock.calls[0][0] });
    mockContinuedState({ id: firstId, state: 'expired' });
    await flushOperations();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    expect(mockBeginAudio).not.toHaveBeenCalled();
    await source._doStop();
  });

  test('active work never becomes idle merely because no progress or screen interaction arrives', async () => {
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const interrupt = jest.fn();
    source.acquire('long request', interrupt);
    await flushOperations();
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(mockEnd).not.toHaveBeenCalled();
    expect(interrupt).not.toHaveBeenCalled();
    expect(source.getStatus()).toBe('limited');
    await source._doStop();
  });

  test('idle expires shared protection without cancelling the pending conversation, which resumes on the same lease', async () => {
    consent = true;
    mockBeginContinued.mockResolvedValue(true);
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const interrupt = jest.fn();
    const lease = source.acquire('chat', interrupt, task);
    await flushOperations();
    const firstId = mockBeginContinued.mock.calls[0][0];
    mockContinuedState({ id: firstId, state: 'active' });
    lease.setIdle?.(true);
    await flushOperations();
    expect(mockEndContinued).toHaveBeenCalledWith(firstId, false);
    expect(mockBeginAudio).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(source.getStatus()).toBe('idle');
    expect(mockEndAudio).toHaveBeenCalledTimes(1);
    expect(mockEnd).toHaveBeenCalledTimes(1);
    expect(interrupt).not.toHaveBeenCalled();
    // An expired idle lease does not create another grace merely by being marked idle again.
    lease.setIdle?.(true);
    await flushOperations();
    expect(mockBeginAudio).toHaveBeenCalledTimes(1);
    lease.setIdle?.(false);
    await flushOperations();
    const secondId = mockBeginContinued.mock.calls[1][0];
    expect(secondId).not.toBe(firstId);
    mockContinuedState({ id: firstId, state: 'expired' });
    mockContinuedState({ id: secondId, state: 'active' });
    await jest.advanceTimersByTimeAsync(60_000);
    expect(source.getStatus()).toBe('limited');
    expect(interrupt).not.toHaveBeenCalled();
    lease.release('completed');
    await source._doStop();
  });

  test('another active task cancels the shared idle countdown and an idle sibling cannot stop it', async () => {
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const waiting = source.acquire('waiting');
    await flushOperations();
    waiting.setIdle?.(true);
    await jest.advanceTimersByTimeAsync(30_000);
    const active = source.acquire('painting');
    await flushOperations();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(mockEnd).not.toHaveBeenCalled();
    active.release();
    await jest.advanceTimersByTimeAsync(59_999);
    expect(mockEnd).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(mockEnd).toHaveBeenCalledTimes(1);
    waiting.release();
    await flushOperations();
    expect(source.getStatus()).toBe('idle');
    await source._doStop();
  });

  test('foreground return cannot revive an idle grace whose wall-clock deadline already passed', async () => {
    consent = true;
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    const lease = source.acquire('waiting');
    await flushOperations();
    lease.setIdle?.(true);
    jest.setSystemTime(Date.now() + 61_000);
    changeState('active');
    await flushOperations();
    expect(source.getStatus()).toBe('idle');
    expect(mockBeginAudio).toHaveBeenCalledTimes(1);
    expect(mockEndAudio).toHaveBeenCalledTimes(1);
    await source._doStop();
  });

  test('does not turn background demand or foreground return into a user task request', async () => {
    mockBeginContinued.mockResolvedValue(true);
    const source = new IosBackgroundExecutionSource(preference);
    await source._doInit();
    changeState('background');
    source.acquire('restored', jest.fn(), task);
    await flushOperations();
    changeState('active');
    await flushOperations();
    expect(mockBeginContinued).not.toHaveBeenCalled();
    await source._doStop();
  });
});

async function flushOperations(): Promise<void> {
  for (let index = 0; index < 20; index += 1) await Promise.resolve();
}
