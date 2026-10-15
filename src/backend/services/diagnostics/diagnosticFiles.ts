import { Directory, File, Paths } from 'expo-file-system';

/** Daily log file, with a numeric suffix for each rotated shard. */
export const LOG_NAME = /^app-error\.(\d{4}-\d{2}-\d{2})\.log(?:\.(\d+))?$/;

export function diagnosticDirectory(kind: 'logs'): Directory {
  return new Directory(Paths.document, 'Diagnostics', `${kind}-v1`);
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
