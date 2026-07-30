import { useMemo } from 'react';

import type { SelectionSource } from '@/components/messageTabs';
import { useDeletePaintings, usePaintingIds } from '@/hooks/paintings';

// Selection behavior the shared toolbar uses for the drawings tab. `enabled`
// gates the (potentially large) all-ids query to edit mode on the active tab.
export function usePaintingSelectionSource(enabled: boolean): SelectionSource {
  const paintingIds = usePaintingIds({ enabled });
  const deletePaintings = useDeletePaintings();

  return useMemo(
    () => ({
      copy: {
        deleteFailed: 'painting.selection.deleteFailed',
        deleteMessage: 'painting.selection.deleteMessage',
        deleteTitle: 'painting.selection.deleteTitle',
      },
      deleteSelected: deletePaintings,
      getAllIds: () => paintingIds.data ?? [],
    }),
    [deletePaintings, paintingIds.data],
  );
}
