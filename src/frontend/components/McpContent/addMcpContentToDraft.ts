import { randomUUID } from 'expo-crypto';
import { File, Paths } from 'expo-file-system';

import {
  type ComposerAttachmentReady,
  createReadyAttachmentDraft,
} from '@/frontend/components/Composer/utils/composerAttachments';
import type { FileModule } from '@/shared/contracts/file';
import type { McpContentPreview } from '@/shared/contracts/mcp';

/** Import binary content before touching the draft, with rollback on cancellation or failure. */
export async function addMcpContentToDraft(
  preview: McpContentPreview,
  files: FileModule,
  conversation: {
    message(text: string): void;
    addAttachments(attachments: ComposerAttachmentReady[]): void;
  },
  signal: AbortSignal,
): Promise<void> {
  const attachments: ComposerAttachmentReady[] = [];
  try {
    for (const content of preview.files) {
      signal.throwIfAborted();
      const temporary = new File(Paths.cache, `mcp-${randomUUID()}`);
      try {
        temporary.writeSync(content.data, { encoding: 'base64' });
        const resolved = await files.createInternalEntry({
          uri: temporary.uri,
          mediaType: content.mimeType,
          name: content.name,
        });
        attachments.push(createReadyAttachmentDraft(resolved, resolved.entry.id));
      } finally {
        if (temporary.exists) temporary.delete();
      }
    }
    signal.throwIfAborted();
    conversation.message(`[${preview.serverName} / ${preview.title}]\n${preview.text}`);
    conversation.addAttachments(attachments);
  } catch (error) {
    await Promise.allSettled(attachments.map((attachment) => files.delete(attachment.fileEntryId)));
    throw error;
  }
}
