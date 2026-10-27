import { File, FileMode } from 'expo-file-system';
import { type DeflateOptions, Zip, ZipDeflate, ZipPassThrough } from 'fflate';

export type ZipWriteEntry = {
  /** Relative `/`-separated path without empty, `.` or `..` segments. */
  name: string;
  /** Deflate level, or `store` to copy the bytes uncompressed. */
  compression: DeflateOptions['level'] | 'store';
} & ({ bytes: Uint8Array } | { file: File });

export type ZipWriteOptions = {
  signal?: AbortSignal;
  /** Rejects with `error()` once the archive grows past `bytes`. */
  limit?: { bytes: number; error(): Error };
  onEntryWritten?(completed: number, total: number): void;
};

const CHUNK_BYTES = 64 * 1024;
const yieldToRuntime = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function assertEntryName(name: string): void {
  if (
    name.includes('\\') ||
    name.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  )
    throw new Error('Invalid ZIP entry name');
}

/**
 * Streams a new ZIP file in entry order. File entries are read in bounded chunks with a yield
 * after each one, so neither the sources nor the archive are held in JavaScript memory.
 */
export async function writeZipFile(
  destination: File,
  entries: readonly ZipWriteEntry[],
  { signal, limit, onEntryWritten }: ZipWriteOptions = {},
): Promise<void> {
  destination.create();
  const output = destination.open(FileMode.WriteOnly);
  let size = 0;
  let finished = false;
  const zip = new Zip((error, chunk, final) => {
    if (error) throw error;
    signal?.throwIfAborted();
    size += chunk.byteLength;
    if (limit && size > limit.bytes) throw limit.error();
    output.writeBytesSync(chunk);
    finished = final;
  });
  try {
    for (const [index, entry] of entries.entries()) {
      signal?.throwIfAborted();
      assertEntryName(entry.name);
      const stream =
        entry.compression === 'store'
          ? new ZipPassThrough(entry.name)
          : new ZipDeflate(entry.name, { level: entry.compression });
      if ('bytes' in entry) {
        zip.add(stream);
        stream.push(entry.bytes, true);
      } else {
        const source = entry.file.open(FileMode.ReadOnly);
        try {
          zip.add(stream);
          let remaining = entry.file.size;
          while (remaining > 0) {
            signal?.throwIfAborted();
            const chunk = source.readBytesSync(Math.min(CHUNK_BYTES, remaining));
            if (!chunk.byteLength) throw new Error('ZIP source file was truncated');
            remaining -= chunk.byteLength;
            stream.push(chunk, false);
            await yieldToRuntime();
          }
          stream.push(new Uint8Array(), true);
        } finally {
          source.close();
        }
      }
      onEntryWritten?.(index + 1, entries.length);
    }
    zip.end();
    if (!finished) throw new Error('ZIP archive did not finish');
  } finally {
    zip.terminate();
    output.close();
  }
}
