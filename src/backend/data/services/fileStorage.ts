import { Directory, File, Paths } from 'expo-file-system';
import { createOrderedUuid } from '@/backend/data/db/schemas/_columnHelpers';
import { loggerService } from '@/shared/core/logger/LoggerService';
import {
  type FileEntryId,
  generatedImageExtension,
  type InternalFileEntry,
  type PreparedInternalFile,
  SafeFileExtensionSchema,
  SafeFileNameSchema,
} from '@cherrystudio/shared/data/types/file';
import type { CherryMessagePart } from '@cherrystudio/shared/data/types/message';
import { readCherryMeta, withCherryMeta } from '@cherrystudio/shared/data/types/uiParts';

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

export async function prepareInternalFileFromUri(
  uri: string,
  displayFilename?: string,
): Promise<PreparedInternalFile> {
  const source = new File(uri);
  const { ext, name } = projectFileName(displayFilename ?? source.name, source.name);
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

    return { ext, id, name, size, uri: destination.uri };
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

async function prepareFilePart(
  part: Extract<CherryMessagePart, { type: 'file' }>,
): Promise<{ file: PreparedInternalFile; part: CherryMessagePart }> {
  const file = await prepareInternalFileFromUri(part.url, part.filename);
  return {
    file,
    part: withCherryMeta({ ...part, url: file.uri }, { fileEntryId: file.id }),
  };
}

export function prepareGeneratedImage(base64: string, mediaType: string): PreparedInternalFile {
  const id = createOrderedUuid();
  const ext = SafeFileExtensionSchema.parse(generatedImageExtension(mediaType));
  const name = SafeFileNameSchema.parse(`painting-${id}`);
  const destination = new File(ensureFileDirectory(), `${id}.${ext}`);
  const payload = base64.includes(',') ? (base64.split(',', 2)[1] ?? '') : base64;

  try {
    destination.write(payload, { encoding: 'base64' });
    if (!destination.exists) {
      throw new Error(`Generated image does not exist after write: ${destination.uri}`);
    }

    const size = destination.size;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Generated image has an invalid size: ${destination.uri}`);
    }

    return { ext, id, name, size, uri: destination.uri };
  } catch (error) {
    try {
      if (destination.exists) {
        destination.delete();
      }
    } catch (cleanupError) {
      logger.warn('Failed to discard partially generated image', cleanupError as Error, { id });
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

export async function imageUriToDataUrl(uri: string, mediaType: string): Promise<string> {
  if (uri.startsWith('data:')) {
    return uri;
  }
  const file = new File(uri);
  const base64 = await file.base64();
  const resolvedMediaType = file.type || mediaType || 'image/*';
  return `data:${resolvedMediaType};base64,${base64}`;
}
