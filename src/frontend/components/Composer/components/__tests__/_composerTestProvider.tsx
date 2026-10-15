import { type PropsWithChildren, useMemo, useRef, useState } from 'react';

import type { FileEntryId } from '@/shared/data/types/file';

import { ComposerProvider, type ComposerAttachmentStore } from '../../context/ComposerProvider';
import {
  appendComposerAttachments,
  type ComposerAttachmentDraft,
  type ComposerAttachmentReady,
  removeComposerAttachment,
  replaceComposerAttachment,
} from '../../utils/composerAttachments';

const noAttachments: readonly ComposerAttachmentDraft[] = [];

type ComposerTestProviderProps = PropsWithChildren<{
  initialAttachments?: readonly ComposerAttachmentDraft[];
  initialDraft?: string;
}>;

/**
 * A composer session over an in-memory attachment store: the managed store's
 * draft-list semantics without its My Files imports, so a source draft stays
 * exactly as added and an importing one can be seeded directly.
 */
export function ComposerTestProvider({
  children,
  initialAttachments = noAttachments,
  initialDraft,
}: ComposerTestProviderProps) {
  const attachmentStore = useInMemoryAttachmentStore(initialAttachments);

  return (
    <ComposerProvider attachmentStore={attachmentStore} initialDraft={initialDraft}>
      {children}
    </ComposerProvider>
  );
}

function useInMemoryAttachmentStore(
  initialAttachments: readonly ComposerAttachmentDraft[],
): ComposerAttachmentStore {
  const [attachments, setAttachmentState] = useState(() => [...initialAttachments]);
  const attachmentsRef = useRef(attachments);
  const actions = useMemo(() => {
    const commit = (next: ComposerAttachmentDraft[]) => {
      attachmentsRef.current = next;
      setAttachmentState(next);
    };

    return {
      addAttachments: (next: ComposerAttachmentDraft[]) =>
        commit(appendComposerAttachments(attachmentsRef.current, next)),
      clearAttachments: () => commit([]),
      removeAttachment: (attachmentId: string) =>
        commit(removeComposerAttachment(attachmentsRef.current, attachmentId)),
      replaceAttachment: (
        attachmentId: string,
        sourceId: FileEntryId,
        replacement: ComposerAttachmentReady,
      ) => {
        const next = replaceComposerAttachment(
          attachmentsRef.current,
          attachmentId,
          sourceId,
          replacement,
        );
        if (!next) return false;
        commit(next);
        return true;
      },
      setAttachments: (next: ComposerAttachmentDraft[]) => commit([...next]),
    };
  }, []);

  return useMemo(() => ({ ...actions, attachments }), [actions, attachments]);
}
