import { useComposerExpansion } from '@cherrystudio/ui/components';
import { type PropsWithChildren, useEffect, useState } from 'react';

import { ComposerDraft } from '../ComposerDraft';
import { ComposerProvider } from '../context/ComposerProvider';
import { useManagedComposerAttachments } from '../hooks/useManagedComposerAttachments';
import type { ComposerInitialAttachment } from '../utils/composerAttachments';

type ComposerSessionProviderProps = PropsWithChildren<{
  draftStore?: ComposerDraft;
  /** Keep the painting workspace active until an explicit dismissal. */
  retainEditing?: boolean;
  isFocused?: boolean;
  workspaceSessionId?: string;
  workspaceFolderId?: string | null;
  initialAttachments?: readonly ComposerInitialAttachment[];
  /** Read once when the session mounts; pass a function to defer reading a stored draft. */
  initialDraft?: string | (() => string);
}>;

/** Owns one draft and imports its transient attachments into managed storage. */
export function ComposerSessionProvider({
  children,
  draftStore,
  retainEditing,
  isFocused = true,
  initialAttachments,
  initialDraft,
  workspaceSessionId,
  workspaceFolderId,
}: ComposerSessionProviderProps) {
  const [buffer] = useState(
    () =>
      draftStore ??
      new ComposerDraft(
        typeof initialDraft === 'function' ? initialDraft() : initialDraft,
        initialAttachments,
      ),
  );
  const attachmentStore = useManagedComposerAttachments(
    buffer,
    workspaceSessionId,
    workspaceFolderId,
  );
  const collapseEditor = useComposerExpansion()?.actions.collapse;

  useEffect(() => collapseEditor?.(), [collapseEditor]);

  return (
    <ComposerProvider
      attachmentStore={attachmentStore}
      draftStore={buffer}
      retainEditing={retainEditing}
      isFocused={isFocused}
      failedSend={workspaceSessionId ? draftStore?.failedSend : undefined}
    >
      {children}
    </ComposerProvider>
  );
}
