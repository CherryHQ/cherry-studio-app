import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { strFromU8 } from 'fflate';

import { extractZipEntries, readZipDirectory } from '@/backend/utils/zipReader';
import { DeepseekImportError } from '@/shared/contracts/deepseekImport';
import { filenameExtension } from '@/shared/data/types/file';
import {
  imageMediaTypeFromExtension,
  imageMediaTypeFromHeader,
} from '@/shared/utils/imageFileTypes';

import { DEEPSEEK_IMPORT_LIMITS, deepseekIndexSchema } from './deepseekFormat';

function isArchivePath(path: string): boolean {
  return (
    path.length <= 1024 &&
    !path.startsWith('/') &&
    !/[\\:\x00-\x1f]/.test(path) &&
    path.split('/').every((part) => part && part !== '.' && part !== '..')
  );
}

export function deepseekArchiveFile(root: Directory, path: string): File {
  if (!isArchivePath(path)) throw new DeepseekImportError('invalid');
  return new File(root, ...path.split('/'));
}

export async function readDeepseekJson(file: File): Promise<unknown> {
  if (!file.exists || file.size > DEEPSEEK_IMPORT_LIMITS.jsonBytes) {
    throw new DeepseekImportError(file.exists ? 'too-large' : 'invalid');
  }
  try {
    return JSON.parse(await file.text());
  } catch (cause) {
    throw new DeepseekImportError('invalid', { cause });
  }
}

/** Inspect only a bounded prefix; the archive's is_image remains the image identity. */
export function readDeepseekImageMediaType(file: File): string {
  const handle = file.open(FileMode.ReadOnly);
  try {
    return (
      imageMediaTypeFromHeader(handle.readBytesSync(Math.min(file.size, 32))) ??
      imageMediaTypeFromExtension(filenameExtension(file.name))
    );
  } finally {
    handle.close();
  }
}

export type DeepseekArchiveConversation = {
  id: string;
  insertedAt?: number;
  updatedAt?: number;
};

const CONVERSATION_FILE = /^chat_sessions\/([^/]+)\.json$/;

/**
 * Extract through the shared bounded ZIP reader, never through an in-memory unzip. Only the ZIP
 * structure itself must be intact: entries with unusable paths, or whose names collide on a
 * case-insensitive filesystem, are skipped. Conversations are the union of readable index rows
 * and the conversation files actually present; the manifest and index are optional.
 */
export async function unpackDeepseekArchive(
  input: File,
  root: Directory,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void,
): Promise<{ conversations: DeepseekArchiveConversation[]; names: Set<string> }> {
  if (!input.exists || input.size <= 0) throw new DeepseekImportError('invalid');
  const size = input.size;
  if (size > DEEPSEEK_IMPORT_LIMITS.archiveBytes) throw new DeepseekImportError('too-large');
  const handle = input.open(FileMode.ReadOnly);
  const format = {
    invalid: () => new DeepseekImportError('invalid'),
    decodeName: (bytes: Uint8Array) => strFromU8(bytes),
    maxNameBytes: 1024,
  };
  const names = new Set<string>();
  try {
    const source = {
      size,
      read(offset: number, length: number) {
        handle.offset = offset;
        return handle.readBytesSync(length);
      },
    };
    const directory = readZipDirectory(source, {
      ...format,
      tooLarge: () => new DeepseekImportError('too-large'),
      maxRecords: DEEPSEEK_IMPORT_LIMITS.entries,
      maxExpandedBytes: DEEPSEEK_IMPORT_LIMITS.expandedBytes,
      allowDirectories: true,
      checkRecord: () => {},
    });
    const folded = new Set<string>();
    const entries = directory.entries.filter(({ name }) => {
      const key = name.normalize('NFC').toLowerCase();
      if (!isArchivePath(name) || folded.has(key)) return false;
      folded.add(key);
      names.add(name);
      return true;
    });
    await extractZipEntries(
      source,
      { ...directory, entries },
      {
        ...format,
        signal,
        verifyCrc: true,
        onRead: (position) => onProgress(Math.min(position, size), size),
        open: (entry) => {
          const file = deepseekArchiveFile(root, entry.name);
          file.parentDirectory.create({ intermediates: true, idempotent: true });
          file.create();
          const output = file.open(FileMode.WriteOnly);
          return {
            write: (chunk) => {
              if (Paths.availableDiskSpace < chunk.length + 32 * 1024 * 1024) {
                throw new DeepseekImportError('disk-space');
              }
              output.writeBytesSync(chunk);
            },
            close: () => output.close(),
          };
        },
      },
    );
  } finally {
    handle.close();
  }
  signal.throwIfAborted();
  const conversations = new Map<string, DeepseekArchiveConversation>();
  if (names.has('chat_session_index.json')) {
    try {
      const index = deepseekIndexSchema.parse(
        await readDeepseekJson(deepseekArchiveFile(root, 'chat_session_index.json')),
      );
      for (const item of index)
        if (names.has(`chat_sessions/${item.id}.json`) && !conversations.has(item.id))
          conversations.set(item.id, {
            id: item.id,
            insertedAt: item.inserted_at,
            updatedAt: item.updated_at,
          });
    } catch (error) {
      if (!(error instanceof DeepseekImportError)) throw error;
      // An unreadable index only loses its timestamps; the conversation files remain.
    }
  }
  for (const name of names) {
    const id = CONVERSATION_FILE.exec(name)?.[1];
    if (id && !conversations.has(id)) conversations.set(id, { id });
  }
  if (conversations.size === 0) throw new DeepseekImportError('unsupported');
  return { conversations: [...conversations.values()], names };
}
