import { type PropsWithChildren } from 'react';

import { ComposerProvider } from '../context/ComposerProvider';
import { useManagedComposerAttachments } from '../hooks/useManagedComposerAttachments';
import type { ComposerInitialAttachment } from '../utils/composerAttachments';

type ComposerSessionProviderProps = PropsWithChildren<{
  initialAttachments?: readonly ComposerInitialAttachment[];
  /** Read once when the session mounts; pass a function to defer reading a stored draft. */
  initialDraft?: string | (() => string);
}>;

/** Owns one draft and imports its transient attachments into managed storage. */
export function ComposerSessionProvider({
  children,
  initialAttachments,
  initialDraft,
}: ComposerSessionProviderProps) {
  const attachmentStore = useManagedComposerAttachments(initialAttachments);

  return (
    <ComposerProvider attachmentStore={attachmentStore} initialDraft={initialDraft}>
      {children}
    </ComposerProvider>
  );
}
