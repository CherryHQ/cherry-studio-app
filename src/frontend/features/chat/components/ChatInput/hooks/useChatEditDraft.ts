import { useCallback, useLayoutEffect, useRef } from 'react';

import {
  useComposerActions,
  useComposerState,
  useComposerMeta,
} from '@/frontend/components/Composer/context/ComposerProvider';
import type { ComposerAttachmentDraft } from '@/frontend/components/Composer/utils/composerAttachments';

import { useChatEditing } from '../../../context/ChatEditingProvider';

/**
 * Owns the composer's edit-session draft: beginning an edit stashes the
 * interrupted draft and its attachments and loads the original question;
 * cancelling or accepting an edit restores both exactly once. A failed
 * submission keeps the edit and its stash intact.
 */
export function useChatEditDraft() {
  const { attachments, draft } = useComposerState();
  const { addAttachments, clearAttachments, setAttachments, setDraft } = useComposerActions();
  const { inputRef } = useComposerMeta();
  const { editing, endEdit } = useChatEditing();
  const stash = useRef<
    { draft: string; attachments: readonly ComposerAttachmentDraft[] } | undefined
  >(undefined);
  const draftRef = useRef(draft);
  const attachmentsRef = useRef(attachments);
  useLayoutEffect(() => {
    draftRef.current = draft;
    attachmentsRef.current = attachments;
  }, [attachments, draft]);

  const loadedMessageId = useRef<string | undefined>(undefined);
  const editingMessageId = editing?.messageId;
  useLayoutEffect(() => {
    if (!editingMessageId) {
      loadedMessageId.current = undefined;
      return;
    }
    if (loadedMessageId.current === editingMessageId) return;
    // Switching questions replaces only the edit buffer, never the interrupted draft.
    stash.current ??= { draft: draftRef.current, attachments: attachmentsRef.current };
    loadedMessageId.current = editingMessageId;
    clearAttachments();
    setDraft(editing?.initialText ?? '');
    inputRef.current?.focus();
  }, [clearAttachments, editing, editingMessageId, inputRef, setDraft]);

  const cancelEdit = useCallback(() => {
    if (stash.current !== undefined) {
      setDraft(stash.current.draft);
      setAttachments([...stash.current.attachments]);
      stash.current = undefined;
    }
    endEdit();
  }, [endEdit, setAttachments, setDraft]);

  // ComposerSurface clears the submitted edit before awaiting its admission.
  // Restoring here is safe only after that admission has succeeded.
  const commitEdit = useCallback(() => {
    if (stash.current !== undefined) {
      const saved = stash.current;
      setDraft((current) => [saved.draft, current].filter(Boolean).join('\n'));
      addAttachments([...saved.attachments]);
      stash.current = undefined;
    }
    endEdit();
  }, [addAttachments, endEdit, setDraft]);

  return { cancelEdit, commitEdit, editing };
}
