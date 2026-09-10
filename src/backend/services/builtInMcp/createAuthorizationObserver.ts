import {
  PluginError,
  type PluginAuthorizationObservation,
  type PluginAuthorizationState,
} from '@/shared/contracts/plugins';
import type { PluginConnection } from '@/shared/data/types/plugin';

export type AuthorizationFlow = {
  getState(): Promise<PluginAuthorizationState>;
  poll(attemptId: string): Promise<PluginAuthorizationState>;
  complete(attemptId: string): Promise<PluginConnection>;
};

const MIN_DELAY_MS = 100;

/**
 * Drives one interactive authorization while a screen observes it: polls at the server's
 * interval, completes an approved grant once, and reports progress. Detaching stops scheduling
 * only; the flow keeps its durable state for the next observer.
 */
export function createAuthorizationObserver(flow: AuthorizationFlow) {
  const listeners = new Set<(observation: PluginAuthorizationObservation) => void>();
  let observation: PluginAuthorizationObservation = { state: { status: 'idle' }, busy: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let checkRequested = false;
  let completion: { attemptId: string; result: Promise<PluginConnection> } | undefined;
  let stopped = false;

  function emit(next: Partial<PluginAuthorizationObservation>) {
    observation = { ...observation, ...next };
    for (const listener of listeners) listener(observation);
  }

  function schedule(delayMs: number) {
    clearTimeout(timer);
    if (!listeners.size || stopped) return;
    timer = setTimeout(() => void check(), Math.max(MIN_DELAY_MS, delayMs));
  }

  async function check() {
    clearTimeout(timer);
    if (stopped) return;
    if (running) {
      checkRequested = true;
      return;
    }
    running = true;
    checkRequested = false;
    emit({ busy: true, error: undefined });
    try {
      let state = await flow.getState();
      if (state.status === 'waiting' && listeners.size && Date.now() >= state.nextPollAt)
        state = await flow.poll(state.attemptId);
      emit({ state });
      if (state.status === 'ready' && listeners.size) {
        if (completion?.attemptId !== state.attemptId) {
          completion = { attemptId: state.attemptId, result: flow.complete(state.attemptId) };
        }
        const connection = await completion.result;
        emit({ state: await flow.getState(), connection });
      } else if (state.status === 'waiting') {
        schedule(Math.min(state.nextPollAt, state.expiresAt) - Date.now());
      }
    } catch (error) {
      // Retry is explicit after an actual failure. Do not loop permission/storage errors.
      completion = undefined;
      emit({ error: error instanceof PluginError ? error.reason : 'request' });
    } finally {
      running = false;
      emit({ busy: false });
      if (checkRequested) void check();
    }
  }

  return {
    observe(listener: (observation: PluginAuthorizationObservation) => void) {
      listeners.add(listener);
      listener(observation);
      if (listeners.size === 1) void check();
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        clearTimeout(timer);
        // Progress and outcome belong to the observing session; durable state is re-read next time.
        observation = { state: observation.state, busy: observation.busy };
      };
    },
    check() {
      void check();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      listeners.clear();
    },
  };
}
