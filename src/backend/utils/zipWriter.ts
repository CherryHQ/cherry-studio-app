import { File, FileMode } from 'expo-file-system';
import { type DeflateOptions, Zip, ZipDeflate, ZipPassThrough } from 'fflate';

export type ZipWriteEntry = {
  /** Relative `/`-separated path without empty, `.` or `..` segments. */
  name: string;
  /** Deflate level, or `store` to copy the bytes uncompressed. */
  compression: DeflateOptions['level'] | 'store';
} & ({ bytes: Uint8Array } | { file: File; expectedSize?: number });

export type ZipWriteOptions = {
  signal?: AbortSignal;
  /** Rejects with `error()` once the archive grows past `bytes`. */
  limit?: { bytes: number; error(): Error };
  /** Uncompressed source bytes; terminal progress follows archive finalization and cleanup. */
  onProgress?(processedBytes: number, totalBytes: number): void;
};

const CHUNK_BYTES = 64 * 1024;
// Keep native size preflight cooperative by yielding every 64 entries.
const INVENTORY_YIELD_ENTRIES = 64;
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
  { signal, limit, onProgress }: ZipWriteOptions = {},
): Promise<void> {
  signal?.throwIfAborted();
  let totalBytes = 0;
  const sources: { entry: ZipWriteEntry; bytes: number }[] = [];
  for (const descriptor of entries) {
    signal?.throwIfAborted();
    // Pin memory bytes even if the caller later replaces the descriptor's reference.
    const entry = 'bytes' in descriptor ? { ...descriptor } : descriptor;
    assertEntryName(entry.name);
    const bytes = 'bytes' in entry ? entry.bytes.byteLength : entry.file.size;
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid ZIP source size');
    if (
      'file' in entry &&
      entry.expectedSize !== undefined &&
      (!Number.isSafeInteger(entry.expectedSize) ||
        entry.expectedSize < 0 ||
        entry.expectedSize !== bytes)
    )
      throw new Error('ZIP source size does not match expected size');
    totalBytes += bytes;
    if (!Number.isSafeInteger(totalBytes)) throw new Error('Invalid ZIP total source size');
    sources.push({ entry, bytes });
    if (sources.length % INVENTORY_YIELD_ENTRIES === 0) {
      signal?.throwIfAborted();
      await yieldToRuntime();
      signal?.throwIfAborted();
    }
  }
  signal?.throwIfAborted();
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
  let processedBytes = 0;
  const reportProgress = () => {
    signal?.throwIfAborted();
    // The final input chunk is not proof that the archive finished or its handle closed.
    if (totalBytes === 0 || processedBytes < totalBytes) onProgress?.(processedBytes, totalBytes);
  };
  try {
    reportProgress();
    for (const { entry, bytes } of sources) {
      signal?.throwIfAborted();
      const stream =
        entry.compression === 'store'
          ? new ZipPassThrough(entry.name)
          : new ZipDeflate(entry.name, { level: entry.compression });
      if ('bytes' in entry) {
        if (entry.bytes.byteLength !== bytes) throw new Error('ZIP source bytes changed size');
        zip.add(stream);
        signal?.throwIfAborted();
        stream.push(entry.bytes, true);
        processedBytes += bytes;
        reportProgress();
      } else {
        const source = entry.file.open(FileMode.ReadOnly);
        try {
          zip.add(stream);
          let remaining = bytes;
          while (remaining > 0) {
            signal?.throwIfAborted();
            const chunk = source.readBytesSync(Math.min(CHUNK_BYTES, remaining));
            if (!chunk.byteLength) throw new Error('ZIP source file was truncated');
            if (chunk.byteLength > remaining) throw new Error('ZIP source file exceeded its size');
            signal?.throwIfAborted();
            stream.push(chunk, false);
            remaining -= chunk.byteLength;
            processedBytes += chunk.byteLength;
            reportProgress();
            await yieldToRuntime();
            signal?.throwIfAborted();
          }
          signal?.throwIfAborted();
          if (source.readBytesSync(1).byteLength)
            throw new Error('ZIP source file exceeded its size');
          signal?.throwIfAborted();
          stream.push(new Uint8Array(), true);
        } finally {
          source.close();
        }
      }
    }
    signal?.throwIfAborted();
    zip.end();
    if (!finished) throw new Error('ZIP archive did not finish');
  } finally {
    try {
      zip.terminate();
    } finally {
      output.close();
    }
  }
  signal?.throwIfAborted();
  onProgress?.(processedBytes, totalBytes);
}
