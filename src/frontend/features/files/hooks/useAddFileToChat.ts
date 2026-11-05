import { createChatSelectionHandoff, type ChatTarget } from '@/frontend/appShell/navigation/chat';
import { createReadyAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';
import type { ResolvedFile } from '@/shared/contracts/file';

import { useReturnToChat } from './useReturnToChat';
import { useSelectionSourceChat } from './useSelectionSourceChat';

/**
 * Adds the previewed document or text file to the chat that opened it, without sending.
 * A chat whose Agent cannot take the file offers no action.
 */
export function useAddFileToChat(file: ResolvedFile, sourceChat: ChatTarget | undefined) {
  const { isResolving, returnsToSourceChat } = useSelectionSourceChat(sourceChat);
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
