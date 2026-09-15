import { useToast } from '@cherrystudio/ui/components';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackendModule } from '@/frontend/data';
import {
  DocumentExportError,
  type CaptureHtmlPages,
  type HtmlConversionContext,
  type HtmlConversionFormat,
} from '@/shared/contracts/documentExport';
import type { ResolvedFile } from '@/shared/contracts/file';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  HtmlConversionSurface,
  type HtmlCaptureRequest,
} from '../components/HtmlConversionSurface';

const logger = loggerService.withContext('HtmlConversion');
type Progress = Parameters<NonNullable<HtmlConversionContext['onProgress']>>[0];

export function useHtmlConversion() {
  const module = useBackendModule('documentExport');
  const { t } = useTranslation();
  const { toast } = useToast();
  const [request, setRequest] = useState<HtmlCaptureRequest>();
  const [progress, setProgress] = useState<Progress>();
  const [result, setResult] = useState<ResolvedFile>();
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
    (html: string): CaptureHtmlPages =>
      (input) =>
        new Promise((resolve, reject) => {
          input.signal.throwIfAborted();
          const controller = new AbortController();
          let settled = false;
          let failure: unknown;
          const request: HtmlCaptureRequest = {
            id: randomUUID(),
            html,
            input: { ...input, signal: controller.signal },
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

  async function convert(html: string, title: string, format: HtmlConversionFormat) {
    if (current.current) return;
    const controller = new AbortController();
    current.current = controller;
    setProgress({ stage: 'capturing', current: 0, total: 0 });
    try {
      const file = await module.convertHtml(
        { title, format, capture: capture(html) },
        {
          signal: controller.signal,
          onProgress: (value) => {
            if (mounted.current) setProgress(value);
          },
        },
      );
      if (mounted.current) {
        setResult(file);
        toast.show({ label: t('fileViewer.conversion.saved'), variant: 'success' });
      }
    } catch (error) {
      if (mounted.current) {
        const cancelled =
          controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
        const limit =
          error instanceof DocumentExportError &&
          ['size-limit', 'image-size-limit'].includes(error.code);
        if (!cancelled) logger.warn('HTML conversion failed', error as Error);
        toast.show({
          label: t(
            cancelled
              ? 'fileViewer.conversion.cancelled'
              : limit
                ? 'fileViewer.conversion.sizeLimit'
                : 'fileViewer.conversion.failed',
          ),
          variant: cancelled ? 'default' : 'danger',
        });
      }
    } finally {
      current.current = undefined;
      if (mounted.current) setProgress(undefined);
    }
  }

  return {
    convert,
    cancel: () => current.current?.abort(),
    progress,
    result,
    surface: request ? <HtmlConversionSurface key={request.id} request={request} /> : null,
  };
}
