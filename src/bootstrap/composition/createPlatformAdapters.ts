import type { FileEntryId } from '@cherrystudio/universal/data/types/file';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import type { FileRefService } from '@/backend/data/services/FileRefService';
import {
  createInternalEntry,
  discardInternalEntries,
  discardUnreferencedInternalEntry,
  resolveFileEntry,
  resolveRenderableFileUri,
} from '@/backend/services/file/fileStorage';
import { DevicePermissions } from '@/backend/services/permissions';

export type PlatformAdapters = ReturnType<typeof createPlatformAdapters>;

export function createPlatformAdapters({
  fileEntry,
  fileRef,
}: {
  fileEntry: FileEntryService;
  fileRef: FileRefService;
}) {
  return {
    devicePermissions: new DevicePermissions(),
    fileContent: {
      discardUnreferenced: (id: FileEntryId) =>
        discardUnreferencedInternalEntry(fileEntry, fileRef, id),
      import: async (input: { name?: string; uri: string }) => {
        const entry = await createInternalEntry(fileEntry, {
          cleanupPolicy: 'delete_when_unreferenced',
          name: input.name,
          source: 'uri',
          uri: input.uri,
        });
        const resolved = await resolveFileEntry(fileEntry, entry.id);
        if (!resolved) {
          await discardInternalEntries(fileEntry, [entry]);
          throw new Error(`Imported file cannot be resolved: ${entry.id}`);
        }
        return resolved;
      },
      resolve: (id: FileEntryId) => resolveFileEntry(fileEntry, id),
      resolveRenderableUri: (id: FileEntryId) => resolveRenderableFileUri(fileEntry, id),
    },
  };
}
