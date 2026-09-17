import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelRatio } from 'react-native';

import { DocumentExportError } from '@/shared/contracts/documentExport';

import { createHtmlCaptureSession } from './createHtmlCaptureSession';
import { HtmlCaptureSurface, type HtmlCaptureRequest } from './HtmlCaptureSurface';
import type { HtmlCaptureInput } from './types';

let nextId = 0;

export function useHtmlCapture() {
  const [request, setRequest] = useState<HtmlCaptureRequest>();
  const pending = useRef(new Set<AbortController>());
  const mounted = useRef(true);
  const capture = useCallback(async (input: HtmlCaptureInput) => {
    input.signal.throwIfAborted();
    if (!mounted.current) throw new DocumentExportError('disposed');
    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal.addEventListener('abort', abort, { once: true });
    pending.current.add(controller);
    let request: HtmlCaptureRequest | undefined;
    try {
      const id = ++nextId;
      const density = PixelRatio.get();
      const source = input.source({ id, density });
      const session = await createHtmlCaptureSession({
        signal: controller.signal,
        onPage: input.onPage,
        timeout: source.timeout,
      });
      request = { id, density, source, session };
      if (!mounted.current) session.abort(new DOMException('Capture closed', 'AbortError'));
      else if (!session.signal.aborted) setRequest(request);
      await session.finished;
    } finally {
      pending.current.delete(controller);
      input.signal.removeEventListener('abort', abort);
      if (request && mounted.current)
        setRequest((current) => (current === request ? undefined : current));
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const controllers = pending.current;
    return () => {
      mounted.current = false;
      for (const controller of controllers) controller.abort();
    };
  }, []);
  return {
    capture,
    surface: request ? <HtmlCaptureSurface key={request.id} request={request} /> : null,
  };
}
