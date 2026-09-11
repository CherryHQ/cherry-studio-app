import { useEffect, useRef, useState } from 'react';

import {
  DocumentExportError,
  type CaptureExportHtml,
  type DocumentExportArtifact,
  type DocumentExportProgress,
  type DocumentExportSession,
  type ExportFormat,
  type ExportPresentation,
} from '@/shared/contracts/documentExport';

type PreviewState =
  | { status: 'loading'; progress: DocumentExportProgress }
  | { status: 'ready'; artifact: DocumentExportArtifact }
  | { status: 'error'; code: DocumentExportError['code'] | 'cancelled' };

export function useDocumentExportPreview(
  session: DocumentExportSession,
  format: ExportFormat,
  presentation: ExportPresentation,
  capture: CaptureExportHtml,
) {
  const [result, setResult] = useState<{
    format: ExportFormat;
    attempt: number;
    state: PreviewState;
  }>({ format, attempt: 0, state: { status: 'loading', progress: 'rendering' } });
  const [attempt, setAttempt] = useState(0);
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    const controller = new AbortController();
    const publish = (state: PreviewState) => {
      if (!controller.signal.aborted) setResult({ format, attempt, state });
    };
    // Abort, then settle the old work before admitting the next render.
    tail.current = tail.current
      .catch(() => {})
      .then(async () => {
        if (controller.signal.aborted) return;
        try {
          const artifact = await session.render(
            format === 'markdown'
              ? { format }
              : format === 'html'
                ? { format, presentation }
                : { format, presentation, capture },
            {
              signal: controller.signal,
              onProgress: (progress) => {
                publish({ status: 'loading', progress });
              },
            },
          );
          publish({ status: 'ready', artifact });
        } catch (error) {
          publish({
            status: 'error',
            code:
              error instanceof DocumentExportError
                ? error.code
                : error instanceof Error && error.name === 'AbortError'
                  ? 'cancelled'
                  : 'storage-failed',
          });
        }
      });
    return () => controller.abort();
  }, [attempt, capture, format, presentation, session]);
  const state: PreviewState =
    result.format === format && result.attempt === attempt
      ? result.state
      : { status: 'loading', progress: 'rendering' };
  return { state, retry: () => setAttempt((value) => value + 1) };
}
