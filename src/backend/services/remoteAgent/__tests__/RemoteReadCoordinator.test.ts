import { RemoteReadCoordinator } from '../RemoteReadCoordinator';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
it('shares a read without letting one consumer cancel the other, then cancels the last reader', async () => {
  const reads = new RemoteReadCoordinator();
  const a = new AbortController();
  const b = new AbortController();
  let shared!: AbortSignal;
  let resolve!: (value: string) => void;
  const work = jest.fn((signal: AbortSignal) => {
    shared = signal;
    return new Promise<string>((done) => {
      resolve = done;
    });
  });
  const first = reads.share('body', a.signal, work);
  const second = reads.share('body', b.signal, work);
  await tick();
  a.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  expect(shared.aborted).toBe(false);
  resolve('body');
  await expect(second).resolves.toBe('body');
  expect(work).toHaveBeenCalledTimes(1);
  const pending = reads.share('body', b.signal, work);
  await tick();
  b.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(shared.aborted).toBe(true);
  resolve('discarded');
});

it('caps concurrent RPCs and removes a cancelled queued read without executing it', async () => {
  const reads = new RemoteReadCoordinator(2);
  const pending: (() => void)[] = [];
  let running = 0;
  let peak = 0;
  const work = jest.fn(async () => {
    peak = Math.max(peak, ++running);
    await new Promise<void>((resolve) => pending.push(resolve));
    running--;
  });
  const signal = new AbortController().signal;
  const calls = [reads.run(signal, work), reads.run(signal, work), reads.run(signal, work)];
  const cancelled = new AbortController();
  const queued = reads.run(cancelled.signal, work);
  cancelled.abort();
  await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
  await tick();
  expect(work).toHaveBeenCalledTimes(2);
  pending.shift()!();
  await tick();
  expect(work).toHaveBeenCalledTimes(3);
  for (const finish of pending) finish();
  await Promise.all(calls);
  expect(peak).toBe(2);
});
