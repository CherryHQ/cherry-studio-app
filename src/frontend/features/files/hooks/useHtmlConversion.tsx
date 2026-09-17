import { useToast } from '@cherrystudio/ui/components';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  FileSharingError,
  prepareImageExport,
  shareFile,
  useExportWatermark,
} from '@/frontend/appShell/fileExport';
import { useHtmlCapture } from '@/frontend/components/HtmlCapture';
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

import { htmlConversionCaptureSource } from '../utils/htmlConversionCaptureSource';

const logger = loggerService.withContext('HtmlConversion');
type Progress = Parameters<NonNullable<HtmlConversionContext['onProgress']>>[0];

export function useHtmlConversion(options: FileExportOptions = {}) {
  const module = useBackendModule('documentExport');
  const { t } = useTranslation();
  const { toast } = useToast();
  const createWatermark = useExportWatermark(options.watermark);
  const { capture: captureHtml, surface } = useHtmlCapture();
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
        captureHtml({
          source: ({ id, density }) => htmlConversionCaptureSource(html, input.format, id, density),
          signal: input.signal,
          onPage: async (page, index, total, signal) => {
            if (watermark.kind === 'none' || (input.format === 'pptx' && index !== total - 1))
              return input.onPage(page, index, total);
            const signed = await prepareImageExport(page, watermark);
            try {
              signal.throwIfAborted();
              await input.onPage({ ...signed, ...readPngDimensions(signed.uri) }, index, total);
            } finally {
              signed.release();
            }
          },
        }),
    [captureHtml],
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
    surface,
  };
}
