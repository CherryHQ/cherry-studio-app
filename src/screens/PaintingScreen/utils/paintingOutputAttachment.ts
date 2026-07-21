import { imageMediaTypeFromExtension } from '@/data/services/fileStorage';
import type { ChatInputAttachmentDraft } from '@/screens/ChatScreen/input/utils/chatInputAttachments';

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
