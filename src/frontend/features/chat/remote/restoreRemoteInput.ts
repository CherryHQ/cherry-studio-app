import type { ConversationInput } from '@/frontend/appShell/conversation/remote';
import type { ComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';
import { FileEntryIdSchema, type FileEntryId } from '@/shared/data/types/file';

export async function restoreRemoteInput(
  input: ConversationInput,
  getUri: (id: FileEntryId) => Promise<string | undefined>,
) {
  const files = input.parts.flatMap((part) => (part.type === 'file' ? [part] : []));
  const resolved = await Promise.allSettled(
    files.map(async (part): Promise<ComposerAttachmentReady> => {
      const fileEntryId = FileEntryIdSchema.parse(part.fileEntryId);
      const uri = await getUri(fileEntryId);
      if (!uri) throw new Error('RESOURCE_UNAVAILABLE');
      return {
        id: fileEntryId,
        fileEntryId,
        uri,
        name: part.name ?? fileEntryId,
        mediaType: part.mediaType,
        kind: part.mediaType.startsWith('image/') ? 'image' : 'file',
        status: 'ready',
      };
    }),
  );
  return {
    text: input.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n'),
    attachments: resolved.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    ),
    missing: resolved.flatMap((result, index) =>
      result.status === 'rejected' ? [files[index].name ?? files[index].fileEntryId] : [],
    ),
  };
}
