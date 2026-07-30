import type { ChatInputAttachmentDraft } from '@/frontend/features/chat/input/utils/chatInputAttachments';
import { imageMediaTypeFromExtension } from '@/shared/domain/file';

// Mirrors the draft shape produced by useResolvedPaintingFiles for inputs; the
// fileEntryId lets usePaintingGeneration reference the stored file instead of
// copying it into the managed directory again.
export function createPaintingOutputAttachmentDraft(output: {
  fileEntryId: string;
  uri: string;
}): ChatInputAttachmentDraft {
  const fileName = output.uri.split('/').pop() || 'image';
  const dotIndex = fileName.lastIndexOf('.');
  const extension = dotIndex > 0 ? fileName.slice(dotIndex + 1) : null;

  return {
    fileEntryId: output.fileEntryId,
    id: `painting-file:${output.fileEntryId}`,
    kind: 'image',
    mediaType: imageMediaTypeFromExtension(extension),
    name: fileName,
    uri: output.uri,
  };
}
