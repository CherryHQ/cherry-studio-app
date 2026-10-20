import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { isComposerImageMediaType } from '@/frontend/components/Composer/utils/composerAttachments';
import { useOpenFileEntry } from '@/frontend/components/FileEntryPreview';
import { useApiClient } from '@/frontend/data/DataApiProvider';
import type { ResolvedFile } from '@/shared/contracts/file';

/**
 * An image a painting generated opens its painting board, focused on that
 * image, so the versions before and after it come back with it. Every other
 * file — and a generated image no painting owns, such as one an Agent made —
 * opens the file viewer.
 */
export function useOpenLibraryFile() {
  const api = useApiClient();
  const router = useRouter();
  const { openFileEntry } = useOpenFileEntry();

  return useCallback(
    async (file: ResolvedFile) => {
      const { entry } = file;
      if (entry.provenance === 'generated' && isComposerImageMediaType(entry.mediaType)) {
        const painting = await api.get(`/paintings/by-output/${entry.id}`).catch(() => null);
        if (painting) {
          router.push({
            pathname: '/paintings',
            params: { fileEntryId: entry.id, paintingId: painting.id },
          });
          return;
        }
      }
      // Each edit is already a new library entry; accepting it only advances the viewer.
      openFileEntry(file, () => true);
    },
    [api, openFileEntry, router],
  );
}
