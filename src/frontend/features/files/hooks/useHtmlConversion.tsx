import { useToast } from '@cherrystudio/ui/components';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  FileSharingError,
  prepareImageExport,
  shareFile,
  useExportWatermark,
} from '@/frontend/appShell/fileExport';
import { useBackendModule } from '@/frontend/data';
import { readPngDimensions } from '@/frontend/utils/capturePng';
import {
  DocumentExportError,
  type CaptureHtmlPages,
  type HtmlConversionContext,
  type HtmlConversionFormat,
} from '@/shared/contracts/documentExport';
import type { ExportWatermark, FileExportOptions } from '@/shared/contracts/fileExport';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  HtmlConversionSurface,
  type HtmlCaptureRequest,
} from '../components/HtmlConversionSurface';

const logger = loggerService.withContext('HtmlConversion');
type Progress = Parameters<NonNullable<HtmlConversionContext['onProgress']>>[0];

export function useHtmlConversion(options: FileExportOptions = {}) {
  const module = useBackendModule('documentExport');
  const { t } = useTranslation();
  const { toast } = useToast();
  const createWatermark = useExportWatermark(options.watermark);
  const [request, setRequest] = useState<HtmlCaptureRequest>();
  const [progress, setProgress] = useState<Progress>();
  const [isSharing, setIsSharing] = useState(false);
  const current = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current?.abort();
    };
  }, []);

  const capture = useCallback(
    (html: string, watermark: ExportWatermark): CaptureHtmlPages =>
      (input) =>
        new Promise((resolve, reject) => {
          input.signal.throwIfAborted();
          const controller = new AbortController();
          let settled = false;
          let failure: unknown;
          const request: HtmlCaptureRequest = {
            id: randomUUID(),
            html,
            input: {
              ...input,
              signal: controller.signal,
              onPage: async (page, index, total) => {
                if (watermark.kind === 'none' || (input.format === 'pptx' && index !== total - 1))
                  return input.onPage(page, index, total);
                const signed = await prepareImageExport(page, watermark);
                try {
                  controller.signal.throwIfAborted();
                  await input.onPage({ ...signed, ...readPngDimensions(signed.uri) }, index, total);
                } finally {
                  signed.release();
                }
              },
            },
            started: false,
            abort: (error) => {
              if (settled) return;
              failure ??= error;
              controller.abort();
              if (!request.started) request.finish(error);
            },
            finish: (error) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              input.signal.removeEventListener('abort', abort);
              if (mounted.current) setRequest(undefined);
              if (failure || error) reject(failure ?? error);
              else resolve();
            },
          };
          const abort = () => request.abort(new DOMException('Conversion cancelled', 'AbortError'));
          const timer = setTimeout(
            () => request.abort(new DocumentExportError('capture-failed')),
            180_000,
          );
          input.signal.addEventListener('abort', abort, { once: true });
          setRequest(request);
        }),
    [],
  );

  async function share(html: string, title: string, format: HtmlConversionFormat) {
    if (current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setIsSharing(true);
    setProgress({ stage: 'capturing', current: 0, total: 0 });
    let isConverted = false;
    try {
      const watermark = createWatermark();
      await shareFile(
        async () => {
          const file = await module.convertHtml(
            { title, format, capture: capture(html, watermark) },
            {
              signal: controller.signal,
              onProgress: (value) => {
                if (mounted.current) setProgress(value);
              },
            },
          );
          controller.signal.throwIfAborted();
          isConverted = true;
          setProgress(undefined);
          return file;
        },
        { watermark, signal: controller.signal },
      );
    } catch (error) {
      if (mounted.current) {
        const cancelled =
          controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
        const limit =
          error instanceof DocumentExportError &&
          ['size-limit', 'image-size-limit'].includes(error.code);
        if (!cancelled)
          logger.warn(
            isConverted ? 'HTML sharing failed' : 'HTML conversion failed',
            error as Error,
          );
        toast.show({
          label: t(
            cancelled
              ? 'fileViewer.conversion.cancelled'
              : error instanceof FileSharingError
                ? 'fileViewer.shareUnavailable'
                : isConverted
                  ? 'fileViewer.shareFailed'
                  : limit
                    ? 'fileViewer.conversion.sizeLimit'
                    : 'fileViewer.conversion.failed',
          ),
          variant: cancelled ? 'default' : 'danger',
        });
      }
    } finally {
      current.current = undefined;
      if (mounted.current) {
        setIsSharing(false);
        setProgress(undefined);
      }
    }
  }

  return {
    share,
    isSharing,
    cancel: () => current.current?.abort(),
    progress,
    surface: request ? <HtmlConversionSurface key={request.id} request={request} /> : null,
  };
}
