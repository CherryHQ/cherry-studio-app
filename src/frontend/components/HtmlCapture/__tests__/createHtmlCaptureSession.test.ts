import { DocumentExportError, type CapturedHtmlPage } from '@/shared/contracts/documentExport';

import { createHtmlCaptureSession } from '../createHtmlCaptureSession';
import type { HtmlCaptureFrame } from '../types';

const frames: HtmlCaptureFrame[] = [
  { width: 1080, height: 3744, script: 'first' },
  { width: 1080, height: 700, script: 'second' },
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((success) => {
    resolve = success;
  });
  return { promise, resolve };
}

function screenshot(index = 0): CapturedHtmlPage {
  return { uri: `file:///page-${index}.png`, width: 1080, height: 700, release: jest.fn() };
}

afterEach(() => jest.useRealTimers());

test('waits for each page consumer and release before preparing the next page', async () => {
  const events: string[] = [];
  const copying = deferred<void>();
  const copyStarted = deferred<void>();
  const session = await createHtmlCaptureSession({
    signal: new AbortController().signal,
    timeout: { pageMs: 60_000 },
    onPage: async (_page, index, total) => {
      events.push(`copy ${index}/${total}`);
      if (index === 0) {
        copyStarted.resolve();
        await copying.promise;
      }
    },
  });
  session.run(frames, {
    prepare: async (_frame, index) => {
      events.push(`prepare ${index}`);
    },
    capture: async (frame) => {
      const index = frames.indexOf(frame);
      events.push(`capture ${index}`);
      return {
        ...screenshot(index),
        release: () => {
          events.push(`release ${index}`);
        },
      };
    },
  });
  await copyStarted.promise;
  expect(events).toEqual(['prepare 0', 'capture 0', 'copy 0/2']);
  copying.resolve();
  await session.finished;
  expect(events).toEqual([
    'prepare 0',
    'capture 0',
    'copy 0/2',
    'release 0',
    'prepare 1',
    'capture 1',
    'copy 1/2',
    'release 1',
  ]);
});

test('rejects concurrent consumers and keeps a cancelled copy leased until it drains', async () => {
  const controller = new AbortController();
  const copying = deferred<void>();
  const copyStarted = deferred<void>();
  const page = screenshot();
  const onPage = jest.fn(async () => {
    copyStarted.resolve();
    await copying.promise;
  });
  const session = await createHtmlCaptureSession({
    signal: controller.signal,
    timeout: {},
    onPage,
  });
  const outcome = session.finished.catch((error: unknown) => error);
  session.run(frames, { prepare: async () => {}, capture: async () => page });
  await copyStarted.promise;
  const nextInput = { signal: new AbortController().signal, timeout: {}, onPage: jest.fn() };
  await expect(createHtmlCaptureSession(nextInput)).rejects.toMatchObject({ code: 'busy' });

  controller.abort();
  let acquired = false;
  const next = createHtmlCaptureSession(nextInput).then((value) => {
    acquired = true;
    return value;
  });
  await Promise.resolve();
  expect(acquired).toBe(false);
  expect(page.release).not.toHaveBeenCalled();
  copying.resolve();
  expect(await outcome).toMatchObject({ name: 'AbortError' });
  const nextSession = await next;
  expect(page.release).toHaveBeenCalledTimes(1);
  expect(onPage).toHaveBeenCalledTimes(1);
  const nextOutcome = nextSession.finished.catch((error: unknown) => error);
  nextSession.abort(new Error('Done'));
  await nextOutcome;
});

test('releases a late native screenshot after cancellation without delivering it', async () => {
  const controller = new AbortController();
  const native = deferred<CapturedHtmlPage>();
  const started = deferred<void>();
  const page = screenshot();
  const onPage = jest.fn();
  const session = await createHtmlCaptureSession({
    signal: controller.signal,
    timeout: {},
    onPage,
  });
  const outcome = session.finished.catch((error: unknown) => error);
  session.run(frames, {
    prepare: async () => {},
    capture: () => {
      started.resolve();
      return native.promise;
    },
  });
  await started.promise;
  controller.abort();
  native.resolve(page);
  expect(await outcome).toMatchObject({ name: 'AbortError' });
  expect(onPage).not.toHaveBeenCalled();
  expect(page.release).toHaveBeenCalledTimes(1);
});

test('a waiting request can cancel without disturbing the draining capture lease', async () => {
  const copying = deferred<void>();
  const copyStarted = deferred<void>();
  const page = screenshot();
  const input = {
    signal: new AbortController().signal,
    timeout: {},
    onPage: async () => {
      copyStarted.resolve();
      await copying.promise;
    },
  };
  const session = await createHtmlCaptureSession(input);
  const outcome = session.finished.catch((error: unknown) => error);
  session.run(frames, { prepare: async () => {}, capture: async () => page });
  await copyStarted.promise;
  const failure = new DocumentExportError('capture-failed');
  session.abort(failure);

  const waiting = new AbortController();
  const next = createHtmlCaptureSession({ ...input, signal: waiting.signal });
  waiting.abort();
  await expect(next).rejects.toMatchObject({ name: 'AbortError' });
  expect(page.release).not.toHaveBeenCalled();
  copying.resolve();
  expect(await outcome).toBe(failure);
  expect(page.release).toHaveBeenCalledTimes(1);
});

test('consumer failure releases its page and stops subsequent captures', async () => {
  const failure = new Error('Cannot copy PNG');
  const page = screenshot();
  const capture = jest.fn(async () => page);
  const session = await createHtmlCaptureSession({
    signal: new AbortController().signal,
    timeout: {},
    onPage: async () => {
      throw failure;
    },
  });
  session.run(frames, { prepare: async () => {}, capture });
  await expect(session.finished).rejects.toBe(failure);
  expect(page.release).toHaveBeenCalledTimes(1);
  expect(capture).toHaveBeenCalledTimes(1);
});

test('cancels readiness waits and preserves the original timeout failure', async () => {
  jest.useFakeTimers();
  const capture = jest.fn();
  const session = await createHtmlCaptureSession({
    signal: new AbortController().signal,
    timeout: { pageMs: 60_000 },
    onPage: jest.fn(),
  });
  const outcome = session.finished.catch((error: unknown) => error);
  session.run(frames, {
    prepare: (_frame, _index, signal) =>
      new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Closed', 'AbortError')), {
          once: true,
        });
      }),
    capture,
  });
  jest.advanceTimersByTime(60_000);
  expect(await outcome).toEqual(new DocumentExportError('capture-failed'));
  expect(capture).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('expires before measurement and permits a new session', async () => {
  jest.useFakeTimers();
  const input = {
    signal: new AbortController().signal,
    timeout: { totalMs: 180_000 },
    onPage: jest.fn(),
  };
  const session = await createHtmlCaptureSession(input);
  const outcome = session.finished.catch((error: unknown) => error);
  jest.advanceTimersByTime(180_000);
  expect(await outcome).toMatchObject({ code: 'capture-failed' });
  const next = await createHtmlCaptureSession(input);
  const nextOutcome = next.finished.catch((error: unknown) => error);
  next.abort(new Error('Done'));
  await nextOutcome;
  expect(jest.getTimerCount()).toBe(0);
});

test('restarts the page timeout while retaining an overall conversion deadline', async () => {
  jest.useFakeTimers();
  const secondPage = deferred<void>();
  const session = await createHtmlCaptureSession({
    signal: new AbortController().signal,
    timeout: { pageMs: 60_000, totalMs: 90_000 },
    onPage: async () => {},
  });
  const outcome = session.finished.catch((error: unknown) => error);
  session.run(frames, {
    prepare: async (_frame, index, signal) => {
      if (index === 0) jest.advanceTimersByTime(50_000);
      else {
        secondPage.resolve();
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
    },
    capture: async () => screenshot(),
  });
  await secondPage.promise;
  jest.advanceTimersByTime(39_999);
  expect(session.signal.aborted).toBe(false);
  jest.advanceTimersByTime(1);
  expect(await outcome).toMatchObject({ code: 'capture-failed' });
  expect(jest.getTimerCount()).toBe(0);
});
