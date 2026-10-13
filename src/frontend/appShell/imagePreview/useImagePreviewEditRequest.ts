import { useEffect, useRef } from 'react';

import type { FileEntryId } from '@/shared/data/types/file';

import {
  createImagePreviewEditRequest,
  finishImagePreviewEditRequest,
  getImagePreviewEditRequest,
  type ReplacePreviewImage,
} from './imagePreviewEditRequest';

/** The source tile owns the callback lifetime, including navigation away from its composer. */
export function useImagePreviewEditRequest() {
  const owned = useRef<{ id: string; sourceId: FileEntryId } | undefined>(undefined);
  useEffect(
    () => () => {
      if (owned.current) finishImagePreviewEditRequest(owned.current.id);
    },
    [],
  );

  return (sourceId: FileEntryId, replace: ReplacePreviewImage) => {
    const current = owned.current;
    if (
      current &&
      current.sourceId === sourceId &&
      getImagePreviewEditRequest(current.id, sourceId)
    ) {
      return current.id;
    }
    if (current) finishImagePreviewEditRequest(current.id);
    const id = createImagePreviewEditRequest(sourceId, replace);
    owned.current = { id, sourceId };
    return id;
  };
}
