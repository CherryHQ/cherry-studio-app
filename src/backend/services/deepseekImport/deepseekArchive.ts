import { type Directory, File, FileMode, Paths } from 'expo-file-system';
import { strFromU8 } from 'fflate';

import { extractZipEntries, readZipDirectory } from '@/backend/utils/zipReader';
import { DeepseekImportError } from '@/shared/contracts/deepseekImport';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { filenameExtension } from '@/shared/data/types/file';
import {
  imageMediaTypeFromExtension,
  imageMediaTypeFromHeader,
} from '@/shared/utils/imageFileTypes';

import { DEEPSEEK_IMPORT_LIMITS, deepseekIndexSchema } from './deepseekFormat';

const logger = loggerService.withContext('DeepseekImport');

function isArchivePath(path: string): boolean {
  return (
    path.length <= 1024 &&
    !path.startsWith('/') &&
    !/[\\:\x00-\x1f]/.test(path) &&
    path.split('/').every((part) => part && part !== '.' && part !== '..')
  );
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
export function readDeepseekImageMediaType(file: File, archivePath: string): string {
  const handle = file.open(FileMode.ReadOnly);
  try {
    return (
      imageMediaTypeFromHeader(handle.readBytesSync(Math.min(file.size, 32))) ??
      imageMediaTypeFromExtension(filenameExtension(archivePath.split('/').at(-1) ?? ''))
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
 * Extract entries under app-owned names. The ZIP directory identifies conversation candidates;
 * only entries that passed extraction can be read. The index enriches timestamps when available.
 */
export async function unpackDeepseekArchive(
  input: File,
  root: Directory,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void,
): Promise<{ conversations: DeepseekArchiveConversation[]; files: Map<string, string> }> {
  if (!input.exists || input.size <= 0) throw new DeepseekImportError('invalid');
  const size = input.size;
  if (size > DEEPSEEK_IMPORT_LIMITS.archiveBytes) throw new DeepseekImportError('too-large');
  const handle = input.open(FileMode.ReadOnly);
  const format = {
    invalid: (reasonCode: DeepseekImportError['reasonCode']) =>
      new DeepseekImportError('invalid', { reasonCode }),
    decodeName: (bytes: Uint8Array) => {
      try {
        return strFromU8(bytes);
      } catch {
        return null;
      }
    },
    maxNameBytes: 1024,
  };
  const files = new Map<string, string>();
  const candidateIds = new Set<string>();
  let skippedEntries = 0;
  const addCandidate = (name: string) => {
    const id = CONVERSATION_FILE.exec(name)?.[1];
    if (id) candidateIds.add(id);
  };
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
      onInvalidEntry: (name) => {
        skippedEntries += 1;
        if (name !== undefined) addCandidate(name);
      },
    });
    const entries = directory.entries.filter(({ name }) => {
      addCandidate(name);
      if (isArchivePath(name)) return true;
      skippedEntries += 1;
      return false;
    });
    root.create({ intermediates: true });
    let nextEntry = 0;
    await extractZipEntries(
      source,
      { ...directory, entries },
      {
        ...format,
        signal,
        verifyCrc: true,
        onRead: (position) => onProgress(Math.min(position, size), size),
        onInvalidEntry: (name) => {
          skippedEntries += 1;
          const uri = files.get(name);
          files.delete(name);
          if (uri !== undefined) {
            try {
              new File(uri).delete();
            } catch {
              // The import finalizer also removes the entire staging directory.
            }
          }
        },
        open: (entry) => {
          const file = new File(root, `entry-${++nextEntry}`);
          file.create();
          const output = file.open(FileMode.WriteOnly);
          files.set(entry.name, file.uri);
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
  const indexUri = files.get('chat_session_index.json');
  if (indexUri !== undefined) {
    try {
      const index = deepseekIndexSchema.parse(await readDeepseekJson(new File(indexUri)));
      for (const item of index)
        if (candidateIds.has(item.id) && !conversations.has(item.id))
          conversations.set(item.id, {
            id: item.id,
            insertedAt: item.inserted_at,
            updatedAt: item.updated_at,
          });
    } catch (error) {
      if (!(error instanceof DeepseekImportError)) throw error;
      // An unreadable index only loses its timestamps; the conversation files remain.
      skippedEntries += 1;
    }
  }
  for (const id of candidateIds) if (!conversations.has(id)) conversations.set(id, { id });
  if (skippedEntries > 0)
    logger.warn('DeepSeek import skipped archive entries', { phase: 'archive', skippedEntries });
  if (conversations.size === 0) throw new DeepseekImportError('unsupported');
  return { conversations: [...conversations.values()], files };
}
