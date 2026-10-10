import { openFilePreview, useToast } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { prepareFileExport, useExportWatermark } from '@/frontend/appShell/fileExport';
import {
  finishImagePreviewEditRequest,
  useImagePreviewEditRequest,
  type ReplacePreviewImage,
} from '@/frontend/appShell/imagePreview';
import type { ResolvedFile } from '@/shared/contracts/file';
import type { FileExportOptions } from '@/shared/contracts/fileExport';
import { canEditFileImage } from '@/shared/contracts/fileImageEdit';
import { loggerService } from '@/shared/core/logger/LoggerService';

import {
  canPreviewDocument,
  fileEntryPreviewKind,
  toFilePreviewFile,
} from '../utils/fileEntryPresentation';

const logger = loggerService.withContext('FileEntryPreview');

/** Shared by cards and the viewer's explicit system-open escape hatch. */
export function useOpenFileEntry(options: FileExportOptions = {}) {
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const createWatermark = useExportWatermark(options.watermark);
  const requestImageEdit = useImagePreviewEditRequest();

  const openFileEntryWithSystem = async ({ entry, uri }: ResolvedFile) => {
    try {
      const exported = await prepareFileExport({ entry, uri }, createWatermark());
      // The recipient may read after the chooser closes; the OS owns this cache copy's lifetime.
      await openFilePreview({
        file: toFilePreviewFile(
          { ...entry, filename: exported.filename, mediaType: exported.mediaType },
          exported.uri,
        ),
        labels: {
          openWith: t('filePreview.openWith'),
          unavailable: t('filePreview.unavailable'),
        },
      });
    } catch (error) {
      logger.warn('File preview operation failed', error as Error, {
        entryId: entry.id,
        operation: 'open',
      });
      toast.show({ label: t('filePreview.openFailed'), variant: 'danger' });
    }
  };

  const openFileEntry = (file: ResolvedFile, replaceImage?: ReplacePreviewImage) => {
    if (fileEntryPreviewKind(file.entry) === 'document' && !canPreviewDocument(file.entry)) {
      void openFileEntryWithSystem(file);
    } else {
      const imageEditRequestId =
        replaceImage && canEditFileImage(file.entry.mediaType)
          ? requestImageEdit(file.entry.id, replaceImage)
          : undefined;
      try {
        router.push({
          pathname: '/files/[fileEntryId]',
          params: {
            fileEntryId: file.entry.id,
            ...(imageEditRequestId ? { imageEditRequestId } : {}),
          },
        });
      } catch (error) {
        if (imageEditRequestId) finishImagePreviewEditRequest(imageEditRequestId);
        throw error;
      }
    }
  };

  return { openFileEntry, openFileEntryWithSystem };
}
