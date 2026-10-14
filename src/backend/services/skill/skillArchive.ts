import { Inflate } from 'fflate';

import { SkillsError } from '@/shared/contracts/skills';

import { decodeUtf8, isSafePackagePath, type SkillPackageFiles } from './skillPackage';

export const SKILL_ARCHIVE_MAX_BYTES = 32 * 1024 * 1024;
const ARCHIVE_MAX_FILES = 10_000;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function invalid(): never {
  throw new SkillsError('package-invalid', 'The Skill archive is invalid or has unsafe paths.');
}

/** Preflight the central directory before expanding any untrusted bytes. ZIP64 is not accepted. */
function readDirectory(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (
      view.getUint32(offset, true) === 0x06054b50 &&
      offset + 22 + view.getUint16(offset + 20, true) === bytes.length
    ) {
      end = offset;
      break;
    }
  }
  if (end < 0) invalid();
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) !== 0 ||
    view.getUint16(end + 6, true) !== 0 ||
    view.getUint16(end + 8, true) !== count ||
    !count ||
    count > ARCHIVE_MAX_FILES ||
    offset + view.getUint32(end + 12, true) !== end
  )
    invalid();
  const start = offset;
  const entries = new Map<
    string,
    {
      size: number;
      compressedSize: number;
      compression: number;
      offset: number;
      flags: number;
      crc32: number;
    }
  >();
  const paths = new Map<string, string>();
  const directories = new Set<string>();
  let expanded = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) invalid();
    const nameEnd = offset + 46 + view.getUint16(offset + 28, true);
    const next = nameEnd + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    if (next > end) invalid();
    const name = decodeUtf8(bytes.subarray(offset + 46, nameEnd));
    if (!name) invalid();
    const directory = name.endsWith('/');
    const path = directory ? name.slice(0, -1) : name;
    const unixType = (view.getUint32(offset + 38, true) >>> 16) & 0o170000;
    const compression = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 24, true);
    if (
      !isSafePackagePath(path) ||
      view.getUint16(offset + 8, true) & 1 ||
      (compression !== 0 && compression !== 8) ||
      view.getUint16(offset + 34, true) !== 0 ||
      (unixType !== 0 && unixType !== (directory ? 0o040000 : 0o100000)) ||
      size === 0xffffffff ||
      view.getUint32(offset + 20, true) === 0xffffffff
    )
      invalid();
    const parts = path.split('/');
    for (let length = 1; length <= parts.length; length++) {
      const prefix = parts.slice(0, length).join('/');
      const folded = prefix.normalize('NFC').toLowerCase();
      if (paths.has(folded) && paths.get(folded) !== prefix) invalid();
      paths.set(folded, prefix);
      if (length < parts.length || directory) directories.add(prefix);
    }
    if (!directory) {
      if (entries.has(name)) invalid();
      entries.set(name, {
        size,
        compressedSize: view.getUint32(offset + 20, true),
        compression,
        offset: view.getUint32(offset + 42, true),
        flags: view.getUint16(offset + 8, true),
        crc32: view.getUint32(offset + 16, true),
      });
      expanded += size;
    }
    if (expanded > SKILL_ARCHIVE_MAX_BYTES)
      throw new SkillsError('package-too-large', 'The expanded Skill archive exceeds 32 MiB.');
    offset = next;
  }
  if (offset !== end || [...entries.keys()].some((name) => directories.has(name))) invalid();
  return { entries, start };
}

/** Bounded streaming inflation; files remain in memory and are never executed or extracted. */
export async function readSkillArchive(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<SkillPackageFiles> {
  if (bytes.byteLength > SKILL_ARCHIVE_MAX_BYTES)
    throw new SkillsError('package-too-large', 'The Skill archive exceeds 32 MiB.');
  const { entries, start } = readDirectory(bytes);
  const files = new Map<string, Uint8Array>();
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let previousEnd = 0;
    for (const [name, entry] of [...entries].sort((a, b) => a[1].offset - b[1].offset)) {
      signal?.throwIfAborted();
      const offset = entry.offset;
      if (
        offset < previousEnd ||
        offset + 30 > start ||
        view.getUint32(offset, true) !== 0x04034b50
      )
        invalid();
      const nameEnd = offset + 30 + view.getUint16(offset + 26, true);
      const dataStart = nameEnd + view.getUint16(offset + 28, true);
      const dataEnd = dataStart + entry.compressedSize;
      if (
        dataEnd > start ||
        view.getUint16(offset + 6, true) !== entry.flags ||
        view.getUint16(offset + 8, true) !== entry.compression ||
        decodeUtf8(bytes.subarray(offset + 30, nameEnd)) !== name ||
        (!(entry.flags & 8) &&
          (view.getUint32(offset + 14, true) !== entry.crc32 ||
            view.getUint32(offset + 18, true) !== entry.compressedSize ||
            view.getUint32(offset + 22, true) !== entry.size)) ||
        (entry.compression === 0 && entry.compressedSize !== entry.size)
      )
        invalid();
      previousEnd = dataEnd;
      const output = new Uint8Array(entry.size);
      let written = 0;
      let crc = 0xffffffff;
      let complete = entry.compression === 0;
      const write = (chunk: Uint8Array, final: boolean) => {
        signal?.throwIfAborted();
        if (written + chunk.byteLength > entry.size) invalid();
        output.set(chunk, written);
        written += chunk.byteLength;
        for (const byte of chunk) crc = CRC_TABLE[(crc ^ byte) & 255]! ^ (crc >>> 8);
        if (final) complete = true;
      };
      const inflate = entry.compression === 8 ? new Inflate(write) : null;
      for (let cursor = dataStart; cursor < dataEnd; cursor += 4096) {
        const chunk = bytes.subarray(cursor, Math.min(cursor + 4096, dataEnd));
        if (inflate) inflate.push(chunk, cursor + 4096 >= dataEnd);
        else write(chunk, cursor + 4096 >= dataEnd);
        if ((cursor - dataStart) % 65_536 === 0)
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (inflate && entry.compressedSize === 0) inflate.push(new Uint8Array(), true);
      if (!complete || written !== entry.size || (crc ^ 0xffffffff) >>> 0 !== entry.crc32)
        invalid();
      files.set(name, output);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return files;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof SkillsError) throw error;
    throw new SkillsError('package-invalid', 'The Skill archive could not be read.', {
      cause: error,
    });
  }
}
