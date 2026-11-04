import { useEffect, useRef } from 'react';

import type { ChatComposerHandoff } from '@/frontend/appShell/navigation/chat';
import { useComposerActions, useComposerState } from '@/frontend/components/Composer';

import { mergeComposerHandoff } from './mergeComposerHandoff';

/** Applies route handoffs inside the mounted provider, preserving its live draft. */
export function useComposerHandoffAppend(
  token: string | undefined,
  handoff: ChatComposerHandoff | undefined,
  onApplied: (token: string) => void,
) {
  const { draft, attachments } = useComposerState();
  const { editDraft, addAttachments } = useComposerActions();
  const appliedToken = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!token || appliedToken.current === token) return;
    // Guard before dispatching: effects may replay before the parent's acknowledgement commits.
    appliedToken.current = token;
    if (handoff) {
      const merged = mergeComposerHandoff({ draft, attachments }, handoff);
      editDraft(merged.draft);
      addAttachments(merged.attachments.slice(attachments.length));
    }
    onApplied(token);
  }, [addAttachments, attachments, draft, editDraft, handoff, onApplied, token]);
}
