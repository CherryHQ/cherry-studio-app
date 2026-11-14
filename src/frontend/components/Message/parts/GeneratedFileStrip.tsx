import { BackgroundPressExclusion, ContextMenuExclusion } from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';

import { FileEntryAttachment, useResolvedFile } from '@/frontend/components/FileEntryPreview';
import type { FileEntryId } from '@/shared/data/types/file';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta } from '@/shared/data/types/uiParts';

import { useMessageFileRenderer } from './MessageFileRendererContext';

type MessageFilePart = Extract<CherryMessagePart, { type: 'file' }>;

/**
 * Assistant deliverables: images themselves, and file rows for other kinds. Each file is its own
 * block in the message column, so an unavailable one leaves no gap behind.
 */
export function GeneratedFileStrip({
  initialImageAspectRatio,
  parts,
  partKeys,
}: {
  initialImageAspectRatio?: number;
  parts: readonly MessageFilePart[];
  partKeys?: readonly string[];
}) {
  const renderFile = useMessageFileRenderer();
  return parts.map((part, index) => {
    if (renderFile) {
      const key = partKeys?.[index] ?? part.url;
      const content = renderFile(key, part);
      return content ? <SourceFile key={key}>{content}</SourceFile> : null;
    }
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

function SourceFile({ children }: PropsWithChildren) {
  return (
    <BackgroundPressExclusion>
      <ContextMenuExclusion className="w-full">{children}</ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}
