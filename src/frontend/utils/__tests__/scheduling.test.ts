import { createDebouncedAction, createFrameLoop, createScheduledFlush } from '../scheduling';

describe('frontend scheduling utilities', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('createDebouncedAction', () => {
    it('delays execution until calls pause and supports flush and cancel', () => {
      const run = jest.fn();
      const action = createDebouncedAction(run, 200);

      action.schedule();
      jest.advanceTimersByTime(150);
      action.schedule();
      jest.advanceTimersByTime(150);
      expect(run).not.toHaveBeenCalled();

      jest.advanceTimersByTime(50);
      expect(run).toHaveBeenCalledTimes(1);

      // Flush is a no-op once nothing is pending.
      action.flush();
      expect(run).toHaveBeenCalledTimes(1);

      action.schedule();
      action.flush();
      expect(run).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(200);
      expect(run).toHaveBeenCalledTimes(2);

      action.schedule();
      action.cancel();
      jest.advanceTimersByTime(200);
      expect(run).toHaveBeenCalledTimes(2);
    });

    it('runs immediately when delayMs is zero or negative', () => {
      const run = jest.fn();
      const action = createDebouncedAction(run, 0);
      action.schedule();
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  describe('createScheduledFlush', () => {
    it('keeps the original deadline while already scheduled and supports cancel', () => {
      const run = jest.fn();
      const flush = createScheduledFlush(run);

      expect(flush.isScheduled()).toBe(false);
      flush.schedule(100);
      expect(flush.isScheduled()).toBe(true);

      jest.advanceTimersByTime(60);
      flush.schedule(500);
      jest.advanceTimersByTime(40);
      expect(run).toHaveBeenCalledTimes(1);
      expect(flush.isScheduled()).toBe(false);

      flush.schedule(100);
      flush.cancel();
      expect(flush.isScheduled()).toBe(false);
      jest.advanceTimersByTime(100);
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  describe('createFrameLoop', () => {
    it('waits for async frame work before queueing the next frame and stops cleanly', async () => {
      const callbacks = new Map<number, (time: number) => void>();
      let nextId = 1;
      jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        const id = nextId++;
        callbacks.set(id, cb);
        return id;
      });
      jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
        if (typeof id === 'number') callbacks.delete(id);
      });

      let resolveFrame!: () => void;
      const onFrame = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveFrame = resolve;
          }),
      );
      const loop = createFrameLoop(onFrame);

      loop.start();
      expect(callbacks.size).toBe(1);

      const firstCb = callbacks.get(1)!;
      callbacks.delete(1);
      firstCb(16);
      expect(onFrame).toHaveBeenCalledWith(16);
      expect(callbacks.size).toBe(0);

      resolveFrame();
      await Promise.resolve();
      expect(callbacks.size).toBe(1);

      loop.stop();
      expect(callbacks.size).toBe(0);
    });

    it('does not queue another frame when stopped while async frame work is in flight', async () => {
      const callbacks = new Map<number, (time: number) => void>();
      let nextId = 1;
      jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
        const id = nextId++;
        callbacks.set(id, cb);
        return id;
      });
      jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
        if (typeof id === 'number') callbacks.delete(id);
      });

      let resolveFrame!: () => void;
      const loop = createFrameLoop(
        () =>
          new Promise<void>((resolve) => {
            resolveFrame = resolve;
          }),
      );

      loop.start();
      const firstCb = callbacks.get(1)!;
      callbacks.delete(1);
      firstCb(16);

      loop.stop();
      resolveFrame();
      await Promise.resolve();
      expect(callbacks.size).toBe(0);
    });
  });
});
