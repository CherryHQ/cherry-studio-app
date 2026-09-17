import { Directory, File, Paths } from 'expo-file-system';

export function diagnosticDirectory(kind: 'logs'): Directory {
  return new Directory(Paths.document, 'Diagnostics', `${kind}-v1`);
}

/** Delete only legacy, app-owned diagnostic sources; user-exported archives are elsewhere. */
export function removeLegacyDiagnosticData(): void {
  for (const kind of ['logs', 'traces', 'crashes']) {
    const directory = new Directory(Paths.document, 'Diagnostics', kind);
    if (directory.exists) directory.delete();
  }
}

export function createDiagnosticTemporaryDirectory(id: string): Directory {
  const directory = new Directory(Paths.cache, 'Diagnostics', id);
  directory.create({ intermediates: true });
  return directory;
}

export function appendBytes(file: File, bytes: Uint8Array): void {
  if (!file.exists) file.create({ intermediates: true });
  const handle = file.open();
  try {
    const size = handle.size;
    if (size === null) throw new Error('Diagnostic file is not writable');
    handle.offset = size;
    handle.writeBytes(bytes);
  } finally {
    handle.close();
  }
}

export async function yieldToRuntime(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
