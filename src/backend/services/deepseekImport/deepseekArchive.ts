import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { strFromU8 } from 'fflate';

import { extractZipEntries, readZipDirectory } from '@/backend/utils/zipReader';
import { DeepseekImportError } from '@/shared/contracts/deepseekImport';

import { DEEPSEEK_IMPORT_LIMITS, deepseekIndexSchema } from './deepseekFormat';

function assertArchivePath(path: string): void {
  if (
    path.length > 1024 ||
    path.startsWith('/') ||
    /[\\:\x00-\x1f]/.test(path) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new DeepseekImportError('invalid');
}

export function deepseekArchiveFile(root: Directory, path: string): File {
  assertArchivePath(path);
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

/** Extract through the shared bounded ZIP reader, never through an in-memory unzip. */
export async function unpackDeepseekArchive(
  input: File,
  root: Directory,
  signal: AbortSignal,
  onProgress: (completed: number, total: number) => void,
) {
  if (!input.exists || input.size <= 0) throw new DeepseekImportError('invalid');
  const size = input.size;
  if (size > DEEPSEEK_IMPORT_LIMITS.archiveBytes) throw new DeepseekImportError('too-large');
  const handle = input.open(FileMode.ReadOnly);
  const format = {
    invalid: () => new DeepseekImportError('invalid'),
    decodeName: (bytes: Uint8Array) => strFromU8(bytes),
    maxNameBytes: 1024,
  };
  let names: Set<string>;
  try {
    const source = {
      size,
      read(offset: number, length: number) {
        handle.offset = offset;
        return handle.readBytesSync(length);
      },
    };
    const paths = new Set<string>();
    const directory = readZipDirectory(source, {
      ...format,
      tooLarge: () => new DeepseekImportError('too-large'),
      maxRecords: DEEPSEEK_IMPORT_LIMITS.entries,
      maxExpandedBytes: DEEPSEEK_IMPORT_LIMITS.expandedBytes,
      allowDirectories: true,
      checkRecord: ({ path, size: entrySize }) => {
        assertArchivePath(path);
        const normalized = path.normalize('NFC').toLowerCase();
        if (paths.has(normalized)) throw new DeepseekImportError('invalid');
        paths.add(normalized);
        if (path.endsWith('.json') && entrySize > DEEPSEEK_IMPORT_LIMITS.jsonBytes) {
          throw new DeepseekImportError('too-large');
        }
      },
    });
    names = new Set(directory.entries.map((entry) => entry.name));
    if (!names.has('manifest.json') || !names.has('chat_session_index.json')) {
      throw new DeepseekImportError('unsupported');
    }
    await extractZipEntries(source, directory, {
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
    });
  } finally {
    handle.close();
  }
  signal.throwIfAborted();
  const manifest = await readDeepseekJson(deepseekArchiveFile(root, 'manifest.json'));
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !('export_format_version' in manifest) ||
    manifest.export_format_version !== 3
  ) {
    throw new DeepseekImportError('unsupported');
  }
  const parsed = deepseekIndexSchema.safeParse(
    await readDeepseekJson(deepseekArchiveFile(root, 'chat_session_index.json')),
  );
  if (!parsed.success) throw new DeepseekImportError('invalid');
  const index = parsed.data;
  if (index.length === 0) throw new DeepseekImportError('empty');
  const ids = new Set(index.map((item) => item.id));
  const conversations = [...names].filter((name) => /^chat_sessions\/[^/]+\.json$/.test(name));
  if (
    ids.size !== index.length ||
    conversations.length !== index.length ||
    index.some(({ id }) => !names.has(`chat_sessions/${id}.json`))
  ) {
    throw new DeepseekImportError('invalid');
  }
  return { index, names };
}
