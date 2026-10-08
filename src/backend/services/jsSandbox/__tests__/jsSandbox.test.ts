import type { JsSandboxNativeModule } from '../../../../../modules/js-sandbox';
import { createJsSandbox } from '../jsSandbox';

const LIMITS = {
  timeoutMs: 1000,
  memoryBytes: 1,
  maxResultBytes: 3,
  maxLogBytes: 4,
};

describe('createJsSandbox', () => {
  test('is absent on clients built without the native module', () => {
    expect(createJsSandbox(null)).toBeNull();
  });

  test('passes one run id to the native run and parses its outcome', async () => {
    const native = createNative(async () =>
      JSON.stringify({ status: 'ok', result: '3', durationMs: 1, logs: '', logsTruncated: false }),
    );
    const sandbox = createJsSandbox(native, () => 'run-1')!;

    await expect(
      sandbox.run('return 1 + 2', LIMITS, new AbortController().signal),
    ).resolves.toEqual({
      status: 'ok',
      result: '3',
      durationMs: 1,
      logs: '',
      logsTruncated: false,
    });
    expect(native.run).toHaveBeenCalledWith('run-1', 'return 1 + 2', LIMITS);
  });

  test('cancels that run and rejects with the abort reason without waiting for it', async () => {
    const native = createNative(() => new Promise<string>(() => {}));
    const sandbox = createJsSandbox(native, () => 'run-1')!;
    const controller = new AbortController();
    const reason = new Error('turn cancelled');

    const running = sandbox.run('while (true) {}', LIMITS, controller.signal);
    controller.abort(reason);

    await expect(running).rejects.toBe(reason);
    expect(native.cancel).toHaveBeenCalledWith('run-1');
  });

  test('never starts a run for an already cancelled turn', async () => {
    const native = createNative(async () => '{}');
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));

    await expect(
      createJsSandbox(native)!.run('return 1', LIMITS, controller.signal),
    ).rejects.toThrow('cancelled');
    expect(native.run).not.toHaveBeenCalled();
  });

  test('reports an unreadable native outcome as an internal error', async () => {
    const sandbox = createJsSandbox(createNative(async () => 'not json'))!;

    await expect(
      sandbox.run('return 1', LIMITS, new AbortController().signal),
    ).resolves.toMatchObject({ status: 'error', kind: 'internal' });
  });
});

function createNative(
  run: JsSandboxNativeModule['run'],
): JsSandboxNativeModule & { run: jest.Mock; cancel: jest.Mock } {
  return { run: jest.fn(run), cancel: jest.fn() };
}
