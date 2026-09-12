import { ResourceScopeCoordinator } from '../ResourceScopeCoordinator';
import {
  type CancelReason,
  DEFAULT_DRAIN_TIMEOUT_MS,
  type ResourceScope,
  ScopeDrainTimeoutError,
  ScopeFencedError,
} from '../types';

const mockLoggerError = jest.fn();

jest.mock('@logger', () => ({
  loggerService: {
    withContext: () => ({
      debug: jest.fn(),
      error: (...args: unknown[]) => mockLoggerError(...args),
      info: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

const painting = (id: string): ResourceScope => ({ id, kind: 'painting' });

/**
 * A stand-in for a cancellable turn or job: `settled` resolves only when the
 * test says the terminal write landed, which is the whole property the drain
 * step is asserting.
 */
function makeOperation(kind: string, scopes: readonly ResourceScope[]) {
  let finish!: () => void;
  const settled = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const cancelled: CancelReason[] = [];
  const record = (reason: CancelReason) => cancelled.push(reason);

  return {
    cancelled,
    /** Settle without being asked — the operation ended on its own. */
    finish,
    /** Stubborn by default: cancelling it does not make it stop. */
    registration: { cancel: record, kind, scopes, settled },
    /** What a well-behaved operation does: stop when cancelled. */
    settleOnCancel: () => ({
      cancel: (reason: CancelReason) => {
        record(reason);
        finish();
      },
      kind,
      scopes,
      settled,
    }),
  };
}

describe('ResourceScopeCoordinator', () => {
  let coordinator: ResourceScopeCoordinator;

  beforeEach(() => {
    jest.clearAllMocks();
    coordinator = new ResourceScopeCoordinator();
  });

  /**
   * Registers and asserts nothing — used where the point of the line is that the
   * scope accepted the operation, so a `ScopeFencedError` should surface as a
   * test failure rather than as an expectation.
   */
  const register = (registration: Parameters<ResourceScopeCoordinator['register']>[0]) =>
    coordinator.register(registration);

  describe('registration', () => {
    it('tracks an operation under every scope it names', () => {
      const operation = makeOperation('chat.turn', [painting('t1'), painting('a1')]);
      register(operation.registration);

      expect(coordinator.listActive(painting('t1'))).toEqual([
        { kind: 'chat.turn', scopes: [painting('t1'), painting('a1')] },
      ]);
      expect(coordinator.listActive(painting('a1'))).toHaveLength(1);
      expect(coordinator.listActive(painting('other'))).toEqual([]);
    });

    it('forgets a released operation, and release is idempotent', () => {
      const operation = makeOperation('chat.turn', [painting('t1')]);
      const handle = register(operation.registration);

      handle.release();
      handle.release();

      expect(coordinator.listActive(painting('t1'))).toEqual([]);
    });

    it('leaves no partial index behind when one of several scopes is fenced', async () => {
      // Seal `painting:p1` so the second scope of the next registration rejects.
      await coordinator.delete([painting('p1')], async () => undefined);

      const operation = makeOperation('job.painting.generate', [painting('t1'), painting('p1')]);
      expect(() => coordinator.register(operation.registration)).toThrow(ScopeFencedError);

      // `topic:t1` was checked first and must not have been indexed anyway.
      expect(coordinator.listActive(painting('t1'))).toEqual([]);
    });

    it('does not report a rejected settled promise as an unhandled rejection', async () => {
      const rejection = Promise.reject(new Error('turn failed'));
      register({
        cancel: () => undefined,
        kind: 'chat.turn',
        scopes: [painting('t1')],
        settled: rejection,
      });

      // The coordinator attaches its own handler at registration, so awaiting a
      // full turn of the microtask queue must not surface the rejection.
      await Promise.resolve();
      await expect(rejection).rejects.toThrow('turn failed');
    });
  });

  describe('the five-step sequence', () => {
    it('cancels, drains, then mutates — in that order', async () => {
      const order: string[] = [];
      let finish!: () => void;
      const settled = new Promise<void>((resolve) => {
        finish = () => {
          order.push('settled');
          resolve();
        };
      });
      register({
        cancel: () => {
          order.push('cancel');
          // A real operation settles asynchronously after its terminal write.
          setTimeout(finish, 0);
        },
        kind: 'chat.turn',
        scopes: [painting('t1')],
        settled,
      });

      await coordinator.delete([painting('t1')], async () => {
        order.push('mutate');
      });

      expect(order).toEqual(['cancel', 'settled', 'mutate']);
    });

    it('passes the reason through to cancel, defaulting per entry point', async () => {
      const deleted = makeOperation('chat.turn', [painting('t1')]);
      register(deleted.settleOnCancel());
      await coordinator.delete([painting('t1')], async () => undefined);

      const invalidated = makeOperation('chat.turn', [painting('t2')]);
      register(invalidated.settleOnCancel());
      await coordinator.invalidate([painting('t2')], async () => undefined);

      const explicit = makeOperation('chat.turn', [painting('t3')]);
      register(explicit.settleOnCancel());
      await coordinator.invalidate([painting('t3')], async () => undefined, {
        reason: 'model-swap',
      });

      expect(deleted.cancelled).toEqual(['resource-deleted']);
      expect(invalidated.cancelled).toEqual(['resource-invalidated']);
      expect(explicit.cancelled).toEqual(['model-swap']);
    });

    it('mutates immediately when the scope holds no operations', async () => {
      const mutate = jest.fn(async () => 'done');
      await expect(coordinator.delete([painting('empty')], mutate)).resolves.toBe('done');
      expect(mutate).toHaveBeenCalledTimes(1);
    });

    it('cancels an operation once when a batch names several of its scopes', async () => {
      const operation = makeOperation('chat.turn', [painting('t1'), painting('a1')]);
      register(operation.settleOnCancel());

      await coordinator.delete(
        [painting('a1'), painting('t1'), painting('t1')],
        async () => undefined,
      );

      expect(operation.cancelled).toEqual(['resource-deleted']);
    });
  });

  describe('fencing', () => {
    it('rejects registration while a pass is draining, and after a delete seals', async () => {
      const operation = makeOperation('chat.turn', [painting('t1')]);
      register(operation.registration);

      const pass = coordinator.delete([painting('t1')], async () => undefined);
      await Promise.resolve();

      const during = makeOperation('chat.turn', [painting('t1')]);
      expect(() => coordinator.register(during.registration)).toThrow(ScopeFencedError);

      operation.finish();
      await pass;

      const after = makeOperation('chat.turn', [painting('t1')]);
      expect(() => coordinator.register(after.registration)).toThrow(ScopeFencedError);
    });

    it('reopens the scope after invalidate succeeds', async () => {
      const operation = makeOperation('chat.turn', [painting('t1')]);
      register(operation.settleOnCancel());

      await coordinator.invalidate([painting('t1')], async () => undefined);

      const next = makeOperation('chat.turn', [painting('t1')]);
      expect(() => register(next.registration)).not.toThrow();
    });

    it('keeps the scope fenced until the outer of two overlapping passes finishes', async () => {
      const outerMutate = deferred<void>();
      const outer = coordinator.invalidate([painting('t1')], () => outerMutate.promise);
      await Promise.resolve();

      // Runs to completion entirely inside the outer pass's window.
      await coordinator.invalidate([painting('t1')], async () => undefined);

      const during = makeOperation('chat.turn', [painting('t1')]);
      expect(() => coordinator.register(during.registration)).toThrow(ScopeFencedError);

      outerMutate.resolve();
      await outer;

      const after = makeOperation('chat.turn', [painting('t1')]);
      expect(() => register(after.registration)).not.toThrow();
    });

    it('fences only the scopes it was given', async () => {
      const mutate = deferred<void>();
      const pass = coordinator.delete([painting('t1')], () => mutate.promise);
      await Promise.resolve();

      const other = makeOperation('chat.turn', [painting('t2')]);
      expect(() => register(other.registration)).not.toThrow();

      mutate.resolve();
      await pass;
    });
  });

  describe('failure handling', () => {
    it('skips the mutation and reopens the scope when the drain times out', async () => {
      jest.useFakeTimers();
      try {
        const stubborn = makeOperation('job.painting.generate', [painting('p1')]);
        register(stubborn.registration);
        const mutate = jest.fn(async () => undefined);

        const pass = coordinator.delete([painting('p1')], mutate);
        const assertion = expect(pass).rejects.toThrow(ScopeDrainTimeoutError);
        await jest.advanceTimersByTimeAsync(DEFAULT_DRAIN_TIMEOUT_MS + 1);
        await assertion;

        expect(mutate).not.toHaveBeenCalled();
        // Nothing was written, so the scope is exactly as it was — not sealed.
        expect(() => register(makeOperation('x', [painting('p1')]).registration)).not.toThrow();
      } finally {
        jest.useRealTimers();
      }
    });

    it('names the straggling operations, and only those', async () => {
      jest.useFakeTimers();
      try {
        const quick = makeOperation('chat.turn', [painting('t1')]);
        const stubborn = makeOperation('job.painting.generate', [painting('t1')]);
        register(quick.settleOnCancel());
        register(stubborn.registration);

        const pass = coordinator.delete([painting('t1')], async () => undefined);
        const assertion = expect(pass).rejects.toMatchObject({
          stragglers: [{ kind: 'job.painting.generate', scopes: [painting('t1')] }],
        });
        await jest.advanceTimersByTimeAsync(DEFAULT_DRAIN_TIMEOUT_MS + 1);
        await assertion;
      } finally {
        jest.useRealTimers();
      }
    });

    it('honours a caller-supplied drain ceiling', async () => {
      jest.useFakeTimers();
      try {
        const stubborn = makeOperation('chat.turn', [painting('t1')]);
        register(stubborn.registration);

        const pass = coordinator.delete([painting('t1')], async () => undefined, {
          drainTimeoutMs: 50,
        });
        const assertion = expect(pass).rejects.toThrow(ScopeDrainTimeoutError);
        await jest.advanceTimersByTimeAsync(51);
        await assertion;
      } finally {
        jest.useRealTimers();
      }
    });

    it('treats a rejected settled promise as settled', async () => {
      register({
        cancel: () => undefined,
        kind: 'chat.turn',
        scopes: [painting('t1')],
        settled: Promise.reject(new Error('turn failed')),
      });

      // The operation stopped; that it stopped by failing is the owner's problem,
      // not a reason to block the deletion.
      await expect(coordinator.delete([painting('t1')], async () => 'ok')).resolves.toBe('ok');
    });

    it('logs a throwing canceller and completes the pass anyway', async () => {
      const settled = Promise.resolve();
      register({
        cancel: () => {
          throw new Error('canceller exploded');
        },
        kind: 'chat.turn',
        scopes: [painting('t1')],
        settled,
      });

      await expect(coordinator.delete([painting('t1')], async () => 'ok')).resolves.toBe('ok');
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('chat.turn'),
        expect.any(Error),
      );
    });

    it('reopens the scope when an invalidate mutation throws', async () => {
      const operation = makeOperation('chat.turn', [painting('t1')]);
      register(operation.settleOnCancel());

      await expect(
        coordinator.invalidate([painting('t1')], async () => {
          throw new Error('write failed');
        }),
      ).rejects.toThrow('write failed');

      expect(() => register(makeOperation('x', [painting('t1')]).registration)).not.toThrow();
    });

    it('leaves the scope fenced and reports when a delete mutation throws', async () => {
      const operation = makeOperation('chat.turn', [painting('t1')]);
      register(operation.settleOnCancel());

      await expect(
        coordinator.delete([painting('t1')], async () => {
          throw new Error('write failed');
        }),
      ).rejects.toThrow('write failed');

      // A batch delete can fail part-way, so the scope is not reopened over a
      // possibly half-deleted resource.
      expect(() => coordinator.register(makeOperation('x', [painting('t1')]).registration)).toThrow(
        ScopeFencedError,
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        expect.stringContaining('painting:t1'),
        expect.any(Error),
      );
    });
  });

  it('drops its registry on stop so a late release finds nothing', async () => {
    const operation = makeOperation('chat.turn', [painting('t1')]);
    const handle = register(operation.registration);

    await coordinator._doStop();
    handle.release();

    expect(coordinator.listActive(painting('t1'))).toEqual([]);
    expect(() =>
      coordinator.register(makeOperation('x', [painting('t1')]).registration),
    ).not.toThrow();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
