import { type PropsWithChildren } from 'react';

import { ComposerProvider } from '../context/ComposerProvider';
import { useManagedComposerAttachments } from '../hooks/useManagedComposerAttachments';
import type { ComposerInitialAttachment } from '../utils/composerAttachments';

type ManagedComposerProviderProps = PropsWithChildren<{
  initialAttachments?: readonly ComposerInitialAttachment[];
  initialDraft?: string;
}>;

export function ManagedComposerProvider({
  children,
  initialAttachments,
  initialDraft,
}: ManagedComposerProviderProps) {
  const attachmentStore = useManagedComposerAttachments(initialAttachments);

  return (
    <ComposerProvider attachmentStore={attachmentStore} initialDraft={initialDraft}>
      {children}
    </ComposerProvider>
  );
}
