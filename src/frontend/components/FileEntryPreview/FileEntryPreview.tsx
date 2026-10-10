import {
  FileAttachmentPreview,
  FilePreview,
  type FilePreviewOperation,
  type FilePreviewVariant,
  type FilePreviewTransfer,
} from '@cherrystudio/ui/components';
import { type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { ReplacePreviewImage } from '@/frontend/appShell/imagePreview';
import type { ResolvedFile } from '@/shared/contracts/file';
import { loggerService } from '@/shared/core/logger/LoggerService';
import type { FileEntry, FileEntryId } from '@/shared/data/types/file';

import { FileEntryImage } from './FileEntryImage';
import { FileEntryAttachmentSkeleton, FileEntrySkeleton } from './FileEntrySkeleton';
import { useOpenFileEntry } from './hooks/useOpenFileEntry';
import { useResolvedFile } from './hooks/useResolvedFile';
import { fileEntryPreviewKind, toFilePreviewFile } from './utils/fileEntryPresentation';

const logger = loggerService.withContext('FileEntryPreview');

/** Reads the entry by id, then its URI. */
export function FileEntryPreview({
  entryId,
  size,
  variant,
  transfer,
  onImageReplace,
}: {
  entryId: FileEntryId;
  size?: number;
  variant?: FilePreviewVariant;
  transfer?: FilePreviewTransfer;
  /** Explicitly enables editing for this caller; ordinary file previews stay read-only. */
  onImageReplace?: ReplacePreviewImage;
}) {
  const { data, isLoading } = useResolvedFile(entryId);
  const { openFileEntry } = useOpenFileEntry();

  if (isLoading) {
    return <FileEntrySkeleton size={size} variant={variant} />;
  }

  return (
    <EntryPreview
      entry={data?.entry}
      entryId={entryId}
      size={size}
      uri={data?.uri}
      variant={variant}
      transfer={transfer}
      onOpen={(file) => openFileEntry(file, onImageReplace)}
    />
  );
}

/** Assistant artifacts render images directly; other files retain their result row. */
export function FileEntryAttachment({
  initialAspectRatio,
  entryId,
}: {
  initialAspectRatio?: number;
  entryId: FileEntryId;
}) {
  const { data, isLoading } = useResolvedFile(entryId);

  if (isLoading) {
    return <FileEntryAttachmentSkeleton aspectRatio={initialAspectRatio} />;
  }

  if (data && fileEntryPreviewKind(data.entry) === 'image') {
    return (
      <FileEntryImage
        entry={data.entry}
        initialAspectRatio={initialAspectRatio}
        key={data.entry.id}
        uri={data.uri}
      />
    );
  }

  return <EntryAttachment entry={data?.entry} entryId={entryId} uri={data?.uri} />;
}

/**
 * Same preview for a caller that already holds the entry and its resolved URI.
 */
export function LoadedFileEntryPreview({
  badge,
  entry,
  previewUri,
  size,
  uri,
  variant,
}: {
  badge?: ReactNode;
  entry: FileEntry;
  previewUri: string | undefined;
  size?: number;
  uri: string | undefined;
  variant?: FilePreviewVariant;
}) {
  const { openFileEntry } = useOpenFileEntry();
  return (
    <EntryPreview
      badge={badge}
      entry={entry}
      entryId={entry.id}
      previewUri={previewUri}
      size={size}
      uri={uri}
      variant={variant}
      onOpen={openFileEntry}
    />
  );
}

function EntryPreview({
  badge,
  entry,
  entryId,
  previewUri,
  size,
  uri,
  variant,
  transfer,
  onOpen,
}: {
  badge?: ReactNode;
  entry: FileEntry | undefined;
  entryId: FileEntryId;
  previewUri?: string;
  size?: number;
  uri: string | undefined;
  variant?: FilePreviewVariant;
  transfer?: FilePreviewTransfer;
  onOpen: (file: ResolvedFile) => void;
}) {
  const { handleError, t } = useFileEntryPreviewError(entryId);
  const file = entry && uri ? toFilePreviewFile(entry, uri, previewUri) : null;

  return (
    <FilePreview
      badge={badge}
      file={file}
      labels={{
        openWith: t('filePreview.openWith'),
        unavailable: t('filePreview.unavailable'),
      }}
      onError={handleError}
      onPress={() => {
        if (entry && uri) onOpen({ entry, uri });
      }}
      size={size}
      variant={variant}
      transfer={transfer}
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
