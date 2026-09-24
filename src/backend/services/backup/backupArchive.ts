import { Directory, File, FileMode, Paths, type FileHandle } from 'expo-file-system';
import { Inflate, strFromU8, Zip, ZipDeflate, ZipPassThrough } from 'fflate';

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
  const { entries: directory, start } = readZipDirectory(input);
  const entries = new Map<string, number>();
  let expandedBytes = 0;
  const source = input.open(FileMode.ReadOnly);
  try {
    let cursor = 0;
    // Stored Office documents contain ZIP headers. Bound each outer entry by its central-directory
    // size instead of scanning for the next local header inside the file's payload.
    const localEntries = [...directory.values()].sort((left, right) => left.offset - right.offset);
    for (const [index, entry] of localEntries.entries()) {
      signal.throwIfAborted();
      if (entry.offset !== cursor) throw new BackupError('invalid');
      source.offset = cursor;
      const header = readExact(source, 30);
      const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
      const nameLength = view.getUint16(26, true);
      const extraLength = view.getUint16(28, true);
      if (
        view.getUint32(0, true) !== 0x04034b50 ||
        view.getUint16(6, true) !== entry.flags ||
        view.getUint16(8, true) !== entry.compression ||
        nameLength > 512 ||
        strFromU8(readExact(source, nameLength)) !== entry.name
      )
        throw new BackupError('invalid');
      const dataStart = entry.offset + 30 + nameLength + extraLength;
      const dataEnd = dataStart + entry.compressedSize;
      if (dataEnd > start) throw new BackupError('invalid');
      if (
        !(entry.flags & 8) &&
        (view.getUint32(14, true) !== entry.crc32 ||
          view.getUint32(18, true) !== entry.compressedSize ||
          view.getUint32(22, true) !== entry.size)
      )
        throw new BackupError('invalid');
      source.offset = dataStart;

      const file = archiveFile(root, entry.name);
      file.parentDirectory.create({ intermediates: true, idempotent: true });
      file.create();
      const output = file.open(FileMode.WriteOnly);
      let size = 0;
      let complete = entry.compression === 0;
      const write = (chunk: Uint8Array) => {
        signal.throwIfAborted();
        size += chunk.byteLength;
        expandedBytes += chunk.byteLength;
        if (size > entry.size) throw new BackupError('invalid');
        if (
          expandedBytes > BACKUP_LIMITS.expandedBytes ||
          (entry.name === 'manifest.json' && size > BACKUP_LIMITS.manifestBytes)
        )
          throw new BackupError('too-large');
        if (Paths.availableDiskSpace < chunk.byteLength + 32 * 1024 * 1024)
          throw new BackupError('disk-space');
        output.writeBytes(chunk);
      };
      try {
        const inflate =
          entry.compression === 8
            ? new Inflate((chunk, final) => {
                write(chunk);
                if (final) complete = true;
              })
            : undefined;
        let remaining = entry.compressedSize;
        while (remaining > 0) {
          signal.throwIfAborted();
          const chunk = readExact(source, Math.min(remaining, BACKUP_LIMITS.chunkBytes));
          remaining -= chunk.byteLength;
          if (inflate) inflate.push(chunk, remaining === 0);
          else write(chunk);
          progress(source.offset ?? 0, inputSize);
          await yieldToApp();
        }
        if (inflate && entry.compressedSize === 0) inflate.push(new Uint8Array(), true);
      } finally {
        output.close();
      }
      if (!complete || size !== entry.size) throw new BackupError('invalid');
      source.offset = dataEnd;
      const nextOffset = localEntries[index + 1]?.offset ?? start;
      if (entry.flags & 8) {
        const descriptorLength = nextOffset - dataEnd;
        if (descriptorLength !== 12 && descriptorLength !== 16) throw new BackupError('invalid');
        const descriptor = readExact(source, descriptorLength);
        const descriptorView = new DataView(
          descriptor.buffer,
          descriptor.byteOffset,
          descriptor.byteLength,
        );
        const prefix = descriptorLength === 16 ? 4 : 0;
        if (
          (prefix && descriptorView.getUint32(0, true) !== 0x08074b50) ||
          descriptorView.getUint32(prefix, true) !== entry.crc32 ||
          descriptorView.getUint32(prefix + 4, true) !== entry.compressedSize ||
          descriptorView.getUint32(prefix + 8, true) !== entry.size
        )
          throw new BackupError('invalid');
      }
      cursor = source.offset ?? 0;
      if (cursor !== nextOffset) throw new BackupError('invalid');
      entries.set(entry.name, size);
    }
    if (cursor !== start) throw new BackupError('invalid');
  } finally {
    source.close();
  }
  progress(inputSize, inputSize);
  if (entries.size !== directory.size || !entries.has('manifest.json'))
    throw new BackupError('invalid');
  const manifestBytes = await archiveFile(root, 'manifest.json').bytes();
  const manifest = validateManifest(JSON.parse(strFromU8(manifestBytes)));
  if (entries.size !== manifest.entries.length + 1) throw new BackupError('invalid');
  for (const entry of manifest.entries) {
    signal.throwIfAborted();
    if (
      entries.get(entry.path) !== entry.size ||
      (await backupStorageNative().hashFile(archiveFile(root, entry.path).uri)) !== entry.sha256
    )
      throw new BackupError('invalid');
  }
  return manifest;
}

function readExact(source: FileHandle, length: number): Uint8Array {
  const bytes = source.readBytes(length);
  if (bytes.byteLength !== length) throw new BackupError('invalid');
  return bytes;
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
      const nextOffset: number = (source.offset ?? 0) + entry.skip;
      if (nextOffset > end.start + end.size) throw new BackupError('invalid');
      source.offset = nextOffset;
    }
    if (source.offset !== end.start + end.size) throw new BackupError('invalid');
    return { entries, start: end.start };
  } finally {
    source.close();
  }
}
