import { useCallback, useLayoutEffect, useRef } from 'react';

import {
  useComposerActions,
  useComposerState,
} from '@/frontend/components/Composer/context/ComposerProvider';
import type { ComposerAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';

import { useChatEditing } from '../../../context/ChatEditingProvider';

/**
 * Owns the composer's edit-session draft: beginning an edit stashes the
 * interrupted draft and its attachments and loads the original question;
 * cancelling restores both exactly once, and a submitted edit clears the
 * stash so a later edit starts from the live composer state.
 */
export function useChatEditDraft() {
  const { attachments, draft } = useComposerState();
  const { addAttachments, clearAttachments, setDraft } = useComposerActions();
  const { editing, endEdit } = useChatEditing();
  const stash = useRef<{ draft: string; attachments: readonly ComposerAttachmentDraft[] }>();
  const draftRef = useRef(draft);
  const attachmentsRef = useRef(attachments);
  useLayoutEffect(() => {
    draftRef.current = draft;
    attachmentsRef.current = attachments;
  }, [attachments, draft]);

  const editingMessageId = editing?.messageId;
  useLayoutEffect(() => {
    if (!editingMessageId || stash.current !== undefined) return;
    stash.current = { draft: draftRef.current, attachments: attachmentsRef.current };
    clearAttachments();
    setDraft(editing?.initialText ?? '');
  }, [clearAttachments, editing, editingMessageId, setDraft]);

  const cancelEdit = useCallback(() => {
    if (stash.current !== undefined) {
      setDraft(stash.current.draft);
      if (stash.current.attachments.length > 0) addAttachments([...stash.current.attachments]);
      stash.current = undefined;
    }
    endEdit();
  }, [addAttachments, endEdit, setDraft]);

  const commitEdit = useCallback(() => {
    stash.current = undefined;
    endEdit();
  }, [endEdit]);

  return { cancelEdit, commitEdit, editing };
}
