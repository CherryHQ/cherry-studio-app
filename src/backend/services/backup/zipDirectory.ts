import { strFromU8 } from 'fflate';

import { BackupError } from '@/shared/contracts/backup';

import { assertBackupPath, BACKUP_LIMITS } from './backupFormat';

/** The portable format uses single-disk ZIP32 with no trailing payload. */
export function parseZipEnd(tail: Uint8Array, archiveSize: number) {
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  for (let offset = tail.length - 22; offset >= 0; offset--) {
    if (
      view.getUint32(offset, true) !== 0x06054b50 ||
      offset + 22 + view.getUint16(offset + 20, true) !== tail.length
    )
      continue;
    const count = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 12, true);
    const start = view.getUint32(offset + 16, true);
    if (
      view.getUint16(offset + 4, true) !== 0 ||
      view.getUint16(offset + 6, true) !== 0 ||
      view.getUint16(offset + 8, true) !== count ||
      count === 0 ||
      count > BACKUP_LIMITS.entries + 1 ||
      start + size !== archiveSize - tail.length + offset ||
      size < count * 46
    )
      throw new BackupError('invalid');
    return { count, size, start };
  }
  throw new BackupError('invalid', 'Missing or truncated ZIP directory.');
}

export function parseZipEntry(header: Uint8Array, nameBytes: Uint8Array) {
  if (header.length !== 46) throw new BackupError('invalid');
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const flags = view.getUint16(8, true);
  const compression = view.getUint16(10, true);
  const compressedSize = view.getUint32(20, true);
  const size = view.getUint32(24, true);
  const unixType = view.getUint32(38, true) >>> 28;
  if (
    view.getUint32(0, true) !== 0x02014b50 ||
    flags & 1 ||
    (compression !== 0 && compression !== 8) ||
    view.getUint16(34, true) !== 0 ||
    view.getUint16(28, true) !== nameBytes.length ||
    size === 0xffffffff ||
    compressedSize === 0xffffffff ||
    (unixType !== 0 && unixType !== 8)
  )
    throw new BackupError('invalid');
  const name = strFromU8(nameBytes);
  assertBackupPath(name);
  return {
    name,
    size,
    compressedSize,
    compression,
    flags,
    crc32: view.getUint32(16, true),
    offset: view.getUint32(42, true),
    skip: view.getUint16(30, true) + view.getUint16(32, true),
  };
}
