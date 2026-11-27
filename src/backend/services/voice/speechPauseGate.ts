export type SpeechPauseGate = {
  isPaused(): boolean;
  pause(): boolean;
  resume(): boolean;
  waitIfPaused(): Promise<void>;
};

/**
 * Shared pause/resume barrier for multi-chunk speech engines.
 * Resolves immediately when unpaused and unwinds via `signal.reason` on abort while paused.
 */
export function createSpeechPauseGate(signal: AbortSignal): SpeechPauseGate {
  let paused = false;
  let resumeWaiter: (() => void) | undefined;

  return {
    isPaused: () => paused,
    pause() {
      if (paused) return false;
      paused = true;
      return true;
    },
    resume() {
      if (!paused) return false;
      paused = false;
      const waiter = resumeWaiter;
      resumeWaiter = undefined;
      waiter?.();
      return true;
    },
    waitIfPaused() {
      if (!paused) return Promise.resolve();
      signal.throwIfAborted();
      return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          resumeWaiter = undefined;
          reject(signal.reason);
        };
        const unblock = () => {
          signal.removeEventListener('abort', onAbort);
          resumeWaiter = undefined;
          resolve();
        };
        resumeWaiter = unblock;
        signal.addEventListener('abort', onAbort, { once: true });
      });
    },
  };
}
