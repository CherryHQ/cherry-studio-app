import {
  FilePreview,
  type FilePreviewFile,
  type FilePreviewOperation,
  useAlert,
} from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { loggerService } from '@/shared/core/logger/LoggerService';
import type { FileEntryId } from '@/shared/data/types/file';

import { useResolvedFile } from './hooks/useResolvedFile';
import { fileEntryDisplayName, fileEntryExtensionLabel } from './utils/fileEntryPresentation';

const logger = loggerService.withContext('FileEntryPreview');

export function FileEntryPreview({ entryId, size }: { entryId: FileEntryId; size?: number }) {
  const { t } = useTranslation();
  const { alert } = useAlert();
  const { data, isLoading } = useResolvedFile(entryId);
  const file: FilePreviewFile | null = data
    ? {
        displayName: fileEntryDisplayName(data.entry),
        extensionLabel: fileEntryExtensionLabel(data.entry),
        id: data.entry.id,
        kind: data.entry.mediaType.startsWith('image/') ? 'image' : 'document',
        revision: data.entry.updatedAt,
        uri: data.uri,
      }
    : null;
  const handleError = useCallback(
    (error: Error, operation: FilePreviewOperation) => {
      logger.warn('File preview operation failed', error, { entryId, operation });
      if (operation === 'open') {
        alert.show({ title: t('filePreview.openFailed') });
      }
    },
    [alert, entryId, t],
  );

  return (
    <FilePreview
      file={file}
      isLoading={isLoading}
      labels={{
        loading: t('filePreview.loading'),
        openWith: t('filePreview.openWith'),
        unavailable: t('filePreview.unavailable'),
      }}
      onError={handleError}
      size={size}
    />
  );
}
