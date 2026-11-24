import { useCallback } from 'react';

import { LibraryMasterDetailHost } from '@/frontend/appShell/pane';
import { FileViewerPane } from '@/frontend/features/files';
import { FileLibraryScreen } from '@/frontend/features/library';
import type { FileEntryId } from '@/shared/data/types/file';

export default function LibraryIndexScreen() {
  const renderPreview = useCallback(
    (fileEntryId: string) => <FileViewerPane entryId={fileEntryId as FileEntryId} />,
    [],
  );

  return <LibraryMasterDetailHost library={<FileLibraryScreen />} renderPreview={renderPreview} />;
}
