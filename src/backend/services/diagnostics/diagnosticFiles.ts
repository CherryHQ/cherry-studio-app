import { Directory, File, Paths } from 'expo-file-system';

export function diagnosticDirectory(kind: 'logs' | 'traces' | 'crashes'): Directory {
  return new Directory(Paths.document, 'Diagnostics', kind);
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

/** Error properties and cyclic values remain inspectable without filtering caller data. */
export function serializeDiagnosticRecord(value: unknown): string {
  const ancestors: object[] = [];
  const errors = new WeakMap<Error, object>();
  return JSON.stringify(value, function (_key, entry: unknown) {
    if (typeof entry === 'bigint') return entry.toString();
    if (entry === null || typeof entry !== 'object') return entry;
    while (ancestors.length > 0 && ancestors.at(-1) !== this) ancestors.pop();
    let object = entry;
    if (entry instanceof Error) {
      object = errors.get(entry) ?? {
        ...entry,
        name: entry.name,
        message: entry.message,
        stack: entry.stack,
        cause: entry.cause,
      };
      errors.set(entry, object);
    }
    if (ancestors.includes(object)) return '[Circular]';
    ancestors.push(object);
    return object;
  });
}

export async function yieldToRuntime(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
