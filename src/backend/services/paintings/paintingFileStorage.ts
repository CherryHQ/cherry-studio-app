import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { createInternalEntryWithPreview } from '@/backend/services/file/filePreviewStorage';
import {
  discardInternalEntries,
  getInternalFileUri,
  imageUriToDataUrl,
  resolveFileEntry,
} from '@/backend/services/file/fileStorage';

import type { PaintingFileStorage } from './tasks/paintingGenerateJobHandler';

/**
 * The managed-file port painting work writes through: the job handler stores
 * generated images with it and resolves live input availability at dispatch.
 * A module singleton rather than a composition-built object
 * because everything it closes over is one too.
 */
export const paintingFileStorage: PaintingFileStorage = {
  createInternalEntry: (input) => createInternalEntryWithPreview(fileEntryService, input),
  discard: (entries) => discardInternalEntries(fileEntryService, entries),
  getUri: getInternalFileUri,
  resolve: (id) => resolveFileEntry(fileEntryService, id),
  readDataUrl: imageUriToDataUrl,
};
