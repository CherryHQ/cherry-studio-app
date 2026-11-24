export interface DebouncedAction {
  schedule(): void;
  flush(): void;
  cancel(): void;
}

/**
 * Delays `run` until calls pause for `delayMs`. Supports immediate `flush()` on lifecycle boundaries
 * (such as app backgrounding or unmount) and `cancel()` to discard pending work.
 */
export function createDebouncedAction(run: () => void, delayMs: number): DebouncedAction {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isPending = false;

  const cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    isPending = false;
  };

  const flush = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (!isPending) return;
    isPending = false;
    run();
  };

  const schedule = () => {
    if (delayMs <= 0) {
      cancel();
      run();
      return;
    }
    isPending = true;
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, delayMs);
  };

  return { schedule, flush, cancel };
}

export interface ScheduledFlush {
  schedule(delayMs: number): void;
  cancel(): void;
  isScheduled(): boolean;
}

/**
 * Coalesces repeated updates into a fixed-window flush without pushing an already-scheduled
 * deadline forward, so busy streams keep becoming visible instead of starving.
 */
export function createScheduledFlush(run: () => void): ScheduledFlush {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const cancel = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  };

  const schedule = (delayMs: number) => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      run();
    }, delayMs);
  };

  const isScheduled = () => timer !== undefined;

  return { schedule, cancel, isScheduled };
}

export interface FrameLoop {
  start(): void;
  stop(): void;
}

/**
 * Runs a frame callback repeatedly until stopped, awaiting async work before queueing the next
 * animation frame so overlapping frames cannot pile up.
 */
export function createFrameLoop(onFrame: (time: number) => void | Promise<void>): FrameLoop {
  let frameId: number | undefined;
  let generation = 0;

  const scheduleNext = (expectedGeneration: number) => {
    if (generation !== expectedGeneration) return;
    frameId = requestAnimationFrame((time) => {
      frameId = undefined;
      if (generation !== expectedGeneration) return;
      const result = onFrame(time);
      if (result && typeof result.then === 'function') {
        void result.then(() => {
          scheduleNext(expectedGeneration);
        });
      } else {
        scheduleNext(expectedGeneration);
      }
    });
  };

  const stop = () => {
    generation += 1;
    if (frameId !== undefined) {
      cancelAnimationFrame(frameId);
      frameId = undefined;
    }
  };

  const start = () => {
    stop();
    scheduleNext(generation);
  };

  return { start, stop };
}
