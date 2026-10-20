import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { takeChatSelectionHandoff } from '@/frontend/appShell/navigation/chat';
import { useComposerActions, useComposerMeta } from '@/frontend/components/Composer';

import { createMentionLabel } from '../utils/mentionLabels';
import { createSelectionMentionUrl } from '../utils/selectionMentions';

/** Insert at the retained caret when the preview returns; the existing draft stays mounted. */
export function useChatSelectionHandoff(token: string | undefined) {
  const { inputRef } = useComposerMeta();
  const { addAttachments } = useComposerActions();
  useFocusEffect(
    useCallback(() => {
      const input = inputRef.current;
      if (!input) return;
      const handoff = takeChatSelectionHandoff(token);
      if (!handoff) return;
      addAttachments([handoff.attachment]);
      input.insertLink(
        createMentionLabel(handoff.selection.label),
        createSelectionMentionUrl(handoff.selection.selection),
      );
      input.insertText(' ');
    }, [addAttachments, inputRef, token]),
  );
}
