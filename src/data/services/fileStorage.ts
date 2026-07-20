import { Directory, File, Paths } from 'expo-file-system';

import { loggerService } from '@/core/logger/LoggerService';
import { createOrderedUuid } from '@/data/db/schemas/_columnHelpers';
import {
  type FileEntryId,
  type InternalFileEntry,
  type PreparedInternalFile,
  SafeFileExtensionSchema,
  SafeFileNameSchema,
} from '@/data/types/file';
import type { CherryMessagePart } from '@/data/types/message';
import { readCherryMeta, withCherryMeta } from '@/data/types/uiParts';

const FILE_DIRECTORY_NAME = 'files';
const logger = loggerService.withContext('fileStorage');

function fileDirectory(): Directory {
  return new Directory(Paths.document, FILE_DIRECTORY_NAME);
}

function ensureFileDirectory(): Directory {
  const directory = fileDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  return directory;
}

function managedFile(id: FileEntryId, ext: string | null): File {
  return new File(fileDirectory(), `${id}${ext ? `.${ext}` : ''}`);
}

function projectFileName(displayFilename: string, sourceFilename: string) {
  const displayBase =
    basenameForProjection(displayFilename) || basenameForProjection(sourceFilename);
  const displayDot = displayBase.lastIndexOf('.');
  const sourceBase = basenameForProjection(sourceFilename);
  const sourceDot = sourceBase.lastIndexOf('.');
  const name = displayDot > 0 ? displayBase.slice(0, displayDot) : displayBase;
  const ext =
    displayDot > 0
      ? displayBase.slice(displayDot + 1).toLowerCase()
      : sourceDot > 0
        ? sourceBase.slice(sourceDot + 1).toLowerCase()
        : null;

  return {
    ext: ext ? SafeFileExtensionSchema.parse(ext) : null,
    name: SafeFileNameSchema.parse(name),
  };
}

function basenameForProjection(value: string): string {
  return (value.split(/[\\/]/).pop() ?? value).replace(/[\s.]+$/, '');
}

async function prepareFilePart(
  part: Extract<CherryMessagePart, { type: 'file' }>,
): Promise<{ file: PreparedInternalFile; part: CherryMessagePart }> {
  const source = new File(part.url);
  const { ext, name } = projectFileName(part.filename ?? source.name, source.name);
  const id = createOrderedUuid();
  const destination = new File(ensureFileDirectory(), `${id}${ext ? `.${ext}` : ''}`);

  try {
    await source.copy(destination);

    if (!destination.exists) {
      throw new Error(`Prepared file does not exist after copy: ${destination.uri}`);
    }

    const size = destination.size;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Prepared file has an invalid size: ${destination.uri}`);
    }

    return {
      file: { ext, id, name, size, uri: destination.uri },
      part: withCherryMeta({ ...part, url: destination.uri }, { fileEntryId: id }),
    };
  } catch (error) {
    try {
      if (destination.exists) {
        destination.delete();
      }
    } catch (cleanupError) {
      logger.warn('Failed to discard partially prepared file', cleanupError as Error, { id });
    }
    throw error;
  }
}

export async function prepareMessageParts(
  parts: readonly CherryMessagePart[],
): Promise<{ files: PreparedInternalFile[]; parts: CherryMessagePart[] }> {
  const files: PreparedInternalFile[] = [];
  const preparedParts: CherryMessagePart[] = [];

  try {
    for (const part of parts) {
      if (part.type !== 'file' || readCherryMeta(part)?.fileEntryId) {
        preparedParts.push(part);
        continue;
      }

      const prepared = await prepareFilePart(part);
      files.push(prepared.file);
      preparedParts.push(prepared.part);
    }
  } catch (error) {
    discardPreparedFiles(files);
    throw error;
  }

  return { files, parts: preparedParts };
}

export function discardPreparedFiles(files: readonly PreparedInternalFile[]): void {
  for (const prepared of files) {
    try {
      const file = new File(prepared.uri);
      if (file.exists) {
        file.delete();
      }
    } catch (error) {
      logger.warn('Failed to discard prepared file', error as Error, { id: prepared.id });
    }
  }
}

export function resolveInternalFileUri(
  entry: Pick<InternalFileEntry, 'ext' | 'id'>,
): string | undefined {
  const file = managedFile(entry.id, entry.ext);
  return file.exists ? file.uri : undefined;
}
