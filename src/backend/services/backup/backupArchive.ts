import { Directory, File, FileMode, Paths, type FileHandle } from 'expo-file-system';
import { strFromU8, Unzip, UnzipInflate, Zip, ZipDeflate, ZipPassThrough } from 'fflate';

import { backupStorageNative } from '@/backend/data/storage/storagePaths';
import { BackupError } from '@/shared/contracts/backup';

import {
  assertBackupPath,
  BACKUP_LIMITS,
  type BackupManifest,
  validateManifest,
} from './backupFormat';
import { parseZipEnd, parseZipEntry } from './zipDirectory';

export function archiveFile(root: Directory, path: string): File {
  assertBackupPath(path);
  return new File(root, ...path.split('/'));
}

const yieldToApp = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function packBackup(
  root: Directory,
  manifest: BackupManifest,
  output: File,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
): Promise<void> {
  output.create();
  const handle = output.open(FileMode.WriteOnly);
  let size = 0;
  let finished = false;
  const zip = new Zip((error, chunk, final) => {
    if (error) throw error;
    signal.throwIfAborted();
    size += chunk.byteLength;
    if (size > BACKUP_LIMITS.archiveBytes) throw new BackupError('too-large');
    handle.writeBytes(chunk);
    finished = final;
  });
  try {
    const paths = ['manifest.json', ...manifest.entries.map((entry) => entry.path)];
    for (const [index, path] of paths.entries()) {
      signal.throwIfAborted();
      const source = archiveFile(root, path).open(FileMode.ReadOnly);
      const entry =
        path === 'database/cherry.db' || path === 'manifest.json'
          ? new ZipDeflate(path, { level: 1 })
          : new ZipPassThrough(path);
      try {
        zip.add(entry);
        while (true) {
          signal.throwIfAborted();
          const chunk = source.readBytes(BACKUP_LIMITS.chunkBytes);
          entry.push(chunk, chunk.byteLength === 0);
          if (chunk.byteLength === 0) break;
          await yieldToApp();
        }
      } finally {
        source.close();
      }
      progress(index + 1, paths.length);
    }
    zip.end();
    if (!finished) throw new BackupError('storage');
  } finally {
    zip.terminate();
    handle.close();
  }
}

export async function unpackBackup(
  input: File,
  root: Directory,
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
): Promise<BackupManifest> {
  if (!input.exists || input.size <= 0) throw new BackupError('invalid');
  if (input.size > BACKUP_LIMITS.archiveBytes) throw new BackupError('too-large');
  const inputSize = input.size;
  const directory = readZipDirectory(input);
  const handles = new Set<FileHandle>();
  const entries = new Map<string, { size: number; complete: boolean }>();
  const names = new Set<string>();
  let expandedBytes = 0;
  let readBytes = 0;
  const unzip = new Unzip((entry) => {
    signal.throwIfAborted();
    assertBackupPath(entry.name);
    if (names.has(entry.name.toLowerCase()) || names.size >= BACKUP_LIMITS.entries + 1)
      throw new BackupError('invalid');
    if (entry.compression !== 0 && entry.compression !== 8) throw new BackupError('invalid');
    const declared = directory.get(entry.name);
    if (!declared || declared.compression !== entry.compression) throw new BackupError('invalid');
    names.add(entry.name.toLowerCase());
    const file = archiveFile(root, entry.name);
    file.parentDirectory.create({ intermediates: true, idempotent: true });
    file.create();
    const output = file.open(FileMode.WriteOnly);
    handles.add(output);
    const state = { size: 0, complete: false };
    entries.set(entry.name, state);
    entry.ondata = (error, chunk, final) => {
      if (error) throw new BackupError('invalid');
      signal.throwIfAborted();
      state.size += chunk.byteLength;
      if (state.size > declared.size) throw new BackupError('invalid');
      expandedBytes += chunk.byteLength;
      if (
        expandedBytes > BACKUP_LIMITS.expandedBytes ||
        (entry.name === 'manifest.json' && state.size > BACKUP_LIMITS.manifestBytes)
      )
        throw new BackupError('too-large');
      if (Paths.availableDiskSpace < chunk.byteLength + 32 * 1024 * 1024)
        throw new BackupError('disk-space');
      output.writeBytes(chunk);
      if (final) {
        if (state.size !== declared.size) throw new BackupError('invalid');
        state.complete = true;
        output.close();
        handles.delete(output);
      }
    };
    entry.start();
  });
  unzip.register(UnzipInflate);
  const source = input.open(FileMode.ReadOnly);
  try {
    while (true) {
      signal.throwIfAborted();
      const chunk = source.readBytes(4096);
      readBytes += chunk.byteLength;
      unzip.push(chunk, chunk.byteLength === 0);
      progress(readBytes, inputSize);
      if (chunk.byteLength === 0) break;
      await yieldToApp();
    }
  } finally {
    source.close();
    for (const handle of handles) handle.close();
  }
  if (
    entries.size !== directory.size ||
    [...entries.values()].some((entry) => !entry.complete) ||
    !entries.has('manifest.json')
  )
    throw new BackupError('invalid');
  const manifestBytes = await archiveFile(root, 'manifest.json').bytes();
  const manifest = validateManifest(JSON.parse(strFromU8(manifestBytes)));
  if (entries.size !== manifest.entries.length + 1) throw new BackupError('invalid');
  for (const entry of manifest.entries) {
    signal.throwIfAborted();
    if (
      entries.get(entry.path)?.size !== entry.size ||
      (await backupStorageNative().hashFile(archiveFile(root, entry.path).uri)) !== entry.sha256
    )
      throw new BackupError('invalid');
  }
  return manifest;
}

function readZipDirectory(input: File) {
  const source = input.open(FileMode.ReadOnly);
  try {
    source.offset = Math.max(0, input.size - 65557);
    const end = parseZipEnd(source.readBytes(Math.min(input.size, 65557)), input.size);
    source.offset = end.start;
    const entries = new Map<string, ReturnType<typeof parseZipEntry>>();
    const names = new Set<string>();
    let expanded = 0;
    for (let index = 0; index < end.count; index++) {
      const header = source.readBytes(46);
      if (header.length !== 46) throw new BackupError('invalid');
      const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
      const length = view.getUint16(28, true);
      if (length > 512) throw new BackupError('invalid');
      const entry = parseZipEntry(header, source.readBytes(length));
      if (names.has(entry.name.toLowerCase()) || entry.offset >= end.start)
        throw new BackupError('invalid');
      names.add(entry.name.toLowerCase());
      entries.set(entry.name, entry);
      expanded += entry.size;
      if (
        expanded > BACKUP_LIMITS.expandedBytes ||
        (entry.name === 'manifest.json' && entry.size > BACKUP_LIMITS.manifestBytes)
      )
        throw new BackupError('too-large');
      const nextOffset = (source.offset ?? 0) + entry.skip;
      if (nextOffset > end.start + end.size) throw new BackupError('invalid');
      source.offset = nextOffset;
    }
    if (source.offset !== end.start + end.size) throw new BackupError('invalid');
    return entries;
  } finally {
    source.close();
  }
}
