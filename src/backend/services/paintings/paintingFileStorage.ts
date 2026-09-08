import { fileEntryService } from '@/backend/data/services/FileEntryService';
import { createInternalEntryWithPreview } from '@/backend/services/file/filePreviewStorage';
import {
  discardInternalEntries,
  getInternalFileUri,
  imageUriToDataUrl,
} from '@/backend/services/file/fileStorage';

import type { PaintingFileStorage } from './tasks/paintingGenerateJobHandler';

/**
 * The managed-file port painting work writes through: the job handler stores
 * generated images with it. Input references are prepared by `fileContent`
 * before enqueueing. A module singleton rather than a composition-built object
 * because everything it closes over is one too.
 */
export const paintingFileStorage: PaintingFileStorage = {
  createInternalEntry: (input) => createInternalEntryWithPreview(fileEntryService, input),
  discard: (entries) => discardInternalEntries(fileEntryService, entries),
  getUri: getInternalFileUri,
  readDataUrl: imageUriToDataUrl,
};
