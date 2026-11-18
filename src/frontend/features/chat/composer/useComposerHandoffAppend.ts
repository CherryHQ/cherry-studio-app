import { useEffect, useRef } from 'react';

import type { ChatComposerHandoff } from '@/frontend/appShell/navigation/chat';
import { useComposerActions, useComposerState } from '@/frontend/components/Composer';

/** Applies route handoffs inside the mounted provider, preserving its live draft. */
export function useComposerHandoffAppend(
  token: string,
  handoff: ChatComposerHandoff | undefined,
  onApplied: (token: string) => void,
) {
  const { draft } = useComposerState();
  const { editDraft, addAttachments } = useComposerActions();
  const appliedToken = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (appliedToken.current === token) return;
    // Guard before dispatching: effects may replay before the parent's acknowledgement commits.
    appliedToken.current = token;
    if (handoff) {
      editDraft([draft, handoff.draft].filter(Boolean).join('\n'));
      addAttachments([...handoff.attachments]);
    }
    onApplied(token);
  }, [addAttachments, draft, editDraft, handoff, onApplied, token]);
}
