import { Directory, File, Paths } from 'expo-file-system';

import { createOrderedUuid } from '@/backend/data/db/schemas/_columnHelpers';
import type { FileEntryService } from '@/backend/data/services/FileEntryService';
import type { ResolvedFile } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';
import {
  FALLBACK_MEDIA_TYPE,
  type FileEntry,
  type FileEntryId,
  type FileEntryProvenance,
  FileEntryIdSchema,
  fileEntryUrl,
  filenameExtension,
  MediaTypeSchema,
  SafeExtSchema,
  SafeNameSchema,
} from '@/shared/data/types/file';
import type { CherryMessagePart } from '@/shared/data/types/message';
import { readCherryMeta, withCherryMeta } from '@/shared/data/types/uiParts';
import { generatedImageExtension } from '@/shared/utils/imageFileTypes';

const DATA_DIRECTORY_NAME = 'Data';
const FILE_DIRECTORY_NAME = 'Files';
const logger = loggerService.withContext('fileStorage');

export type CreateInternalEntryInput = { provenance: FileEntryProvenance } & (
  | {
      /** Authoritative media type from the picker; extension inference is the fallback. */
      mediaType?: string;
      name?: string;
      /** Transient import source; its bytes are copied to Data/Files and the URI is not persisted. */
      source: 'uri';
      uri: string;
    }
  | {
      data: string;
      mediaType: string;
      name?: string;
      source: 'base64';
    }
  | {
      /** UTF-8 text written verbatim. */
      data: string;
      mediaType: string;
      /** Display name; the caller owns extension inference, so it is required. */
      name: string;
      source: 'text';
    }
);

type WrittenInternalFile = {
  filename: string;
  id: FileEntryId;
  mediaType: string;
  provenance: FileEntryProvenance;
  size: number;
};

function fileDirectory(): Directory {
  return new Directory(Paths.document, DATA_DIRECTORY_NAME, FILE_DIRECTORY_NAME);
}

function ensureFileDirectory(): Directory {
  const directory = fileDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true });
  }
  return directory;
}

function managedFile(id: FileEntryId, ext: string | null): File {
  const safeId = FileEntryIdSchema.parse(id);
  const safeExt = ext === null ? null : SafeExtSchema.parse(ext);
  return new File(fileDirectory(), `${safeId}${safeExt ? `.${safeExt}` : ''}`);
}

function managedFileForEntry(entry: Pick<FileEntry, 'filename' | 'id'>): File {
  return managedFile(entry.id, filenameExtension(entry.filename));
}

function projectFilename(displayFilename: string, sourceFilename: string): string {
  const displayBase =
    basenameForProjection(displayFilename) || basenameForProjection(sourceFilename);
  const displayDot = displayBase.lastIndexOf('.');
  const sourceBase = basenameForProjection(sourceFilename);
  const sourceDot = sourceBase.lastIndexOf('.');
  const rawExt =
    displayDot > 0
      ? displayBase.slice(displayDot + 1).toLowerCase()
      : sourceDot > 0
        ? sourceBase.slice(sourceDot + 1).toLowerCase()
        : null;
  // An unsafe extension is folded back into the base name so the stored
  // filename and the on-disk suffix stay in agreement with filenameExtension().
  const ext = rawExt && SafeExtSchema.safeParse(rawExt).success ? rawExt : null;
  const name = displayDot > 0 ? displayBase.slice(0, displayDot) : displayBase;
  const filename = ext ? `${name}.${ext}` : displayBase;
  return SafeNameSchema.parse(filename);
}

function basenameForProjection(value: string): string {
  return (value.split(/[\\/]/).pop() ?? value).replace(/[\s.]+$/, '');
}

function resolveMediaType(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    if (candidate && MediaTypeSchema.safeParse(candidate).success) {
      return candidate;
    }
  }
  return FALLBACK_MEDIA_TYPE;
}

async function writeInternalFile(input: CreateInternalEntryInput): Promise<WrittenInternalFile> {
  const id = createOrderedUuid();
  let filename: string;
  let mediaType: string;
  let write: (destination: File) => Promise<void> | void;

  if (input.source === 'uri') {
    const source = new File(input.uri);
    filename = projectFilename(input.name ?? source.name, source.name);
    mediaType = resolveMediaType(input.mediaType, source.type);
    write = (destination) => source.copy(destination);
  } else if (input.source === 'base64') {
    mediaType = resolveMediaType(input.mediaType);
    const ext = SafeExtSchema.parse(generatedImageExtension(mediaType));
    const name = SafeNameSchema.parse(input.name ?? `painting-${id}`);
    filename = filenameExtension(name) ? name : `${name}.${ext}`;
    const payload = input.data.includes(',') ? (input.data.split(',', 2)[1] ?? '') : input.data;
    write = (destination) => destination.write(payload, { encoding: 'base64' });
  } else {
    mediaType = resolveMediaType(input.mediaType);
    filename = SafeNameSchema.parse(input.name);
    write = (destination) => destination.write(input.data);
  }

  const destination = new File(ensureFileDirectory(), `${id}${extSuffix(filename)}`);

  try {
    await write(destination);

    if (!destination.exists) {
      throw new Error(`Internal file does not exist after write: ${destination.uri}`);
    }

    const size = destination.size;
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error(`Internal file has an invalid size: ${destination.uri}`);
    }

    return { filename, id, mediaType, provenance: input.provenance, size };
  } catch (error) {
    try {
      if (destination.exists) {
        destination.delete();
      }
    } catch (cleanupError) {
      logger.warn('Failed to discard partially written internal file', cleanupError as Error, {
        id,
      });
    }
    throw error;
  }
}

function extSuffix(filename: string): string {
  const ext = filenameExtension(filename);
  return ext ? `.${ext}` : '';
}

export async function createInternalEntry(
  entries: Pick<FileEntryService, 'create'>,
  input: CreateInternalEntryInput,
): Promise<FileEntry> {
  const written = await writeInternalFile(input);
  try {
    return await entries.create(written);
  } catch (error) {
    try {
      deleteInternalFile(written);
    } catch (cleanupError) {
      logger.warn(
        'Failed to discard an internal file after FileEntry creation failed',
        cleanupError as Error,
        { id: written.id },
      );
    }
    throw error;
  }
}

export async function createMessageParts(
  entries: Pick<FileEntryService, 'create' | 'delete'>,
  parts: readonly CherryMessagePart[],
): Promise<{ entries: FileEntry[]; parts: CherryMessagePart[] }> {
  const createdEntries: FileEntry[] = [];
  const managedParts: CherryMessagePart[] = [];

  try {
    for (const part of parts) {
      if (part.type !== 'file' || readCherryMeta(part)?.fileEntryId) {
        managedParts.push(part);
        continue;
      }

      const entry = await createInternalEntry(entries, {
        mediaType: part.mediaType,
        name: part.filename,
        provenance: 'imported',
        source: 'uri',
        uri: part.url,
      });
      createdEntries.push(entry);
      managedParts.push(
        withCherryMeta(
          { ...part, mediaType: entry.mediaType, url: fileEntryUrl(entry.id) },
          { fileEntryId: entry.id },
        ),
      );
    }
  } catch (error) {
    await discardInternalEntries(entries, createdEntries);
    throw error;
  }

  return { entries: createdEntries, parts: managedParts };
}

export async function discardInternalEntries(
  entries: Pick<FileEntryService, 'delete'>,
  createdEntries: readonly Pick<FileEntry, 'filename' | 'id'>[],
): Promise<void> {
  for (const entry of createdEntries) {
    try {
      await entries.delete(entry.id);
    } catch (error) {
      logger.warn('Failed to delete a discarded FileEntry', error as Error, { id: entry.id });
      continue;
    }
    try {
      deleteInternalFile(entry);
    } catch (error) {
      logger.warn('Failed to delete a discarded internal file', error as Error, { id: entry.id });
    }
  }
}

/**
 * Hard-delete an entry and its bytes. The row is removed first; the unlink is
 * best-effort (a leftover blob is reclaimable by the future cache-cleanup
 * sweep, while a dangling row would not be).
 */
export async function deleteInternalEntry(
  entries: Pick<FileEntryService, 'deleteTx' | 'findByIdTx' | 'withWriteTx'>,
  id: FileEntryId,
): Promise<boolean> {
  const deletedEntry = await entries.withWriteTx(async (tx) => {
    const entry = await entries.findByIdTx(tx, id);
    if (!entry) {
      return null;
    }
    await entries.deleteTx(tx, id);
    return entry;
  });

  if (!deletedEntry) {
    return false;
  }

  try {
    deleteInternalFile(deletedEntry);
  } catch (error) {
    logger.warn('Failed to unlink a deleted internal file', error as Error, { id });
  }
  return true;
}

export async function resolveFileEntry(
  entries: Pick<FileEntryService, 'findById'>,
  id: FileEntryId,
): Promise<ResolvedFile | null> {
  const entry = await entries.findById(id);
  if (!entry) return null;
  const uri = getInternalFileUri(entry);
  return uri ? { entry, uri } : null;
}

export async function getFileUri(
  entries: Pick<FileEntryService, 'findById'>,
  id: FileEntryId,
): Promise<string | undefined> {
  return (await resolveFileEntry(entries, id))?.uri;
}

export function deleteInternalFile(entry: Pick<FileEntry, 'filename' | 'id'>): boolean {
  const file = managedFileForEntry(entry);
  if (!file.exists) {
    return false;
  }
  file.delete();
  return true;
}

export function getInternalFileUri(entry: Pick<FileEntry, 'filename' | 'id'>): string | undefined {
  const file = managedFileForEntry(entry);
  return file.exists ? file.uri : undefined;
}

export async function imageUriToDataUrl(
  uri: string,
  mediaType: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  if (uri.startsWith('data:')) {
    return uri;
  }
  const file = new File(uri);
  const base64 = await file.base64();
  signal?.throwIfAborted();
  const resolvedMediaType = resolveMediaType(mediaType, file.type, 'image/*');
  return `data:${resolvedMediaType};base64,${base64}`;
}

export async function readFileUriBytes(uri: string, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted();
  const bytes = await new File(uri).bytes();
  signal?.throwIfAborted();
  return bytes;
}
