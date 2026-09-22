import { useEffect, useRef, useState } from 'react';

import {
  DocumentExportError,
  type CaptureExportHtml,
  type DocumentExportArtifact,
  type DocumentExportProgress,
  type DocumentExportSession,
  type ExportFormat,
  type ExportImageLayout,
  type ExportPresentation,
} from '@/shared/contracts/documentExport';
import { renderMarkdownSignature } from '@/shared/utils/documentExportMarkdown';

type PreviewState =
  | { status: 'loading'; progress: DocumentExportProgress }
  | { status: 'ready'; artifact: DocumentExportArtifact; fallback?: true }
  | { status: 'markdown'; text: string; fallback?: true }
  | { status: 'paused' };

export function useDocumentExportPreview(
  session: DocumentExportSession,
  format: ExportFormat,
  presentation: ExportPresentation,
  capture: CaptureExportHtml,
  revision: number,
  imageLayout: ExportImageLayout = 'pages',
) {
  const [result, setResult] = useState<{
    session: DocumentExportSession;
    format: ExportFormat;
    presentation: ExportPresentation;
    attempt: number;
    revision: number;
    imageLayout: ExportImageLayout;
    state: PreviewState;
  }>();
  const [attempt, setAttempt] = useState(0);
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const markdown = session.markdown + renderMarkdownSignature(presentation.watermark);
  useEffect(() => {
    const controller = new AbortController();
    const publish = (state: PreviewState) => {
      if (!controller.signal.aborted)
        setResult({ session, format, presentation, attempt, revision, imageLayout, state });
    };
    // Abort, then settle the old work before admitting the next render.
    tail.current = tail.current
      .catch(() => {})
      .then(async () => {
        if (controller.signal.aborted) return;
        const context = {
          signal: controller.signal,
          onProgress: (progress: DocumentExportProgress) =>
            publish({ status: 'loading', progress }),
        };
        const pause = (error: unknown) => {
          if (
            controller.signal.aborted ||
            (error instanceof Error && error.name === 'AbortError') ||
            (error instanceof DocumentExportError &&
              ['inactive', 'disposed', 'busy'].includes(error.code))
          ) {
            publish({ status: 'paused' });
            return true;
          }
          return false;
        };
        try {
          const artifact = await session.render(
            format === 'markdown'
              ? { format, watermark: presentation.watermark }
              : format === 'html'
                ? { format, presentation }
                : { format, presentation, capture, layout: imageLayout },
            context,
          );
          publish({ status: 'ready', artifact });
        } catch (error) {
          if (pause(error)) return;
          if (format === 'image') {
            try {
              const artifact = await session.render(
                { format: 'html', presentation: { ...presentation, imageFrame: undefined } },
                context,
              );
              publish({ status: 'ready', artifact, fallback: true });
              return;
            } catch (htmlError) {
              if (pause(htmlError)) return;
            }
          }
          // A complete source preview needs neither image allocation nor temporary files.
          publish({ status: 'markdown', text: markdown, fallback: true });
        }
      });
    return () => controller.abort();
  }, [attempt, capture, format, imageLayout, markdown, presentation, revision, session]);
  const state: PreviewState =
    result?.session === session &&
    result.format === format &&
    result.presentation === presentation &&
    result.attempt === attempt &&
    result.imageLayout === imageLayout &&
    result.revision === revision
      ? result.state
      : { status: 'loading', progress: 'rendering' };

  const getArtifact = async (signal: AbortSignal): Promise<DocumentExportArtifact> => {
    signal.throwIfAborted();
    if (state.status === 'ready') return state.artifact;
    if (state.status !== 'markdown') throw new DocumentExportError('busy');
    // A source-only fallback retries Markdown preparation after cancelled work has settled.
    const rendering = tail.current
      .catch(() => {})
      .then(() => {
        signal.throwIfAborted();
        return session.render(
          { format: 'markdown', watermark: presentation.watermark },
          { signal },
        );
      });
    tail.current = rendering;
    return rendering;
  };
  return { state, getArtifact, retry: () => setAttempt((value) => value + 1) };
}
