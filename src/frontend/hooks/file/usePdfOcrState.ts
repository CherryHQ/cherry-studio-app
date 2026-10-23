import { useEffect, useState } from 'react';

import { useBackendModule } from '@/frontend/data/BackendProvider';
import type { PdfOcrState } from '@/shared/contracts/file';

/**
 * One file's extraction queue or recognition progress, keyed by entry ID or running read_file call
 * ID. Undefined when neither is active.
 */
export function usePdfOcrState(key: string | undefined): PdfOcrState | undefined {
  const file = useBackendModule('file');
  // Tagged with its key so a changed key never shows the previous file's progress.
  const [observed, setObserved] = useState<{ key: string; state: PdfOcrState | undefined }>();
  useEffect(() => {
    if (!key) return;
    return file.observePdfOcr(key, (state) => setObserved({ key, state }));
  }, [file, key]);
  return key && observed?.key === key ? observed.state : undefined;
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
