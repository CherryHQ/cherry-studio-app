import { type MemoryPlatform, MemoryError, assertMemoryTarget } from '@cherrystudio/memory';
import { randomUUID } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { storageDirectory } from '@/backend/data/storage/storagePaths';
import { AgentIdSchema } from '@/shared/data/types/agent';
import { sha256Hex } from '@/shared/utils/sha256';

/** Logical roots are owned by the service, never accepted as model paths. */
export function managedMemoryRoot(base: Directory, root: string): Directory {
  if (root === 'shared') return new Directory(base, 'Data', 'Memory');
  const parts = root.split('/');
  const backup = parts[0] === 'backups';
  const scope = backup ? parts.slice(1) : parts;
  if (scope.length === 1 && scope[0] === 'shared' && backup)
    return new Directory(base, 'Data', 'MemoryBackups', 'shared');
  if (scope.length === 2 && scope[0] === 'agent' && AgentIdSchema.safeParse(scope[1]).success)
    return backup
      ? new Directory(base, 'Data', 'MemoryBackups', 'agent', scope[1])
      : new Directory(base, 'Data', 'Agents', scope[1]);
  throw new MemoryError('invalid-path', 'Unknown memory root');
}

function assertRelative(root: string, relative: string): void {
  if (relative === '' || relative === '.memories') return;
  if (root.startsWith('backups/')) {
    if (/^\d+-[0-9a-f-]{36}\.json$/.test(relative)) return;
  } else {
    assertMemoryTarget(relative);
    return;
  }
  throw new MemoryError('invalid-path', 'Unknown memory file');
}

/** Interrupted publication reads the retained old file; pending files are never active. */
export function recoverableMemoryFile(file: File): File {
  const previous = new File(file.uri + '.previous');
  return !file.exists && previous.exists ? previous : file;
}

export async function replaceMemoryFile(file: File, bytes: Uint8Array, assertCurrent: () => void) {
  storageMutationGate.assertWritable();
  file.parentDirectory.create({ intermediates: true, idempotent: true });
  const previous = new File(file.uri + '.previous');
  const staged = new File(file.parentDirectory, '.' + file.name + '.' + randomUUID() + '.pending');
  try {
    await staged.write(bytes);
    assertCurrent();
    storageMutationGate.assertWritable();
    if (file.exists) {
      if (previous.exists) previous.delete();
      await new File(file.uri).move(previous);
    }
    assertCurrent();
    storageMutationGate.assertWritable();
    await staged.move(file);
    // Retain an old copy if cleanup fails; canonical reads still win.
    try {
      if (previous.exists) previous.delete();
    } catch {
      /* Safe to retain for later cleanup. */
    }
  } finally {
    if (staged.uri !== file.uri && staged.exists) staged.delete();
  }
}

export const managedMemoryPlatform: MemoryPlatform = {
  hash: sha256Hex,
  randomUUID,
  now: Date.now,
  // Use portable case-insensitive names on both mobile platforms.
  caseSensitive: false,
  files: {
    async assertPath(root, relative) {
      assertRelative(root, relative);
      const directory = managedMemoryRoot(storageDirectory(), root);
      if (relative.startsWith('.memories/') && !new Directory(directory, '.memories').exists)
        throw new MemoryError('invalid-path', 'Memory topics must be a directory');
    },
    async ensureDirectory(root, relative) {
      assertRelative(root, relative);
      const directory = new Directory(
        managedMemoryRoot(storageDirectory(), root),
        ...(relative ? [relative] : []),
      );
      if (!directory.exists) {
        storageMutationGate.assertWritable();
        directory.create({ intermediates: true, idempotent: true });
      }
    },
    async list(root, relative) {
      assertRelative(root, relative);
      const directory = new Directory(
        managedMemoryRoot(storageDirectory(), root),
        ...(relative ? [relative] : []),
      );
      if (!directory.exists) return [];
      const entries = new Map<string, { name: string; directory: boolean }>();
      for (const item of directory.list()) {
        let name = item.name;
        if (item instanceof File && name.endsWith('.previous')) name = name.slice(0, -9);
        if (!entries.has(name) || !item.name.endsWith('.previous'))
          entries.set(name, { name, directory: item instanceof Directory });
      }
      return [...entries.values()];
    },
    async read(root, relative) {
      assertRelative(root, relative);
      const file = recoverableMemoryFile(
        new File(managedMemoryRoot(storageDirectory(), root), ...relative.split('/')),
      );
      if (!file.exists) return null;
      const before = file.info();
      if (file.size > 20 * 1024 * 1024)
        throw new MemoryError('limit', 'Memory file exceeds the complete-read budget');
      const bytes = await file.bytes();
      const after = file.info();
      if (
        before.size !== after.size ||
        before.modificationTime !== after.modificationTime ||
        bytes.length !== after.size
      )
        throw new MemoryError('conflict', 'Memory changed during the read');
      return bytes;
    },
    async replace(root, relative, bytes, assertCurrent) {
      assertRelative(root, relative);
      const file = new File(managedMemoryRoot(storageDirectory(), root), ...relative.split('/'));
      if (bytes !== null) return replaceMemoryFile(file, bytes, assertCurrent);
      assertCurrent();
      storageMutationGate.assertWritable();
      const previous = new File(file.uri + '.previous');
      // Remove the fallback first, so a successful deletion cannot revive it.
      if (previous.exists) previous.delete();
      if (file.exists) file.delete();
    },
    async identity(root, relative) {
      assertRelative(root, relative);
      const file = recoverableMemoryFile(
        new File(managedMemoryRoot(storageDirectory(), root), ...relative.split('/')),
      );
      return file.exists ? file.uri.toLowerCase().replace(/\.previous$/, '') : null;
    },
  },
};
