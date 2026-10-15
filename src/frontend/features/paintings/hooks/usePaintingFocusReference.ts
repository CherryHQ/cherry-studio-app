import { useEffect, useRef, useState } from 'react';

import { useComposerActions, useComposerState } from '@/frontend/components/Composer';
import type { FileEntryId } from '@/shared/data/types/file';

import { createPaintingOutputAttachmentDraft } from '../utils/paintingOutputAttachment';

const focusReferencePrefix = 'painting-focus:';

/**
 * Keeps the focused image attached to the composer as the next generation's
 * reference. Photos the user adds stay beside it. Removing the reference from
 * the composer means "generate something new", which holds until the focus
 * moves to another image.
 */
export function usePaintingFocusReference(image: { fileEntryId: string; uri: string } | null) {
  const { attachments, isSubmitting } = useComposerState();
  const { addAttachments, setAttachments } = useComposerActions();
  const focusKey = image?.fileEntryId ?? null;
  const [detachedKey, setDetachedKey] = useState<string | null>(null);
  const attachedKey = useRef<string | null>(null);
  const isDetached = detachedKey !== null && detachedKey === focusKey;

  const references = attachments.filter((attachment) =>
    attachment.id.startsWith(focusReferencePrefix),
  );
  const currentId = focusKey ? `${focusReferencePrefix}${focusKey}` : null;
  const hasCurrent = references.some((attachment) => attachment.id === currentId);

  // The composer's attachment store is external to this screen; this effect
  // reconciles it with the focus rather than deriving render state.
  useEffect(() => {
    if (isSubmitting) return;
    if (hasCurrent) {
      attachedKey.current = focusKey;
      if (references.length > 1) {
        setAttachments(
          attachments.filter(
            (attachment) =>
              !attachment.id.startsWith(focusReferencePrefix) || attachment.id === currentId,
          ),
        );
      }
      return;
    }
    // The user removed the reference that was attached for this very focus.
    if (attachedKey.current !== null && attachedKey.current === focusKey) {
      attachedKey.current = null;
      setDetachedKey(focusKey);
      return;
    }
    const stale = references.length > 0;
    if (stale) {
      setAttachments(
        attachments.filter((attachment) => !attachment.id.startsWith(focusReferencePrefix)),
      );
    }
    if (!image || isDetached) {
      attachedKey.current = null;
      return;
    }
    attachedKey.current = focusKey;
    addAttachments([
      {
        ...createPaintingOutputAttachmentDraft({
          fileEntryId: image.fileEntryId as FileEntryId,
          uri: image.uri,
        }),
        id: `${focusReferencePrefix}${image.fileEntryId}`,
      },
    ]);
  }, [
    addAttachments,
    attachments,
    currentId,
    focusKey,
    hasCurrent,
    image,
    isDetached,
    isSubmitting,
    references.length,
    setAttachments,
  ]);

  return {
    isDetached,
    /** Re-attaches the focused image after the user chose to generate something new. */
    reattach: () => setDetachedKey(null),
  };
}
