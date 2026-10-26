import { createChatSelectionHandoff, type ChatTarget } from '@/frontend/appShell/navigation/chat';
import { createReadyAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';
import { fileEntryPreviewKind } from '@/frontend/components/FileEntryPreview';
import type { ResolvedFile } from '@/shared/contracts/file';

import { useReturnToChat } from './useReturnToChat';
import { acceptsSelection, useSelectionSourceChat } from './useSelectionSourceChat';

const acceptsAnyAgent = () => true;

/**
 * Adds the previewed file to the chat that opened it, without sending. Every Agent takes images;
 * other files need a standard Agent, and a chat that cannot take the file offers no action.
 */
export function useAddFileToChat(file: ResolvedFile, sourceChat: ChatTarget | undefined) {
  const { isResolving, returnsToSourceChat } = useSelectionSourceChat(
    sourceChat,
    fileEntryPreviewKind(file.entry) === 'image' ? acceptsAnyAgent : acceptsSelection,
  );
  const returnToChat = useReturnToChat();

  return {
    isResolving,
    returnsToSourceChat,
    add: () => {
      if (!sourceChat) return;
      const attachment = createReadyAttachmentDraft(file, `file-entry:${file.entry.id}`);
      returnToChat({ ...sourceChat, selectionHandoff: createChatSelectionHandoff({ attachment }) });
    },
  };
}
