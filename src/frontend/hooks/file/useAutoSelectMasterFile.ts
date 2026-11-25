import { useEffect } from 'react';

import { useLibraryMasterDetail } from '@/frontend/appShell/pane/state';

/**
 * Keeps the right detail preview populated in wide Master-Detail mode by selecting the first
 * visible library entry whenever nothing is selected or the previous entry is removed.
 */
export function useAutoSelectMasterFile(visibleFileIds: readonly string[], isLoading: boolean) {
  const masterDetail = useLibraryMasterDetail();
  const isMasterDetail = Boolean(masterDetail?.isMasterDetail);
  const selectedFileId = masterDetail?.selectedFileId ?? null;
  const selectFile = masterDetail?.selectFile;

  useEffect(() => {
    if (!isMasterDetail || !selectFile || isLoading) return;
    if (visibleFileIds.length === 0) return;
    if (selectedFileId && visibleFileIds.includes(selectedFileId)) return;
    selectFile(visibleFileIds[0] ?? null);
  }, [isLoading, isMasterDetail, selectFile, selectedFileId, visibleFileIds]);
}
