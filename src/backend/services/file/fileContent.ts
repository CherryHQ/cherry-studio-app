import * as z from 'zod';

import { fileEntryService } from '@/backend/data/services/FileEntryService';
import {
  type FileEntry,
  type FileEntryId,
  FileEntryIdSchema,
  type FileEntryProvenance,
  FileEntryProvenanceSchema,
  MediaTypeSchema,
  SafeNameSchema,
} from '@/shared/data/types/file';

import {
  createInternalEntryWithPreview,
  generateFilePreviewUri,
  resolveCachedFilePreviewUris,
} from './filePreviewStorage';
import {
  createInternalEntry,
  deleteInternalEntry,
  discardInternalEntries,
  getFileUri,
  resolveFileEntry,
} from './fileStorage';

const createInternalEntryInputSchema = z.strictObject({
  mediaType: MediaTypeSchema.optional(),
  name: SafeNameSchema.optional(),
  uri: z.string().min(1),
});

const createTextEntryInputSchema = z.strictObject({
  data: z.string(),
  mediaType: MediaTypeSchema,
  name: SafeNameSchema,
  provenance: FileEntryProvenanceSchema,
});

/**
 * Managed-file port over `fileStorage`, validated at the boundary.
 *
 * A module singleton rather than a constructed adapter: the entry service it
 * closes over is a module singleton itself, so there is nothing left for a
 * factory to inject.
 */
export const fileContent = {
  /**
   * Copies a transient picker, camera, or share URI into managed storage. This
   * port is import-only by contract, which is why it fixes the provenance
   * instead of taking it: anything that can produce other origins — an agent
   * tool, a peer transfer — uses `fileStorage.createInternalEntry` directly and
   * must state one.
   */
  createInternalEntry: async (input: { mediaType?: string; name?: string; uri: string }) => {
    const validated = createInternalEntryInputSchema.parse(input);
    const entry = await createInternalEntryWithPreview(fileEntryService, {
      mediaType: validated.mediaType,
      name: validated.name,
      provenance: 'imported',
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
  /**
   * Store UTF-8 text as a new managed entry. Unlike an imported attachment it
   * has no preview to derive, so it skips the preview decorator, and the caller
   * keeps the entry rather than a resolved URI (agent tools return ids).
   *
   * Text entries are not inherently generated — a composer that saves pasted
   * text would land here too — so the caller states the origin.
   */
  createTextEntry: async (input: {
    data: string;
    mediaType: string;
    name: string;
    provenance: FileEntryProvenance;
  }) => {
    const validated = createTextEntryInputSchema.parse(input);
    return createInternalEntry(fileEntryService, { ...validated, source: 'text' });
  },
  delete: (id: FileEntryId) => deleteInternalEntry(fileEntryService, FileEntryIdSchema.parse(id)),
  generatePreviewUri: generateFilePreviewUri,
  getUri: (id: FileEntryId) => getFileUri(fileEntryService, FileEntryIdSchema.parse(id)),
  resolveUris: async (entries: readonly FileEntry[]) => entries.map(resolveCachedFilePreviewUris),
  resolve: (id: FileEntryId) => resolveFileEntry(fileEntryService, FileEntryIdSchema.parse(id)),
};
