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
  | { status: 'markdown'; text: string }
  | { status: 'error'; code: DocumentExportError['code'] | 'cancelled' };

export function useDocumentExportPreview(
  session: DocumentExportSession,
  format: ExportFormat,
  presentation: ExportPresentation,
  capture: CaptureExportHtml,
  revision: number,
) {
  const [result, setResult] = useState<{
    session: DocumentExportSession;
    format: ExportFormat;
    attempt: number;
    revision: number;
    state: PreviewState;
  }>();
  const [attempt, setAttempt] = useState(0);
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (format === 'markdown') return;
    const controller = new AbortController();
    const publish = (state: PreviewState) => {
      if (!controller.signal.aborted) setResult({ session, format, attempt, revision, state });
    };
    // Abort, then settle the old work before admitting the next render.
    tail.current = tail.current
      .catch(() => {})
      .then(async () => {
        if (controller.signal.aborted) return;
        try {
          const artifact = await session.render(
            format === 'html' ? { format, presentation } : { format, presentation, capture },
            {
              signal: controller.signal,
              onProgress: (progress) => publish({ status: 'loading', progress }),
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
  }, [attempt, capture, format, presentation, revision, session]);
  const state: PreviewState =
    format === 'markdown'
      ? { status: 'markdown', text: session.markdown }
      : result?.session === session &&
          result.format === format &&
          result.attempt === attempt &&
          result.revision === revision
        ? result.state
        : { status: 'loading', progress: 'rendering' };

  const getArtifact = async (signal: AbortSignal): Promise<DocumentExportArtifact> => {
    signal.throwIfAborted();
    if (state.status === 'ready') return state.artifact;
    if (state.status !== 'markdown') throw new DocumentExportError('busy');
    // Markdown becomes a file only on Share, after any cancelled conversion has settled.
    const rendering = tail.current
      .catch(() => {})
      .then(() => {
        signal.throwIfAborted();
        return session.render({ format: 'markdown' }, { signal });
      });
    tail.current = rendering;
    return rendering;
  };
  return { state, getArtifact, retry: () => setAttempt((value) => value + 1) };
}
