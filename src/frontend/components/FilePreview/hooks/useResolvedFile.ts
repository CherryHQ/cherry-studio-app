import type { FileEntryId } from '@cherrystudio/universal/data/types/file';

import { useQuery } from '@/frontend/data';

export function useResolvedFile(entryId: FileEntryId) {
  return useQuery('/files/:id/resolved', {
    params: { id: entryId },
    retry: false,
  });
}
