import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { fileContent } from '@/backend/services/file/fileContent';
import { hashLocalFile } from '@/backend/services/file/fileHash';
import { getInternalFileUri } from '@/backend/services/file/fileStorage';
import { prepareEmbeddedImage } from '@/backend/services/file/importedImageNormalization';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { managedFileResolver } from '../resources/managedFileResolver';
import type { OfficeFiles } from './officeToolResources';

const logger = loggerService.withContext('officeFiles');

const localUri: OfficeFiles['localUri'] = (file) =>
  getInternalFileUri({ filename: file.name, id: file.fileEntryId });

/** The device side of the Office tools: managed files, image copies and temporary outputs. */
export const officeFiles: OfficeFiles = {
  resolveAvailable: managedFileResolver.resolveAvailable,
  localUri,
  async prepareImage(file) {
    const uri = localUri(file);
    return uri
      ? prepareEmbeddedImage({ uri, mediaType: file.mediaType, name: file.name })
      : undefined;
  },
  size(uri) {
    const file = new File(uri);
    return file.exists ? file.size : undefined;
  },
  hash: hashLocalFile,
  temporaryUri(extension) {
    const directory = new Directory(Paths.cache, 'OfficeJobs');
    directory.create({ idempotent: true, intermediates: true });
    return new File(directory, `${randomUUID()}.${extension}`).uri;
  },
  discard(uri) {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch (error) {
      logger.warn('Failed to discard a temporary Office file', error as Error);
    }
  },
  createFileEntry: (input, signal) => fileContent.createFileEntry(input, signal),
};
