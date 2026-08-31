import * as z from 'zod';

import { fileEntryService } from '@/backend/data/services/FileEntryService';
import {
  type FileEntry,
  type FileEntryId,
  FileEntryIdSchema,
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
});

/**
 * Managed-file port over `fileStorage`, validated at the boundary.
 *
 * A module singleton rather than a constructed adapter: the entry service it
 * closes over is a module singleton itself, so there is nothing left for a
 * factory to inject.
 */
export const fileContent = {
  createInternalEntry: async (input: { mediaType?: string; name?: string; uri: string }) => {
    const validated = createInternalEntryInputSchema.parse(input);
    const entry = await createInternalEntryWithPreview(fileEntryService, {
      mediaType: validated.mediaType,
      name: validated.name,
      provenance: 'user',
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
   */
  createTextEntry: async (input: { data: string; mediaType: string; name: string }) => {
    const validated = createTextEntryInputSchema.parse(input);
    return createInternalEntry(fileEntryService, {
      ...validated,
      provenance: 'artifact',
      source: 'text',
    });
  },
  delete: (id: FileEntryId) => deleteInternalEntry(fileEntryService, FileEntryIdSchema.parse(id)),
  generatePreviewUri: generateFilePreviewUri,
  getUri: (id: FileEntryId) => getFileUri(fileEntryService, FileEntryIdSchema.parse(id)),
  resolveUris: async (entries: readonly FileEntry[]) => entries.map(resolveCachedFilePreviewUris),
  resolve: (id: FileEntryId) => resolveFileEntry(fileEntryService, FileEntryIdSchema.parse(id)),
};
