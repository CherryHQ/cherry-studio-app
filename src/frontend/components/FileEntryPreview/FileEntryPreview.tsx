import { FilePreview, type FilePreviewOperation, useAlert } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { loggerService } from '@/shared/core/logger/LoggerService';
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

import { FileEntrySkeleton } from './FileEntrySkeleton';
import { useFileUri, useResolvedFile } from './hooks/useResolvedFile';
import { toFilePreviewFile } from './utils/fileEntryPresentation';

const logger = loggerService.withContext('FileEntryPreview');

/** Reads the entry by id, then its URI. */
export function FileEntryPreview({ entryId, size }: { entryId: FileEntryId; size?: number }) {
  const { data, isLoading } = useResolvedFile(entryId);

  if (isLoading) {
    return <FileEntrySkeleton size={size} />;
  }

  return <EntryPreview entry={data?.entry} entryId={entryId} size={size} uri={data?.uri} />;
}

/**
 * Same preview for a caller that already holds the entry — a list page, say —
 * so rendering a page of files costs one URI resolution each and no re-read of
 * rows the list just returned.
 */
export function LoadedFileEntryPreview({ entry, size }: { entry: FileEntry; size?: number }) {
  const uriQuery = useFileUri(entry.id);

  if (uriQuery.isLoading) {
    return <FileEntrySkeleton size={size} />;
  }

  return <EntryPreview entry={entry} entryId={entry.id} size={size} uri={uriQuery.data} />;
}

function EntryPreview({
  entry,
  entryId,
  size,
  uri,
}: {
  entry: FileEntry | undefined;
  entryId: FileEntryId;
  size?: number;
  uri: string | undefined;
}) {
  const { t } = useTranslation();
  const { alert } = useAlert();
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
      file={entry && uri ? toFilePreviewFile(entry, uri) : null}
      labels={{
        openWith: t('filePreview.openWith'),
        unavailable: t('filePreview.unavailable'),
      }}
      onError={handleError}
      size={size}
    />
  );
}
