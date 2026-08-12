import {
  type FileEntryId,
  FileEntryIdSchema,
  SafeNameSchema,
} from '@cherrystudio/universal/data/types/file';
import * as z from 'zod';

import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { fileRefService } from '@/backend/data/services/FileRefService';

import {
  createInternalEntry as createStoredInternalEntry,
  deleteInternalEntryIfUnreferenced,
  discardInternalEntries,
  getFileUri,
  resolveFileEntry,
} from './fileStorage';

const createInternalEntryInputSchema = z.strictObject({
  name: SafeNameSchema.optional(),
  uri: z.string().min(1),
});

/**
 * Managed-file port over `fileStorage`, validated at the boundary.
 *
 * A module singleton rather than a constructed adapter: the entry and reference
 * services it closes over are module singletons themselves, so there is nothing
 * left for a factory to inject.
 */
export const fileContent = {
  createInternalEntry: async (input: { name?: string; uri: string }) => {
    const validated = createInternalEntryInputSchema.parse(input);
    const entry = await createStoredInternalEntry(fileEntryService, {
      cleanupPolicy: 'delete_when_unreferenced',
      name: validated.name,
      source: 'uri',
      uri: validated.uri,
    });
    const resolved = await resolveFileEntry(fileEntryService, entry.id);
    if (!resolved) {
      await discardInternalEntries(fileEntryService, [entry]);
      throw new Error(`Created internal file cannot be resolved: ${entry.id}`);
    }
    return resolved;
  },
  deleteIfUnreferenced: (id: FileEntryId) =>
    deleteInternalEntryIfUnreferenced(
      fileEntryService,
      fileRefService,
      FileEntryIdSchema.parse(id),
    ),
  getUri: (id: FileEntryId) => getFileUri(fileEntryService, FileEntryIdSchema.parse(id)),
  resolve: (id: FileEntryId) => resolveFileEntry(fileEntryService, FileEntryIdSchema.parse(id)),
};
