import { FilePreview, type FilePreviewOperation, useAlert } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { loggerService } from '@/shared/core/logger/LoggerService';
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

import { FileEntrySkeleton } from './FileEntrySkeleton';
import { useResolvedFile } from './hooks/useResolvedFile';
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
 * Same preview for a caller that already holds the entry and its resolved URI.
 */
export function LoadedFileEntryPreview({
  entry,
  previewUri,
  size,
  uri,
}: {
  entry: FileEntry;
  previewUri: string | undefined;
  size?: number;
  uri: string | undefined;
}) {
  return (
    <EntryPreview entry={entry} entryId={entry.id} previewUri={previewUri} size={size} uri={uri} />
  );
}

function EntryPreview({
  entry,
  entryId,
  previewUri,
  size,
  uri,
}: {
  entry: FileEntry | undefined;
  entryId: FileEntryId;
  previewUri?: string;
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
      file={entry && uri ? toFilePreviewFile(entry, uri, previewUri) : null}
      labels={{
        openWith: t('filePreview.openWith'),
        unavailable: t('filePreview.unavailable'),
      }}
      onError={handleError}
      size={size}
    />
  );
}
