import { randomUUID as mockRandomUUID } from 'node:crypto';

import { AppState, type AppStateStatus } from 'react-native';

import { IosBackgroundExecutionSource } from '../IosBackgroundExecutionSource';
import type { KeepAliveLease, KeepAliveTask } from '../KeepAliveCoordinator';

function createPrng(seed: number) {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(maxExclusive: number): number {
      return Math.floor(this.next() * maxExclusive);
    },
  };
}

const activeNativeTasks = new Set<string>();
const activeAudioTasks = new Set<string>();
const mockBegin = jest.fn<Promise<boolean>, [string]>();
const mockEnd = jest.fn<Promise<void>, [string]>();
const mockBeginAudio = jest.fn<Promise<boolean>, [string]>();
const mockEndAudio = jest.fn<Promise<void>, [string]>();
const mockBeginContinued = jest.fn<Promise<boolean>, [string, KeepAliveTask]>();
const mockUpdateContinued = jest.fn<Promise<void>, [string, KeepAliveTask]>();
const mockEndContinued = jest.fn<Promise<void>, [string, boolean]>();
let mockExpire: ((event: { id: string }) => void) | undefined;
let mockAudioState: ((event: { id: string; active: boolean }) => void) | undefined;
let consent: boolean | null = null;
let notifyConsentChange: (() => void) | undefined;

const preference = {
  readCached: jest.fn(),
  subscribeChange: jest.fn(),
};

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
      listener: (payload: { id: string; active?: boolean; state?: string }) => void,
    ) => {
      if (event === 'onBackgroundExecutionExpired') mockExpire = listener;
      else if (event === 'onBackgroundAudioStateChanged')
        mockAudioState = listener as typeof mockAudioState;
      return { remove: jest.fn() };
    },
  }),
}));

async function flushMicrotasks() {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

describe('IosBackgroundExecutionSource lease state-machine invariants', () => {
  let appStateListener: ((state: AppStateStatus) => void) | undefined;

  const setAppState = (next: AppStateStatus) => {
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: next });
    appStateListener?.(next);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    activeNativeTasks.clear();
    activeAudioTasks.clear();
    consent = null;

    mockBegin.mockImplementation(async (id) => {
      activeNativeTasks.add(id);
      return true;
    });
    mockEnd.mockImplementation(async (id) => {
      activeNativeTasks.delete(id);
    });
    mockBeginAudio.mockImplementation(async (id) => {
      activeAudioTasks.add(id);
      return true;
    });
    mockEndAudio.mockImplementation(async (id) => {
      activeAudioTasks.delete(id);
    });
    mockBeginContinued.mockResolvedValue(false);
    mockUpdateContinued.mockResolvedValue(undefined);
    mockEndContinued.mockResolvedValue(undefined);

    preference.readCached.mockImplementation(() => consent);
    preference.subscribeChange.mockImplementation(() => (listener: () => void) => {
      notifyConsentChange = listener;
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
  });

  it('preserves K1-K4 across 50 seeded randomized acquire/release/appstate/expiry sequences', async () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      activeNativeTasks.clear();
      activeAudioTasks.clear();
      consent = null;
      setAppState('active');

      const rng = createPrng(seed * 7919);
      const source = new IosBackgroundExecutionSource(preference);
      await source._doInit();

      const held: { lease: KeepAliveLease; interrupted: number; released: boolean }[] = [];
      let foregroundInterrupts = 0;

      for (let step = 0; step < 30; step += 1) {
        const action = rng.int(7);

        if (action < 2) {
          const entry = {
            lease: null as unknown as KeepAliveLease,
            interrupted: 0,
            released: false,
          };
          entry.lease = source.acquire(`task-${step}`, () => {
            entry.interrupted += 1;
            if (AppState.currentState === 'active') {
              foregroundInterrupts += 1;
            }
          });
          held.push(entry);
        } else if (action === 2 && held.length > 0) {
          // Release a lease (including occasional deliberate double-release to test K2).
          const idx = rng.int(held.length);
          const item = held[idx]!;
          item.lease.release('completed');
          item.released = true;
          if (rng.int(2) === 0) {
            item.lease.release('completed');
          }
        } else if (action === 3) {
          const states: AppStateStatus[] = ['active', 'background', 'inactive'];
          setAppState(states[rng.int(states.length)]!);
        } else if (action === 4) {
          consent = rng.int(2) === 0;
          notifyConsentChange?.();
        } else if (action === 5 && activeNativeTasks.size > 0) {
          const id = [...activeNativeTasks][0]!;
          activeNativeTasks.delete(id);
          mockExpire?.({ id });
        } else if (action === 6 && activeAudioTasks.size > 0) {
          const id = [...activeAudioTasks][0]!;
          mockAudioState?.({ id, active: rng.int(2) === 0 });
        }

        await flushMicrotasks();

        // K3: Expiry queued while app is foreground must never interrupt foreground holders.
        expect(foregroundInterrupts).toBe(0);
      }

      // Release every remaining lease (twice to confirm idempotency).
      for (const item of held) {
        item.lease.release('completed');
        item.lease.release('completed');
        item.released = true;
      }
      await flushMicrotasks();

      // K1: Zero active leases -> status returns to idle and zero leaked native tasks remain.
      expect(source.getStatus()).toBe('idle');
      expect(activeNativeTasks.size).toBe(0);
      expect(activeAudioTasks.size).toBe(0);

      // K4: Stopping ends all activity cleanly and later acquire() is a safe no-op.
      await source._doStop();
      await flushMicrotasks();
      const callsBefore = mockBegin.mock.calls.length + mockBeginAudio.mock.calls.length;
      const postDisposeLease = source.acquire('after-dispose');
      postDisposeLease.release();
      await flushMicrotasks();
      expect(mockBegin.mock.calls.length + mockBeginAudio.mock.calls.length).toBe(callsBefore);
    }
  });
});
