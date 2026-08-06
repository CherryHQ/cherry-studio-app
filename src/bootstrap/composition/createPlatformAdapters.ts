import type { FileEntryId } from '@cherrystudio/universal/data/types/file';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import { resolveFileEntry, resolveRenderableFileUri } from '@/backend/services/file/fileStorage';
import { DevicePermissions } from '@/backend/services/permissions';

export type PlatformAdapters = ReturnType<typeof createPlatformAdapters>;

export function createPlatformAdapters({ fileEntry }: { fileEntry: FileEntryService }) {
  return {
    devicePermissions: new DevicePermissions(),
    fileContent: {
      resolve: (id: FileEntryId) => resolveFileEntry(fileEntry, id),
      resolveRenderableUri: (id: FileEntryId) => resolveRenderableFileUri(fileEntry, id),
    },
  };
}
