import { DocumentExportError, type CapturedHtmlPage } from '@/shared/contracts/documentExport';

import type { HtmlCaptureFrame, HtmlCaptureInput, HtmlCaptureSource } from './types';

type CaptureDriver = {
  prepare(frame: HtmlCaptureFrame, index: number, signal: AbortSignal): Promise<void>;
  capture(frame: HtmlCaptureFrame, signal: AbortSignal): Promise<CapturedHtmlPage>;
};

export type HtmlCaptureSession = {
  signal: AbortSignal;
  finished: Promise<void>;
  abort(error: unknown): void;
  run(frames: readonly HtmlCaptureFrame[], driver: CaptureDriver): void;
};

// Shared by both page owners. A cancelled session keeps its lease until native
// capture and the consumer's watermark/copy work have physically finished.
let active: HtmlCaptureSession | undefined;

export async function createHtmlCaptureSession(
  input: Pick<HtmlCaptureInput, 'signal' | 'onPage'> & Pick<HtmlCaptureSource, 'timeout'>,
): Promise<HtmlCaptureSession> {
  input.signal.throwIfAborted();
  if (active?.signal.aborted) {
    const previous = active;
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(new DOMException('Capture cancelled', 'AbortError'));
      const drained = () => {
        input.signal.removeEventListener('abort', abort);
        resolve();
      };
      input.signal.addEventListener('abort', abort, { once: true });
      void previous.finished.then(drained, drained);
    });
  }
  input.signal.throwIfAborted();
  if (active) throw new DocumentExportError('busy');

  const controller = new AbortController();
  let started = false;
  let settled = false;
  // React Native's AbortController does not consistently support abort(reason).
  let failure: unknown;
  let pageTimer: ReturnType<typeof setTimeout> | undefined;
  let totalTimer: ReturnType<typeof setTimeout> | undefined;
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const finished = new Promise<void>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  const clearTimers = () => {
    clearTimeout(pageTimer);
    clearTimeout(totalTimer);
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimers();
    input.signal.removeEventListener('abort', abort);
    if (active === session) active = undefined;
    if (controller.signal.aborted) reject(failure);
    else resolve();
  };
  const timeout = () => session.abort(new DocumentExportError('capture-failed'));
  const touch = () => {
    clearTimeout(pageTimer);
    if (input.timeout.pageMs !== undefined) pageTimer = setTimeout(timeout, input.timeout.pageMs);
  };
  const session: HtmlCaptureSession = {
    signal: controller.signal,
    finished,
    abort(error) {
      if (settled || controller.signal.aborted) return;
      failure = error;
      controller.abort();
      clearTimers();
      if (!started) finish();
    },
    run(frames, driver) {
      if (started || settled || controller.signal.aborted) return;
      started = true;
      // Every failure, including a synchronous driver failure, goes through
      // the same completion boundary.
      void (async () => {
        try {
          if (!frames.length) throw new DocumentExportError('capture-failed');
          for (const [index, frame] of frames.entries()) {
            controller.signal.throwIfAborted();
            touch();
            await driver.prepare(frame, index, controller.signal);
            controller.signal.throwIfAborted();
            const page = await driver.capture(frame, controller.signal);
            try {
              controller.signal.throwIfAborted();
              await input.onPage(page, index, frames.length, controller.signal);
              controller.signal.throwIfAborted();
            } finally {
              page.release();
            }
          }
        } catch (error) {
          session.abort(error);
        } finally {
          finish();
        }
      })();
    },
  };
  const abort = () => session.abort(new DOMException('Capture cancelled', 'AbortError'));
  active = session;
  input.signal.addEventListener('abort', abort, { once: true });
  touch();
  if (input.timeout.totalMs !== undefined) totalTimer = setTimeout(timeout, input.timeout.totalMs);
  return session;
}
