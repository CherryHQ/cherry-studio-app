import { useState } from 'react';

import type {
  ComposerAttachmentDraft,
  ComposerAttachmentReady,
} from '@/frontend/components/Composer/utils/composerAttachments';
import type { FileEntryId } from '@/shared/data/types/file';

export type PaintingReferenceImage = {
  fileEntryId: FileEntryId;
  mediaType: string;
  name: string;
  size?: number;
};
export type PaintingInputResult = { id: string; images: readonly PaintingReferenceImage[] };
type Selection = { image: PaintingReferenceImage; origin: 'automatic' | 'explicit' };
export type PaintingReference = ReturnType<typeof usePaintingReference>;

/** Selection intent survives control/model changes; the strategy decides what may be sent. */
export function usePaintingReference(
  result: PaintingInputResult | undefined,
  draft: string,
  attachments: readonly ComposerAttachmentDraft[],
) {
  const attachmentKey = JSON.stringify(attachments.map((item) => [item.id, item.fileEntryId]));
  const [state, setState] = useState(() => ({
    resultId: result?.id,
    selection: attachments.length === 0 ? automaticSelection(result) : undefined,
    attachmentKey,
    isPickerOpen: attachments.length === 0 && (result?.images.length ?? 0) > 1,
    submitted: false,
    editedAfterSubmission: false,
  }));
  let current = state;
  if (
    state.attachmentKey !== attachmentKey ||
    state.resultId !== result?.id ||
    (state.submitted &&
      !state.editedAfterSubmission &&
      (draft.length > 0 || attachments.length > 0))
  ) {
    const hasNewInput = draft.length > 0 || attachments.length > 0;
    const editedAfterSubmission = state.editedAfterSubmission || (state.submitted && hasNewInput);
    const hasNewResult = state.resultId !== result?.id;
    let selection = state.selection;
    if (hasNewResult && !hasNewInput && !editedAfterSubmission)
      selection = automaticSelection(result);
    // Manual input wins, including when the user later removes it. It cannot
    // uncover an old automatic reference that was never explicitly selected.
    if (
      attachments.length > 0 &&
      attachmentKey !== state.attachmentKey &&
      selection?.origin === 'automatic'
    )
      selection = undefined;
    current = {
      ...state,
      attachmentKey,
      resultId: result?.id,
      selection,
      editedAfterSubmission,
      ...(hasNewResult
        ? {
            isPickerOpen:
              !hasNewInput && !editedAfterSubmission && (result?.images.length ?? 0) > 1,
            submitted: false,
          }
        : {}),
    };
    setState(current);
  }
  const changeSelection = (selection: Selection | undefined) =>
    setState((value) => ({
      ...value,
      selection,
      isPickerOpen: false,
      editedAfterSubmission: value.editedAfterSubmission || value.submitted,
    }));
  return {
    images: result?.images ?? [],
    selection: current.selection,
    isPickerOpen: current.isPickerOpen,
    choose: () => setState((value) => ({ ...value, isPickerOpen: !value.isPickerOpen })),
    clear: () => changeSelection(undefined),
    select: (image: PaintingReferenceImage) => changeSelection({ image, origin: 'explicit' }),
    beginSubmission: (images: readonly ComposerAttachmentReady[]) =>
      setState((value) => ({
        ...value,
        attachmentKey: '[]',
        submitted: true,
        editedAfterSubmission: false,
        isPickerOpen: false,
        selection:
          value.selection ??
          (images.length === 1 && images[0].kind === 'image'
            ? { image: images[0], origin: 'explicit' }
            : undefined),
      })),
    rejectSubmission: () => setState((value) => ({ ...value, submitted: false })),
  };
}

function automaticSelection(result: PaintingInputResult | undefined): Selection | undefined {
  return result?.images.length === 1 ? { image: result.images[0], origin: 'automatic' } : undefined;
}
