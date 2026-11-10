import { useToast } from '@cherrystudio/ui/components';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useExportWatermarkStyle } from '@/frontend/appShell/fileExport';
import { useApiClient, useBackendModule } from '@/frontend/data';
import type { ResolvedFile } from '@/shared/contracts/file';
import type { FileExportOptions } from '@/shared/contracts/fileExport';
import type { FileEntryId } from '@/shared/data/types/file';

import { createFileShareRequest, finishShareRequest } from './shareRequest';

type FileShareOptions = FileExportOptions & {
  /** Library shares keep the selected bytes and expose no conversion choices. */
  allowConversion?: boolean;
};

/** Freeze the complete ordered selection before presenting the common share sheet. */
export function useShareFiles(options: FileShareOptions = {}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const api = useApiClient();
  const fileModule = useBackendModule('file');
  const [isSharing, setIsSharing] = useState(false);
  const pending = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.abort();
    };
  }, []);
  const defaultWatermark = useExportWatermarkStyle();
  const watermark = options.watermark ?? defaultWatermark;
  const allowConversion = options.allowConversion ?? true;
  const share = useCallback(
    async (source: readonly (FileEntryId | ResolvedFile)[]) => {
      if (pending.current || !source.length) return;
      const controller = new AbortController();
      pending.current = controller;
      setIsSharing(true);
      try {
        const files: ResolvedFile[] = [];
        const unique = new Set<string>();
        for (let start = 0; start < source.length; start += 8) {
          const resolved = await Promise.all(
            source.slice(start, start + 8).map(async (item) => {
              controller.signal.throwIfAborted();
              if (typeof item !== 'string') return item;
              const entry = await api.get(`/files/entries/${item}`, { signal: controller.signal });
              const uri = await fileModule.getUri(item);
              if (!entry || !uri) throw new Error('Share source is unavailable');
              return { entry, uri };
            }),
          );
          for (const file of resolved)
            if (!unique.has(file.entry.id)) {
              unique.add(file.entry.id);
              files.push(file);
            }
        }
        controller.signal.throwIfAborted();
        const request = createFileShareRequest(files, watermark, allowConversion);
        if (!request) {
          toast.show({ label: t('documentExport.errors.busy'), variant: 'danger' });
          return;
        }
        try {
          router.push({ pathname: '/share', params: { requestId: request.id } });
        } catch (error) {
          await finishShareRequest(request.id);
          throw error;
        }
        await request.outcome;
      } catch {
        if (!controller.signal.aborted && mounted.current)
          toast.show({ label: t('fileViewer.shareFailed'), variant: 'danger' });
      } finally {
        if (pending.current === controller) pending.current = undefined;
        if (mounted.current) setIsSharing(false);
      }
    },
    [allowConversion, api, fileModule, t, toast, watermark],
  );
  return { isSharing, share };
}

export function useShareFile(
  file: ResolvedFile | null | undefined,
  options: FileShareOptions = {},
) {
  const { isSharing, share: shareFiles } = useShareFiles(options);
  const share = useCallback(
    () => (file ? shareFiles([file]) : Promise.resolve()),
    [file, shareFiles],
  );
  return { isSharing, share };
}
