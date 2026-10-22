import type { JsSandboxNativeModule } from '../../../../../modules/js-sandbox';
import {
  createJsSandbox,
  JS_SANDBOX_MAX_CONCURRENT_RUNS,
  type JsSandboxRun,
  type JsSandboxBridgeInput,
} from '../jsSandbox';

const LIMITS = {
  timeoutMs: 1000,
  memoryBytes: 1,
  maxResultBytes: 3,
  maxLogBytes: 4,
};

const DONE = { durationMs: 1, logs: '', logsTruncated: false };

describe('createJsSandbox', () => {
  test('is absent on clients built without the native module', () => {
    expect(createJsSandbox(null)).toBeNull();
  });

  test('keeps the bridge absent on older clients', () => {
    expect(createJsSandbox(createNative(async () => '{}'))!.startBridge).toBeUndefined();
  });

  test('passes host file URIs to native file runs and reports the capability', async () => {
    const outcome = JSON.stringify({ status: 'ok', result: '4', ...DONE });
    expect(createJsSandbox(createNative(async () => outcome))!.files).toBe(false);
    const native = {
      ...createNative(async () => outcome),
      runFiles: jest.fn(async () => outcome),
    };
    const sandbox = createJsSandbox(native, () => 'files')!;
    expect(sandbox.files).toBe(true);
    const signal = new AbortController().signal;
    const files = { inputs: ['file:///a.pptx'], output: 'file:///b.pptx' };
    expect(await sandbox.run({ code: 'x', limits: LIMITS, files, signal })).toMatchObject({
      result: '4',
    });
    await sandbox.run({ code: 'y', limits: LIMITS, files: { inputs: [] }, signal });
    expect(native.runFiles.mock.calls).toEqual([
      ['files', 'x', LIMITS, files],
      ['files', 'y', LIMITS, { inputs: [], output: '' }],
    ]);
    expect(native.run).not.toHaveBeenCalled();
  });

  test('routes bridge messages by run and keeps its listener until native cleanup', async () => {
    const finished = deferred<string>();
    const remove = jest.fn();
    let deliverEvent!: (event: { runId: string; message: string }) => void;
    const native = {
      ...createNative(async () => JSON.stringify({ status: 'ok', ...DONE })),
      runBridge: jest.fn(
        (..._input: Parameters<NonNullable<JsSandboxNativeModule['runBridge']>>) =>
          finished.promise,
      ),
      deliver: jest.fn(),
      addListener: jest.fn((_name: 'onMessage', listener: typeof deliverEvent) => {
        deliverEvent = listener;
        return { remove };
      }),
    };
    const sandbox = createJsSandbox(native, () => 'bridge')!;
    const onMessage = jest.fn();
    const controller = new AbortController();
    const bridge = await sandbox.startBridge!(
      bridgeInput({ onMessage, signal: controller.signal }),
    );
    // The bridge's caller owns its deadline and output limits; only the memory cap reaches native.
    expect(native.runBridge.mock.calls[0]).toEqual([
      'bridge',
      '',
      '{}',
      { startedAt: 100, seed: 1 },
      { timeoutMs: 0, memoryBytes: 1, maxResultBytes: 0, maxLogBytes: 0 },
    ]);
    deliverEvent({ runId: 'other', message: 'ignored' });
    deliverEvent({ runId: 'bridge', message: 'done' });
    expect(onMessage.mock.calls).toEqual([['done']]);
    bridge.post('reply');
    expect(native.deliver).toHaveBeenCalledWith('bridge', 'reply');
    controller.abort();
    expect(native.cancel).toHaveBeenCalledWith('bridge');
    expect(remove).not.toHaveBeenCalled();
    finished.resolve('');
    await bridge.result;
    expect(remove).toHaveBeenCalledTimes(1);
    bridge.post('too late');
    expect(native.deliver).toHaveBeenCalledTimes(1);
  });

  test('bridge runs queue among themselves, never behind or ahead of bounded computations', async () => {
    const finished = deferred<string>();
    const native = {
      ...createNative(async () => JSON.stringify({ status: 'ok', ...DONE })),
      runBridge: jest.fn(() => finished.promise),
      deliver: jest.fn(),
      addListener: jest.fn(() => ({ remove() {} })),
    };
    const sandbox = createJsSandbox(native)!;
    const active = await Promise.all(
      Array.from({ length: JS_SANDBOX_MAX_CONCURRENT_RUNS }, () =>
        sandbox.startBridge!(bridgeInput()),
      ),
    );
    // A script parked on a tool or an approval leaves a computation free to start.
    await expect(sandbox.run(runInput())).resolves.toMatchObject({ status: 'ok' });

    const controller = new AbortController();
    const queued = sandbox.startBridge!(bridgeInput({ signal: controller.signal }));
    controller.abort(new Error('queued bridge cancelled'));
    await expect(queued).rejects.toThrow('queued bridge cancelled');
    expect(native.runBridge).toHaveBeenCalledTimes(JS_SANDBOX_MAX_CONCURRENT_RUNS);
    expect(native.cancel).not.toHaveBeenCalled();
    finished.resolve('');
    await Promise.all(active.map((bridge) => bridge.result));
  });

  test('passes one run id, code, and limits to the native run and parses its outcome', async () => {
    const native = createNative(async () => JSON.stringify({ status: 'ok', result: '3', ...DONE }));
    const sandbox = createJsSandbox(native, () => 'run-1')!;

    await expect(sandbox.run(runInput({ code: 'return 1 + 2' }))).resolves.toEqual({
      status: 'ok',
      result: '3',
      ...DONE,
    });
    expect(native.run).toHaveBeenCalledWith('run-1', 'return 1 + 2', LIMITS);
  });

  test('cancels that run and rejects with the abort reason without waiting for it', async () => {
    const started = deferred<void>();
    const finished = deferred<string>();
    const native = createNative(() => {
      started.resolve();
      return finished.promise;
    });
    const sandbox = createJsSandbox(native, () => 'run-1')!;
    const controller = new AbortController();
    const reason = new Error('turn cancelled');

    const running = sandbox.run(runInput({ code: 'while (true) {}', signal: controller.signal }));
    await started.promise;
    controller.abort(reason);

    await expect(running).rejects.toBe(reason);
    expect(native.cancel).toHaveBeenCalledWith('run-1');
    finished.resolve(JSON.stringify({ status: 'error', kind: 'cancelled', message: '', ...DONE }));
    await finished.promise;
  });

  test('never starts a run for an already cancelled turn', async () => {
    const native = createNative(async () => '{}');
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));

    await expect(
      createJsSandbox(native)!.run(runInput({ signal: controller.signal })),
    ).rejects.toThrow('cancelled');
    expect(native.run).not.toHaveBeenCalled();
  });

  test('notifies resource owners only after cancelled native work finishes', async () => {
    const started = deferred<void>();
    const finished = deferred<string>();
    const native = createNative(() => {
      started.resolve();
      return finished.promise;
    });
    const onSettled = jest.fn();
    const controller = new AbortController();
    const running = createJsSandbox(native)!.run(
      runInput({ signal: controller.signal, onSettled }),
    );
    await started.promise;
    controller.abort(new Error('cancelled'));
    await expect(running).rejects.toThrow('cancelled');
    expect(onSettled).not.toHaveBeenCalled();
    finished.resolve(JSON.stringify({ status: 'ok', ...DONE }));
    await finished.promise;
    await Promise.resolve();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  test('releases resource owners when cancellation prevents any native work', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    const onSettled = jest.fn();
    await expect(
      createJsSandbox(createNative(async () => '{}'))!.run(
        runInput({ signal: controller.signal, onSettled }),
      ),
    ).rejects.toThrow('cancelled');
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  test('reports an unreadable native outcome as an internal error', async () => {
    const sandbox = createJsSandbox(createNative(async () => 'not json'))!;

    await expect(sandbox.run(runInput())).resolves.toMatchObject({
      status: 'error',
      kind: 'internal',
    });
  });

  test('shares a FIFO concurrency limit across service instances', async () => {
    const count = JS_SANDBOX_MAX_CONCURRENT_RUNS + 2;
    const started = Array.from({ length: count }, () => deferred<void>());
    const finished = Array.from({ length: count }, () => deferred<string>());
    const native = createNative((_runId, code) => {
      const index = Number(code);
      started[index].resolve();
      return finished[index].promise;
    });
    let nextId = 0;
    const createId = () => String(nextId++);
    const first = createJsSandbox(native, createId)!;
    const second = createJsSandbox(native, createId)!;
    const runs = Array.from({ length: count }, (_, index) =>
      (index === 0 ? first : second).run(runInput({ code: String(index) })),
    );
    await Promise.all(
      started.slice(0, JS_SANDBOX_MAX_CONCURRENT_RUNS).map(({ promise }) => promise),
    );

    expect(native.run).toHaveBeenCalledTimes(JS_SANDBOX_MAX_CONCURRENT_RUNS);
    finished[0].resolve(JSON.stringify({ status: 'ok', ...DONE }));
    await started[JS_SANDBOX_MAX_CONCURRENT_RUNS].promise;
    expect(native.run).toHaveBeenCalledTimes(JS_SANDBOX_MAX_CONCURRENT_RUNS + 1);
    finished[1].resolve(JSON.stringify({ status: 'ok', ...DONE }));
    await started[count - 1].promise;
    expect(native.run).toHaveBeenCalledTimes(count);
    for (const result of finished.slice(2))
      result.resolve(JSON.stringify({ status: 'ok', ...DONE }));
    await Promise.all(runs);
  });

  test('removes a cancelled queued run without calling native cancel', async () => {
    const started = deferred<void>();
    const finished = deferred<string>();
    let count = 0;
    const native = createNative(() => {
      if (++count === JS_SANDBOX_MAX_CONCURRENT_RUNS) started.resolve();
      return finished.promise;
    });
    const sandbox = createJsSandbox(native)!;
    const active = Array.from({ length: JS_SANDBOX_MAX_CONCURRENT_RUNS }, () =>
      sandbox.run(runInput()),
    );
    await started.promise;
    const controller = new AbortController();
    const queued = sandbox.run(runInput({ signal: controller.signal }));
    const reason = new Error('cancelled while queued');
    controller.abort(reason);

    await expect(queued).rejects.toBe(reason);
    expect(native.cancel).not.toHaveBeenCalled();
    finished.resolve(JSON.stringify({ status: 'ok', ...DONE }));
    await Promise.all(active);
    expect(native.run).toHaveBeenCalledTimes(JS_SANDBOX_MAX_CONCURRENT_RUNS);
    await sandbox.run(runInput());
  });

  test('holds a cancelled run slot until the native thread finishes', async () => {
    const started = deferred<void>();
    const finished = deferred<string>();
    let count = 0;
    const native = createNative(() => {
      if (++count === JS_SANDBOX_MAX_CONCURRENT_RUNS) started.resolve();
      return finished.promise;
    });
    const sandbox = createJsSandbox(native)!;
    const controller = new AbortController();
    const cancelled = sandbox.run(runInput({ signal: controller.signal }));
    const active = Array.from({ length: JS_SANDBOX_MAX_CONCURRENT_RUNS - 1 }, () =>
      sandbox.run(runInput()),
    );
    await started.promise;
    const queued = sandbox.run(runInput());
    const reason = new Error('cancelled during execution');
    controller.abort(reason);

    await expect(cancelled).rejects.toBe(reason);
    expect(native.run).toHaveBeenCalledTimes(JS_SANDBOX_MAX_CONCURRENT_RUNS);
    finished.resolve(JSON.stringify({ status: 'ok', ...DONE }));
    await Promise.all([...active, queued]);
    expect(native.run).toHaveBeenCalledTimes(JS_SANDBOX_MAX_CONCURRENT_RUNS + 1);
  });

  test('releases slots when starting native execution throws', async () => {
    const native = createNative(() => {
      throw new Error('native unavailable');
    });
    const sandbox = createJsSandbox(native)!;
    for (let index = 0; index <= JS_SANDBOX_MAX_CONCURRENT_RUNS; index++) {
      await expect(sandbox.run(runInput())).rejects.toThrow('native unavailable');
    }
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function runInput(overrides: Partial<JsSandboxRun> = {}): JsSandboxRun {
  return {
    code: 'return 1',
    limits: LIMITS,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function bridgeInput(overrides: Partial<JsSandboxBridgeInput> = {}): JsSandboxBridgeInput {
  return {
    setup: '',
    data: '{}',
    clock: { startedAt: 100, seed: 1 },
    memoryBytes: 1,
    signal: new AbortController().signal,
    onMessage() {},
    ...overrides,
  };
}

function createNative(
  run: JsSandboxNativeModule['run'],
): JsSandboxNativeModule & { run: jest.Mock; cancel: jest.Mock } {
  return { run: jest.fn(run), cancel: jest.fn() };
}
