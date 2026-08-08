import {
  type FileEntryId,
  FileEntryIdSchema,
  SafeNameSchema,
} from '@cherrystudio/universal/data/types/file';
import * as z from 'zod';

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

const importFileInputSchema = z.strictObject({
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
      discardUnreferenced: (id: FileEntryId) =>
        discardUnreferencedInternalEntry(fileEntry, fileRef, FileEntryIdSchema.parse(id)),
      import: async (input: { name?: string; uri: string }) => {
        const validated = importFileInputSchema.parse(input);
        const entry = await createInternalEntry(fileEntry, {
          cleanupPolicy: 'delete_when_unreferenced',
          name: validated.name,
          source: 'uri',
          uri: validated.uri,
        });
        const resolved = await resolveFileEntry(fileEntry, entry.id);
        if (!resolved) {
          await discardInternalEntries(fileEntry, [entry]);
          throw new Error(`Imported file cannot be resolved: ${entry.id}`);
        }
        return resolved;
      },
      resolve: (id: FileEntryId) => resolveFileEntry(fileEntry, FileEntryIdSchema.parse(id)),
      resolveRenderableUri: (id: FileEntryId) =>
        resolveRenderableFileUri(fileEntry, FileEntryIdSchema.parse(id)),
    },
  };
}
