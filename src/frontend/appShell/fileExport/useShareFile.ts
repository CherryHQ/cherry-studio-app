import { useToast } from '@cherrystudio/ui/components';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ResolvedFile } from '@/shared/contracts/file';
import type { FileExportOptions } from '@/shared/contracts/fileExport';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { FileSharingError, shareFile } from './shareFile';
import { useExportWatermark } from './useExportWatermark';

const logger = loggerService.withContext('FileSharing');

export function useShareFile(file: ResolvedFile | null, options: FileExportOptions = {}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const createWatermark = useExportWatermark(options.watermark);
  const sharing = useRef<AbortController | undefined>(undefined);
  const [isSharing, setIsSharing] = useState(false);
  useEffect(() => () => sharing.current?.abort(), []);

  const share = async () => {
    if (sharing.current || !file) return;
    const controller = new AbortController();
    sharing.current = controller;
    setIsSharing(true);
    try {
      await shareFile(file, { watermark: createWatermark(), signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted) return;
      logger.warn('File sharing failed', error as Error, { entryId: file.entry.id });
      toast.show({
        label: t(
          error instanceof FileSharingError
            ? 'fileViewer.shareUnavailable'
            : 'fileViewer.shareFailed',
        ),
        variant: 'danger',
      });
    } finally {
      sharing.current = undefined;
      if (!controller.signal.aborted) setIsSharing(false);
    }
  };

  return { isSharing, share };
}
