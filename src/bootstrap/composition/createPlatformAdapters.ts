import {
  type FileEntryId,
  FileEntryIdSchema,
  SafeNameSchema,
} from '@cherrystudio/universal/data/types/file';
import * as z from 'zod';

import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import type { FileRefService } from '@/backend/data/services/FileRefService';
import {
  createInternalEntry as createStoredInternalEntry,
  deleteInternalEntryIfUnreferenced,
  discardInternalEntries,
  getFileUri,
  resolveFileEntry,
} from '@/backend/services/file/fileStorage';
import { DevicePermissions } from '@/backend/services/permissions';

export type PlatformAdapters = ReturnType<typeof createPlatformAdapters>;

const createInternalEntryInputSchema = z.strictObject({
  name: SafeNameSchema.optional(),
  uri: z.string().min(1),
});

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
      createInternalEntry: async (input: { name?: string; uri: string }) => {
        const validated = createInternalEntryInputSchema.parse(input);
        const entry = await createStoredInternalEntry(fileEntry, {
          cleanupPolicy: 'delete_when_unreferenced',
          name: validated.name,
          source: 'uri',
          uri: validated.uri,
        });
        const resolved = await resolveFileEntry(fileEntry, entry.id);
        if (!resolved) {
          await discardInternalEntries(fileEntry, [entry]);
          throw new Error(`Created internal file cannot be resolved: ${entry.id}`);
        }
        return resolved;
      },
      deleteIfUnreferenced: (id: FileEntryId) =>
        deleteInternalEntryIfUnreferenced(fileEntry, fileRef, FileEntryIdSchema.parse(id)),
      getUri: (id: FileEntryId) => getFileUri(fileEntry, FileEntryIdSchema.parse(id)),
      resolve: (id: FileEntryId) => resolveFileEntry(fileEntry, FileEntryIdSchema.parse(id)),
    },
  };
}
