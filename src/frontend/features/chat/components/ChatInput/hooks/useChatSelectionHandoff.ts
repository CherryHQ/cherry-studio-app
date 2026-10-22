import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

import {
  takeChatSelectionHandoff,
  type ChatComposerHandoff,
} from '@/frontend/appShell/navigation/chat';
import { useComposerActions, useComposerState } from '@/frontend/components/Composer';
import { isComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';

import { createSelectionMention } from '../utils/selectionMentions';

/** Append the reference when the preview returns; the existing draft stays mounted. */
export function useChatSelectionHandoff(token: string | undefined) {
  const { attachments } = useComposerState();
  const { addAttachments, setDraft } = useComposerActions();
  const pending = useRef<
    | {
        token: string | undefined;
        attachmentId: string;
        selection: NonNullable<ChatComposerHandoff['selection']>;
        attachmentsBeforeAdd?: typeof attachments;
      }
    | undefined
  >(undefined);

  useFocusEffect(
    useCallback(() => {
      const handoff = takeChatSelectionHandoff(token);
      if (handoff) {
        const existing = attachments.find(
          (attachment) =>
            attachment.id === handoff.attachment.id ||
            (isComposerAttachmentReady(attachment) &&
              attachment.fileEntryId === handoff.attachment.fileEntryId),
        );
        pending.current = {
          token,
          attachmentId: existing?.id ?? handoff.attachment.id,
          selection: handoff.selection,
          attachmentsBeforeAdd: existing ? undefined : attachments,
        };
        if (!existing) {
          addAttachments([handoff.attachment]);
          return;
        }
      }

      const reference = pending.current;
      if (!reference) return;
      // An effect replay may still see the snapshot from before addAttachments committed.
      if (reference.token === token && reference.attachmentsBeforeAdd === attachments) return;
      const attachment = attachments.find((item) => item.id === reference.attachmentId);
      // Failed/removed imports and a departed route must not leave a dangling selection.
      if (reference.token !== token || !attachment) {
        pending.current = undefined;
        return;
      }
      if (!isComposerAttachmentReady(attachment)) return;
      // Workspace preparation can copy the source to a new managed entry.
      pending.current = undefined;
      const mention = createSelectionMention(reference.selection.label, {
        ...reference.selection.selection,
        file_entry_id: attachment.fileEntryId,
      });
      // The caret of a field never focused sits at its start on Android, so append through the
      // draft: the order matches iOS and every chip is rebuilt from Markdown.
      setDraft((draft) => `${draft}${draft && !/\s$/.test(draft) ? ' ' : ''}${mention} `);
    }, [addAttachments, attachments, setDraft, token]),
  );
}
