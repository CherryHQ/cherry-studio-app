import { createConcurrencySlots } from '../concurrencySlots';

const signal = () => new AbortController().signal;

test('queues holders until an earlier holder releases its slot', async () => {
  const slots = createConcurrencySlots(1);
  const release = await slots.acquire(signal());
  let started = false;
  const second = slots.acquire(signal()).then((nextRelease) => {
    started = true;
    return nextRelease;
  });
  await Promise.resolve();
  expect(started).toBe(false);
  release();
  const releaseSecond = await second;
  expect(started).toBe(true);
  releaseSecond();
});

test('admits up to the limit and starts queued holders in FIFO order', async () => {
  const slots = createConcurrencySlots(2);
  const releases = await Promise.all([slots.acquire(signal()), slots.acquire(signal())]);
  const order: number[] = [];
  const queued = [1, 2].map((id) =>
    slots.acquire(signal()).then((release) => {
      order.push(id);
      return release;
    }),
  );
  await Promise.resolve();
  expect(order).toEqual([]);
  releases[0]();
  await queued[0];
  expect(order).toEqual([1]);
  releases[1]();
  await queued[1];
  expect(order).toEqual([1, 2]);
});

test('rejects an already aborted acquisition without queueing it', () => {
  const slots = createConcurrencySlots(1);
  const controller = new AbortController();
  const reason = new Error('already cancelled');
  controller.abort(reason);
  expect(() => slots.acquire(controller.signal)).toThrow(reason);
});

test('removes cancelled queued holders and makes release idempotent', async () => {
  const slots = createConcurrencySlots(1);
  const release = await slots.acquire(signal());
  const controller = new AbortController();
  const second = slots.acquire(controller.signal);
  controller.abort(new Error('cancelled'));
  await expect(second).rejects.toThrow('cancelled');
  const third = slots.acquire(signal());
  release();
  const releaseThird = await third;
  release();
  let started = false;
  const fourth = slots.acquire(signal()).then((nextRelease) => {
    started = true;
    return nextRelease;
  });
  await Promise.resolve();
  expect(started).toBe(false);
  releaseThird();
  (await fourth)();
});
