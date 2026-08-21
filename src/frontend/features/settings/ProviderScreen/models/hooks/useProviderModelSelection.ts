import { useCallback, useState } from 'react';

import type { UniqueModelId } from '@/shared/data/types/model';

const noneSelected: ReadonlySet<UniqueModelId> = new Set();

/**
 * Which models the list has selected, and whether it is selecting at all.
 *
 * Held by the screen rather than the list: the actions that drive it — edit,
 * select all, delete — live in the header and the bottom toolbar, which are
 * siblings of the list, not children of it.
 */
export function useProviderModelSelection() {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<UniqueModelId>>(noneSelected);

  return {
    // Leaving a selection behind would be invisible until the next edit, so
    // ending the session ends the selection with it.
    exitEditing: useCallback(() => {
      setIsEditing(false);
      setSelectedIds(noneSelected);
    }, []),
    enterEditing: useCallback(() => setIsEditing(true), []),
    isEditing,
    selectedIds,
    toggleAll: useCallback((ids: readonly UniqueModelId[]) => {
      setSelectedIds((current) =>
        ids.length > 0 && ids.every((id) => current.has(id)) ? noneSelected : new Set(ids),
      );
    }, []),
    toggleModel: useCallback((id: UniqueModelId) => {
      setSelectedIds((current) => {
        const next = new Set(current);

        if (!next.delete(id)) {
          next.add(id);
        }

        return next;
      });
    }, []),
  };
}
