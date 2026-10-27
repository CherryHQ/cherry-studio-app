import { randomUUID } from 'expo-crypto';
import { Directory, Paths } from 'expo-file-system';
import { deleteAsync, getInfoAsync, readDirectoryAsync } from 'expo-file-system/legacy';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// Includes the previous flat bundle/snapshot layout so upgrades reclaim interrupted attempts.
const OWNED_DIRECTORY = new RegExp(`^(?:run-|trace-)?${UUID}$`, 'i');
let currentRoot: Directory | undefined;

function temporaryRoot(): Directory {
  currentRoot ??= new Directory(Paths.cache, 'Diagnostics', `run-${randomUUID()}`);
  return currentRoot;
}

/** One JS runtime owns a parent; host replacement or concurrent capture keeps the same owner. */
export function createDiagnosticTemporaryDirectory(id: string): Directory {
  const directory = new Directory(temporaryRoot(), id);
  directory.create({ intermediates: true });
  return directory;
}

/** Startup may overlap an upload: never sweep directories owned by this runtime. */
export async function cleanupDiagnosticTemporaryDirectories(): Promise<void> {
  const current = temporaryRoot().uri;
  const parent = new Directory(Paths.cache, 'Diagnostics');
  if (!(await getInfoAsync(parent.uri)).exists) return;
  for (const name of await readDirectoryAsync(parent.uri)) {
    if (!OWNED_DIRECTORY.test(name)) continue;
    const directory = new Directory(parent, name);
    if (directory.uri === current) continue;
    const info = await getInfoAsync(directory.uri);
    if (info.exists && info.isDirectory) await deleteAsync(directory.uri, { idempotent: true });
  }
}
