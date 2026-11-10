import { useCallback, useEffect, useRef } from 'react';

import { prepareImageExport } from '@/frontend/appShell/fileExport';
import { registerShareCleanup, retainShareOperation } from '@/frontend/appShell/sharing';
import { useHtmlCapture } from '@/frontend/components/HtmlCapture';
import { useBackendModule } from '@/frontend/data';
import { readPngDimensions } from '@/frontend/utils/capturePng';
import { readFileText } from '@/frontend/utils/readFileText';
import {
  DocumentExportError,
  type HtmlConversionArtifact,
  type HtmlConversionFormat,
} from '@/shared/contracts/documentExport';
import type { ResolvedFile } from '@/shared/contracts/file';
import type { ExportWatermark } from '@/shared/contracts/fileExport';
import { inheritAiContent } from '@/shared/data/types/aiContent';
import { readAiContentText } from '@/shared/utils/aiContentText';

import { htmlConversionCaptureSource } from '../utils/htmlConversionCaptureSource';

export function useHtmlConversion(requestId: string) {
  const module = useBackendModule('documentExport');
  const { capture, surface } = useHtmlCapture();
  const prepared = useRef(new Map<string, HtmlConversionArtifact>());
  const tail = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(new Set<AbortController>());
  const cleanup = useCallback(async () => {
    await tail.current.catch(() => {});
    await Promise.allSettled([...prepared.current.values()].map((artifact) => artifact.dispose()));
    prepared.current.clear();
  }, []);
  useEffect(() => {
    registerShareCleanup(requestId, cleanup);
    const controllers = pending.current;
    return () => {
      for (const controller of controllers) controller.abort();
    };
  }, [cleanup, requestId]);
  const convert = useCallback(
    (
      file: ResolvedFile,
      format: HtmlConversionFormat,
      watermark: ExportWatermark,
      signal: AbortSignal,
    ) => {
      const key = JSON.stringify([file.entry.id, file.entry.updatedAt, format, watermark]);
      const operation = tail.current
        .catch(() => {})
        .then(async () => {
          signal.throwIfAborted();
          const cached = prepared.current.get(key);
          if (cached) return cached;
          const content = readFileText(file.uri);
          if (content.isTruncated) throw new DocumentExportError('size-limit');
          let aiContent = file.entry.aiContent;
          if (!aiContent) {
            try {
              const label = readAiContentText(content.text, 'text/html');
              if (label) aiContent = inheritAiContent(label);
            } catch {
              /* An unknown historical declaration does not change ordinary conversion. */
            }
          }
          const controller = new AbortController();
          const abort = () => controller.abort();
          signal.addEventListener('abort', abort, { once: true });
          pending.current.add(controller);
          try {
            const artifact = await module.convertHtml(
              {
                title: file.entry.filename,
                aiContent,
                format,
                capture: (input) =>
                  capture({
                    source: ({ id, density }) =>
                      htmlConversionCaptureSource(content.text, format, id, density),
                    signal: input.signal,
                    onPage: async (page, index, total, captureSignal) => {
                      if (watermark.kind === 'none' || (format === 'pptx' && index !== total - 1))
                        return input.onPage(page, index, total);
                      const signed = await prepareImageExport(page, watermark);
                      try {
                        captureSignal.throwIfAborted();
                        await input.onPage(
                          { ...signed, ...readPngDimensions(signed.uri) },
                          index,
                          total,
                        );
                      } finally {
                        signed.release();
                      }
                    },
                  }),
              },
              { signal: controller.signal },
            );
            prepared.current.set(key, artifact);
            signal.throwIfAborted();
            return artifact;
          } finally {
            pending.current.delete(controller);
            signal.removeEventListener('abort', abort);
          }
        });
      tail.current = operation;
      return retainShareOperation(requestId, operation);
    },
    [capture, module, requestId],
  );
  return { convert, surface };
}
