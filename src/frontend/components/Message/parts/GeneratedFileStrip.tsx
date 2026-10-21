import { BackgroundPressExclusion, ContextMenuExclusion } from '@cherrystudio/ui/components';

import { FileEntryAttachment, useResolvedFile } from '@/frontend/components/FileEntryPreview';
import type { FileEntryId } from '@/shared/data/types/file';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

type MessageFilePart = Extract<CherryMessagePart, { type: 'file' }>;

/**
 * Assistant deliverables: images themselves, and file rows for other kinds. Each file is its own
 * block in the message column, so an unavailable one leaves no gap behind.
 */
export function GeneratedFileStrip({
  initialImageAspectRatio,
  parts,
}: {
  initialImageAspectRatio?: number;
  parts: readonly MessageFilePart[];
}) {
  return parts.map((part) => {
    const entryId = readCherryMeta(part)?.fileEntryId as FileEntryId | undefined;
    return entryId ? (
      <GeneratedFile
        entryId={entryId}
        initialAspectRatio={initialImageAspectRatio}
        key={part.url}
      />
    ) : null;
  });
}

function GeneratedFile({
  entryId,
  initialAspectRatio,
}: {
  entryId: FileEntryId;
  initialAspectRatio?: number;
}) {
  // Shares the attachment's queries; the wrapper must disappear with the hidden file.
  const { data, isLoading } = useResolvedFile(entryId);
  if (!isLoading && !data) return null;

  return (
    <BackgroundPressExclusion>
      <ContextMenuExclusion className="w-full">
        <FileEntryAttachment entryId={entryId} initialAspectRatio={initialAspectRatio} />
      </ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}
