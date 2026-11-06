import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DocumentExportError,
  type CaptureExportHtml,
  type DocumentExportArtifact,
  type DocumentExportProgress,
  type DocumentExportSession,
  type ExportFormat,
  type ExportPresentation,
} from '@/shared/contracts/documentExport';
import { renderMarkdownSignature } from '@/shared/utils/documentExportMarkdown';

/** Preparing a readable preview never captures PNGs. Delivery renders the chosen format once. */
export function useDocumentExportPreview(
  session: DocumentExportSession,
  format: ExportFormat,
  presentation: ExportPresentation,
  capture: CaptureExportHtml,
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    session: DocumentExportSession;
    format: ExportFormat;
    presentation: ExportPresentation;
    html?: string;
    artifact?: DocumentExportArtifact;
    error?: unknown;
  }>();
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const text = session.markdown + renderMarkdownSignature(presentation.watermark);
  const immediateHtml = useMemo(
    () =>
      format === 'image'
        ? session.previewDocument(presentation)
        : session.previewMarkdown(text, presentation),
    [format, presentation, session, text],
  );
  useEffect(() => {
    const controller = new AbortController();
    tail.current = tail.current
      .catch(() => {})
      .then(async () => {
        if (controller.signal.aborted) return;
        try {
          const artifact = await session.render(
            format === 'markdown'
              ? { format, watermark: presentation.watermark }
              : { format: 'html', presentation },
            { signal: controller.signal },
          );
          if (!controller.signal.aborted)
            setResult({
              session,
              format,
              presentation,
              artifact,
              html:
                artifact.format === 'html'
                  ? artifact.html
                  : artifact.format === 'markdown'
                    ? session.previewMarkdown(artifact.text, presentation)
                    : undefined,
            });
        } catch (error) {
          if (!controller.signal.aborted) setResult({ session, format, presentation, error });
        }
      });
    return () => controller.abort();
  }, [attempt, format, presentation, session]);
  const current =
    result?.session === session && result.format === format && result.presentation === presentation
      ? result
      : undefined;
  const getArtifact = useCallback(
    async (signal: AbortSignal, onProgress?: (progress: DocumentExportProgress) => void) => {
      signal.throwIfAborted();
      await tail.current.catch(() => {});
      signal.throwIfAborted();
      return session.render(
        format === 'image'
          ? {
              format,
              presentation,
              capture,
              layout: presentation.imageFrame?.excerptLabel ? 'single' : 'pages',
            }
          : format === 'html'
            ? { format, presentation }
            : { format, watermark: presentation.watermark },
        { signal, onProgress },
      );
    },
    [capture, format, presentation, session],
  );
  return {
    html: current?.html ?? immediateHtml,
    isPreparing: !current,
    error: current?.error,
    issues: current?.artifact?.issues ?? [],
    getArtifact,
    retry: () => setAttempt((value) => value + 1),
    isPaused:
      current?.error instanceof DocumentExportError &&
      ['inactive', 'busy'].includes(current.error.code),
  };
}
