import {
  prepareFileAttachments,
  type PrepareFileAttachmentsInput,
} from '@/backend/services/file/prepareFileAttachments';
import { fileAttachmentMode } from '@/shared/utils/fileAttachmentPolicy';

import type { RuntimeTextAttachmentPart } from '../runtime';

/** Agent-only projection: generic file preparation never constructs trusted runtime envelopes. */
export async function resolveManagedTextAttachments(
  input: Omit<PrepareFileAttachmentsInput, 'target'>,
): Promise<ReadonlyMap<string, RuntimeTextAttachmentPart>> {
  const isText = (id: string) => {
    const file = input.availableFiles.get(id);
    const mode = file && fileAttachmentMode(file);
    return mode === 'text' || mode === 'document-text';
  };
  const prepared = await prepareFileAttachments({
    ...input,
    currentFileEntryIds: input.currentFileEntryIds.filter(isText),
    historicalFileEntryIds: input.historicalFileEntryIds?.filter(isText),
    target: { purpose: 'chat', acceptsImages: true },
  });
  return new Map(
    [...prepared].flatMap(([id, attachment]) =>
      attachment.text === undefined
        ? []
        : [
            [
              id,
              {
                fileEntryId: id,
                type: 'text-attachment' as const,
                mediaType: attachment.file.mediaType,
                name: attachment.file.name,
                text: attachment.text,
                truncated: attachment.report.sourceTruncated || attachment.report.requestTruncated,
                trust: 'untrusted-user-content' as const,
                attachmentReport: attachment.report,
              },
            ],
          ],
    ),
  );
}
