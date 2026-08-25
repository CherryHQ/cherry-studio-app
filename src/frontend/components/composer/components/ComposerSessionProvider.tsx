import { type PropsWithChildren } from 'react';

import { ComposerProvider } from '../context/ComposerProvider';
import { useManagedComposerAttachments } from '../hooks/useManagedComposerAttachments';
import type { ComposerInitialAttachment } from '../utils/composerAttachments';

type ComposerSessionProviderProps = PropsWithChildren<{
  initialAttachments?: readonly ComposerInitialAttachment[];
  initialDraft?: string;
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
