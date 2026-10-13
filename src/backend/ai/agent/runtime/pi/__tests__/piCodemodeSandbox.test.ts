import { constants, createContext, runInContext } from 'node:vm';

import type { HostToWorkerMessage, WorkerToHostMessage } from '@earendil-works/pi-codemode/native';

import type { RuntimeScriptSandbox } from '../../durableTypes';
import { createPiCodemodeSandbox, PI_CODEMODE_VM_SOURCE } from '../piCodemodeSandbox';

/** Exercise the exact bridge and upstream prelude in their own realm, without native execution. */
function driver(code: string) {
  // An ordinary global: the prelude freezes globals, which a contextified sandbox object would
  // turn into undefined shadows of the realm's built-ins.
  const context = createContext(constants.DONT_CONTEXTIFY, { microtaskMode: 'afterEvaluate' });
  // The native realm starts without a console; the prelude installs its own.
  runInContext('delete globalThis.console', context);
  const messages: WorkerToHostMessage[] = [];
  const clock = jest.fn();
  const factory = runInContext(PI_CODEMODE_VM_SOURCE, context);
  const bridge = factory(
    (message: string) => messages.push(JSON.parse(message)),
    clock,
    JSON.stringify({
      code,
      tools: [{ name: 'echo', jsName: 'echo', description: 'Echo' }],
      globals: [],
      store: { previous: '7' },
      deterministic: { startedAt: 100, seed: 1 },
      fingerprint: 'test',
    }),
    'test-engine',
  );
  return {
    messages,
    clock,
    deliver: (message: HostToWorkerMessage) => bridge.deliver(JSON.stringify(message)),
    drain() {
      for (let attempt = 0; attempt < 10; attempt++) {
        runInContext('void 0', context);
        const state = bridge.drained();
        if (state !== 'again') return state;
      }
      throw new Error('The bridge did not drain.');
    },
  };
}

test('buffers out-of-order replies, acknowledges each drain, and returns upstream store writes', () => {
  const vm = driver(`
    const values = await Promise.all([tools.echo({ n: 1 }), tools.echo({ n: 2 })]);
    store('answer', values);
    return [load('previous'), ...values];
  `);
  expect(vm.drain()).toBe('idle');
  const calls = vm.messages.filter((message) => message.type === 'call');
  expect(calls).toHaveLength(2);
  expect(vm.messages).toContainEqual({ type: 'idle', seq: 0, issued: 2 });
  const second: HostToWorkerMessage = {
    type: 'result',
    id: calls[1]!.id,
    seq: 2,
    now: 150,
    ok: true,
    payload: '2',
  };
  vm.deliver(second);
  expect(() => vm.deliver(second)).toThrow('sequence');
  expect(vm.drain()).toBe('idle');
  vm.deliver({ type: 'result', id: calls[0]!.id, seq: 1, now: 200, ok: true, payload: '1' });
  expect(vm.drain()).toBe('done');
  expect(vm.clock.mock.calls).toEqual([[200], [200]]);
  expect(vm.messages).toContainEqual({ type: 'idle', seq: 1, issued: 2 });
  expect(vm.messages.at(-1)).toMatchObject({
    type: 'done',
    ok: true,
    value: '[7,1,2]',
    writes: '[["answer","[1,2]"]]',
    during: { seq: 2, issued: 2 },
  });
});

test('does not expose native callbacks or nondeterministic collection APIs to scripts', () => {
  const vm = driver(
    'return [typeof emit, typeof clock, typeof input, typeof WeakRef, typeof FinalizationRegistry];',
  );
  expect(vm.drain()).toBe('done');
  expect(vm.messages.at(-1)).toMatchObject({
    type: 'done',
    ok: true,
    value: '["undefined","undefined","undefined","undefined","undefined"]',
  });
});

test('a script that does not compile reports its error text ahead of the stack frames', () => {
  const vm = driver('const = 1;');
  const done = vm.messages.at(-1);
  if (done?.type !== 'done' || done.ok) throw new Error('Expected a failed script');
  const error = JSON.parse(done.error) as { name: string; message: string; stack: string };
  expect(error.name).toBe('SyntaxError');
  expect(error.message).not.toBe('');
  expect(error.stack.startsWith(`SyntaxError: ${error.message}`)).toBe(true);
});

test('cancellation during native admission waits for cleanup and never leaves the queued VM running', async () => {
  let input!: Parameters<RuntimeScriptSandbox['startBridge']>[0];
  let open!: (value: Awaited<ReturnType<RuntimeScriptSandbox['startBridge']>>) => void;
  const pending = new Promise<Awaited<ReturnType<RuntimeScriptSandbox['startBridge']>>>(
    (resolve) => {
      open = resolve;
    },
  );
  const sandbox = createPiCodemodeSandbox({
    fingerprint: 'test',
    startBridge: async (value) => {
      input = value;
      return pending;
    },
  })!;
  const controller = new AbortController();
  const run = sandbox.start('return 1', {
    startedAt: 100,
    seed: 1,
    signal: controller.signal,
    onCall() {},
  });
  await Promise.resolve();
  controller.abort();
  const cleanup = deferred();
  open({ post() {}, result: cleanup.promise });
  let settled = false;
  void run.result.then(() => {
    settled = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect(input.signal.aborted).toBe(true);
  expect(settled).toBe(false);
  cleanup.resolve('');
  await expect(run.result).resolves.toMatchObject({ ok: false, error: { kind: 'aborted' } });
  await sandbox.close();
});

function deferred() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
