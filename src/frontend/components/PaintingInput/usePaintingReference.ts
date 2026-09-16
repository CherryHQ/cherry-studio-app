import { useState } from 'react';

import type { FileEntryId } from '@/shared/data/types/file';

export type PaintingReferenceImage = {
  fileEntryId: FileEntryId;
  mediaType: string;
  name: string;
};

export type PaintingReference = ReturnType<typeof usePaintingReference>;

/** Keep the editing target outside the draft cleared by ComposerSurface on send. */
export function usePaintingReference(images: readonly PaintingReferenceImage[]) {
  const sourceKey = JSON.stringify(images.map((image) => image.fileEntryId));
  const [choice, setChoice] = useState<{ sourceKey: string; fileEntryId: FileEntryId | null }>();
  const selectedId =
    choice?.sourceKey === sourceKey
      ? choice.fileEntryId
      : images.length === 1
        ? images[0].fileEntryId
        : null;
  const selected = images.find((image) => image.fileEntryId === selectedId);
  const needsSelection = images.length > 1 && choice?.sourceKey !== sourceKey;

  return {
    choose: () => setChoice(undefined),
    clear: () => setChoice({ sourceKey, fileEntryId: null }),
    images,
    needsSelection,
    select: (fileEntryId: FileEntryId) => setChoice({ sourceKey, fileEntryId }),
    selected,
  };
}
