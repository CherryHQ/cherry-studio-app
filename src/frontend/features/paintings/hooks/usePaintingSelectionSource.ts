import { useMemo } from 'react';

import { type SelectionSource, usePendingDeletionIds } from '@/frontend/components/selection';

import { useDeletePaintings, usePaintingIds } from './usePaintings';

// Selection behavior the shared toolbar uses for the painting history list.
// `enabled` gates the (potentially large) all-ids query to edit mode.
export function usePaintingSelectionSource(enabled: boolean): SelectionSource {
  const paintingIds = usePaintingIds({ enabled });
  const deletePaintings = useDeletePaintings();
  const pendingDeletionIds = usePendingDeletionIds('drawings');

  return useMemo(
    () => ({
      copy: {
        deleteFailed: 'painting.selection.deleteFailed',
        deleteMessage: 'painting.selection.deleteMessage',
        deleteTitle: 'painting.selection.deleteTitle',
      },
      deleteSelected: deletePaintings,
      getAllIds: () => (paintingIds.data ?? []).filter((id) => !pendingDeletionIds.has(id)),
    }),
    [deletePaintings, paintingIds.data, pendingDeletionIds],
  );
}
