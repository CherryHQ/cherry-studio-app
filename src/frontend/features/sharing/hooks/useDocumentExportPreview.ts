import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  DocumentExportError,
  type CaptureExportHtml,
  type DocumentExportArtifact,
  type DocumentExportProgress,
  type DocumentExportSession,
  type ExportFormat,
  type ExportPresentation,
} from '@/shared/contracts/documentExport';
import type { ExportWatermark } from '@/shared/contracts/fileExport';
import { renderMarkdownSignature } from '@/shared/utils/documentExportMarkdown';

import { IMAGE_PAGE_HEIGHT, type ImagePageSlice } from '../utils/imagePagePlan';

const FIRST_PAGE: readonly ImagePageSlice[] = [{ top: 0, height: IMAGE_PAGE_HEIGHT }];

/** Preparing a readable preview never captures PNGs. Delivery selects its own watermark treatment. */
export function useDocumentExportPreview(
  session: DocumentExportSession,
  format: ExportFormat,
  presentation: ExportPresentation,
  capture: CaptureExportHtml,
) {
  const [attempt, setAttempt] = useState(0);
  // Revisiting the same format/HTML is a new load, including after retry.
  const request = useMemo(
    () => ({ session, format, presentation, attempt }),
    [attempt, format, presentation, session],
  );
  const activeRequest = useRef<typeof request | undefined>(undefined);
  useLayoutEffect(() => {
    activeRequest.current = request;
    return () => {
      activeRequest.current = undefined;
    };
  }, [request]);
  const [result, setResult] = useState<{
    request: typeof request;
    html?: string;
    artifact?: DocumentExportArtifact;
    error?: unknown;
  }>();
  const [pageResult, setPageResult] = useState<{
    request: typeof request;
    pages?: readonly ImagePageSlice[];
    error?: unknown;
  }>();
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const text = session.markdown + renderMarkdownSignature(presentation.watermark);
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
              request,
              artifact,
              html: artifact.format === 'html' ? artifact.html : undefined,
            });
        } catch (error) {
          if (!controller.signal.aborted) setResult({ request, error });
        }
      });
    return () => controller.abort();
  }, [format, presentation, request, session]);
  const current = result?.request === request ? result : undefined;
  const currentPage = pageResult?.request === request ? pageResult : undefined;
  const error = current?.error ?? currentPage?.error;
  const onPages = useCallback(
    (pages: readonly ImagePageSlice[]) => {
      if (activeRequest.current === request)
        setPageResult((current) =>
          // A failed load stays failed until retry or a new preview request.
          current?.request === request && current.error !== undefined
            ? current
            : { request, pages },
        );
    },
    [request],
  );
  const onPreviewError = useCallback(
    (error?: unknown) => {
      if (activeRequest.current === request)
        setPageResult({ request, error: error ?? new DocumentExportError('capture-failed') });
    },
    [request],
  );
  const getArtifact = useCallback(
    async (
      signal: AbortSignal,
      options?: {
        watermark?: ExportWatermark;
        onProgress?: (progress: DocumentExportProgress) => void;
      },
    ) => {
      signal.throwIfAborted();
      await tail.current.catch(() => {});
      signal.throwIfAborted();
      const outputPresentation = options?.watermark
        ? { ...presentation, watermark: options.watermark }
        : presentation;
      return session.render(
        format === 'image'
          ? {
              format,
              presentation: outputPresentation,
              capture,
              layout: outputPresentation.imageFrame?.layout ?? 'pages',
            }
          : format === 'html'
            ? { format, presentation: outputPresentation }
            : { format, watermark: outputPresentation.watermark },
        { signal, onProgress: options?.onProgress },
      );
    },
    [capture, format, presentation, session],
  );
  return {
    text: current?.artifact?.format === 'markdown' ? current.artifact.text : text,
    filename:
      current?.artifact && current.artifact.format !== 'image'
        ? current.artifact.file.filename
        : undefined,
    html: current?.html ?? '',
    isPreparing: !current,
    error,
    pages: format === 'image' ? (currentPage?.pages ?? FIRST_PAGE) : FIRST_PAGE,
    onPages,
    onPreviewError,
    issues: current?.artifact?.issues ?? [],
    getArtifact,
    retry: () => setAttempt((value) => value + 1),
    isPaused: error instanceof DocumentExportError && ['inactive', 'busy'].includes(error.code),
  };
}
