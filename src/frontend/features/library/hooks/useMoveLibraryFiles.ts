import { useRef, useState } from 'react';

import { useMutation } from '@/frontend/data';
import { toDataApiError } from '@/shared/data/api/errors';
import { MAX_FILE_MOVE_BATCH_SIZE, type FileMoveResult } from '@/shared/data/types/fileLibrary';

/** Bounded batches keep the destination fixed and report progress without flooding mutations. */
export function useMoveLibraryFiles() {
  const { trigger } = useMutation('POST', '/files/library/move');
  const pending = useRef(false);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);

  async function move(fileEntryIds: readonly string[], folderId: string | null) {
    if (pending.current) return;
    const ids = [...new Set(fileEntryIds)];
    if (ids.length === 0) return [];
    pending.current = true;
    setProgress({ completed: 0, total: ids.length });
    const results: FileMoveResult[] = [];
    try {
      for (let offset = 0; offset < ids.length; offset += MAX_FILE_MOVE_BATCH_SIZE) {
        const batch = ids.slice(offset, offset + MAX_FILE_MOVE_BATCH_SIZE);
        try {
          results.push(...(await trigger({ body: { fileEntryIds: batch, folderId } })));
        } catch (error) {
          // A failed request leaves this and the unsent batches available for retry.
          const code = toDataApiError(error).code;
          results.push(
            ...ids.slice(offset).map((fileEntryId) => ({
              fileEntryId,
              status: 'failed' as const,
              code,
            })),
          );
          break;
        }
        setProgress({ completed: offset + batch.length, total: ids.length });
      }
      return results;
    } finally {
      pending.current = false;
      setProgress(null);
    }
  }

  return { move, progress };
}
