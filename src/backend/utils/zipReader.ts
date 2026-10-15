import { Inflate } from 'fflate';

/**
 * Restricted reader for untrusted single-disk ZIP32 archives: the central directory is validated
 * before any byte is inflated, and extraction streams bounded chunks while yielding to the app.
 * Encryption, ZIP64, links and compression other than stored/deflate are rejected.
 */

/** Random-access archive bytes; a read returns fewer bytes only past the end of the archive. */
export type ZipSource = {
  readonly size: number;
  read(offset: number, length: number): Uint8Array;
};

export type ZipEntry = {
  name: string;
  size: number;
  compressedSize: number;
  compression: number;
  flags: number;
  crc32: number;
  offset: number;
};

export type ZipDirectory = {
  /** File entries in archive order. */
  entries: ZipEntry[];
  /** Offset of the central directory, which ends the entry data. */
  start: number;
};

/** A central-directory record; `path` drops a directory's trailing slash. */
export type ZipRecord = { name: string; path: string; directory: boolean; size: number };

type ZipFormatOptions = {
  /** Rejection for a malformed archive; `missing-directory` means no end record was found. */
  invalid(reason: 'malformed' | 'missing-directory'): Error;
  decodeName(bytes: Uint8Array): string | null;
  /** Upper bound for an entry name's encoded length. */
  maxNameBytes?: number;
};

export type ZipDirectoryOptions = ZipFormatOptions & {
  tooLarge(): Error;
  maxRecords: number;
  /** Bound on the sum of declared file sizes. */
  maxExpandedBytes: number;
  /** Accept entries ending in `/` as directories; otherwise the name reaches `checkRecord` as is. */
  allowDirectories?: boolean;
  /** Path, collision and per-entry rules in directory order. Throw to reject the archive. */
  checkRecord(record: ZipRecord): void;
};

export type ZipExtractOptions = ZipFormatOptions & {
  /** Require entries back to back from offset 0 and validate every data descriptor. */
  contiguous?: boolean;
  verifyCrc?: boolean;
  signal?: AbortSignal;
  /** Receives the archive position after each compressed chunk is read. */
  onRead?(position: number): void;
  /** Receives one entry's expanded bytes; `close` runs whether or not the entry is valid. */
  open(entry: ZipEntry): { write(chunk: Uint8Array): void; close?(): void };
};

const END_RECORD_MAX_BYTES = 22 + 0xffff;
const CHUNK_BYTES = 64 * 1024;
const UNIX_TYPE_MASK = 0o170000;
const UNIX_DIRECTORY = 0o040000;
const UNIX_FILE = 0o100000;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

const viewOf = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const yieldToRuntime = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function readExact(source: ZipSource, offset: number, length: number, invalid: () => Error) {
  const bytes = source.read(offset, length);
  if (bytes.byteLength !== length) throw invalid();
  return bytes;
}

export function readZipDirectory(source: ZipSource, options: ZipDirectoryOptions): ZipDirectory {
  const invalid = () => options.invalid('malformed');
  const tail = source.read(
    Math.max(0, source.size - END_RECORD_MAX_BYTES),
    Math.min(source.size, END_RECORD_MAX_BYTES),
  );
  const view = viewOf(tail);
  let end = -1;
  for (let offset = tail.length - 22; offset >= 0; offset--) {
    if (
      view.getUint32(offset, true) === 0x06054b50 &&
      offset + 22 + view.getUint16(offset + 20, true) === tail.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) throw options.invalid('missing-directory');
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  const start = view.getUint32(end + 16, true);
  // The end record closes the archive and the directory ends exactly where that record starts.
  const directoryEnd = source.size - tail.length + end;
  if (
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0 ||
    view.getUint16(end + 8, true) !== count ||
    count === 0 ||
    count > options.maxRecords ||
    start + size !== directoryEnd ||
    size < count * 46
  )
    throw invalid();

  const entries = new Map<string, ZipEntry>();
  let expanded = 0;
  let position = start;
  for (let index = 0; index < count; index++) {
    if (position + 46 > directoryEnd) throw invalid();
    const header = viewOf(readExact(source, position, 46, invalid));
    const nameLength = header.getUint16(28, true);
    const next =
      position + 46 + nameLength + header.getUint16(30, true) + header.getUint16(32, true);
    if (
      header.getUint32(0, true) !== 0x02014b50 ||
      next > directoryEnd ||
      (options.maxNameBytes !== undefined && nameLength > options.maxNameBytes)
    )
      throw invalid();
    const name = options.decodeName(readExact(source, position + 46, nameLength, invalid));
    if (name === null) throw invalid();
    const directory = options.allowDirectories === true && name.endsWith('/');
    const flags = header.getUint16(8, true);
    const compression = header.getUint16(10, true);
    const compressedSize = header.getUint32(20, true);
    const entrySize = header.getUint32(24, true);
    const offset = header.getUint32(42, true);
    const unixType = (header.getUint32(38, true) >>> 16) & UNIX_TYPE_MASK;
    if (
      flags & 1 ||
      (compression !== 0 && compression !== 8) ||
      header.getUint16(34, true) !== 0 ||
      entrySize === 0xffffffff ||
      compressedSize === 0xffffffff ||
      (unixType !== 0 && unixType !== (directory ? UNIX_DIRECTORY : UNIX_FILE)) ||
      (!directory && offset + 30 > start)
    )
      throw invalid();
    options.checkRecord({
      name,
      path: directory ? name.slice(0, -1) : name,
      directory,
      size: entrySize,
    });
    if (!directory) {
      if (entries.has(name)) throw invalid();
      entries.set(name, {
        name,
        size: entrySize,
        compressedSize,
        compression,
        flags,
        crc32: header.getUint32(16, true),
        offset,
      });
      expanded += entrySize;
      if (expanded > options.maxExpandedBytes) throw options.tooLarge();
    }
    position = next;
  }
  if (position !== directoryEnd) throw invalid();
  return { entries: [...entries.values()].sort((a, b) => a.offset - b.offset), start };
}

/** Cross-checks each local header against the directory, then streams its expanded bytes. */
export async function extractZipEntries(
  source: ZipSource,
  { entries, start }: ZipDirectory,
  options: ZipExtractOptions,
): Promise<void> {
  const invalid = () => options.invalid('malformed');
  let cursor = 0;
  for (const [index, entry] of entries.entries()) {
    options.signal?.throwIfAborted();
    if (options.contiguous ? entry.offset !== cursor : entry.offset < cursor) throw invalid();
    const header = viewOf(readExact(source, entry.offset, 30, invalid));
    const nameLength = header.getUint16(26, true);
    if (
      header.getUint32(0, true) !== 0x04034b50 ||
      header.getUint16(6, true) !== entry.flags ||
      header.getUint16(8, true) !== entry.compression ||
      (options.maxNameBytes !== undefined && nameLength > options.maxNameBytes) ||
      options.decodeName(readExact(source, entry.offset + 30, nameLength, invalid)) !== entry.name
    )
      throw invalid();
    const dataStart = entry.offset + 30 + nameLength + header.getUint16(28, true);
    const dataEnd = dataStart + entry.compressedSize;
    if (
      dataEnd > start ||
      (!(entry.flags & 8) &&
        (header.getUint32(14, true) !== entry.crc32 ||
          header.getUint32(18, true) !== entry.compressedSize ||
          header.getUint32(22, true) !== entry.size)) ||
      (entry.compression === 0 && entry.compressedSize !== entry.size)
    )
      throw invalid();

    const sink = options.open(entry);
    let written = 0;
    let crc = 0xffffffff;
    let complete = entry.compression === 0;
    try {
      const write = (chunk: Uint8Array) => {
        options.signal?.throwIfAborted();
        written += chunk.byteLength;
        if (written > entry.size) throw invalid();
        if (options.verifyCrc)
          for (const byte of chunk) crc = CRC_TABLE[(crc ^ byte) & 255]! ^ (crc >>> 8);
        sink.write(chunk);
      };
      const inflate =
        entry.compression === 8
          ? new Inflate((chunk, final) => {
              write(chunk);
              if (final) complete = true;
            })
          : undefined;
      for (let position = dataStart; position < dataEnd;) {
        options.signal?.throwIfAborted();
        const chunk = readExact(
          source,
          position,
          Math.min(dataEnd - position, CHUNK_BYTES),
          invalid,
        );
        position += chunk.byteLength;
        if (inflate) inflate.push(chunk, position === dataEnd);
        else write(chunk);
        options.onRead?.(position);
        await yieldToRuntime();
      }
      if (inflate && entry.compressedSize === 0) inflate.push(new Uint8Array(), true);
    } finally {
      sink.close?.();
    }
    if (
      !complete ||
      written !== entry.size ||
      (options.verifyCrc && (crc ^ 0xffffffff) >>> 0 !== entry.crc32)
    )
      throw invalid();

    cursor = dataEnd;
    if (!options.contiguous) continue;
    const nextOffset = entries[index + 1]?.offset ?? start;
    if (entry.flags & 8) {
      const length = nextOffset - dataEnd;
      if (length !== 12 && length !== 16) throw invalid();
      const descriptor = viewOf(readExact(source, dataEnd, length, invalid));
      const prefix = length === 16 ? 4 : 0;
      if (
        (prefix && descriptor.getUint32(0, true) !== 0x08074b50) ||
        descriptor.getUint32(prefix, true) !== entry.crc32 ||
        descriptor.getUint32(prefix + 4, true) !== entry.compressedSize ||
        descriptor.getUint32(prefix + 8, true) !== entry.size
      )
        throw invalid();
      cursor = nextOffset;
    }
    if (cursor !== nextOffset) throw invalid();
  }
  if (options.contiguous && cursor !== start) throw invalid();
}
