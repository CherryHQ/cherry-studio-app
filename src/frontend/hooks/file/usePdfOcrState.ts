import { useEffect, useState } from 'react';

import { useBackendModule } from '@/frontend/data/BackendProvider';
import type { PdfOcrState } from '@/shared/contracts/file';

/** One file's extraction queue or recognition progress. Undefined when neither is active. */
export function usePdfOcrState(fileEntryId: string | undefined): PdfOcrState | undefined {
  const file = useBackendModule('file');
  const [state, setState] = useState<PdfOcrState>();
  useEffect(() => {
    if (!fileEntryId) return;
    const stop = file.observePdfOcr(fileEntryId, setState);
    return () => {
      stop();
      setState(undefined);
    };
  }, [file, fileEntryId]);
  return state;
}

/** Whether any of these files is actively recognizing scanned text. Queued files may be text PDFs. */
export function usePdfOcrActive(fileEntryIds: readonly string[]): boolean {
  const file = useBackendModule('file');
  const [active, setActive] = useState(false);
  const key = fileEntryIds.join(',');
  useEffect(() => {
    if (!key) return;
    const busy = new Set<string>();
    const stops = key.split(',').map((id) =>
      file.observePdfOcr(id, (state) => {
        if (state?.status === 'recognizing') busy.add(id);
        else busy.delete(id);
        setActive(busy.size > 0);
      }),
    );
    return () => {
      for (const stop of stops) stop();
      setActive(false);
    };
  }, [file, key]);
  return active;
}
