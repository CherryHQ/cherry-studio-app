import type { JsSandboxNativeModule } from '../../../../../modules/js-sandbox';
import { createJsSandbox, type JsSandboxRun } from '../jsSandbox';

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

  test('passes one run id and the store as JSON text to the native run and parses its outcome', async () => {
    const native = createNative(async () => JSON.stringify({ status: 'ok', result: '3', ...DONE }));
    const sandbox = createJsSandbox(native, () => 'run-1')!;

    await expect(
      sandbox.run(runInput({ code: 'return 1 + 2', store: { user: { name: 'a' }, count: 3 } })),
    ).resolves.toEqual({
      status: 'ok',
      result: '3',
      storeWrites: { set: {}, delete: [] },
      ...DONE,
    });
    expect(native.run).toHaveBeenCalledWith(
      'run-1',
      'return 1 + 2',
      JSON.stringify({ user: '{"name":"a"}', count: '3' }),
      LIMITS,
    );
  });

  test("parses a fulfilled script's store writes into values to set and keys to delete", async () => {
    const native = createNative(async () =>
      JSON.stringify({
        status: 'ok',
        storeWrites: JSON.stringify([['count', '4'], ['gone'], ['user', '{"name":"b"}']]),
        ...DONE,
      }),
    );

    await expect(createJsSandbox(native)!.run(runInput())).resolves.toMatchObject({
      storeWrites: { set: { count: 4, user: { name: 'b' } }, delete: ['gone'] },
    });
  });

  test('drops a garbled write report rather than applying part of it', async () => {
    const native = createNative(async () =>
      JSON.stringify({ status: 'ok', storeWrites: '[["ok","1"],["bad","{"]]', ...DONE }),
    );

    await expect(createJsSandbox(native)!.run(runInput())).resolves.toMatchObject({
      storeWrites: { set: {}, delete: [] },
    });
  });

  test('cancels that run and rejects with the abort reason without waiting for it', async () => {
    const native = createNative(() => new Promise<string>(() => {}));
    const sandbox = createJsSandbox(native, () => 'run-1')!;
    const controller = new AbortController();
    const reason = new Error('turn cancelled');

    const running = sandbox.run(runInput({ code: 'while (true) {}', signal: controller.signal }));
    controller.abort(reason);

    await expect(running).rejects.toBe(reason);
    expect(native.cancel).toHaveBeenCalledWith('run-1');
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

  test('reports an unreadable native outcome as an internal error', async () => {
    const sandbox = createJsSandbox(createNative(async () => 'not json'))!;

    await expect(sandbox.run(runInput())).resolves.toMatchObject({
      status: 'error',
      kind: 'internal',
    });
  });
});

function runInput(overrides: Partial<JsSandboxRun> = {}): JsSandboxRun {
  return {
    code: 'return 1',
    limits: LIMITS,
    store: {},
    signal: new AbortController().signal,
    ...overrides,
  };
}

function createNative(
  run: JsSandboxNativeModule['run'],
): JsSandboxNativeModule & { run: jest.Mock; cancel: jest.Mock } {
  return { run: jest.fn(run), cancel: jest.fn() };
}
