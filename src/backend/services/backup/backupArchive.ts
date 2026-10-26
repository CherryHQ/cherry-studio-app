import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { strFromU8 } from 'fflate';

import { hashLocalFile } from '@/backend/services/file/fileHash';
import { extractZipEntries, readZipDirectory } from '@/backend/utils/zipReader';
import { writeZipFile, type ZipWriteEntry } from '@/backend/utils/zipWriter';
import { BackupError } from '@/shared/contracts/backup';

import {
  assertBackupPath,
  BACKUP_LIMITS,
  type BackupManifest,
  validateManifest,
} from './backupFormat';

export function archiveFile(root: Directory, path: string): File {
  assertBackupPath(path);
  return new File(root, ...path.split('/'));
}

export async function packBackup(
  root: Directory,
  manifest: BackupManifest,
  output: File,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
): Promise<void> {
  const paths = ['manifest.json', ...manifest.entries.map((entry) => entry.path)];
  await writeZipFile(
    output,
    paths.map(
      (path): ZipWriteEntry => ({
        name: path,
        file: archiveFile(root, path),
        compression: path.startsWith('database/') || path === 'manifest.json' ? 1 : 'store',
      }),
    ),
    {
      signal,
      limit: { bytes: BACKUP_LIMITS.archiveBytes, error: () => new BackupError('too-large') },
      onEntryWritten: progress,
    },
  );
}

const zipFormat = {
  invalid: (reason: 'malformed' | 'missing-directory') =>
    reason === 'missing-directory'
      ? new BackupError('invalid', 'Missing or truncated ZIP directory.')
      : new BackupError('invalid'),
  decodeName: (bytes: Uint8Array) => strFromU8(bytes),
  maxNameBytes: 512,
};

export async function unpackBackup(
  input: File,
  root: Directory,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
): Promise<BackupManifest> {
  if (!input.exists || input.size <= 0) throw new BackupError('invalid');
  if (input.size > BACKUP_LIMITS.archiveBytes) throw new BackupError('too-large');
  const inputSize = input.size;
  const handle = input.open(FileMode.ReadOnly);
  let entries: ReadonlyMap<string, number>;
  try {
    const source = {
      size: inputSize,
      read(offset: number, length: number) {
        handle.offset = offset;
        return handle.readBytesSync(length);
      },
    };
    const names = new Set<string>();
    const directory = readZipDirectory(source, {
      ...zipFormat,
      tooLarge: () => new BackupError('too-large'),
      maxRecords: BACKUP_LIMITS.entries + 1,
      maxExpandedBytes: BACKUP_LIMITS.expandedBytes,
      checkRecord: ({ name, size }) => {
        assertBackupPath(name);
        if (names.has(name.toLowerCase())) throw new BackupError('invalid');
        names.add(name.toLowerCase());
        if (name === 'manifest.json' && size > BACKUP_LIMITS.manifestBytes)
          throw new BackupError('too-large');
      },
    });
    let expandedBytes = 0;
    // Stored Office documents contain ZIP headers. Each outer entry is bounded by its
    // central-directory size instead of scanning for the next local header inside its payload.
    await extractZipEntries(source, directory, {
      ...zipFormat,
      contiguous: true,
      signal,
      onRead: (position) => progress(position, inputSize),
      open: (entry) => {
        const file = archiveFile(root, entry.name);
        file.parentDirectory.create({ intermediates: true, idempotent: true });
        file.create();
        const output = file.open(FileMode.WriteOnly);
        let size = 0;
        return {
          write: (chunk) => {
            size += chunk.byteLength;
            expandedBytes += chunk.byteLength;
            if (
              expandedBytes > BACKUP_LIMITS.expandedBytes ||
              (entry.name === 'manifest.json' && size > BACKUP_LIMITS.manifestBytes)
            )
              throw new BackupError('too-large');
            if (Paths.availableDiskSpace < chunk.byteLength + 32 * 1024 * 1024)
              throw new BackupError('disk-space');
            output.writeBytesSync(chunk);
          },
          close: () => output.close(),
        };
      },
    });
    // Extraction verified every entry against its declared size.
    entries = new Map(directory.entries.map((entry) => [entry.name, entry.size]));
  } finally {
    handle.close();
  }
  progress(inputSize, inputSize);
  if (!entries.has('manifest.json')) throw new BackupError('invalid');
  const manifestBytes = await archiveFile(root, 'manifest.json').bytes();
  const manifest = validateManifest(JSON.parse(strFromU8(manifestBytes)));
  if (entries.size !== manifest.entries.length + 1) throw new BackupError('invalid');
  for (const entry of manifest.entries) {
    signal.throwIfAborted();
    if (
      entries.get(entry.path) !== entry.size ||
      (await hashLocalFile(archiveFile(root, entry.path).uri, signal)) !== entry.sha256
    )
      throw new BackupError('invalid');
  }
  return manifest;
}
