export type SpeechPauseGate = {
  isPaused(): boolean;
  pause(): boolean;
  resume(): boolean;
  release(): void;
  waitIfPaused(): Promise<void>;
};

/**
 * Shared pause/resume barrier for multi-chunk speech engines.
 * Resolves immediately when unpaused or released and unwinds via `signal.reason` on abort.
 */
export function createSpeechPauseGate(signal: AbortSignal): SpeechPauseGate {
  let paused = false;
  let released = false;
  let resumeWaiter: (() => void) | undefined;

  return {
    isPaused: () => paused && !released,
    pause() {
      if (paused || released) return false;
      paused = true;
      return true;
    },
    resume() {
      if (!paused || released) return false;
      paused = false;
      const waiter = resumeWaiter;
      resumeWaiter = undefined;
      waiter?.();
      return true;
    },
    release() {
      if (released) return;
      released = true;
      paused = false;
      const waiter = resumeWaiter;
      resumeWaiter = undefined;
      waiter?.();
    },
    waitIfPaused() {
      if (!paused || released) return Promise.resolve();
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
