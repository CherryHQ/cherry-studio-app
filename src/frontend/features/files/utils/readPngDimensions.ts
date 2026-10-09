import { File, FileMode } from 'expo-file-system';

/** Read dimensions without asking an image loader to decode a potentially huge export. */
export function readPngDimensions(uri: string): { width: number; height: number } | undefined {
  const handle = new File(uri).open(FileMode.ReadOnly);
  try {
    const bytes = handle.readBytes(24);
    if (bytes.length !== 24) return undefined;
    const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (
      header.getUint32(0) !== 0x89504e47 ||
      header.getUint32(4) !== 0x0d0a1a0a ||
      header.getUint32(8) !== 13 ||
      header.getUint32(12) !== 0x49484452
    )
      return undefined;
    const width = header.getUint32(16);
    const height = header.getUint32(20);
    return width > 0 && height > 0 ? { width, height } : undefined;
  } finally {
    handle.close();
  }
}
