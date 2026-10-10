import { acquireLocalFetchSlot } from '../localFetchSlot';

test('queues URLs until the previous page releases its resources', async () => {
  const release = await acquireLocalFetchSlot(new AbortController().signal);
  let started = false;
  const second = acquireLocalFetchSlot(new AbortController().signal).then((nextRelease) => {
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

test('removes cancelled queued URLs and makes release idempotent', async () => {
  const release = await acquireLocalFetchSlot(new AbortController().signal);
  const controller = new AbortController();
  const second = acquireLocalFetchSlot(controller.signal);
  controller.abort(new Error('cancelled'));
  await expect(second).rejects.toThrow('cancelled');
  const third = acquireLocalFetchSlot(new AbortController().signal);
  release();
  const releaseThird = await third;
  release();
  let started = false;
  const fourth = acquireLocalFetchSlot(new AbortController().signal).then((nextRelease) => {
    started = true;
    return nextRelease;
  });
  await Promise.resolve();
  expect(started).toBe(false);
  releaseThird();
  (await fourth)();
});
