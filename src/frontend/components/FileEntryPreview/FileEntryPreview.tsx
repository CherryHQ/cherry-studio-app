import {
  FileAttachmentPreview,
  FilePreview,
  type FilePreviewOperation,
} from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { loggerService } from '@/shared/core/logger/LoggerService';
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

import { FileEntryImage } from './FileEntryImage';
import { FileEntryAttachmentSkeleton, FileEntrySkeleton } from './FileEntrySkeleton';
import { useOpenFileEntry } from './hooks/useOpenFileEntry';
import { useResolvedFile } from './hooks/useResolvedFile';
import { fileEntryPreviewKind, toFilePreviewFile } from './utils/fileEntryPresentation';

const logger = loggerService.withContext('FileEntryPreview');

/** Reads the entry by id, then its URI. */
export function FileEntryPreview({ entryId, size }: { entryId: FileEntryId; size?: number }) {
  const { data, isLoading } = useResolvedFile(entryId);

  if (isLoading) {
    return <FileEntrySkeleton size={size} />;
  }

  return <EntryPreview entry={data?.entry} entryId={entryId} size={size} uri={data?.uri} />;
}

/** Assistant artifacts render images directly; other files retain their result row. */
export function FileEntryAttachment({ entryId }: { entryId: FileEntryId }) {
  const { data, isLoading } = useResolvedFile(entryId);

  if (isLoading) {
    return <FileEntryAttachmentSkeleton />;
  }

  if (data && fileEntryPreviewKind(data.entry) === 'image') {
    return <FileEntryImage entry={data.entry} key={data.entry.id} uri={data.uri} />;
  }

  return <EntryAttachment entry={data?.entry} entryId={entryId} uri={data?.uri} />;
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
  const { handleError, t } = useFileEntryPreviewError(entryId);
  const { openFileEntry } = useOpenFileEntry();
  const file = entry && uri ? toFilePreviewFile(entry, uri, previewUri) : null;

  return (
    <FilePreview
      file={file}
      labels={{
        openWith: t('filePreview.openWith'),
        unavailable: t('filePreview.unavailable'),
      }}
      onError={handleError}
      onPress={() => {
        if (entry && uri) openFileEntry({ entry, uri });
      }}
      size={size}
    />
  );
}

function EntryAttachment({
  entry,
  entryId,
  uri,
}: {
  entry: FileEntry | undefined;
  entryId: FileEntryId;
  uri: string | undefined;
}) {
  const { handleError, t } = useFileEntryPreviewError(entryId);
  const { openFileEntry } = useOpenFileEntry();
  const file = entry && uri ? toFilePreviewFile(entry, uri) : null;

  return (
    <FileAttachmentPreview
      categoryLabel={t('filePreview.document')}
      file={file}
      labels={{
        openWith: t('filePreview.openWith'),
        unavailable: t('filePreview.unavailable'),
      }}
      onError={handleError}
      onPress={() => {
        if (entry && uri) openFileEntry({ entry, uri });
      }}
    />
  );
}

function useFileEntryPreviewError(entryId: FileEntryId) {
  const { t } = useTranslation();
  const handleError = useCallback(
    (error: Error, operation: FilePreviewOperation) => {
      logger.warn('File preview operation failed', error, { entryId, operation });
    },
    [entryId],
  );

  return { handleError, t };
}
